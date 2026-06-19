---
description: "Scan the Fable application for security vulnerabilities (CVEs) across frontend and backend, analyze risk/regression levels, and compile a dated HTML report on the Desktop."
agent: "agent"
---

# Vulnerability Audit & CVE Check Workflow

This workflow instructs the AI to perform a comprehensive vulnerability check of both the frontend (npm) and backend (Gradle/dependency-check) systems, evaluate actual risk factors (specifically for LAN/VPN deployment), and output a detailed HTML report to the Desktop.

## Context
- Backend: [build.gradle](../../fable-api/build.gradle)
- Frontend: [package.json](../../fable-ui/package.json)
- Desktop Path: `/home/michael/Desktop`

## Instructions

Please execute the following steps meticulously:

### Step 1: Frontend Vulnerability Scan (npm)
1. Navigate to `fable-ui`.
2. Run `npm audit` (and `npm audit --omit=dev` if needed to isolate runtime dependencies).
3. Identify all vulnerabilities, noting:
   - Vulnerable package name.
   - Severity level.
   - Path/dependency chain.
   - If it's a devDependency or runtime dependency.

### Step 2: Backend Vulnerability Scan (Gradle)
1. Navigate to `fable-api`.
2. Run `./gradlew dependencyCheckAnalyze`.
3. Locate and parse the HTML report generated at `fable-api/build/reports/dependency-check-report.html`.
4. Extract all identified CVEs and vulnerable libraries.

### Step 3: AI Panel Scan (pip)
1. Check the dependencies listed in `docker/ai-panel/requirements.txt`.
2. Review if there are known issues with versions of libraries like `pillow`, `torch`, `yolov8` (ultralytics), or `fastapi`.

### Step 4: Analyze Risk & Regression Factors
For each vulnerability found, determine:
1. **Actual Positives vs. False Positives**: Is the vulnerable code path actually reachable in Fable's LAN/VPN deployment model? (e.g. database client vulns require control of the DB server; client-side dev-dependency vulns do not affect production bundles).
2. **Risk Factor**: Low, Moderate, High, or Critical.
3. **Regression Risk**: What is the risk of breaking functionality if we update this package?
4. **Cascading Requirements**: What other packages, runtimes (like Node or JDK versions), or build tools must be upgraded to support this fix?

### Step 5: Generate the Report & Implementation Plan
1. Create a detailed HTML report and write it to the Desktop (path: `/home/michael/Desktop/[Date]-cve_vulns.html`, e.g., `2026-06-19-cve_vulns.html`). Use a dark-themed, modern glassmorphism design.
2. In the report, detail all findings, positives, false positives, risk factors, and cascading updates.
3. Propose a separate **Implementation Plan** (written as a markdown artifact or in the chat) containing immediate, zero-regression updates (Category A) that are safe to apply.
