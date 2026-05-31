import fs from "node:fs";
import path from "node:path";
import { beginGovernanceSync, commitGovernanceSync, inspectGit, releaseGovernanceSync } from "./governance-sync.mjs";
import { normalizeTarget, toPosix } from "./core-shared.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";

type HarnessTransactionTarget = {
  projectRoot: string;
  harness?: ResolvedHarnessPaths;
  [key: string]: unknown;
};

type GitInspection = ReturnType<typeof inspectGit>;
type GovernanceCommitSummary = ReturnType<typeof commitGovernanceSync>;

export type FileWrite = {
  path: string;
  content: string | Uint8Array;
  encoding?: BufferEncoding;
  mode?: number;
  action?: string;
  surface?: string;
};

export type FileDelete = {
  path: string;
  recursive?: boolean;
  force?: boolean;
  action?: string;
  surface?: string;
};

export type GeneratedSurface = {
  surface: string;
  paths?: string[];
};

export type TransactionCommitOptions = {
  message: string;
  defer?: boolean;
  allowDirtyWorktree?: boolean;
  allowDirtyWriteScope?: boolean;
};

export type TransactionMutationResult = {
  allowedPaths?: string[];
  generatedSurfaces?: Array<string | GeneratedSurface>;
  commit?: Partial<TransactionCommitOptions>;
};

export type TransactionMutationContext = {
  target: HarnessTransactionTarget;
  plan: TransactionPlan;
};

export type ChangeSet = {
  operation: string;
  writes?: FileWrite[];
  deletes?: FileDelete[];
  generatedSurfaces?: Array<string | GeneratedSurface>;
  allowedPaths?: string[];
  commit?: TransactionCommitOptions;
  dryRun?: boolean;
  apply?: (context: TransactionMutationContext) => TransactionMutationResult | void;
};

export type TransactionPlan = {
  changeSet: ChangeSet;
  operation: string;
  dryRun: boolean;
  targetRoot: string;
  allowedPaths: string[];
  generatedSurfaces: string[];
  git: GitInspection;
  conflicts: string[];
};

export type TransactionReleaseSummary = {
  attempted: boolean;
  completed: boolean;
  lockPath: string;
};

export type TransactionErrorSummary = {
  name: string;
  message: string;
  code?: string;
  details?: unknown;
  recovery?: unknown[];
};

export type TransactionSuccess = {
  success: true;
  operation: string;
  dryRun: boolean;
  allowedPaths: string[];
  generatedSurfaces: string[];
  git: GitInspection;
  writes: string[];
  deletes: string[];
  commit: GovernanceCommitSummary;
  release: TransactionReleaseSummary;
};

export type TransactionFailure = {
  success: false;
  operation: string;
  dryRun: boolean;
  allowedPaths: string[];
  generatedSurfaces: string[];
  git: GitInspection;
  writes: string[];
  deletes: string[];
  commit: GovernanceCommitSummary & { reason: "failed" };
  release: TransactionReleaseSummary;
  error: TransactionErrorSummary;
  cause: unknown;
};

export type TransactionResult = TransactionSuccess | TransactionFailure;

export type HarnessTransaction = {
  plan(changeSet: ChangeSet): TransactionPlan;
  apply(plan: TransactionPlan): TransactionResult;
};

export function createGovernanceHarnessTransaction(targetInput: string | HarnessTransactionTarget = "."): HarnessTransaction {
  const target = normalizeTransactionTarget(targetInput);
  return {
    plan(changeSet) {
      const git = inspectGit(target.projectRoot);
      const allowedPaths = normalizeAllowedPaths(target, pathsFromChangeSet(changeSet));
      const generatedSurfaces = generatedSurfaceNames(changeSet.generatedSurfaces || []);
      return {
        changeSet,
        operation: changeSet.operation || "harness-transaction",
        dryRun: changeSet.dryRun === true,
        targetRoot: target.projectRoot,
        allowedPaths,
        generatedSurfaces,
        git,
        conflicts: detectPlanConflicts(git, allowedPaths, changeSet.commit),
      };
    },
    apply(plan) {
      const lockPath = governanceLockPath(target);
      let release = releaseSummary(lockPath, false);
      let context: ReturnType<typeof beginGovernanceSync> | null = null;
      let allowedPaths = [...plan.allowedPaths];
      let generatedSurfaces = [...plan.generatedSurfaces];
      const writes = writePaths(target, plan.changeSet.writes || []);
      const deletes = deletePaths(target, plan.changeSet.deletes || []);
      try {
        context = beginGovernanceSync(target, {
          operation: plan.operation,
          dryRun: plan.dryRun,
          allowDirtyWorktree: plan.changeSet.commit?.allowDirtyWorktree === true,
          allowDirtyWriteScope: plan.changeSet.commit?.allowDirtyWriteScope === true,
          allowedRelativePaths: allowedPaths,
        });
        applyDeclarativeChanges(target, plan);
        const mutation = plan.changeSet.apply?.({ target, plan }) || {};
        const mutationGeneratedSurfaces = mutation.generatedSurfaces || [];
        allowedPaths = normalizeAllowedPaths(target, [...allowedPaths, ...(mutation.allowedPaths || []), ...generatedSurfacePaths(mutationGeneratedSurfaces)]);
        generatedSurfaces = [...new Set([...generatedSurfaces, ...generatedSurfaceNames(mutationGeneratedSurfaces)])].sort();
        const commitOptions = { ...(plan.changeSet.commit || {}), ...(mutation.commit || {}) };
        const commit = commitOptions.defer === true
          ? { committed: false, reason: "deferred", allowedPaths }
          : commitGovernanceSync(context, allowedPaths, { message: commitOptions.message || "chore(harness): sync governance state" });
        release = releaseGovernanceContext(context, lockPath);
        return {
          success: true,
          operation: plan.operation,
          dryRun: plan.dryRun,
          allowedPaths,
          generatedSurfaces,
          git: plan.git,
          writes,
          deletes,
          commit,
          release,
        };
      } catch (error) {
        release = releaseGovernanceContext(context, lockPath);
        return {
          success: false,
          operation: plan.operation,
          dryRun: plan.dryRun,
          allowedPaths,
          generatedSurfaces,
          git: plan.git,
          writes,
          deletes,
          commit: { committed: false, reason: "failed", allowedPaths },
          release,
          error: summarizeError(error),
          cause: error,
        };
      }
    },
  };
}

