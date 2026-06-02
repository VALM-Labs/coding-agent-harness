import fs from "node:fs";
import path from "node:path";
import { readBundledTemplate, renderTaskTemplate, toPosix } from "../core-shared.mjs";
import { governanceRelativePaths, syncTaskGovernance } from "../governance-sync.mjs";
import { type GeneratedSurface, type TransactionResult } from "../harness-transaction.mjs";
import { prepareModuleRegistration, type ModuleRegistrationInput } from "../module-registry.mjs";
import { renderPresetResourceIndex } from "../preset-engine.mjs";
import { buildCreationTaskAudit } from "../task-audit-metadata.mjs";
import { assertLifecyclePresetWriteScope, renderLifecyclePresetTaskTemplate } from "./preset-interop.mjs";
import { appendLongRunningContractFile, moduleTemplateFiles, taskFilesForBudget } from "./template-files.mjs";
import { refreshPresetCommandAudit } from "./create-task-helpers.mjs";
import type { LifecycleChange, LifecycleTarget, PresetContext, PresetPackage } from "../types/task-lifecycle.js";
import type { TaskBudget } from "../types/task-scanner.js";
import type { buildScaffoldProvenance } from "./scaffold-provenance.mjs";

type GovernanceTask = Parameters<typeof syncTaskGovernance>[1] & {
  presetAudit?: unknown;
};
type ModuleRegistrationPlan = {
  changes: Array<{ destination: string; action: string; surface: string }>;
};

export type CreateTaskMaterialization = {
  changes: LifecycleChange[];
  governance: ReturnType<typeof syncTaskGovernance>;
  commandWriteScopes: string[];
  generatedSurfaces: GeneratedSurface[];
};

export type CreateTaskMaterializationOptions = {
  target: LifecycleTarget;
  directory: string;
  normalizedTaskId: string;
  normalizedModuleKey: string;
  normalizedLocale: string;
  normalizedBudget: TaskBudget;
  normalizedPreset: string;
  taskTitle: string;
  longRunning: boolean;
  dryRun: boolean;
  presetPackage: PresetPackage | null;
  presetContext: PresetContext | null;
  scaffoldProvenance: ReturnType<typeof buildScaffoldProvenance>;
  baseTaskAudit: ReturnType<typeof buildCreationTaskAudit>;
  plannedModuleRegistration: ModuleRegistrationPlan | null;
  moduleRegistration: ModuleRegistrationInput;
  task: GovernanceTask;
};

export function createTaskGeneratedSurfaces(changes: Array<LifecycleChange | { destination: string; surface?: string }>): GeneratedSurface[] {
  const bySurface = new Map<string, Set<string>>();
  for (const change of changes) {
    const destination = change.destination;
    if (!destination) continue;
    const surface = "surface" in change && change.surface ? change.surface : createTaskSurfaceName(change as LifecycleChange);
    if (!bySurface.has(surface)) bySurface.set(surface, new Set());
    bySurface.get(surface)?.add(destination);
  }
  return [...bySurface.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([surface, paths]) => ({ surface, paths: [...paths].sort() }));
}

export function createTaskTransactionSummary(result: TransactionResult) {
  return {
    success: result.success,
    operation: result.operation,
    dryRun: result.dryRun,
    allowedPaths: result.allowedPaths,
    generatedSurfaces: result.generatedSurfaces,
    writes: result.writes,
    deletes: result.deletes,
  };
}

