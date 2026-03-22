# Booklore Import Organization: Findings and Options

Date: 2026-03-21

## Problem Summary

When importing large parent directories with many already-organized child folders, all imported books initially appear in Not Shelved because no shelf assignments are automatically created during import. This makes users re-sort content manually, and effectively encourages one-folder-at-a-time import.

## Prior Findings (from previous research)

### 1. Recursive import intermittency

Observed behavior can appear intermittent due to a few scan-path realities:

- Directory traversal uses recursive file walking with symlink following.
- Certain directories are intentionally skipped (hidden/system/temp patterns, unreadable directories, and directories with a .ignore marker).
- The audio-folder classifier can collapse multi-file audio directories into folder-based audiobook entries, which can feel like missing files depending on expectations.
- Some processing exceptions are handled without a highly visible user-facing diagnostic.

Suggested mitigations:

- Increase scan diagnostics (surface skipped paths/reasons).
- Add an import/scan summary report (processed, skipped, inaccessible).
- Add guardrails for folder-based audiobook classification edge cases.

### 2. Import-time tagging concept

Feasibility is high because tags already exist in metadata and are applied through standard metadata services. This could allow import-assigned tags and then Magic Shelf rules on tags.

## Current Option Review

### Option 1: Magic Shelf by Library (no code)

Pros:

- Works immediately.
- No migration, no code changes.

Cons:

- Only library-level grouping; does not segment by child folder path.

### Option 2: Magic Shelf Folder Path rule (implemented)

What it does:

- Adds a new Magic Shelf rule field: folderPath.
- Allows matching on each book file subpath (relative folder path under library path).

Use examples:

- folderPath contains "Comics/Marvel"
- folderPath starts_with "Manga/"
- folderPath equals "Books/Fantasy"

Pros:

- Low invasiveness.
- No database migration.
- Works for existing and future imports.
- Keeps physical folder organization usable as a dynamic view layer.

Cons:

- Dynamic organization only; does not physically assign shelves unless users also perform shelf assignment actions.

### Option 3: Auto-create shelves from folder structure (future)

Pros:

- Fully automatic shelf assignment based on folder names.

Cons:

- More invasive.
- Requires additional design choices (depth, naming collisions, re-runs, ownership behavior).

## Recommendation

Near term (now):

1. Use Option 2 (folderPath Magic Shelf rules) to preserve folder-based organization at scale without forcing one-folder-at-a-time import.
2. Add improved scan diagnostics as a follow-up for intermittent recursive concerns.

Later:

1. Evaluate Option 3 if fully automatic shelf assignment is desired.
2. Optionally combine import-time tags with Magic Shelves for explicit labeling workflows.

## Implementation Status (this session)

Option 2 has been implemented end-to-end:

- Backend RuleField enum includes folderPath.
- Backend rule evaluator maps folderPath to book file subpath.
- Magic Shelf UI includes folderPath as a selectable field.
- Frontend rule evaluator supports folderPath for local evaluation paths.
- English i18n includes Folder Path label.

Validation:

- Backend compile successful.
- Frontend build successful.
