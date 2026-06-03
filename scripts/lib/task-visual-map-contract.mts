import path from "node:path";
import {
  legacyVisualRoadmapFile,
  readFileSafe,
  visualMapFile,
} from "./core-shared.mjs";
import {
  firstColumn,
  splitDependencies,
  splitList,
  tableAfterHeading,
} from "./markdown-utils.mjs";
import {
  normalizePhaseActor,
  normalizePhaseKind,
} from "./phase-kind.mjs";
import type {
  TaskContractFile,
  TaskPhase,
  VisualMapContractFile,
} from "./types/task-scanner.js";

export function parsePhases(taskPlanContent: string): TaskPhase[] {
  const { header, rows } = tableAfterHeading(taskPlanContent, /^Phase ID$/i);
  if (rows.length === 0) return [];
  const indexes = {
    id: firstColumn(header, ["Phase ID", "阶段 ID"]),
    kind: firstColumn(header, ["Kind", "阶段类型", "类型"]),
    dependsOn: firstColumn(header, ["Depends On", "依赖"]),
    state: firstColumn(header, ["State", "状态"]),
    completion: firstColumn(header, ["Completion", "完成度"]),
    output: firstColumn(header, ["Output", "产出"]),
    requiredEvidence: firstColumn(header, ["Required Evidence", "必要证据"]),
    exitCommand: firstColumn(header, ["Exit Command", "出口命令", "退出命令"]),
    actor: firstColumn(header, ["Actor", "执行者", "角色"]),
    evidenceStatus: firstColumn(header, ["Evidence Status", "证据状态"]),
    blockingRisk: firstColumn(header, ["Blocking Risk", "阻塞风险"]),
    owner: firstColumn(header, ["Owner / Handoff", "负责人 / 交接"]),
  };
  return rows.map((row) => ({
    id: row[indexes.id] || "",
    kind: normalizePhaseKind(row[indexes.kind]),
    dependsOn: splitDependencies(row[indexes.dependsOn] || ""),
    state: row[indexes.state] || "planned",
    completion: Number.parseInt(String(row[indexes.completion] || "0").replace("%", ""), 10) || 0,
    output: row[indexes.output] || "",
    requiredEvidence: splitList(row[indexes.requiredEvidence] || ""),
    exitCommand: row[indexes.exitCommand] || "",
    actor: normalizePhaseActor(row[indexes.actor]),
    evidenceStatus: row[indexes.evidenceStatus] || "missing",
    blockingRisk: row[indexes.blockingRisk] || "",
    owner: row[indexes.owner] || "",
  }));
}

export function readTaskContractFile(taskDir: string, fileName: string, legacyContent = ""): TaskContractFile {
  const filePath = path.join(taskDir, fileName);
  const content = readFileSafe(filePath);
  if (content.trim()) return { path: filePath, content, source: "standalone" };
  return { path: filePath, content: legacyContent, source: legacyContent.trim() ? "legacy" : "missing" };
}

export function readVisualMapContractFile(taskDir: string, legacyContent = ""): VisualMapContractFile {
  const canonicalPath = path.join(taskDir, visualMapFile);
  const canonical = readFileSafe(canonicalPath);
  if (canonical.trim()) return { path: canonicalPath, content: canonical, source: "canonical", status: "present" };
  const legacyPath = path.join(taskDir, legacyVisualRoadmapFile);
  const legacy = readFileSafe(legacyPath);
  if (legacy.trim()) return { path: legacyPath, content: legacy, source: "legacy", status: "legacy-only" };
  return {
    path: canonicalPath,
    content: legacyContent,
    source: legacyContent.trim() ? "legacy" : "missing",
    status: legacyContent.trim() ? "legacy-only" : "missing",
  };
}
