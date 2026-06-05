#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  assert,
  expectJson,
  expectPass,
  repoRoot,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

type KernelTaskListPayload = {
  schemaVersion: string;
  adapter: string;
  query: {
    moduleKey?: string;
    queue?: string;
    includeArchived: boolean;
    includeDeleted: boolean;
  };
  tasks: Array<{
    id: string;
    title: string;
    moduleKey?: string;
    queue: string;
    reviewStatus: string;
  }>;
};

type TaskListComparisonPayload = {
  schemaVersion: string;
  command: string;
  oldAdapter: string;
  newAdapter: string;
  compatibilityDecision: string;
  old: {
    tasks?: Array<Record<string, unknown>>;
  };
  kernel: KernelTaskListPayload;
  divergences: Array<{
    field: string;
    classification: string;
    decision: string;
    oldValue?: unknown;
    kernelValue?: unknown;
    reason: string;
  }>;
};

const target = path.join(tmpRoot, "task-kernel-cli-adapter-comparison");
fs.cpSync(path.join(repoRoot, "tests/fixtures/task-kernel-repository/active-standard-task"), target, { recursive: true });
fs.mkdirSync(path.join(target, "coding-agent-harness"), { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, "examples/minimal-project/coding-agent-harness/harness.yaml"),
  path.join(target, "coding-agent-harness/harness.yaml"),
);

const kernelList = expectJson<KernelTaskListPayload>([
  "task-list",
  "--json",
  "--task-kernel",
  "--module",
  "task-kernel",
  target,
]);
assert(kernelList.schemaVersion === "task-kernel-cli-task-list/v1", "task-list --task-kernel should expose the Kernel CLI schema");
assert(kernelList.adapter === "task-kernel", "task-list --task-kernel should identify the Kernel adapter");
assert(kernelList.query.moduleKey === "task-kernel", "task-list --task-kernel should map --module into ListTasks input");
assert(kernelList.tasks.length === 1, "Kernel task-list should return the fixture task");
assert(kernelList.tasks[0]?.id === "2026-06-05-active-standard-task", "Kernel task-list should use canonical TaskId");
assert(kernelList.tasks[0]?.queue === "active", "Kernel task-list should use domain queue classification");
assert(kernelList.tasks[0]?.reviewStatus === "agent-reviewed", "Kernel task-list should use domain review status");

const kernelText = expectPass([
  "task-list",
  "--task-kernel",
  "--module",
  "task-kernel",
  target,
]);
assert(kernelText.stdout.includes("2026-06-05-active-standard-task\tactive\tagent-reviewed\tActive standard task"), "Kernel task-list text output should format the summary projection");

const comparison = expectJson<TaskListComparisonPayload>([
  "task-list",
  "--json",
  "--compare-task-kernel",
  "--module",
  "task-kernel",
  target,
]);
assert(comparison.schemaVersion === "task-kernel-cli-comparison/v1", "comparison should expose the comparison schema");
assert(comparison.oldAdapter === "legacy-cli", "comparison should include the old CLI adapter output");
assert(comparison.newAdapter === "task-kernel", "comparison should include the Kernel adapter output");
assert(comparison.compatibilityDecision === "compatible-with-classified-divergences", "comparison should classify divergences instead of treating old output as golden");
assert(comparison.old.tasks?.length === 1, "comparison should capture the legacy task-list row");
assert(comparison.kernel.tasks.length === 1, "comparison should capture the Kernel task-list row");
assert(comparison.divergences.length > 0, "comparison should classify old-vs-Kernel differences");
assert(
  comparison.divergences.every((divergence) => divergence.classification && divergence.decision && divergence.reason),
  "every comparison divergence should have a classification, decision, and reason",
);
assert(
  comparison.divergences.some((divergence) => divergence.field.endsWith(".queue") && divergence.classification === "intentional-divergence"),
  "queue mismatch should be classified as an intentional domain-truth divergence",
);
assert(
  comparison.divergences.some((divergence) => divergence.field.endsWith(".id") && divergence.classification === "adapter-display-only"),
  "legacy path-derived id mismatch should be display-only",
);
assert(
  comparison.divergences.some((divergence) => divergence.field.endsWith(".legacyExtraFields") && divergence.classification === "adapter-display-only"),
  "legacy scanner extra fields should be display-only",
);

const unsupportedFilter = run([
  "task-list",
  "--task-kernel",
  "--state",
  "active",
  target,
]);
assert(unsupportedFilter.status === 2, "Kernel task-list should reject unsupported legacy-only filters");
assert(unsupportedFilter.stderr.includes("currently support only --module, --queue, and --include-archived"), "unsupported filter error should explain the supported Kernel slice");

console.log("Task Kernel CLI adapter comparison tests passed");
