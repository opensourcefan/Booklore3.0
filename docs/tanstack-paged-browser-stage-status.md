# TanStack Paged Browser Stage Status

Last verified: 2026-05-07
Branch: `develop`
Latest verified release at time of update: `v3.15.42`

## Current Local Follow-On Batch

An unreleased local follow-on batch now extends the guarded paged browser beyond the `v3.15.42` shipped boundary.

- The guarded paged browser path now supports `ALL_BOOKS`, `LIBRARY`, `SHELF`, and `NOT_SHELFED` when the request stays within the current server-backed contract.
- The guarded paged browser path now supports active search terms instead of forcing an automatic legacy fallback.
- The main paged browser endpoint now exposes `shelfId`, `unshelved`, and `mediaTypes` filters for the browser path.
- The guarded paged browser path now supports both the server-backed `bookType` filter and the browser's custom `Media Type` navigation scope backed by `book.fileType`.
- The current server adapter now supports a broader metadata-backed sort set plus user-progress-backed `personalRating`, `lastReadTime`, `dateFinished`, and `readStatus` on the paged path.
- Magic Shelf remains intentionally legacy.

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

- The guarded paged browser path supports `ALL_BOOKS`, `LIBRARY`, `SHELF`, and `NOT_SHELFED`.
- The guarded paged browser path supports both `grid` and `table` view modes.
- Active search terms can stay on the paged browser path.
- The shipped paged browser path supports the released metadata-backed sort group plus current-user-aware `personalRating`, `lastReadTime`, `dateFinished`, and `readStatus`.
- The shipped paged browser path supports the server-backed `bookType` filter.
- The guarded paged path falls back to legacy full-state mode when directory scope is active.
- The guarded paged path falls back to legacy full-state mode when series collapse is enabled.
- The guarded paged path falls back to legacy full-state mode when sort or filter criteria are not supported by the server adapter.
- Magic Shelf routes now surface the legacy status pill in the browser UI instead of showing no route-status pill at all.

## Current Local Browser Boundary

- `ALL_BOOKS`, `LIBRARY`, `SHELF`, and `NOT_SHELFED` can now stay on the paged browser path for `grid` and `table` views.
- Active search terms can now stay on the paged browser path.
- The server-backed `bookType` filter and the browser's custom `Media Type` navigation filter can now stay on the paged browser path.
- Metadata-backed server sort fields can now stay on the paged browser path.
- User-progress-backed `personalRating`, `lastReadTime`, `dateFinished`, and `readStatus` can now stay on the paged browser path.
- Unsupported computed, random, `readingProgress`, and file-primary sort fields still fall back to legacy full-state mode.
- Directory-scoped browsing still falls back to legacy full-state mode.
- Series-collapsed browsing still falls back to legacy full-state mode.
- Magic Shelf still falls back to legacy full-state mode.

## What Remains Legacy By Design Today

- Magic Shelf routes remain legacy full-state.
- Directory-scoped browsing remains legacy full-state.
- Series-collapsed browsing remains legacy full-state.
- Unsupported computed sort combinations, including `readingProgress`, remain legacy full-state.
- Unsupported filter combinations remain legacy full-state.

## Exact Remaining Follow-On Work

- `readingProgress` still needs a server-side sort contract that matches the client's current multi-source progress precedence across EPUB, PDF, CBX, audiobook, KOReader, and Kobo progress values.
- Directory-scoped browser routes still need a server-backed contract before they can move off legacy full-state mode.
- Series-collapsed browser routes still need a server-backed grouped-query contract before they can move off legacy full-state mode.
- Magic Shelf remains intentionally legacy unless there is a future decision to add a dedicated paged contract for rule-based shelf results.
- Unsupported browser filter combinations outside the current server mappings still need explicit server mappings before they can stay on the paged path.

## Evidence Basis

- `PagedGridPilotService` now enables paged mode for `ALL_BOOKS`, `LIBRARY`, `SHELF`, and `NOT_SHELFED` for normalized `grid` or `table` view modes.
- `PagedGridPilotService` guardrails explicitly allow paged grid and paged table view while preserving `legacy-full-state` fallback mode.
- `PagedGridPilotService` now carries active search on the server path and only rejects directory scope, series collapse, unsupported sort criteria, short search terms, and unsupported filters.
- `ServerFilterAdapter` now maps the browser's `customMediaType` and `customBookType` keys to the paged endpoint `mediaTypes` contract while preserving the separate server `bookType` filter path.
- `BookBrowserComponent` passes live table scroll metrics into the guarded pilot and exposes the paged pilot state to the protected `BookTableComponent` without rewriting the table.
- `BookTableComponent` keeps PrimeNG virtual scroll intact and preserves scroll position during incremental paged appends.
- `BookBrowserComponent` now routes `SHELF` and `NOT_SHELFED` through the guarded pilot when the contract is satisfied and leaves `MAGIC_SHELF` on explicit legacy status.
- `BookController` and `BookService` now expose and process `shelfId`, `unshelved`, and `mediaTypes` on the main paged endpoint.
- `BookService.buildFilterSpec` now applies both the server `bookType` filter and the paged `mediaTypes` contract for custom `book.fileType` labels, including the existing `PHYSICAL` fallback semantics for physical books without a custom media label.
- `BookFilterService` still applies `customMediaType` and `customBookType` client-side against `book.fileType`, and the new paged `mediaTypes` contract now mirrors that browser-level scope instead of forcing legacy fallback.
- `AppBookSpecification.searchText` now searches normalized metadata search text plus categories, ISBNs, and file names.
- `BookQueryService` now applies current-user-aware paged sorting for `personalRating`, `lastReadTime`, `dateFinished`, and `readStatus` instead of forcing those fields back to legacy mode.

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
- Broadening the paged pilot into directory scope, Magic Shelf, or computed sorts such as `readingProgress` without explicit evidence and isolated tests is still not allowed.

## Validation Guidance For Any Future Follow-On Reduction

- `cd booklore-ui && npm exec vitest run src/app/features/book/service/paged-grid-pilot.service.spec.ts src/app/features/book/service/server-filter-adapter.service.spec.ts`
- `cd booklore-ui && npm run build`
- `cd booklore-api && ./gradlew test --tests org.booklore.service.book.BookServiceTest`

Run broader frontend or backend gates only when the touched surface expands beyond the current browser boundary.