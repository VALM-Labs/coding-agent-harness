import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { existsInDocs, readBundledTemplate, readFileSafe, repoRoot, todayDate, toPosix } from "./core-shared.mjs";
import { firstColumn, splitMarkdownRow, updateMarkdownTableRow } from "./markdown-utils.mjs";
import { markdownCell } from "./task-lifecycle/text-utils.mjs";

export class GovernanceSyncError extends Error {
  constructor(message, { code = "governance-sync-failed", details = {}, recovery = [] } = {}) {
    super(message);
    this.name = "GovernanceSyncError";
    this.code = code;
    this.details = details;
    this.recovery = recovery;
  }
}

export function beginGovernanceSync(target, { operation = "governance-sync", dryRun = false } = {}) {
  if (dryRun) return { target, dryRun, operation, git: inspectGit(target.projectRoot), lockPath: "", active: false };
  const lockPath = path.join(target.projectRoot, ".harness/locks/governance-sync.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(
      fd,
      `${JSON.stringify({
        operation,
        pid: process.pid,
        host: process.env.HOSTNAME || "",
        branch: currentBranch(target.projectRoot),
        targetRoot: target.projectRoot,
        startedAt: new Date().toISOString(),
      }, null, 2)}\n`,
    );
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    throw new GovernanceSyncError("Governance sync lock already exists; refusing concurrent registry writes.", {
      code: "governance-lock-exists",
      details: { lockPath, error: error.message },
      recovery: [
        `Inspect ${lockPath}.`,
        "If no process owns the lock, remove it manually and retry.",
      ],
    });
  }
  if (fd !== null) fs.closeSync(fd);

  const gitState = inspectGit(target.projectRoot);
  if (gitState.inGit) {
    if (real(gitState.gitRoot) !== real(target.projectRoot)) {
      releaseGovernanceSync({ lockPath, active: true });
      throw new GovernanceSyncError("Governance sync requires the target argument to be the Git repository root.", {
        code: "governance-git-root-mismatch",
        details: { targetRoot: target.projectRoot, gitRoot: gitState.gitRoot },
        recovery: ["Run the harness command against the target repository root."],
      });
    }
    if (gitState.entries.length > 0) {
      releaseGovernanceSync({ lockPath, active: true });
      throw new GovernanceSyncError("Governance sync requires a clean Git working tree before CLI-owned writes.", {
        code: "governance-git-dirty",
        details: { entries: gitState.entries },
        recovery: ["Commit or otherwise resolve unrelated changes before running this lifecycle command."],
      });
    }
    assertCommitIdentity(target.projectRoot);
  }
  return { target, dryRun, operation, git: gitState, lockPath, active: true };
}

export function releaseGovernanceSync(context) {
  if (!context?.active || !context.lockPath) return;
  try {
    fs.unlinkSync(context.lockPath);
  } catch {
    // Best-effort cleanup; command errors report the original failure.
  }
}

export function commitGovernanceSync(context, allowedRelativePaths, { message = "chore(harness): sync governance state" } = {}) {
  const allowed = [...new Set((allowedRelativePaths || []).filter(Boolean).map(toPosix))].sort();
  if (context?.dryRun || !context?.git?.inGit) return { committed: false, reason: context?.git?.inGit ? "dry-run" : "not-git", allowedPaths: allowed };
  assertOnlyAllowedChanged(context.target.projectRoot, allowed);
  if (allowed.length === 0) return { committed: false, reason: "no-allowed-paths", allowedPaths: allowed };
  git(context.target.projectRoot, ["add", "--", ...allowed]);
  assertOnlyAllowedStaged(context.target.projectRoot, allowed);
  const staged = git(context.target.projectRoot, ["diff", "--cached", "--name-only", "-z"]).stdout.split("\0").filter(Boolean);
  if (staged.length === 0) return { committed: false, reason: "no-changes", allowedPaths: allowed };
  const commitResult = git(context.target.projectRoot, ["commit", "-m", message], { allowFailure: true });
  if (commitResult.status !== 0) {
    throw new GovernanceSyncError("Governance sync wrote files but Git commit failed.", {
      code: "governance-git-commit-failed",
      details: { stdout: commitResult.stdout.trim(), stderr: commitResult.stderr.trim(), allowedPaths: allowed },
      recovery: [
        `Inspect files: ${allowed.join(", ")}`,
        `Then run: git add -- ${allowed.join(" ")} && git commit -m ${JSON.stringify(message)}`,
      ],
    });
  }
  assertClean(context.target.projectRoot);
  return { committed: true, commitSha: git(context.target.projectRoot, ["rev-parse", "HEAD"]).stdout.trim(), allowedPaths: allowed };
}

