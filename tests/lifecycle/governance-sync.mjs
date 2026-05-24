#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  expectJson,
  run,
  tmpRoot,
  todayLocal,
} from "../helpers/harness-test-utils.mjs";

const target = path.join(tmpRoot, "governance-sync-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "test fixture baseline"]);

const created = expectJson(["new-task", "governance-owned", "--title", "Governance Owned", "--locale", "en-US", "--module", "sync", target]);
assert(created.governance?.commit?.committed === true, "new-task should auto-commit governance sync in git targets");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "new-task governance sync should leave git clean");
assert(git(target, ["log", "-1", "--format=%s"]).stdout.trim() === `chore(harness): register task ${created.task.id}`, "new-task commit subject should identify registered task");

const featurePath = path.join(target, "docs/09-PLANNING/Feature-SSoT.md");
const ledgerPath = path.join(target, "docs/Harness-Ledger.md");
const registryPath = path.join(target, "docs/09-PLANNING/Module-Registry.md");
assert(fs.readFileSync(featurePath, "utf8").includes(`docs/09-PLANNING/MODULES/sync/${todayLocal}-governance-owned/task_plan.md`), "new-task should register task in Feature SSoT");
assert(fs.readFileSync(ledgerPath, "utf8").includes(`docs/09-PLANNING/MODULES/sync/${todayLocal}-governance-owned/task_plan.md`), "new-task should register task in Harness Ledger");
assert(fs.readFileSync(registryPath, "utf8").includes("docs/09-PLANNING/MODULES/sync/module_plan.md"), "new-task --module should register module registry row");

fs.writeFileSync(path.join(target, "UNRELATED.txt"), "dirty\n");
const dirtyResult = run(["new-task", "dirty-refused", "--title", "Dirty Refused", target]);
assert(dirtyResult.status !== 0, "governance sync should refuse unrelated dirty files before writing");
assert(dirtyResult.stderr.includes("clean Git working tree"), "dirty refusal should explain clean git requirement");
fs.rmSync(path.join(target, "UNRELATED.txt"));

const lockDir = path.join(target, ".harness/locks");
fs.mkdirSync(lockDir, { recursive: true });
fs.writeFileSync(path.join(lockDir, "governance-sync.lock"), "held by test\n");
const lockResult = run(["new-task", "lock-refused", "--title", "Lock Refused", target]);
assert(lockResult.status !== 0, "governance sync should refuse concurrent lock");
assert(lockResult.stderr.includes("lock already exists"), "lock refusal should explain concurrent registry write");
fs.rmSync(path.join(lockDir, "governance-sync.lock"));

console.log("Governance sync tests passed");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
