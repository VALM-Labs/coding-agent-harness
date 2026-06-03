import {
  beginGovernanceSync,
  commitGovernanceSync,
  releaseGovernanceSync,
} from "../../lib/governance-sync.mjs";
import {
  confirmTaskReview,
  finalizeDeferredTaskReviewConfirmation,
} from "../../lib/task-lifecycle.mjs";

type WorkbenchTarget = {
  projectRoot: string;
};

type WorkbenchReviewSubject = {
  id: string;
  aliases: string[];
  confirmText: string;
  queueReasons?: unknown[];
  repairPrompt?: string;
  semanticProjection?: {
    taskLifecycleProjection?: {
      reviewQueueState?: string;
      reviewStatus?: string;
    };
    reviewWorkbenchQueueView?: {
      confirmed?: boolean;
      humanConfirmable?: boolean;
      queues?: string[];
    };
  };
};

type WorkbenchBatchResult = {
  taskId: string;
  ok: boolean;
  status: number;
  audit?: {
    allowedPaths?: string[];
    commitSha?: string;
    auditCommitSha?: string;
    auditStatus?: string;
  };
  task?: {
    id: string;
  };
  [key: string]: unknown;
};

type BulkReviewBlock = {
  status: number;
  reason: string;
  payload: Record<string, unknown>;
};

export function commitWorkbenchBatch(target: WorkbenchTarget, allowedPaths: string[], { operation, message }: { operation: string; message: string }) {
  const paths = uniqueValues(allowedPaths || []);
  const context = beginGovernanceSync(target, {
    operation,
    allowDirtyWorktree: true,
    allowedRelativePaths: paths,
    allowDirtyWriteScope: true,
  });
  try {
    return commitGovernanceSync(context, paths, { message });
  } finally {
    releaseGovernanceSync(context);
  }
}

export function finalizeWorkbenchReviewConfirmation(target: WorkbenchTarget, taskId: string, { commitSha }: { commitSha?: string }) {
  if (!commitSha) return;
  finalizeDeferredTaskReviewConfirmation(target.projectRoot, taskId, { commitSha });
}

export function confirmWorkbenchReviewBatch(
  target: WorkbenchTarget,
  subjects: WorkbenchReviewSubject[],
  taskIds: string[],
  { reviewer = "Human Reviewer", message = "bulk confirmed from dashboard workbench", evidence = "" }: { reviewer?: string; message?: string; evidence?: string } = {},
) {
  const taskCache = buildWorkbenchTaskCache(subjects);
  const results: WorkbenchBatchResult[] = [];
  for (const taskId of taskIds) {
    const subject = taskCache.byId.get(String(taskId || ""));
    const block = subject ? bulkReviewConfirmationBlock(subject) : { status: 404, reason: `Task not found: ${taskId}`, payload: { taskId } };
    if (!subject || block) {
      results.push({ taskId, ok: false, status: block?.status || 404, error: block?.reason || `Task not found: ${taskId}`, payload: block?.payload || { taskId } });
      continue;
    }
    try {
      const payload = confirmTaskReview(target.projectRoot, subject.id, {
        reviewer,
        message,
        evidence,
        confirmText: subject.confirmText || taskId,
        deferCommit: true,
      }) as { audit?: WorkbenchBatchResult["audit"]; task?: { id?: string } };
      results.push({ taskId, ok: true, status: 200, audit: payload.audit, task: { id: payload.task?.id || subject.id || taskId } });
    } catch (error) {
      results.push({ taskId, ok: false, status: errorStatus(error), ...errorPayload(error) });
    }
  }
  const confirmed = results.filter((result) => result.ok).length;
  const failed = results.length - confirmed;
  if (confirmed > 0) {
    const allowedPaths = uniqueValues(results.filter((result) => result.ok).flatMap((result) => result.audit?.allowedPaths || []));
    const confirmCommit = commitWorkbenchBatch(target, allowedPaths, { operation: "review-complete-bulk", message: "chore: confirm selected reviews" });
    for (const result of results.filter((item) => item.ok)) {
      const subject = taskCache.byId.get(result.taskId);
      if (!subject) continue;
      finalizeWorkbenchReviewConfirmation(target, subject.id, { commitSha: confirmCommit.commitSha });
    }
    const auditCommit = commitWorkbenchBatch(target, allowedPaths, { operation: "review-complete-bulk-audit", message: "chore: record selected review confirmation audit" });
    for (const result of results.filter((item) => item.ok)) {
      result.audit = {
        ...result.audit,
        commitSha: confirmCommit.commitSha,
        auditCommitSha: auditCommit.commitSha,
        auditStatus: "committed",
        allowedPaths,
      };
    }
  }
  return { ok: failed === 0, confirmed, failed, results };
}

function buildWorkbenchTaskCache(subjects: WorkbenchReviewSubject[]): { byId: Map<string, WorkbenchReviewSubject> } {
  const byId = new Map<string, WorkbenchReviewSubject>();
  for (const subject of subjects) {
    for (const id of subject.aliases || []) byId.set(id, subject);
  }
  return { byId };
}

function bulkReviewConfirmationBlock(subject: WorkbenchReviewSubject): BulkReviewBlock | null {
  const lifecycle = subject.semanticProjection?.taskLifecycleProjection || {};
  const reviewView = subject.semanticProjection?.reviewWorkbenchQueueView || {};
  if (reviewView.confirmed) {
    return { status: 409, reason: "Review is already confirmed.", payload: { reviewStatus: lifecycle.reviewStatus || "confirmed", taskId: subject.id } };
  }
  if (!reviewView.humanConfirmable) {
    return {
      status: 409,
      reason: "Review completion is only available for tasks in the review queue.",
      payload: {
        reviewQueueState: lifecycle.reviewQueueState || "unknown",
        taskQueues: reviewView.queues || [],
        queueReasons: subject.queueReasons || [],
        repairPrompt: subject.repairPrompt || "",
        reviewStatus: lifecycle.reviewStatus || "unknown",
        taskId: subject.id,
      },
    };
  }
  return null;
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function errorStatus(error: unknown, fallback = 400): number {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : fallback;
}

function errorPayload(error: unknown): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const recovery = (error as { recovery?: unknown })?.recovery;
  return {
    error: message,
    ...(typeof code === "string" ? { code } : {}),
    ...(details && typeof details === "object" ? { details } : {}),
    ...(Array.isArray(recovery) ? { recovery } : {}),
  };
}
