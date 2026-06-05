import { createTaskOperations } from "../../application/task/task-operations.mjs";
import { createLegacyTaskOperationWriters } from "../../infrastructure/task/legacy-task-operation-writers.mjs";
import {
  createScannerTaskOperationSubjectReader,
  createScannerTaskTombstoneSubjectReader,
} from "./task-operation-subject-reader.mjs";
import type { KernelTaskListCommandResult } from "../../kernel/task/adapters/index.mjs";

type LegacyTaskListPayload = Readonly<{
  tasks?: readonly Record<string, unknown>[];
  modules?: readonly unknown[];
}>;

export type TaskListComparisonDivergence = Readonly<{
  field: string;
  classification: "compatibility" | "intentional-divergence" | "adapter-display-only";
  decision: "keep-old-behavior" | "use-kernel-domain-truth" | "display-only";
  oldValue?: unknown;
  kernelValue?: unknown;
  reason: string;
}>;

export type TaskListComparisonPayload = Readonly<{
  schemaVersion: "task-kernel-cli-comparison/v1";
  command: "task-list";
  oldAdapter: "legacy-cli";
  newAdapter: "task-kernel";
  compatibilityDecision: "compatible-with-classified-divergences";
  old: LegacyTaskListPayload;
  kernel: KernelTaskListCommandResult["payload"];
  divergences: readonly TaskListComparisonDivergence[];
}>;

export type TaskListComparisonCommandResult = Readonly<{
  payload: TaskListComparisonPayload;
  textLines: string[];
}>;

export function createScannerTaskOperations(targetInput: string = ".") {
  return createTaskOperations(targetInput, {
    subjects: createScannerTaskOperationSubjectReader(targetInput),
    strictSubjects: createScannerTaskOperationSubjectReader(targetInput, { strictReviewGitAudit: true }),
    tombstoneSubjects: createScannerTaskTombstoneSubjectReader(targetInput, { strictReviewGitAudit: true }),
    writers: createLegacyTaskOperationWriters(),
  });
}

export function buildTaskListComparisonCommandResult(
  oldPayload: LegacyTaskListPayload,
  kernelResult: KernelTaskListCommandResult,
): TaskListComparisonCommandResult {
  const divergences = classifyTaskListDivergences(oldPayload, kernelResult.payload);
  return {
    payload: {
      schemaVersion: "task-kernel-cli-comparison/v1",
      command: "task-list",
      oldAdapter: "legacy-cli",
      newAdapter: "task-kernel",
      compatibilityDecision: "compatible-with-classified-divergences",
      old: oldPayload,
      kernel: kernelResult.payload,
      divergences,
    },
    textLines: [
      `task-list comparison: ${kernelResult.payload.tasks.length} kernel tasks, ${(oldPayload.tasks ?? []).length} legacy tasks, ${divergences.length} classified divergences`,
      ...divergences.map((divergence) => `${divergence.classification}\t${divergence.field}\t${divergence.reason}`),
    ],
  };
}

function classifyTaskListDivergences(
  oldPayload: LegacyTaskListPayload,
  kernelPayload: KernelTaskListCommandResult["payload"],
): readonly TaskListComparisonDivergence[] {
  const oldTasks = oldPayload.tasks ?? [];
  const divergences: TaskListComparisonDivergence[] = [];
  for (const kernelTask of kernelPayload.tasks) {
    const oldTask = oldTasks.find((task) =>
      String(task.shortId ?? task.id ?? "").endsWith(kernelTask.id),
    );
    if (!oldTask) {
      divergences.push({
        field: `tasks.${kernelTask.id}`,
        classification: "intentional-divergence",
        decision: "use-kernel-domain-truth",
        kernelValue: kernelTask,
        reason: "Kernel TaskPackageStore recognizes canonical task plans even when legacy scanner identity rules do not emit a matching row.",
      });
      continue;
    }
    classifyFieldDivergence(divergences, kernelTask.id, "title", oldTask.title, kernelTask.title);
    classifyFieldDivergence(divergences, kernelTask.id, "module", oldTask.module ?? oldTask.inferredModule, kernelTask.moduleKey);
    classifyFieldDivergence(divergences, kernelTask.id, "queue", firstString(oldTask.taskQueues), kernelTask.queue);
    classifyFieldDivergence(divergences, kernelTask.id, "reviewStatus", oldTask.reviewStatus, kernelTask.reviewStatus);
    if (oldTask.id !== kernelTask.id) {
      divergences.push({
        field: `tasks.${kernelTask.id}.id`,
        classification: "adapter-display-only",
        decision: "display-only",
        oldValue: oldTask.id,
        kernelValue: kernelTask.id,
        reason: "Legacy CLI displays path-derived ids; Kernel output uses canonical TaskId.",
      });
    }
    const oldFieldCount = Object.keys(oldTask).length;
    if (oldFieldCount > Object.keys(kernelTask).length) {
      divergences.push({
        field: `tasks.${kernelTask.id}.legacyExtraFields`,
        classification: "adapter-display-only",
        decision: "display-only",
        oldValue: oldFieldCount,
        kernelValue: Object.keys(kernelTask).length,
        reason: "Legacy task-list includes broad scanner/debug fields; Kernel task-list intentionally exposes the summary projection only.",
      });
    }
  }
  return divergences;
}

function classifyFieldDivergence(
  divergences: TaskListComparisonDivergence[],
  taskId: string,
  field: string,
  oldValue: unknown,
  kernelValue: unknown,
): void {
  if (oldValue === kernelValue) return;
  divergences.push({
    field: `tasks.${taskId}.${field}`,
    classification: "intentional-divergence",
    decision: "use-kernel-domain-truth",
    oldValue,
    kernelValue,
    reason: "Task Kernel summary projection is the selected domain truth for CLI comparison mode.",
  });
}

function firstString(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
