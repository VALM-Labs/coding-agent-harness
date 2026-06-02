#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { confirmTaskReview } from "../scripts/lib/task-lifecycle.mjs";
import type { HarnessTestLooseJson, HarnessTestLooseTask } from "./helpers/harness-test-types.js";
import { assert, expectJson, expectPass, run, sanitizeTemplateFixtureMaterials, tmpRoot } from "./helpers/harness-test-utils.mjs";

type ContractTask = HarnessTestLooseTask & {
  semanticProjection?: {
    taskLifecycleProjection?: Record<string, unknown>;
    dashboardTaskView?: Record<string, unknown>;
    reviewWorkbenchQueueView?: Record<string, unknown>;
  };
  taskLifecycleProjection?: Record<string, unknown>;
  dashboardTaskView?: Record<string, unknown>;
  reviewWorkbenchQueueView?: {
    queues?: string[];
    primaryQueue?: string;
    humanConfirmable?: boolean;
    blocked?: boolean;
    needsMaterials?: boolean;
    finalized?: boolean;
    reasonCodes?: string[];
  };
};

type DashboardBundle = {
  schemaVersion: string;
  status: { tasks: ContractTask[] };
};

const target = path.join(tmpRoot, "semantic-contract-baseline-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", target]);

const active = expectJson(["new-task", "contract-active", "--title", "Contract Active", "--locale", "en-US", target]);
expectJson(["task-start", "contract-active", "--message", "active contract fixture started", target]);

const ready = submitReviewReadyTask("contract-ready-review", "Contract Ready Review");
const missingMaterials = submitReviewReadyTask("contract-missing-materials", "Contract Missing Materials");
fs.rmSync(path.join(taskDirectory(missingMaterials), "walkthrough.md"));

const blocked = submitReviewReadyTask("contract-blocked", "Contract Blocked");
appendOpenBlockingFinding(taskDirectory(blocked), "CB-001", "Contract baseline blocking finding");

const confirmed = submitReviewReadyTask("contract-confirmed", "Contract Confirmed");
commitFixtureBaseline(target, "before contract confirmation");
expectReviewConfirmJson(confirmed.task.id, confirmed.task.shortId);

const status = expectJsonAllowingValidationFailure(["status", "--json", target]);
const taskIndex = expectJsonAllowingValidationFailure(["task-index", "--json", target]);
const statusTasks = status.tasks as unknown as ContractTask[];
const indexTasks = taskIndex.tasks as unknown as ContractTask[];

assert(status.schemaVersion === 2, "status --json must expose schemaVersion 2 for the contract baseline");
assert(taskIndex.schemaVersion === "task-index/v2", "task-index --json must expose task-index/v2 for the contract baseline");

const requiredIds = [
  active.task.id,
  ready.task.id,
  missingMaterials.task.id,
  blocked.task.id,
  confirmed.task.id,
];
for (const id of requiredIds) {
  assert(statusTasks.some((task) => task.id === id), `status --json lost contract task ${id}`);
  assert(indexTasks.some((task) => task.id === id), `task-index --json lost contract task ${id}`);
}

for (const task of statusTasks.filter((item) => requiredIds.includes(item.id))) {
  assertContractFields(task, `status task ${task.id}`);
  assert(task.semanticProjection?.taskLifecycleProjection, `status task ${task.id} missing semanticProjection.taskLifecycleProjection`);
  assert(task.semanticProjection?.dashboardTaskView, `status task ${task.id} missing semanticProjection.dashboardTaskView`);
  assert(task.semanticProjection?.reviewWorkbenchQueueView, `status task ${task.id} missing semanticProjection.reviewWorkbenchQueueView`);
  assert(JSON.stringify(task.taskLifecycleProjection) === JSON.stringify(task.semanticProjection.taskLifecycleProjection), `status task ${task.id} direct lifecycle projection drifted from nested projection`);
  assert(JSON.stringify(task.dashboardTaskView) === JSON.stringify(task.semanticProjection.dashboardTaskView), `status task ${task.id} direct dashboard projection drifted from nested projection`);
  assert(JSON.stringify(task.reviewWorkbenchQueueView) === JSON.stringify(task.semanticProjection.reviewWorkbenchQueueView), `status task ${task.id} direct workbench projection drifted from nested projection`);
}

for (const task of indexTasks.filter((item) => requiredIds.includes(item.id))) {
  assertContractFields(task, `task-index task ${task.id}`);
}

