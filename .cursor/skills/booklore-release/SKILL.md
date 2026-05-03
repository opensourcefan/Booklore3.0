---
name: booklore-release
description: Guides the Booklore3.0 release workflow (tagging, versioning, build verification, and release notes). Use when the user mentions release, tag, tag up, version bump, changelog, or preparing a build for Booklore3.0.
---

# Booklore release

## Non-negotiables

- Evidence only: do not guess or speculate. If something can’t be proven from repo contents or command output, say “not found yet” and keep searching.
- “Tag up” means: increment the least-significant digit by 1 (e.g. `v3.14.6` → `v3.14.7`), unless the user explicitly requests a different versioning change.
- Do not push unless explicitly instructed.

## Quick workflow

### 1) Establish current version state (evidence)

- Determine current branch and working tree status.
- Identify latest existing tag and current build versions:
  - Backend: `booklore-api/build.gradle`
  - Frontend: `booklore-ui/package.json`

### 2) Decide the release target

- If user says “tag up”, compute next tag by incrementing the least-significant digit.
- If user provides an explicit tag/version, use it verbatim.
- If tags are ahead of build version (common in this repo), do not change build versions unless the user asked for it.

### 3) Verify build + tests (prefer direct evidence)

Run the narrowest commands that prove correctness:

- Backend:
  - Prefer `./gradlew test` (avoid `clean` if it fails due to root-owned `build/` artifacts).
  - Use `./gradlew build` when a full build is requested/needed.
- Frontend:
  - `npm run lint`
  - `npm run test`
  - `npm run build` (when preparing a release build)

### 4) Post-change documentation checks (required)

After any meaningful code change, check whether updates are required in:

- `README.md`
- Familiarization guide (repo docs)
- `codespace.md`

If changes are required, implement them; otherwise explicitly state “no update needed” with the evidence you checked.

### 5) Manual test guidance (required)

After each batch of changes/fixes, explicitly list specific edge cases and workflows the user should manually test to confirm there are no regressions.

Keep this list concrete and scenario-driven (UI flows, API endpoints, upgrade path), not generic.

### 6) Release notes / report outputs (conditional)

- If the user requests a report, write it to the Desktop as **HTML** (unless the user specifies a different format/location).
- Otherwise, provide release notes/changelog text in-chat, derived from actual diffs/commits (no guesswork).

## Output templates

### Manual test checklist template

- **Backend**: Start the app, hit key endpoints touched by the change (include the exact endpoints when known).
- **Frontend**: Navigate to the affected screens and confirm primary interactions (clicks, keyboard, mobile breakpoint if relevant).
- **Upgrade**: If migrations/settings changed, verify a fresh start and an upgrade-from-existing-data scenario (only if applicable).

### HTML report template (Desktop)

Use this structure:

- Title (release/tag + date)
- Summary (3–7 bullets)
- Evidence (commands run + results)
- Changes included (commit list or diff summary)
- Risks / known limitations (only if evidenced)
- Manual test plan (checklist)

## Examples (trigger phrases)

- “Tag up and cut a release”
- “Prepare a new tag for Booklore”
- “Bump version / update changelog”
- “Build artifacts for a release”
