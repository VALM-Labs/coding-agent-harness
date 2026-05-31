#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { createGovernanceHarnessTransaction, assertTransactionSucceeded } from "../scripts/lib/harness-transaction.mjs";
import { normalizeTarget } from "../scripts/lib/core-shared.mjs";
import {
  assert,
  expectJson,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

type TransactionCommit = {
  committed?: boolean;
  commitSha?: string;
  allowedPaths?: string[];
};

type NewTaskResponse = {
  task: {
    id: string;
    shortId?: string;
    path?: string;
  };
};

const target = path.join(tmpRoot, "harness-transaction-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "test fixture baseline"]);

const transaction = createGovernanceHarnessTransaction(normalizeTarget(target));
const changeSet = {
  operation: "transaction-plan-apply",
  writes: [
    {
      path: "coding-agent-harness/planning/tasks/transaction-plan/task_plan.md",
      content: "# Transaction Plan\n",
      action: "create",
    },
    {
      path: "coding-agent-harness/governance/generated/transaction-index.md",
      content: "# Transaction Index\n",
      action: "sync-governance",
      surface: "test-generated-index",
    },
  ],
  generatedSurfaces: [
    {
      surface: "test-generated-index",
      paths: ["coding-agent-harness/governance/generated/transaction-index.md"],
    },
  ],
  commit: {
    message: "chore(harness): apply transaction fixture",
  },
};

const plan = transaction.plan(changeSet);
assert(plan.operation === "transaction-plan-apply", "transaction plan should expose the operation name");
assert(plan.git.inGit === true, "transaction plan should include git inspection");
assert(plan.allowedPaths.includes("coding-agent-harness/planning/tasks/transaction-plan/task_plan.md"), "plan should allow file writes");
assert(plan.allowedPaths.includes("coding-agent-harness/governance/generated/transaction-index.md"), "plan should allow generated surface paths");
assert(plan.generatedSurfaces.includes("test-generated-index"), "plan should summarize generated surfaces");
assert(!fs.existsSync(path.join(target, "coding-agent-harness/planning/tasks/transaction-plan/task_plan.md")), "plan should not write files");

const result = transaction.apply(plan);
assertTransactionSucceeded(result);
const commit = result.commit as TransactionCommit;
assert(commit.committed === true, "transaction apply should auto-commit allowed writes");
assert(commit.allowedPaths?.includes("coding-agent-harness/planning/tasks/transaction-plan/task_plan.md"), "commit summary should include allowed write path");
assert(commit.allowedPaths?.includes("coding-agent-harness/governance/generated/transaction-index.md"), "commit summary should include generated surface path");
assert(/^[0-9a-f]{7,40}$/.test(commit.commitSha || ""), "commit summary should include commit SHA");
assert(fs.readFileSync(path.join(target, "coding-agent-harness/planning/tasks/transaction-plan/task_plan.md"), "utf8") === "# Transaction Plan\n", "transaction apply should write content");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "transaction apply should leave git clean");

fs.writeFileSync(path.join(target, "DIRTY.txt"), "dirty\n");
const dirtyPlan = transaction.plan({
  operation: "transaction-dirty-gate",
  writes: [{ path: "coding-agent-harness/planning/tasks/dirty/task_plan.md", content: "# Dirty\n" }],
  commit: { message: "chore(harness): dirty transaction fixture" },
});
assert(dirtyPlan.conflicts.some((conflict) => conflict.includes("DIRTY.txt")), "dirty plan should summarize git conflicts");
const dirtyResult = transaction.apply(dirtyPlan);
assert(dirtyResult.success === false, "transaction apply should return a failure result for dirty git gates");
assert(dirtyResult.error?.message.includes("clean Git working tree"), "dirty failure should preserve governance-sync error text");
assert(dirtyResult.release.completed === true, "dirty failure should report release completion");
assert(!fs.existsSync(path.join(target, ".harness/locks/governance-sync.lock")), "dirty failure should release the governance sync lock");
fs.rmSync(path.join(target, "DIRTY.txt"));

const failurePlan = transaction.plan({
  operation: "transaction-release-on-failure",
  writes: [{ path: "coding-agent-harness/planning/tasks/release-failure/task_plan.md", content: "# Release Failure\n" }],
  commit: { message: "chore(harness): release failure fixture" },
  apply() {
    throw new Error("planned transaction callback failure");
  },
});
const failureResult = transaction.apply(failurePlan);
assert(failureResult.success === false, "transaction apply should capture callback failures");
assert(failureResult.error?.message === "planned transaction callback failure", "callback failure should keep its message");
assert(failureResult.release.completed === true, "callback failure should release governance sync");
assert(!fs.existsSync(path.join(target, ".harness/locks/governance-sync.lock")), "callback failure should remove the lock file");

const lifecycleTarget = path.join(tmpRoot, "harness-transaction-lifecycle-target");
fs.mkdirSync(lifecycleTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", lifecycleTarget]);
git(lifecycleTarget, ["init"]);
git(lifecycleTarget, ["config", "user.name", "Harness Test"]);
git(lifecycleTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(lifecycleTarget, ["add", "."]);
git(lifecycleTarget, ["commit", "-m", "test fixture baseline"]);
expectJson(["module", "register", "txn", "--title", "Transaction", "--prefix", "TXN", "--scope", "src/txn/**", lifecycleTarget]);
const created = expectJson<NewTaskResponse>(["new-task", "transaction-lifecycle", "--title", "Transaction Lifecycle", "--locale", "en-US", "--module", "txn", lifecycleTarget]);
expectJson(["task-start", created.task.shortId || "transaction-lifecycle", "--message", "start transaction lifecycle", lifecycleTarget]);
expectJson(["task-phase", created.task.shortId || "transaction-lifecycle", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const reviewResult = expectJson(["task-review", created.task.shortId || "transaction-lifecycle", "--message", "ready for transaction review", lifecycleTarget]);
assert(Boolean(reviewResult), "task-review should return JSON after transaction migration");
const ledgerPath = path.join(lifecycleTarget, "coding-agent-harness/governance/generated/Harness-Ledger.md");
const modulePlanPath = path.join(lifecycleTarget, "coding-agent-harness/planning/modules/txn/module_plan.md");
assert(fs.readFileSync(ledgerPath, "utf8").includes("Transaction Lifecycle"), "transaction-migrated lifecycle review should sync generated governance ledger");
assert(fs.readFileSync(modulePlanPath, "utf8").includes("transaction-lifecycle"), "transaction-migrated lifecycle review should regenerate module plan index");
assert(git(lifecycleTarget, ["status", "--short"]).stdout.trim() === "", "transaction-migrated lifecycle review should leave git clean");

console.log("HarnessTransaction tests passed");

function git(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
