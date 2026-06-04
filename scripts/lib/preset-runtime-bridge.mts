import { normalizeTarget, toPosix } from "./core-shared.mjs";
import { archiveBlockReason } from "./task-archive-eligibility.mjs";
import { createTaskLifecycleReader } from "./task-repository.mjs";

type PresetRuntimeTarget = ReturnType<typeof normalizeTarget>;

export type PresetRuntimeTask = {
  id: string;
  shortId: string;
  legacyId: string;
  title: string;
  state: string;
  budget: string;
  closeoutStatus: string;
  taskQueues: string[];
  risks: Array<Record<string, unknown>>;
  materialsReady: boolean;
  reviewStatus: string;
  reviewConfirmation: Record<string, unknown> | null;
  deletionState: string;
  taskPreset: string;
  module: string;
  path: string;
  localPath: string;
};

export function normalizePresetRuntimeTarget(input = "."): PresetRuntimeTarget {
  return normalizeTarget(input);
}

export function collectPresetRuntimeTasks(targetInput: PresetRuntimeTarget | string, { includeArchived = false }: { includeArchived?: boolean } = {}): PresetRuntimeTask[] {
  const target = typeof targetInput === "string" ? normalizePresetRuntimeTarget(targetInput) : targetInput;
  return createTaskLifecycleReader(target).listLifecycleTasks({ includeArchived }).map((task) => {
    const pathValue = normalizePresetRuntimePath(String(task.path || task.currentPath || ""));
    const id = String(task.id || "");
    const shortId = String(task.shortId || id.split("/").at(-1) || "");
    return {
      id,
      shortId,
      legacyId: presetRuntimeLegacyId(task, { id, shortId }),
      title: String(task.title || ""),
      state: String(task.state || "unknown"),
      budget: String(task.budget || ""),
      closeoutStatus: String(task.closeoutStatus || ""),
      taskQueues: Array.isArray(task.taskQueues) ? task.taskQueues.map(String) : [], // stable-kernel projection boundary
      risks: Array.isArray(task.risks) ? task.risks.map((risk) => ({ ...(risk as Record<string, unknown>) })) : [],
      materialsReady: task.materialsReady !== false,
      reviewStatus: String(task.reviewStatus || ""),
      reviewConfirmation: task.reviewConfirmation && typeof task.reviewConfirmation === "object" ? { ...(task.reviewConfirmation as Record<string, unknown>) } : null,
      deletionState: String(task.deletionState || ""),
      taskPreset: String(task.taskPreset || ""),
      module: String(task.module || ""),
      path: pathValue,
      localPath: pathValue,
    };
  });
}

export function presetRuntimeArchiveBlockReason(task: PresetRuntimeTask, { archivedBy = "" }: { archivedBy?: string } = {}): string {
  return archiveBlockReason(task, { archivedBy });
}

function normalizePresetRuntimePath(value: string): string {
  const raw = String(value || "").replace(/^TARGET:/, "").trim();
  return raw ? toPosix(raw) : "";
}

function presetRuntimeLegacyId(task: { aliases?: unknown[] }, { id, shortId }: { id: string; shortId: string }): string {
  const aliases = Array.isArray(task.aliases) ? task.aliases.map(String) : [];
  return aliases.find((alias) => alias && alias !== id && alias !== shortId) || "";
}