export function syncTaskGovernance(target, task, { event = "new-task", state = "planned", message = "", dryRun = false } = {}) {
  const changes = [];
  const planPath = stripTargetPrefix(task.path) + "/task_plan.md";
  const reviewPath = stripTargetPrefix(task.path) + "/review.md";
  const feature = syncFeatureRow(target, task, { state, message, planPath, dryRun });
  if (feature) changes.push(feature);
  const ledger = syncLedgerRow(target, task, { event, state, message, planPath, reviewPath, dryRun });
  if (ledger) changes.push(ledger);
  if (task.module) {
    const moduleRegistry = syncModuleRegistryRow(target, task, { state, planPath, dryRun });
    if (moduleRegistry) changes.push(moduleRegistry);
  }
  return { changes };
}

export function syncModuleStepGovernance(target, { moduleKey, stepId, state, dryRun = false } = {}) {
  const changes = [];
  const ledgerPath = path.join(target.docsRoot, "Harness-Ledger.md");
  const ledgerRelative = toPosix(path.relative(target.projectRoot, ledgerPath));
  ensureFileFromTemplate(ledgerPath, "templates/ledger/Harness-Ledger.md", { dryRun });
  if (!dryRun) {
    const content = readFileSafe(ledgerPath);
    const row = [
      `HL-${todayDate().replaceAll("-", "")}-${Date.now().toString().slice(-6)}`,
      `Module ${moduleKey} step ${stepId}`,
      "coordinator",
      state === "done" ? "review" : state === "in-progress" ? "active" : state,
      `docs/09-PLANNING/MODULES/${moduleKey}/module_plan.md`,
      "module-registry",
      "n/a",
      "n/a",
      "pending",
      "checked-none:module-step",
      "none",
      todayDate(),
    ];
    fs.writeFileSync(ledgerPath, appendRow(content, /^ID$/i, row));
  }
  changes.push({ destination: ledgerRelative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "harness-ledger" });
  return { changes };
}

export function governanceRelativePaths(changes) {
  return [...new Set((changes || []).map((change) => change.destination).filter(Boolean).map(toPosix))];
}

function syncFeatureRow(target, task, { state, message, planPath, dryRun }) {
  const featurePath = featureRegistryPath(target);
  ensureFileFromTemplate(featurePath, "templates/ssot/Feature-SSoT.md", { dryRun });
  const relative = toPosix(path.relative(target.projectRoot, featurePath));
  if (!dryRun) {
    const content = readFileSafe(featurePath);
    const privateTable = path.basename(featurePath) === "Private-Feature-SSoT.md";
    const row = privateTable
      ? [
          featureId(task, true),
          mapPrivateFeatureState(state),
          markdownCell(task.title || task.shortId || task.id),
          "coordinator",
          `\`${planPath}\``,
          markdownCell(message || `CLI governance sync: ${state}`),
        ]
      : [
          featureId(task, false),
          markdownCell(task.title || task.shortId || task.id),
          "CLI-owned task lifecycle update",
          "coordinator",
          mapFeatureState(state),
          "P2",
          planPath,
          "pending",
          "n/a",
          "pending",
          "none",
          todayDate(),
        ];
    fs.writeFileSync(featurePath, upsertRow(content, privateTable ? /^ID$/i : /^ID$/i, (header, existing) => rowMatchesPlan(header, existing, planPath), row));
  }
  return { destination: relative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "feature-ssot" };
}

