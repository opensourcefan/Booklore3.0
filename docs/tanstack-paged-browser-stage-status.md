# TanStack Paged Browser Stage Status

Last verified: 2026-05-06
Branch: `develop`
Latest verified release at time of update: `v3.15.39`

## Current Stage Position

Stage 5 is complete.

The original 2026-05-04 safe execution plan defines Stage 5 as a single push stage: list-view integration using the existing PrimeNG table. In the shipped release history, that work was completed across two release breaks:

1. Stage 5 break 1 of 2: guarded paged table/list integration shipped at `v3.15.38`.
2. Stage 5 break 2 of 2: post-release table scroll-retention hardening shipped at `v3.15.39`.

Stage 6 is the active stage.

For safety and rollback clarity, Stage 6 is intentionally split into two breaks:

1. Stage 6 break 1 of 2: formal exception closure and current-boundary documentation.
2. Stage 6 break 2 of 2: optional future feature-by-feature legacy dependency reductions, one narrow feature at a time, only with explicit approval.

## What Is Shipped

- The guarded paged browser path supports `ALL_BOOKS` and `LIBRARY`.
- The guarded paged browser path supports both `grid` and `table` view modes.
- The guarded paged path remains limited to the verified `addedOn DESC` sort path.
- The guarded paged path falls back to legacy full-state mode when directory scope is active.
- The guarded paged path falls back to legacy full-state mode when series collapse is enabled.
- The guarded paged path falls back to legacy full-state mode when search is active.
- The guarded paged path falls back to legacy full-state mode when sort or filter criteria are not supported by the server adapter.

## What Remains Legacy By Design Today

- Shelf routes remain legacy full-state.
- Magic Shelf routes remain legacy full-state.
- Not Shelfed routes remain legacy full-state.
- Directory-scoped browsing remains legacy full-state.
- Series-collapsed browsing remains legacy full-state.
- Search-driven browsing remains legacy full-state.
- Unsupported sort combinations remain legacy full-state.
- Unsupported filter combinations remain legacy full-state.

## Evidence Basis

- `PagedGridPilotService` only enables paged mode for `ALL_BOOKS` and `LIBRARY` and only for normalized `grid` or `table` view modes.
- `PagedGridPilotService` guardrails explicitly allow paged grid and paged table view while preserving `legacy-full-state` fallback mode.
- `PagedGridPilotService` blocker logic explicitly rejects directory scope, series collapse, active search, unsupported sort criteria, and unsupported filters.
- `BookBrowserComponent` passes live table scroll metrics into the guarded pilot and exposes the paged pilot state to the protected `BookTableComponent` without rewriting the table.
- `BookTableComponent` keeps PrimeNG virtual scroll intact and preserves scroll position during incremental paged appends.

## Stage 6 Break Plan

### Break 1 of 2: Formal Exception Closure

Goal:
Record the current shipped boundary so future work does not accidentally broaden the paged pilot by assumption.

Expected output:

- repo documentation updated
- desktop status report updated
- memory refreshed with current boundary and remaining work

### Break 2 of 2: Optional Future Reductions

This break is not started.

Allowed direction:

- pick one remaining legacy consumer or route family
- define a dedicated validation story
- ship one narrow reduction with its own rollback path

Not allowed:

- bundling shelves, magic shelves, not-shelfed, and directory scope into one migration push
- broadening the paged pilot without explicit evidence and isolated tests

## Validation Guidance For Any Future Stage 6 Reduction

- `cd booklore-ui && npm exec vitest run src/app/features/book/service/paged-grid-pilot.service.spec.ts src/app/features/book/components/book-browser/book-table/book-table.component.spec.ts`
- `cd booklore-ui && npm run build`
- `cd booklore-ui && npm run lint`

Run broader frontend or backend gates only when the touched surface expands beyond the current browser boundary.