const readyStatus = findTask(statusTasks, ready.task.id);
assert(readyStatus.reviewQueueState === "ready-to-confirm", "ready task should project ready-to-confirm");
assert(readyStatus.reviewWorkbenchQueueView?.humanConfirmable === true, "ready task should be human-confirmable");
assert(readyStatus.reviewWorkbenchQueueView?.primaryQueue === "review", "ready task should use review as primary workbench queue");

const missingStatus = findTask(statusTasks, missingMaterials.task.id);
assert(missingStatus.reviewWorkbenchQueueView?.humanConfirmable === false, "missing-materials fixture must fail closed for human confirmation");
assert(missingStatus.reviewWorkbenchQueueView?.needsMaterials === true, "missing-materials fixture should project material debt");
assert(missingStatus.taskQueues.includes("missing-materials"), "missing-materials fixture should enter missing-materials queue");
assert(missingStatus.reviewWorkbenchQueueView.reasonCodes?.includes("review-closeout-materials-incomplete"), "missing-materials fixture should explain closeout material debt");

const blockedStatus = findTask(statusTasks, blocked.task.id);
assert(blockedStatus.reviewWorkbenchQueueView?.humanConfirmable === false, "blocked fixture must fail closed for human confirmation");
assert(blockedStatus.reviewWorkbenchQueueView?.blocked === true, "blocked fixture should project blocked workbench state");
assert(blockedStatus.taskQueues.includes("blocked"), "blocked fixture should enter blocked queue");

const confirmedStatus = findTask(statusTasks, confirmed.task.id);
assert(confirmedStatus.reviewStatus === "confirmed", "confirmed fixture should expose confirmed reviewStatus");
assert(confirmedStatus.reviewWorkbenchQueueView?.finalized === true, "confirmed fixture should project finalized workbench state");
assert(!confirmedStatus.taskQueues.includes("review"), "confirmed fixture must not remain in review queue");

const dashboardDir = path.join(target, "tmp-dashboard");
expectPass(["dashboard", "--out-dir", dashboardDir, target]);
const dashboardStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8")) as { tasks: ContractTask[] };
const dashboardScript = fs.readFileSync(path.join(dashboardDir, "assets/dashboard-data.js"), "utf8");
const match = dashboardScript.match(/window\.__HARNESS_DASHBOARD__\s*=\s*([\s\S]*);\s*$/);
assert(match, "dashboard-data.js must expose a parseable dashboard bundle");
const dashboardBundle = JSON.parse(match[1]) as DashboardBundle;
assert(dashboardBundle.schemaVersion === "dashboard-bundle/v1", "dashboard bundle should expose dashboard-bundle/v1");

for (const id of requiredIds) {
  assert(dashboardStatus.tasks.some((task) => task.id === id), `dashboard data/status.json lost contract task ${id}`);
  assert(dashboardBundle.status.tasks.some((task) => task.id === id), `dashboard bundle lost contract task ${id}`);
}
for (const task of dashboardBundle.status.tasks.filter((item) => requiredIds.includes(item.id))) {
  assertContractFields(task, `dashboard bundle task ${task.id}`);
  assert(task.reviewWorkbenchQueueView, `dashboard bundle task ${task.id} missing direct reviewWorkbenchQueueView`);
  assert(task.dashboardTaskView, `dashboard bundle task ${task.id} missing direct dashboardTaskView`);
}

assertGuiPreviewOnlyBaseline();

console.log("Semantic contract baseline tests passed");

