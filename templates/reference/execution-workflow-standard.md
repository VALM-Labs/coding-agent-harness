# Execution Workflow Standard

## 开发执行流程

### 开始任务前
1. 读 Feature SSoT，确认任务状态
2. 读对应的 task_plan.md，对齐目标
3. 判断是否属于长程任务；如属于，先读 `long-running-task-standard.md` 并补齐合同
4. 判断是否需要对抗性 review；如需要，先读 `adversarial-review-standard.md` 并创建 `review.md`
5. Planned task 默认需要 closeout reviewer；先读 `review-routing-standard.md`
6. 确认是否需要开 worktree（参考 worktree-standard.md）
7. 如需开 worktree，按规范创建并记录

### 执行过程中
1. 每完成一个阶段，更新 progress.md
2. 研究发现写入 findings.md
3. 长程任务每轮都要按合同执行 evidence loop 与 review loop
4. reviewer / subagent 审查结果必须写入任务目录 `review.md`
5. 定期 commit，commit message 有意义
6. 遇到阻塞、合同失效或暂停条件触发，立即记录到 progress.md 并报告

### 完成任务后
1. 跑对应的回归测试（按 Cadence Ledger）
2. 更新 Feature SSoT
3. 更新 Regression SSoT / Cadence Ledger（如适用）
4. 确认 `review.md` 无 open P0/P1 finding（如适用）
5. Planned task 必须按 `review-routing-standard.md` 完成 closeout reviewer 或写明 skip reason
6. 写 walkthrough（参考 walkthrough-standard.md），引用 review report
7. 执行 Lessons 检查
8. 更新 Harness Ledger
9. 完成最终 commit / PR，并确认工作区 clean
10. 如有 worktree，按规范清理

## Commit 规范

格式：`<type>(<scope>): <description>`

Type：
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 重构
- `test`: 测试
- `docs`: 文档
- `chore`: 构建/工具/配置

Scope：模块或包名

示例：
- `feat(auth): add OAuth2 login flow`
- `fix(ui): resolve timeline render delay`
- `test(api): add live smoke for webhook flow`

## PR / Merge 规范

1. PR 标题遵循 commit 规范格式
2. PR 描述包含：改了什么、为什么改、怎么验证的
3. 引用对应的 task plan 和 feature SSoT 条目
4. 回归测试结果附在 PR 中
5. [如有 code review 流程，在此定义]

## 禁止事项

- 禁止在项目根目录放过程文件（task_plan、progress 等只能在任务目录内）
- 禁止跳过 task plan 直接开始非平凡任务
- 禁止把对抗性 review 只留在聊天记录里；需要 review 时必须写 `review.md`
- 禁止 merge 后不跑回归
- 禁止 merge 后不写 walkthrough
- 禁止非平凡任务完成后不更新 Harness Ledger
