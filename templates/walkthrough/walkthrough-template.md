# [Wave/Feature 名称] Walkthrough

## 概要
[一句话说清楚这个 wave 做了什么]

## 改动范围
- [改了哪些包/模块]
- [新增了哪些文件]
- [删除了哪些文件]

## 关键决策
| 决策 | 选择 | 原因 |
|------|------|------|
| [决策1] | [选了什么] | [为什么] |

## 验证结果
- 跑了哪些测试：[列出]
- 回归结果：[通过/失败，引用 Regression SSoT]
- Evidence Depth：[到了哪一层]

## Review Report
- Report：[review.md 路径 / 不适用]
- Material findings：[无 / 已修复 / accepted residual，列出 ID]
- No-finding statement：[有 / 无 / 不适用]

## Residual
- [遗留问题1，如无则写"无"]

## Lessons Reflection
- 本轮有没有发现 reference / workflow / checker 不够用或有误：[有/无，写一句理由]
- 有没有反复出现、跨页面/跨模块/跨阶段的共性问题：[有/无，写一句理由]
- 有没有下次 agent 也可能重复踩的坑：[有/无，写一句理由]
- Lessons 结果：[checked-created: L-YYYY-MM-DD-NNN / checked-none: 一句话原因]
- Lessons Detail Doc：[如 checked-created，填 `docs/01-GOVERNANCE/lessons/...md`；否则写"无"]

## 关联
- Task Plan：[路径]
- Review Report：[路径 / 不适用]
- Feature SSoT 条目：[引用]
- Regression Gate：[引用]
- Harness Ledger：[HL-...]
- Commit：[hash]
