---
description: "Run a full repository audit across frontend (npm), backend (Gradle), and Python AI services, check dependency updates and security vulnerabilities, run all test suites, and generate a maintenance report."
agent: "agent"
---

# Full Repository Audit & Dependency Check

This workflow instructs the AI to conduct a comprehensive audit across all layers of the Fable application: Frontend (Angular/npm), Backend (Spring Boot/Gradle), and AI Services (Python/pip), verifying security vulnerabilities, checking updates, executing test suites, and compiling a maintenance report.

## Context
- **Frontend:** [package.json](../../fable-ui/package.json)
- **Backend:** [build.gradle](../../fable-api/build.gradle)
- **AI Search:** [requirements.txt](../../docker/ai-search/requirements.txt)
- **AI Panel:** [requirements.txt](../../docker/ai-panel/requirements.txt)

---

## Instructions

Execute the following steps systematically, checking for any execution errors:

### Step 1: Frontend (npm) Audit & Verification
1. Navigate to `fable-ui`.
2. Run `npm audit` to check for security vulnerabilities.
3. Run `npm run lint` to verify code quality.
4. Run `npx vitest run` to execute all frontend unit and integration tests.

### Step 2: Backend (Gradle) Audit & Verification
1. Navigate to `fable-api`.
2. Run `./gradlew dependencyUpdates` to list all outdated Gradle dependencies.
3. Run `./gradlew clean test` to execute the full backend JUnit test suite.

### Step 3: Python AI Services Verification
1. From the project root, run the Python test suite:
   ```bash
   .venv/bin/pytest docker/ai-search/tests
   ```
2. Verify dependencies listed in `docker/ai-panel/requirements.txt` and `docker/ai-search/requirements.txt` against known vulnerabilities (e.g., PyTorch CVE-2026-24747, FastAPI, Pillow 12.2.0).

### Step 4: Compile maintenance report
Write a comprehensive report and save it in the artifact directory with the format `[date]_[time]_maintenance_report.md` summarizing:
1. **Security & Vulnerabilities Table:** Packages, severity, ecosystems, and upgrade paths.
2. **CI/CD Status:** Open dependency PRs and status of recent builds via GitHub CLI.
3. **Test Executions:** Summary of Vitest, JUnit, and Pytest results.
4. **Actionable Recommendations:** Categorized into:
   - **Category A (Safe / Zero-Regression):** Small updates, overrides, devDependency bumps.
   - **Category B (Low-Medium Risk):** Minor/patch updates requiring validation.
   - **Category C (Blocked / Non-Stable):** Beta, milestone, release candidates, or major version upgrades (only stable GA releases are allowed).
5. **Regression Concerns:** Specific components or user flows to manually verify.
