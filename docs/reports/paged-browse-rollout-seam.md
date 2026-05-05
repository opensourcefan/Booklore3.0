# Paged Browse Rollout Seam

## Purpose

This document defines the Stage 1 rollback seam for future paged browse work.

The current stable list/table view remains the protected baseline. Future runtime stages may introduce paged browse orchestration, but that rollout must happen outside `BookTableComponent` and outside the existing global `BookState` contract until parity is proven.

## Guarded Activation Rules

1. The default data source mode remains `legacy-full-state`.
2. Any paged browse activation must happen at the browser orchestration layer, not inside the table component.
3. Unsupported routes, unsupported filters, request-shaping failures, and runtime page-load failures must immediately fall back to `legacy-full-state`.
4. List/table activation must ship after grid activation and only after dedicated DOM-backed table regression tests pass.
5. The existing PrimeNG virtual-scroll table path remains the rollback target for every runtime stage.

## Kill-Switch Design

Future runtime stages should decide the browse data source through one guarded branch:

- `legacy-full-state`: current production path
- `paged-browse`: route-limited rollout path

If the paged path cannot safely serve the current route or filter set, orchestration must route back to the legacy path before data reaches the active list/table view.

## Stage 1 Deliverables

Stage 1 only adds:

- regression coverage around the stable list/table view
- request-shaping tests for future paged requests
- inert browse-state models for paged cache design
- this rollback seam document

Stage 1 does not change live routing, list rendering, grid rendering, or browser data-source behavior.

## Stage 2 Deliverables

Stage 2 adds dormant orchestration primitives only:

- a separate paged browse-state service
- stable request-key construction for paged browse cache entries
- cache storage and invalidation primitives
- ID lookup helpers that prefer paged cache, then existing full state, then API fallback

Stage 2 still does not wire paged browse state into any route, component, or list/table rendering path.

## Stage 3 Deliverables

Stage 3 enables the first guarded runtime slice only:

- All Books grid can use the paged endpoint through a dedicated pilot seam outside the table component
- server-side paging activates only when the route, view, sort fields, and sidebar filters are all in the verified safe subset
- unsupported search, unsupported filters, directory scope, series-collapsed mode, non-grid view, and non-All-Books routes immediately stay on or fall back to the legacy full-state path
- paged request failures immediately fall back to the legacy full-state path for the active route

Stage 3 still leaves the stable list/table path on the legacy data source.