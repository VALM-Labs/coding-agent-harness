# Adversarial Review Standard

## 职责

本标准定义 reviewer agent / subagent / 外部审查者如何写对抗性审查报告。

Review report 是任务完成前的独立挑战文档，不是 walkthrough，也不是普通进度记录。
`review-routing-standard.md` 决定 reviewer / subagent / external agent / human review 何时触发。

每轮审查必须先问：

> 你对这个方案、实现和策略有 100% 的信心吗？如果没有，找出所有可能的漏洞，提出适当的修复建议，并运行这个循环，直到你对新策略事实上有 100% 的信心。

这里的 100% 信心必须以当前 scope、证据和 material findings 状态为基础，不能用主观感觉替代。

## 存放位置

`docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/review.md`

## 何时必须写

- 使用 reviewer agent、subagent 或外部审查者
- 长程任务合同中包含 review loop
- 任务触及架构、数据、安全、权限、部署、迁移或跨模块契约
- release 前验证、live smoke、browser inspection 或 regression gate 暴露过问题
- 用户明确要求 review / 审查 / 对抗性审查

## 必须包含

1. **Review Scope**：reviewer、审查类型、审查对象、out of scope
2. **Confidence Challenge**：100% 信心问题、漏洞枚举、修复循环次数、最终信心依据
3. **Material Findings**：P0/P1/P2 material finding 表
4. **Non-Material Notes**：不阻塞但值得记录的问题
5. **Evidence Checked**：审查实际看过的证据
6. **No-Finding Statement**：无 material finding 时的明确结论
7. **Residual Risk**：已接受的残余风险
8. **Follow-Up Routing**：路由到 task/progress/findings/regression/lessons/walkthrough

## Severity

| 级别 | 含义 | 处理规则 |
|------|------|----------|
| P0 | 数据损坏、安全事故、生产不可用或错误发布 | 必须停下 |
| P1 | 核心路径、关键契约或主要验收标准被破坏 | 必须修复 |
| P2 | 明确回归或维护风险 | 判断是否本轮修复或 accepted residual |
| P3 | 质量建议或轻微改进 | 可作为 follow-up |

Material finding 指 P0/P1，以及任何会改变 stop condition 的 P2。

## 状态

Finding status 只使用：

- `open`
- `fixed`
- `accepted-residual`
- `not-reproducible`
- `out-of-scope`

`accepted-residual` 必须说明为什么不阻塞本轮目标，并路由到后续任务或 SSoT。

## 收口规则

任务不能在以下状态收口：

- 存在 `open` 的 P0/P1 finding
- 任务合同要求 review loop，但没有 `review.md`
- Confidence Challenge 缺失，或没有记录 final confidence basis
- no-finding statement 缺失
- material finding 修复后没有重跑对应证据
- accepted residual 没有后续路由

Walkthrough 和 Harness Ledger 必须引用本轮 review report。