export function materializeCreateTask({
  target,
  directory,
  normalizedTaskId,
  normalizedModuleKey,
  normalizedLocale,
  normalizedBudget,
  normalizedPreset,
  taskTitle,
  longRunning,
  dryRun,
  presetPackage,
  presetContext,
  scaffoldProvenance,
  baseTaskAudit,
  plannedModuleRegistration,
  moduleRegistration,
  task,
}: CreateTaskMaterializationOptions): CreateTaskMaterialization {
  const changes: LifecycleChange[] = [];
  if (plannedModuleRegistration) {
    const moduleRegistrationResult = prepareModuleRegistration(target, normalizedModuleKey, moduleRegistration, { dryRun });
    changes.push(...moduleRegistrationResult.changes);
  }
  if (normalizedModuleKey) {
    const moduleDirectory = target.harness.version === 2
      ? path.join(target.harness.modulesRoot, normalizedModuleKey)
      : path.dirname(directory);
    for (const [destination, source] of moduleTemplateFiles({ locale: normalizedLocale })) {
      const destinationPath = path.join(moduleDirectory, destination);
      if (fs.existsSync(destinationPath)) continue;
      changes.push({
        destination: toPosix(path.relative(target.projectRoot, destinationPath)),
        source,
        action: dryRun ? "would-create" : "create",
      });
      if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(path.relative(target.projectRoot, destinationPath)), target);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(
        destinationPath,
        renderTaskTemplate(readBundledTemplate(source), {
          taskId: normalizedModuleKey,
          title: normalizedModuleKey,
          locale: normalizedLocale,
          budget: normalizedBudget,
          moduleKey: normalizedModuleKey,
          preset: normalizedPreset,
          presetVersion: presetContext?.presetVersion || "",
          evidenceBundle: presetContext?.evidenceBundle || "",
          longRunning,
          scaffoldProvenance,
          taskAudit: buildCreationTaskAudit({ ...scaffoldProvenance, templateSource: source }, { projectRoot: target.projectRoot }),
          target,
        }),
      );
    }
  }
  const files = appendLongRunningContractFile(taskFilesForBudget({ budget: normalizedBudget, locale: normalizedLocale }), {
    locale: normalizedLocale,
    longRunning,
  });
  for (const [destination, source] of files) {
    const destinationPath = path.join(directory, destination);
    changes.push({
      destination: toPosix(path.relative(target.projectRoot, destinationPath)),
      source,
      action: dryRun ? "would-create" : "create",
    });
    if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(path.relative(target.projectRoot, destinationPath)), target);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(
      destinationPath,
      renderLifecyclePresetTaskTemplate(destination, renderTaskTemplate(readBundledTemplate(source), {
        taskId: normalizedTaskId,
        title: taskTitle,
        locale: normalizedLocale,
        budget: normalizedBudget,
        moduleKey: normalizedModuleKey,
        preset: normalizedPreset,
        presetVersion: presetContext?.presetVersion || "",
        evidenceBundle: presetContext?.evidenceBundle || "",
        longRunning,
        scaffoldProvenance: {
          ...scaffoldProvenance,
          templateSource: source,
        },
        taskAudit: destination === "INDEX.md"
          ? buildCreationTaskAudit({ ...scaffoldProvenance, templateSource: source }, { projectRoot: target.projectRoot })
          : baseTaskAudit,
        target,
      }), presetContext),
    );
  }
  if (presetContext) materializePresetResources({ target, directory, changes, presetPackage, presetContext, dryRun });
  const governance = syncTaskGovernance(target, task, { event: "new-task", state: "planned", message: "task registered by CLI", dryRun });
  changes.push(...governance.changes);
  const commandWriteScopes = [...changes.map((change) => change.destination).filter(Boolean), ...governanceRelativePaths(governance.changes)];
  if (presetContext) {
    refreshPresetCommandAudit(target, presetContext, { commandWriteScopes, dryRun });
    task.presetAudit = presetContext.audit;
  }
  return {
    changes,
    governance,
    commandWriteScopes,
    generatedSurfaces: createTaskGeneratedSurfaces(changes),
  };
}

function materializePresetResources({
  target,
  directory,
  changes,
  presetPackage,
  presetContext,
  dryRun,
}: {
  target: LifecycleTarget;
  directory: string;
  changes: LifecycleChange[];
  presetPackage: PresetPackage | null;
  presetContext: PresetContext;
  dryRun: boolean;
}): void {
  for (const evidence of presetContext.evidenceFiles || []) {
    const destinationPath = path.join(target.projectRoot, evidence.relativePath);
    changes.push({
      destination: toPosix(evidence.relativePath),
      source: evidence.source,
      action: dryRun ? "would-create" : "create",
    });
    if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(evidence.relativePath), target);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, evidence.content);
  }
  for (const resource of presetContext.resourceFiles || []) {
    const destinationPath = path.join(target.projectRoot, resource.relativePath);
    changes.push({
      destination: toPosix(resource.relativePath),
      source: resource.source,
      action: dryRun ? "would-create" : "create",
    });
    if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(resource.relativePath), target);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, resource.content);
  }
  for (const [kind, rows] of Object.entries(presetContext.resourceIndexRows || {})) {
    if (!rows.length) continue;
    const destination = kind === "references" ? "references/INDEX.md" : "artifacts/INDEX.md";
    const destinationPath = path.join(directory, destination);
    const relativePath = toPosix(path.relative(target.projectRoot, destinationPath));
    changes.push({
      destination: relativePath,
      source: `preset-${kind}-index`,
      action: dryRun ? "would-update" : "update",
    });
    if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, relativePath, target);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    const existing = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, "utf8") : "";
    fs.writeFileSync(destinationPath, renderPresetResourceIndex(existing, kind, rows));
  }
}

function createTaskSurfaceName(change: LifecycleChange): string {
  const source = String(change.source || "");
  if (source.startsWith("preset-")) return "preset-resource-index";
  if (/(^|\/)templates(?:-[A-Za-z-]+)?\/modules\//.test(source)) return "module-scaffold";
  if (/(^|\/)templates(?:-[A-Za-z-]+)?\/planning\//.test(source)) return "task-package";
  if (source.includes("preset")) return "preset-evidence";
  return "task-materialization";
}