export function assertTransactionSucceeded(result: TransactionResult): asserts result is TransactionSuccess {
  if (result.success) return;
  throw result.cause instanceof Error ? result.cause : new Error(result.error.message);
}

function normalizeTransactionTarget(targetInput: string | HarnessTransactionTarget): HarnessTransactionTarget {
  if (typeof targetInput === "string") return normalizeTarget(targetInput) as HarnessTransactionTarget;
  return targetInput;
}

function pathsFromChangeSet(changeSet: ChangeSet): string[] {
  return [
    ...(changeSet.allowedPaths || []),
    ...(changeSet.writes || []).map((write) => write.path),
    ...(changeSet.deletes || []).map((deleted) => deleted.path),
    ...generatedSurfacePaths(changeSet.generatedSurfaces || []),
  ];
}

function generatedSurfaceNames(surfaces: Array<string | GeneratedSurface>): string[] {
  return [...new Set(surfaces.map((surface) => typeof surface === "string" ? surface : surface.surface).filter(Boolean))].sort();
}

function generatedSurfacePaths(surfaces: Array<string | GeneratedSurface>): string[] {
  return surfaces.flatMap((surface) => typeof surface === "string" ? [] : surface.paths || []);
}

function normalizeAllowedPaths(target: HarnessTransactionTarget, rawPaths: string[]): string[] {
  return [...new Set(rawPaths.filter(Boolean).map((rawPath) => relativeTargetPath(target, rawPath)).filter(Boolean))].sort();
}

function detectPlanConflicts(git: GitInspection, allowedPaths: string[], commit: TransactionCommitOptions | undefined): string[] {
  if (!git.inGit || git.entries.length === 0) return [];
  if (commit?.allowDirtyWorktree !== true) return git.entries.map((entry) => `dirty git entry: ${entry.path}`);
  const allowed = new Set(allowedPaths);
  const conflicts: string[] = [];
  if (commit.allowDirtyWriteScope !== true) {
    conflicts.push(...git.entries.filter((entry) => allowed.has(entry.path)).map((entry) => `dirty allowed path: ${entry.path}`));
  }
  conflicts.push(...git.entries.filter((entry) => entry.index !== " " && entry.index !== "?" && !allowed.has(entry.path)).map((entry) => `staged outside transaction scope: ${entry.path}`));
  return conflicts;
}

function applyDeclarativeChanges(target: HarnessTransactionTarget, plan: TransactionPlan): void {
  if (plan.dryRun) return;
  for (const write of plan.changeSet.writes || []) {
    const destination = path.join(target.projectRoot, relativeTargetPath(target, write.path));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (typeof write.content === "string") {
      fs.writeFileSync(destination, write.content, write.encoding || "utf8");
    } else {
      fs.writeFileSync(destination, write.content);
    }
    if (write.mode !== undefined) fs.chmodSync(destination, write.mode);
  }
  for (const deleted of plan.changeSet.deletes || []) {
    const destination = path.join(target.projectRoot, relativeTargetPath(target, deleted.path));
    fs.rmSync(destination, { recursive: deleted.recursive === true, force: deleted.force !== false });
  }
}

function writePaths(target: HarnessTransactionTarget, writes: FileWrite[]): string[] {
  return writes.map((write) => relativeTargetPath(target, write.path));
}

function deletePaths(target: HarnessTransactionTarget, deletes: FileDelete[]): string[] {
  return deletes.map((deleted) => relativeTargetPath(target, deleted.path));
}

function relativeTargetPath(target: HarnessTransactionTarget, rawPath: string): string {
  const stripped = String(rawPath || "").replace(/^TARGET:/, "").replace(/^\.\//, "");
  const relative = path.isAbsolute(stripped) ? path.relative(target.projectRoot, stripped) : stripped;
  return toPosix(relative);
}

function releaseGovernanceContext(context: ReturnType<typeof beginGovernanceSync> | null, lockPath: string): TransactionReleaseSummary {
  releaseGovernanceSync(context);
  return releaseSummary(lockPath, true);
}

function releaseSummary(lockPath: string, attempted: boolean): TransactionReleaseSummary {
  return {
    attempted,
    completed: !fs.existsSync(lockPath),
    lockPath,
  };
}

function governanceLockPath(target: HarnessTransactionTarget): string {
  return path.join(target.projectRoot, ".harness/locks/governance-sync.lock");
}

function summarizeError(error: unknown): TransactionErrorSummary {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };
  const candidate = error as Error & { code?: string; details?: unknown; recovery?: unknown[] };
  return {
    name: candidate.name || "Error",
    message: candidate.message,
    code: candidate.code,
    details: candidate.details,
    recovery: candidate.recovery,
  };
}
