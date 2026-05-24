#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  expectJson,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

const target = path.join(tmpRoot, "governance-table-boundary-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", target]);

const docsRoot = path.join(target, "docs");
fs.mkdirSync(path.join(docsRoot, "09-PLANNING", "MODULES", "dashboard"), { recursive: true });
fs.writeFileSync(
  path.join(docsRoot, "09-PLANNING", "MODULES", "dashboard", "module_plan.md"),
  [
    "# Dashboard Module Plan",
    "",
    "| Step ID | Name | Status | Owner / Handoff | Evidence |",
    "| --- | --- | --- | --- | --- |",
    "| DASH-LOCAL-001 | Local drawer parser repair | in-progress | Worker C | keep implementation details here |",
    "",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(docsRoot, "09-PLANNING", "Feature-SSoT.md"),
  [
    "# Feature SSoT",
    "",
    "| ID | Feature | User Outcome | Owner | Status | Priority | Task Plan | Acceptance Evidence | Regression Gate | Walkthrough | Residual | Updated |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| PF-OK-001 | Dashboard boundary summary | Overview links to module/task details | Worker C | active | P2 | `docs/09-PLANNING/TASKS/2026-05-24-governance-table-entropy-checker/task_plan.md` | `npm test` | RG-dashboard | pending | none | 2026-05-24 |",
    "| PF-BAD-001 | Module drawer implementation detail | Copy every parser branch, button label, and repair prompt from DASH-LOCAL-001 into this global table so the global SSoT becomes the implementation log | Worker C | active | P2 | `docs/09-PLANNING/MODULES/dashboard/module_plan.md` | full local evidence paragraph with execution log and temporary repair prompt | RG-dashboard | pending | none | 2026-05-24 |",
    "",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(docsRoot, "01-GOVERNANCE", "Lessons-SSoT.md"),
  [
    "# Lessons SSoT",
    "",
    "| ID | Pattern | Status | Detail Doc | Source Task | Updated |",
    "| --- | --- | --- | --- | --- | --- |",
    "| L-OK-001 | Promoted review routing lesson | approved | `docs/01-GOVERNANCE/lessons/L-OK-001.md` | `docs/09-PLANNING/TASKS/2026-05-24-governance-table-entropy-checker` | 2026-05-24 |",
    "| LC-BAD-001 | Candidate: maybe the dashboard should show a repair prompt transcript before human decision | pending-human-review | none | `docs/09-PLANNING/TASKS/2026-05-24-governance-table-entropy-checker/lesson_candidates.md` | 2026-05-24 |",
    "",
  ].join("\n"),
);

fs.writeFileSync(
  path.join(docsRoot, "Harness-Ledger.md"),
  [
    "# Harness Ledger",
    "",
    "| ID | Date | Task | Owner | Task Plan | Review | Regression | Walkthrough | Lessons Check | Evidence Summary | Residual | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| HL-OK-001 | 2026-05-24 | Boundary checker | Worker C | `docs/09-PLANNING/TASKS/2026-05-24-governance-table-entropy-checker/task_plan.md` | `review.md` | `npm test` | pending | checked-none: no reusable lesson | commands passed; no residual | none | open |",
    "| HL-LEGACY-001 | 2026-05-20 | Legacy overloaded row | Worker A | `docs/09-PLANNING/TASKS/legacy/task_plan.md` | `review.md` | `npm test` | old | checked-none: old row | Legacy execution log: step one copied all output, step two pasted reviewer transcript, step three included temporary repair prompt for a previous task. This predates the checker cutoff and should be reported only. | none | closed |",
    "| HL-BAD-001 | 2026-05-24 | New overloaded row | Worker C | `docs/09-PLANNING/TASKS/2026-05-24-governance-table-entropy-checker/task_plan.md` | `review.md` | `npm test` | pending | checked-none: no reusable lesson | Execution log: first command failed, second command printed a long stack trace, copied raw evidence paragraph, and temporary repair prompt for the agent to paste back into the task. | none | open |",
    "",
  ].join("\n"),
);

const check = run(["check", "--profile", "target-project", target]);
assert(check.status !== 0, "new overloaded global table rows should fail target-project check");
assert(check.stderr.includes("PF-BAD-001"), "Feature SSoT local detail row should be reported as a failure");
assert(check.stderr.includes("LC-BAD-001"), "Lessons SSoT candidate row should be reported as a failure");
assert(check.stderr.includes("HL-BAD-001"), "Harness Ledger execution log row should be reported as a failure");
assert(!check.stderr.includes("PF-OK-001"), "allowed summary row should not be reported as a failure");
assert(!check.stderr.includes("L-OK-001"), "promoted lesson summary row should not be reported as a failure");
assert(check.stdout.includes("HL-LEGACY-001"), "legacy overloaded row should be reported as a warning");
assert(!check.stderr.includes("HL-LEGACY-001"), "legacy overloaded row should not fail the check");

const dashboardDir = path.join(tmpRoot, "governance-table-boundary-dashboard");
const dashboard = run(["dashboard", "--out-dir", dashboardDir, target]);
assert(dashboard.status === 0, `dashboard generation should tolerate report-only legacy rows\n${dashboard.stderr}`);
const adoption = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/adoption.json"), "utf8"));
const entropyWarnings = adoption.warnings.filter((warning) => warning.type === "governance-table-entropy");
assert(entropyWarnings.length >= 4, "dashboard adoption data should expose governance table entropy warnings");
assert(entropyWarnings.every((warning) => warning.phase === "global-table-boundary"), "entropy warnings should use a stable dashboard phase");
assert(entropyWarnings.some((warning) => warning.id.includes("HL-LEGACY-001") && warning.status === "legacy-report-only"), "legacy overload should be visible but report-only in dashboard data");
assert(entropyWarnings.some((warning) => warning.id.includes("PF-BAD-001") && warning.status === "open"), "new violations should be visible as open dashboard warnings");

console.log("Governance table boundary tests passed");