function syncLedgerRow(target, task, { event, state, message, planPath, reviewPath, dryRun }) {
  const ledgerPath = path.join(target.docsRoot, "Harness-Ledger.md");
  ensureFileFromTemplate(ledgerPath, "templates/ledger/Harness-Ledger.md", { dryRun });
  const relative = toPosix(path.relative(target.projectRoot, ledgerPath));
  if (!dryRun) {
    const content = readFileSafe(ledgerPath);
    const row = [
      ledgerId(task),
      markdownCell(task.title || task.shortId || task.id),
      "coordinator",
      mapLedgerState(state),
      planPath,
      featureId(task, path.basename(featureRegistryPath(target)) === "Private-Feature-SSoT.md"),
      "pending",
      event === "task-review" || state === "review" ? reviewPath : "pending",
      "pending",
      "pending",
      markdownCell(message || "none"),
      todayDate(),
    ];
    fs.writeFileSync(ledgerPath, upsertRow(content, /^ID$/i, (header, existing) => rowMatchesPlan(header, existing, planPath), row));
  }
  return { destination: relative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "harness-ledger" };
}

function syncModuleRegistryRow(target, task, { state, planPath, dryRun }) {
  const registryPath = path.join(target.docsRoot, "09-PLANNING/Module-Registry.md");
  ensureFileFromTemplate(registryPath, "templates/ssot/Module-Registry.md", { dryRun });
  const relative = toPosix(path.relative(target.projectRoot, registryPath));
  if (!dryRun) {
    const content = readFileSafe(registryPath);
    const moduleKey = task.module;
    const modulePlan = `docs/09-PLANNING/MODULES/${moduleKey}/module_plan.md`;
    const row = [
      `M-${moduleKey.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
      moduleKey,
      `docs/09-PLANNING/MODULES/${moduleKey}/**`,
      "coordinator",
      state === "planned" ? "reserved" : mapModuleState(state),
      `codex/${moduleKey}`,
      modulePlan,
      "none",
      "none",
      planPath,
      "none",
      todayDate(),
    ];
    fs.writeFileSync(registryPath, upsertRow(content, /^ID$/i, (header, existing) => rowMatchesModule(header, existing, moduleKey, modulePlan), row));
  }
  return { destination: relative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "module-registry" };
}

function featureRegistryPath(target) {
  const privatePath = path.join(target.docsRoot, "09-PLANNING/Private-Feature-SSoT.md");
  if (fs.existsSync(privatePath)) return privatePath;
  const publicPath = path.join(target.docsRoot, "09-PLANNING/Feature-SSoT.md");
  if (existsInDocs(target, "09-PLANNING/Feature-SSoT.md")) return publicPath;
  return publicPath;
}

function ensureFileFromTemplate(destinationPath, templateSource, { dryRun = false } = {}) {
  if (fs.existsSync(destinationPath) || dryRun) return;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, readBundledTemplate(templateSource));
}

function upsertRow(content, headerPattern, matcher, row) {
  const updated = updateMarkdownTableRow(content, headerPattern, (header, existing) => (matcher(header, existing) ? fitRow(row, header.length) : null));
  if (updated.matched) return updated.content;
  return appendRow(content, headerPattern, row);
}

function appendRow(content, headerPattern, row) {
  const lines = String(content || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    if (!header.some((cell) => headerPattern.test(cell))) continue;
    let insertAt = index + 2;
    while (insertAt < lines.length && lines[insertAt].trim().startsWith("|")) insertAt += 1;
    lines.splice(insertAt, 0, `| ${fitRow(row, header.length).join(" | ")} |`);
    return lines.join("\n");
  }
  return `${String(content || "").trimEnd()}\n\n| ${row.join(" | ")} |\n`;
}

function fitRow(row, length) {
  const next = row.map((cell) => markdownCell(cell));
  while (next.length < length) next.push("");
  return next.slice(0, length);
}

function rowMatchesPlan(header, row, planPath) {
  const planIndex = firstColumn(header, ["Task Plan", "Plan", "当前产物"]);
  return planIndex >= 0 && String(row[planIndex] || "").includes(planPath);
}

function rowMatchesModule(header, row, moduleKey, modulePlan) {
  const moduleIndex = firstColumn(header, ["Module", "模块", "模块 Key"]);
  const taskPlanIndex = firstColumn(header, ["Task Plan", "当前产物"]);
  return String(row[moduleIndex] || "").toLowerCase() === String(moduleKey).toLowerCase() || String(row[taskPlanIndex] || "").includes(modulePlan);
}

function featureId(task, privateId) {
  const slug = String(task.shortId || task.id || "task").replace(/^TASKS\//, "").replace(/^MODULES\//, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 72);
  return `${privateId ? "PF" : "F"}-${slug}`;
}

function ledgerId(task) {
  return `HL-${String(task.shortId || task.id || "task").replace(/^TASKS\//, "").replace(/^MODULES\//, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 72)}`;
}

function stripTargetPrefix(value) {
  return String(value || "").replace(/^TARGET:/, "").replace(/\/$/, "");
}

function mapFeatureState(state) {
  if (state === "in_progress") return "active";
  if (state === "review") return "verify";
  if (state === "done") return "shipped";
  if (state === "blocked") return "blocked";
  return "ready";
}

function mapPrivateFeatureState(state) {
  if (state === "in_progress") return "active";
  if (state === "review") return "review";
  if (state === "done") return "done";
  if (state === "blocked") return "blocked";
  return "planned";
}

function mapLedgerState(state) {
  if (state === "in_progress") return "active";
  if (state === "review") return "review";
  if (state === "done") return "closed";
  if (state === "blocked") return "blocked";
  return "planned";
}

function mapModuleState(state) {
  if (state === "in_progress") return "active";
  if (state === "review") return "handoff";
  if (state === "done") return "merged";
  if (state === "blocked") return "blocked";
  return "reserved";
}

export function inspectGit(root) {
  const gitRootResult = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (gitRootResult.status !== 0) return { inGit: false, gitRoot: "", entries: [] };
  const gitRoot = path.resolve(gitRootResult.stdout.trim());
  return { inGit: true, gitRoot, entries: statusEntries(root) };
}

function currentBranch(root) {
  const result = git(root, ["branch", "--show-current"], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : "";
}

function assertCommitIdentity(root) {
  const name = git(root, ["config", "--get", "user.name"], { allowFailure: true }).stdout.trim();
  const email = git(root, ["config", "--get", "user.email"], { allowFailure: true }).stdout.trim();
  if (!name || !email) {
    throw new GovernanceSyncError("Governance sync auto-commit requires Git user.name and user.email.", {
      code: "governance-git-identity-missing",
      details: { hasName: Boolean(name), hasEmail: Boolean(email) },
      recovery: ["Configure a local Git identity for the target repository."],
    });
  }
}

function assertOnlyAllowedChanged(root, allowedPaths) {
  const outside = statusEntries(root).filter((entry) => !allowedPaths.includes(entry.path));
  if (outside.length > 0) {
    throw new GovernanceSyncError("Governance sync produced changes outside the allowlist.", {
      code: "governance-allowlist-violation",
      details: { disallowed: outside, allowedPaths },
      recovery: ["Inspect the extra paths; the CLI will not stage or commit unrelated files."],
    });
  }
}

function assertOnlyAllowedStaged(root, allowedPaths) {
  const outside = statusEntries(root).filter((entry) => entry.index !== " " && !allowedPaths.includes(entry.path));
  if (outside.length > 0) {
    throw new GovernanceSyncError("Git index contains staged files outside the governance sync allowlist.", {
      code: "governance-index-allowlist-violation",
      details: { disallowed: outside, allowedPaths },
      recovery: ["Unstage unrelated files before retrying the lifecycle command."],
    });
  }
}

function assertClean(root) {
  const entries = statusEntries(root);
  if (entries.length > 0) {
    throw new GovernanceSyncError("Governance sync commit completed but working tree is not clean.", {
      code: "governance-post-commit-dirty",
      details: { entries },
      recovery: ["Inspect remaining files before continuing."],
    });
  }
}

function statusEntries(root) {
  return git(root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      index: line.slice(0, 1),
      worktree: line.slice(1, 2),
      path: toPosix(parseStatusPath(line.slice(3))),
      raw: line,
    }))
    .filter((entry) => entry.path !== ".harness/locks/governance-sync.lock");
}

function parseStatusPath(value) {
  const unquoted = value.replace(/^"|"$/g, "");
  return unquoted.includes(" -> ") ? unquoted.split(" -> ").pop() : unquoted;
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new GovernanceSyncError(`git ${args.join(" ")} failed`, {
      code: "governance-git-command-failed",
      details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
      recovery: ["Inspect the Git error and retry after resolving it."],
    });
  }
  return result;
}

function real(filePath) {
  return fs.realpathSync(filePath);
}
