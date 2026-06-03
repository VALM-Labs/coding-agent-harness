import type { CreateTaskOptions, LifecycleUpdateOptions, ReviewConfirmOptions } from "../../lib/types/task-lifecycle.js";

export type LessonSedimentationOptions = {
  dryRun?: boolean;
  title?: string;
  deferCommit?: boolean;
  allowDirtyRelativePaths?: string[];
};

export type TaskOperationWriters = {
  createTask(targetInput: string, taskId: string, options?: CreateTaskOptions): unknown;
  updateTaskLifecycle(targetInput: string, taskId: string, options?: LifecycleUpdateOptions): unknown;
  confirmTaskReview(targetInput: string, taskId: string, options?: ReviewConfirmOptions): unknown;
  createLessonSedimentationTask(targetInput: string, taskId: string, candidateId: string, options?: LessonSedimentationOptions): unknown;
};
