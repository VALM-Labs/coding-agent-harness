# Closeout SSoT

> Single source of truth for task closeout evidence. Every closed Harness Ledger row must be represented here.

## Active Closeouts

| Harness ID | Date | Task | Task Plan | Review Report | Walkthrough | Evidence | Residual | Lessons Check | Closeout Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Walkthrough Skip Reasons

Only these skip reasons are allowed:

- `walkthrough skipped-with-reason: docs-only`
- `walkthrough skipped-with-reason: no-runtime`
- `walkthrough skipped-with-reason: superseded`
- `walkthrough skipped-with-reason: historical-backfill`
- `walkthrough skipped-with-reason: owner-deferred`

## Rules

1. Every `closed`, `closed-with-residual`, or `closed-local-only` Harness Ledger row must have a row in this file.
2. The Walkthrough column must contain either `docs/10-WALKTHROUGH/<file>.md` or one allowed skip reason.
3. Implementation waves should write a walkthrough. Skip reasons are for constrained cases, not convenience.
4. The Evidence column must name the checks, smoke, review, or runtime proof used for closeout.
5. The Residual column must say `none` or route the residual to an owner, task, Regression SSoT, or Harness Ledger row.
6. The Lessons Check column must say `checked-created: L-YYYY-MM-DD-NNN` or `checked-none: <reason>`.
7. `checked-created` requires both a Lessons SSoT row and a detail document under `docs/01-GOVERNANCE/lessons/`.
