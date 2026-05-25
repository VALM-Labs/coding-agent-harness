# Complex Task Skeleton Reference

This folder is a standalone copy of the Harness complex task contract skeleton. Use it when designing a preset so the preset author can see the base files that `harness new-task --budget complex` creates before the preset overlay is applied.

## Required Complex Task Files

| File | Purpose |
| --- | --- |
| `brief.md` | Human-readable task summary and current context packet. |
| `task_plan.md` | Goal, scope, budget, required files, acceptance criteria, and operating decisions. |
| `execution_strategy.md` | Operating model, allocation, conflict control, evidence strategy, and subagent decisions. |
| `visual_map.md` | Phase map, optional diagrams, completion state, evidence state, and blocking risk. |
| `findings.md` | Findings, research notes, and unresolved risks. |
| `lesson_candidates.md` | Task-local lesson candidate queue. |
| `progress.md` | Execution log, decisions, handoff, and residuals. |
| `review.md` | Agent review submission, adversarial review, evidence checked, and residual risk. |
| `references/INDEX.md` | Complex task source/reference index. |
| `artifacts/INDEX.md` | Complex task generated artifact/evidence index. |
| `long-running-task-contract.md` | Optional add-on when the task is explicitly long-running. |

## How A Preset Uses This Skeleton

A preset should usually not replace these files. Harness creates the base task skeleton first. The preset then overlays method-specific content by:

- appending task-plan guidance with `entrypoints.newTask.templates.taskPlanAppend`;
- adding `metadata` lines that make scanner-visible context first-class;
- writing `resources.references` and `resources.artifacts` into the task-local folders;
- adding `context.requiredReads` so the next agent reads the right references before implementation;
- generating audit/evidence files under a task-local `artifacts/preset` bundle.

If a preset needs to change the structure of the complex task skeleton itself, do not hide that inside the preset. Update the Harness task templates or checker instead.