function submitReviewReadyTask(slug: string, title: string): HarnessTestLooseJson {
  const created = expectJson(["new-task", slug, "--title", title, "--locale", "en-US", target]);
  const taskDir = taskDirectory(created);
  expectJson(["task-start", slug, "--message", `${slug} started`, target]);
  expectJson(["task-phase", slug, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
  sanitizeTemplateFixtureMaterials(taskDir);
  const reviewed = expectJson(["task-review", slug, "--message", `${slug} ready`, "--evidence", "command:TARGET:semantic-contract-baseline:passed", target]);
  fs.appendFileSync(path.join(taskDir, "walkthrough.md"), "\n## Contract Evidence\n\nSemantic contract baseline fixture evidence is present.\n");
  return reviewed;
}

function expectJsonAllowingValidationFailure(args: string[]): HarnessTestLooseJson {
  const result = run(args);
  assert(result.stdout.trim().startsWith("{"), `${args.join(" ")} should emit JSON even when validation fails\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return JSON.parse(result.stdout) as HarnessTestLooseJson;
}

function taskDirectory(result: HarnessTestLooseJson): string {
  return path.join(target, result.task.path.replace(/^TARGET:/, ""));
}

function appendOpenBlockingFinding(taskDir: string, findingId: string, message: string): void {
  const reviewPath = path.join(taskDir, "review.md");
  const content = fs.readFileSync(reviewPath, "utf8");
  fs.writeFileSync(
    reviewPath,
    content.replace(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| ${findingId} | P1 | ${message} | command:TARGET:semantic-contract-baseline:checked | Resolve before human confirmation | yes | open | yes | P01 |`,
    ),
  );
}

function expectReviewConfirmJson(taskId: string, confirmText: string): HarnessTestLooseJson {
  try {
    const payload = confirmTaskReview(target, taskId, {
      reviewer: "Human Reviewer",
      message: "contract baseline confirmation",
      confirmText,
    });
    return payload as HarnessTestLooseJson;
  } catch (error) {
    throw new Error(`review confirmation failed: ${error instanceof Error ? error.message : String(error || "unknown error")}`);
  }
}

function commitFixtureBaseline(targetRoot: string, message: string): void {
  if (!fs.existsSync(path.join(targetRoot, ".git"))) {
    expectFixtureGit(targetRoot, ["init"]);
    expectFixtureGit(targetRoot, ["config", "user.name", "Harness Test"]);
    expectFixtureGit(targetRoot, ["config", "user.email", "harness-test@example.invalid"]);
  }
  expectFixtureGit(targetRoot, ["add", "."]);
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: targetRoot, encoding: "utf8" });
  if (diff.status === 0) return;
  expectFixtureGit(targetRoot, ["commit", "-m", `test fixture baseline: ${message}`]);
}

function expectFixtureGit(targetRoot: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd: targetRoot, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function assertContractFields(task: ContractTask, label: string): void {
  assert(Object.hasOwn(task, "path") || Object.hasOwn(task, "currentPath"), `${label} missing required contract path/currentPath field`);
  for (const field of [
    "id",
    "state",
    "lifecycleState",
    "reviewStatus",
    "reviewQueueState",
    "reviewSubmitted",
    "materialsReady",
    "materialIssues",
    "taskQueues",
    "queueReasons",
    "repairPrompt",
    "closeoutStatus",
    "lessonCandidateStatus",
    "lessonCandidateReviewDecision",
    "lessonCandidatePromotionState",
    "deletionState",
    "supersededBy",
  ]) {
    assert(Object.hasOwn(task, field), `${label} missing required contract field ${field}`);
  }
  assert(Array.isArray(task.taskQueues), `${label} taskQueues must be an array`);
  assert(Array.isArray(task.queueReasons), `${label} queueReasons must be an array`);
  assert(Array.isArray(task.materialIssues), `${label} materialIssues must be an array`);
  assert(typeof task.materialsReady === "boolean", `${label} materialsReady must be boolean`);
}

function findTask(tasks: ContractTask[], id: string): ContractTask {
  const task = tasks.find((item) => item.id === id);
  assert(task, `missing task ${id}`);
  return task;
}

function assertGuiPreviewOnlyBaseline(): void {
  const modelPath = path.join(repoRoot(), "harness-gui/src/model/harnessGui.ts");
  const scannerPath = path.join(repoRoot(), "harness-gui/src/server/scanner.ts");
  assert(fs.existsSync(modelPath) && fs.existsSync(scannerPath), "GUi submodule must be initialized for the P01 contract baseline");
  const model = fs.readFileSync(modelPath, "utf8");
  const scanner = fs.readFileSync(scannerPath, "utf8");
  assert(model.includes("previewOnly: boolean"), "GUi action schema must keep previewOnly as an explicit contract field");
  assert(scanner.includes("previewOnly: true"), "GUi review-confirm action must remain preview-only until P08 consumes stable CLI projection");
  assert(scanner.includes("Disabled as a real write until Harness CLI/core confirm action exists."), "GUi preview-only action must explain why it is not runtime truth");
  assert(scanner.includes("inferQueues("), "P01 baseline should still detect the current independent GUi raw queue inference for P08 routing");
}

function repoRoot(): string {
  return process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}
