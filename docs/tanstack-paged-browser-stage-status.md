# TanStack Paged Browser Stage Status

Last verified: 2026-05-06
Branch: `develop`
Latest verified release at time of update: `v3.15.41`

## Current Stage Position

Stage 5 is complete.

The original 2026-05-04 safe execution plan defines Stage 5 as a single push stage: list-view integration using the existing PrimeNG table. In the shipped release history, that work was completed across two release breaks:

1. Stage 5 break 1 of 2: guarded paged table/list integration shipped at `v3.15.38`.
2. Stage 5 break 2 of 2: post-release table scroll-retention hardening shipped at `v3.15.39`.

Stage 6 is complete.

Stage 6 was completed in two release breaks:

1. Stage 6 break 1 of 2: formal exception closure and current-boundary documentation shipped at `v3.15.40`.
2. Stage 6 break 2 of 2: explicit legacy-status surfacing for legacy-only browser routes shipped at `v3.15.41`.

Any future feature-by-feature legacy dependency reductions are now post-plan follow-on work, not unfinished Stage 6 work.

## What Is Shipped

- The guarded paged browser path supports `ALL_BOOKS` and `LIBRARY`.
- The guarded paged browser path supports both `grid` and `table` view modes.
- The guarded paged path remains limited to the verified `addedOn DESC` sort path.
- The guarded paged path falls back to legacy full-state mode when directory scope is active.
- The guarded paged path falls back to legacy full-state mode when series collapse is enabled.
- The guarded paged path falls back to legacy full-state mode when search is active.
- The guarded paged path falls back to legacy full-state mode when sort or filter criteria are not supported by the server adapter.
- Shelf, Magic Shelf, and Not Shelfed routes now surface the same legacy status pill in the browser UI instead of showing no route-status pill at all.

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
- `BookBrowserComponent` now keeps the status pill visible on Shelf, Magic Shelf, and Not Shelfed routes by setting an explicit legacy status instead of clearing the pilot status to inactive.

## Stage 6 Release History

### Break 1 of 2: Formal Exception Closure

Goal:
Record the current shipped boundary so future work does not accidentally broaden the paged pilot by assumption.

Expected output:

- repo documentation updated
- desktop status report updated
- memory refreshed with current boundary and remaining work

### Break 2 of 2: Legacy Route Status Surfacing

Goal:
Make the formal legacy boundary visible in the browser UI for legacy-only routes, not only for routes that participate in the guarded paged pilot.

Shipped outcome:

- Shelf routes show `Legacy full-state mode` with a route-specific explanation.
- Magic Shelf routes show `Legacy full-state mode` with a route-specific explanation.
- Not Shelfed routes show `Legacy full-state mode` with a route-specific explanation.

## Post-Plan Follow-On Work

- Any future dependency reduction must pick one narrow remaining legacy surface.
- Any future dependency reduction needs its own validation story and rollback path.
- Broadening the paged pilot without explicit evidence and isolated tests is still not allowed.

## Validation Guidance For Any Future Follow-On Reduction

- `cd booklore-ui && npm exec vitest run src/app/features/book/service/paged-grid-pilot.service.spec.ts src/app/features/book/components/book-browser/book-table/book-table.component.spec.ts`
- `cd booklore-ui && npm run build`
- `cd booklore-ui && npm run lint`

Run broader frontend or backend gates only when the touched surface expands beyond the current browser boundary.