# [任务名称] - Review

## Review Scope

- Reviewer: [agent / subagent / human / self-review]
- Review type: [adversarial / security / regression / architecture / release / other]
- Reviewed refs:
  - [diff / commit / PR / files / runtime target]
- Out of scope:
  - [明确不审查的范围；如无写"无"]

## Confidence Challenge

- Question: 你对这个方案、实现和策略有 100% 的信心吗？
- Answer: [yes / no]
- If not 100%, remaining vulnerabilities:
  - [漏洞 / 风险 / 证据缺口；如无写"无"]
- Fix loop count: [本轮已执行几次 review -> fix -> evidence -> review 循环]
- Final confidence basis: [为什么现在可以收口；引用 evidence 和 finding 状态]

## Material Findings

| ID | Severity | Area | Finding | Evidence | Required Action | Status |
|----|----------|------|---------|----------|-----------------|--------|

Do not leave example findings in this table. If there are no material findings, leave only the header and complete the No-Finding Statement.

## Non-Material Notes

- [不阻塞本轮目标但值得记录的问题；如无写"无"]

## Evidence Checked

- [ ] [lint / typecheck / build]
- [ ] [unit / integration / e2e]
- [ ] [local smoke]
- [ ] [browser / UI inspection]
- [ ] [live smoke]
- [ ] [logs / screenshots / traces]
- [ ] [diff / PR / commit review]

## No-Finding Statement

[如果没有 material finding，明确写：本轮未发现阻塞目标的 material finding。]

## Residual Risk

- [已知残余风险；如无写"无"]

## Follow-Up Routing

- Task Plan: [是否需要更新，路径或"无"]
- Progress: [对应 progress.md 条目]
- Findings: [是否需要写入 findings.md]
- Regression SSoT: [新增/调整/无]
- Lessons SSoT: [新增/调整/无]
- Walkthrough: [收口时引用路径]
