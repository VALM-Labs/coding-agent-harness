import { Effect } from "effect";

import {
  createMarkdownTaskPackageStoreReader,
} from "../infrastructure/index.mjs";
import {
  TASK_PACKAGE_STORE_PORT_ID,
  type TaskPackageStoreDetail,
  type TaskPackageStoreReader,
  type TaskPackageStoreServiceShape,
  type TaskPackageStoreSummary,
} from "../ports/index.mjs";
import {
  InvalidTaskStateError,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  type TaskKernelError,
} from "../errors.mjs";
import {
  classifyTaskQueue,
  parseModuleKey,
  parseQueueName,
  type ModuleKey,
  type QueueName,
  type TaskRef,
} from "../domain/index.mjs";
import {
  makeTaskQueryService,
  type ListTasksInput,
  type ListTasksOutput,
} from "../application/index.mjs";

export type KernelTaskListOptions = Readonly<{
  moduleKey?: string;
  queue?: string;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}>;

export type KernelTaskListPayload = Readonly<{
  schemaVersion: "task-kernel-cli-task-list/v1";
  adapter: "task-kernel";
  query: Readonly<{
    moduleKey?: ModuleKey;
    queue?: QueueName;
    includeArchived: boolean;
    includeDeleted: boolean;
  }>;
  tasks: ListTasksOutput["tasks"];
}>;

export type KernelTaskListCommandResult = Readonly<{
  payload: KernelTaskListPayload;
  textLines: string[];
}>;

export function buildKernelTaskListCommandResult(targetInput: string, options: KernelTaskListOptions): KernelTaskListCommandResult {
  const query = parseKernelTaskListInput(options);
  const repository = createMarkdownTaskPackageStoreService({
    reader: createMarkdownTaskPackageStoreReader({ root: targetInput }),
  });
  const service = makeTaskQueryService(repository);
  const output = Effect.runSync(service.listTasks(query));
  const payload: KernelTaskListPayload = {
    schemaVersion: "task-kernel-cli-task-list/v1",
    adapter: "task-kernel",
    query: {
      moduleKey: query.moduleKey,
      queue: query.queue,
      includeArchived: query.includeArchived ?? false,
      includeDeleted: query.includeDeleted ?? false,
    },
    tasks: output.tasks,
  };
  return {
    payload,
    textLines: output.tasks.map((task) => `${task.id}\t${task.queue}\t${task.reviewStatus}\t${task.title}`),
  };
}

export function createMarkdownTaskPackageStoreService(input: {
  reader: TaskPackageStoreReader;
}): TaskPackageStoreServiceShape {
  const reader = input.reader;
  return {
    identity: TASK_PACKAGE_STORE_PORT_ID,
    list: (query) =>
      Effect.try({
        try: () => reader.list({
          module: query.moduleKey,
          includeArchived: query.includeArchived,
        })
          .map((snapshot): TaskPackageStoreSummary => ({
            id: snapshot.task.id,
            title: snapshot.task.title,
            taskPath: snapshot.location.relativeDirectory,
            queue: classifyTaskQueue({ task: snapshot.task }),
            reviewStatus: snapshot.task.reviewStatus,
          }))
          .filter((summary) => !query.queue || summary.queue === query.queue)
          .filter((summary) => query.includeDeleted !== false || summary.queue !== "deleted"),
        catch: kernelReadError,
      }),
    get: (ref) =>
      Effect.try({
        try: () => detailFromSnapshot(reader.get(ref)),
        catch: kernelReadError,
      }),
    resolve: (ref) =>
      Effect.try({
        try: () => {
          const location = reader.resolve(ref);
          return { taskId: location.id, taskPath: location.relativeDirectory };
        },
        catch: kernelReadError,
      }),
    create: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "create")),
    save: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "save")),
    archive: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "archive")),
    delete: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "delete")),
  };
}

function parseKernelTaskListInput(options: KernelTaskListOptions): ListTasksInput {
  return {
    moduleKey: options.moduleKey ? parseModuleKey(options.moduleKey) : undefined,
    queue: options.queue ? parseQueueName(options.queue) : undefined,
    includeArchived: options.includeArchived ?? false,
    includeDeleted: options.includeDeleted ?? false,
  };
}

function detailFromSnapshot(snapshot: ReturnType<TaskPackageStoreReader["get"]>): TaskPackageStoreDetail {
  return {
    task: snapshot.task,
    taskPath: snapshot.location.relativeDirectory,
    projections: [],
  };
}

function kernelReadError(error: unknown): TaskKernelError {
  const message = error instanceof Error ? error.message : String(error);
  return /^Task not found/.test(message) || /Task not found at path/.test(message)
    ? new TaskNotFoundError(message)
    : new InvalidTaskStateError(message);
}
