# Walkthrough Standard

## 职责

Walkthrough 是每个 wave / feature 完成后的收口记录。给下一轮 agent 看的交接文档。

## 何时写

- 每个 feature / wave 完成并 merge 后，必须写 walkthrough
- 没有 walkthrough 的 feature 视为未完成

## 存放位置

`docs/10-WALKTHROUGH/YYYY-MM-DD-<feature-name>.md`

Closeout SSoT:

`docs/10-WALKTHROUGH/Closeout-SSoT.md`

## 必须包含的内容

1. **概要**：一句话说清楚做了什么
2. **改动范围**：改了哪些模块/文件
3. **关键决策**：为什么选了方案 A 而不是方案 B
4. **验证结果**：跑了什么测试、回归结果、evidence depth
5. **Review Report**：如有 `review.md`，引用 material finding 状态、no-finding 结论和 accepted residual
6. **Residual**：遗留问题（如无则显式写"无"）
7. **Lessons Reflection**：反思本轮是否暴露共性问题、反复问题、下一轮 agent 可能重复踩的坑
8. **关联**：task plan 路径、SSoT 条目、regression gate、Harness Ledger ID、commit hash

## 写作原则

- 重点是决策和验证，不是逐行解释代码
- 用表格呈现结构化信息
- Residual 是下一轮任务的输入源之一
- 关键决策记录避免后续 agent 推翻已验证的架构选择

## 模板

使用 `docs/10-WALKTHROUGH/_walkthrough-template.md`（如已初始化）。

## 收口要求

写完 walkthrough 后，必须完成 Lessons 检查，再更新 `docs/Harness-Ledger.md`。
同时必须更新 `docs/10-WALKTHROUGH/Closeout-SSoT.md`：

- `closed` / `closed-with-residual` / `closed-local-only` 的 Harness Ledger row 必须有 Closeout SSoT row
- Walkthrough 列必须写 walkthrough 路径，或写受控 skip reason
- Lessons Check 列必须写 `checked-created: L-YYYY-MM-DD-NNN` 或 `checked-none: <reason>`
- 允许的 skip reason 只有 `docs-only`、`no-runtime`、`superseded`、`historical-backfill`、`owner-deferred`

## Lessons Reflection Prompt

写 walkthrough 时必须加入 `Lessons Reflection` 小节，并回答：

1. 本轮有没有发现 reference / workflow / checker 不够用或有误？
2. 有没有反复出现、跨页面/跨模块/跨阶段的共性问题？
3. 有没有下次 agent 也可能重复踩的坑？

如果任一答案是“有”，必须先在 `docs/01-GOVERNANCE/lessons/` 写详情文档，再在
Lessons SSoT 追加一行，`Detail Doc` 指向该详情文档。只填表不写详情文档不合格。
如果答案全是“没有”，Closeout SSoT 和 Harness Ledger 仍要记录 `checked-none: <reason>`。
