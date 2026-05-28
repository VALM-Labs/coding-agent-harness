# TypeScript Runtime Migration Closeout

This closeout records the public package rule after the progressive JavaScript to
TypeScript runtime migration. It now covers the Phase 2 package-runtime cutover:
the npm package executes committed `dist/**/*.mjs` artifacts while historical
`scripts/**/*.mjs` and `tests/**/*.mjs` shims remain checked in for observation
and rollback.

## Current State

All Node runtime and test `.mjs` files under `scripts/` and `tests/` now have an
explicit TypeScript source twin:

- `scripts/**/*.mjs` has adjacent `scripts/**/*.mts`.
- `tests/**/*.mjs` has adjacent `tests/**/*.mts`.
- `scripts/**/*.mts` builds to committed `dist/**/*.mjs` artifacts.
- `dist/**/*.mjs` is the package runtime surface for npm bin, npm scripts, and
  postinstall.
- `.mts` files remain the source ownership surface.

The package still publishes both `dist/` and historical `scripts/` surfaces.
This is intentional during the observation window: Node users execute `dist/`,
while `scripts/**/*.mjs` remains as a historical fallback until dist-primary
execution has enough package-smoke evidence to authorize deletion.

## Why Historical `scripts/*.mjs` Stays

The package is an ESM package and its current public runtime contract points at
the committed dist build output:

- `package.json` maps the `harness` executable to `dist/harness.mjs`.
- npm postinstall runs `dist/postinstall.mjs`.
- npm helper scripts such as `check`, `status`, and dashboard generation run
  through `dist/harness.mjs`.
- Runtime modules import sibling `.mjs` files inside `dist/`, so installed
  package execution does not depend on TypeScript loaders.

Historical `scripts/**/*.mjs` and `tests/**/*.mjs` files have not been deleted
yet. Removing them requires the remaining observation gates: tarball smoke must
prove package execution is dist-primary, tests must no longer rely on checked-in
test `.mjs` files as the long-term runner, and the deletion PR must remain
independently revertible.

## Documented Exceptions

The following package-included JavaScript files are not part of the Node runtime
source-twin cleanup target.

| Path | Reason To Keep |
| --- | --- |
| `presets/legacy-migration/checks/preset-check.mjs` | Preset executable hook. It belongs to the preset extension surface, not core runtime migration. |
| `presets/legacy-migration/scripts/plan-work-queue.mjs` | Preset helper script loaded as packaged preset material. |
| `presets/legacy-migration/scripts/scaffold-task-contracts.mjs` | Preset helper script loaded as packaged preset material. |
| `templates/dashboard/assets/app-src/*.js` | Browser dashboard source assets. They are shipped as template assets, not Node runtime modules. |
| `templates/dashboard/assets/app.js` | Built browser dashboard bundle. Keep until a separate dashboard asset pipeline replaces it. |
| `templates/dashboard/assets/i18n.js` | Browser dashboard localization asset. |
| `templates/dashboard/assets/markdown-reader.js` | Browser dashboard helper asset. |
| `templates/dashboard/assets/mermaid-renderer.js` | Browser dashboard helper asset. |

These files should not be deleted by a runtime `.mjs` cleanup PR. If they are
migrated later, use a dedicated preset or dashboard asset migration plan with its
own package and browser checks.

## Future Cleanup Gate

Before any future PR removes historical `scripts/**/*.mjs` or `tests/**/*.mjs`
shims, it must prove all of the following:

- package `bin` and `postinstall` still work from a packed tarball;
- installed package execution works with a temp `HOME` and PATH isolated to the
  temp consumer `node_modules/.bin`;
- `npm pack --dry-run --json` includes the intended runtime files and excludes
  private, temporary, and test-only material;
- snapshot matrix has no blocking drift;
- real target smoke passes;
- the PR is independently revertible.

Until those gates pass, `dist/**/*.mjs` remains the supported package execution
surface and historical `.mjs` shims remain an observation and rollback surface.
