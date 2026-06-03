import { createTask, confirmTaskReview, updateTaskLifecycle } from "../../lib/task-lifecycle.mjs";
import { createLessonSedimentationTask } from "../../lib/task-lesson-sedimentation.mjs";
import type { TaskOperationWriters } from "../../ports/task/task-operation-writers.mjs";

export function createLegacyTaskOperationWriters(): TaskOperationWriters {
  return {
    createTask,
    updateTaskLifecycle,
    confirmTaskReview,
    createLessonSedimentationTask,
  };
}
