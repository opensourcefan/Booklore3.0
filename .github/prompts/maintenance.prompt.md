---
description: "Perform a safety-first repository maintenance check: audits backend/frontend dependencies, runs linters, checks test suites to ensure zero regressions, scans for open Dependabot PRs/CodeQL issues, and generates a report."
agent: "agent"
---

# Codebase Maintenance Run

This prompt instructs the AI to conduct a thorough, safe codebase maintenance run across both backend and frontend components, focusing on security alerts, PRs, Dependabot, and verification checks.

## Context
- Backend: [build.gradle](../../fable-api/build.gradle)
- Frontend: [package.json](../../fable-ui/package.json)
- Dependabot config: [dependabot.yml](../../.github/dependabot.yml)

## Safety Rules & Best Practices (CRITICAL)
- **Node & npm Version Alignment**: Ensure the local Node and npm version matches the CI environment (Node 24 / npm 11). Running different versions of npm can generate unexpected lockfile structures.
- **Incremental Lockfile Updates**: Never delete the lockfile or regenerate it from scratch as it creates a noisy, massive diff (10,000+ lines). Instead, restore the last known working lockfile (e.g., `git checkout origin/develop -- package-lock.json` or from a stable tag) and run `npm install` to update incrementally.
- **Avoid `--legacy-peer-deps` for Final Commits**: Avoid using `--legacy-peer-deps` when updating the lockfile. Using this flag skips peer dependency resolution, which prunes optional peer dependencies (such as `@emnapi/*` required by `@napi-rs/wasm-runtime`) from the lockfile. This will cause `npm ci` to fail in CI/CD.
- **Node Modules Ownership**: Watch out for root-owned files in `node_modules` (often caused by Docker volumes). If permissions prevent standard `npm install` or cleanup, correct ownership or run the resolution in a clean temporary directory.

## Instructions

Please execute the following steps meticulously and document all findings in a maintenance report:

### Step 1: Security & Vulnerability Scanning
1. **Frontend (npm)**:
   - Run `npm audit` in `fable-ui`.
   - Inspect the `overrides` section of `package.json` to see if nested vulnerabilities can be addressed via overrides.
2. **Backend (Gradle)**:
   - Run `./gradlew dependencyCheckAnalyze` in `fable-api`.
   - Locate and examine the HTML report at `fable-api/build/reports/dependency-check-report.html`.
3. **AI Panel (pip)**:
   - Check the dependencies in `docker/ai-panel/requirements.txt`.

### Step 2: PR & GitHub Status Check
If the `gh` CLI is available, run the following:
- `gh pr list --label "dependencies" --limit 10`
- `gh run list --limit 5` (to check the status of recent CI runs and CodeQL checks)

### Step 3: Lint & Code Quality Checks
Verify code compliance by running:
- Frontend: `npm run lint` in `fable-ui`.
- Backend: `./gradlew check -x test` in `fable-api`.

### Step 4: Regression Testing (CRITICAL)
To ensure no regressions, run:
- Frontend tests: `npm run test -- --watch=false` (or `npx vitest run`) in `fable-ui`.
- Backend tests: `./gradlew test` in `fable-api`.

### Step 5: Compile Report & Action Plan
Create a comprehensive maintenance report. The report MUST be saved in the artifact directory with the naming format `[date][time][title].md` (e.g., `20260619_0845_maintenance_report.md`), summarizing:
1. **Dependency Audit Results**: A table of identified vulnerabilities (vulnerable package, severity, ecosystem, upgrade path).
2. **PR / CI Run Status**: List of open Dependabot/maintenance PRs and status of recent builds.
3. **Test suite validation**: Confirmation of whether all tests passed.
4. **Actionable Recommendations**:
   - **Category A (Safe/Zero-Regression)**: Small minor/patch updates, devDependency bumps, overrides.
   - **Category B (Low-Medium Risk)**: Upgrades requiring minor validation.
   - **Category C (High Risk / Defer)**: Major framework or library changes that need separate branches.
5. **Regression Concerns**: Detail any specific modules or user flows that require manual sanity testing.
