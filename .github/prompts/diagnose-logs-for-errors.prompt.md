---
description: "Diagnose BookLore logs for concrete errors. Use when: investigating Docker container logs, Spring Boot stack traces, Angular console errors, HTTP failures, startup crashes, auth failures, or integration errors."
argument-hint: "Paste or select log lines; optional service, container, endpoint, feature, or symptom"
agent: "agent"
---

Preamble:
- Warning, must be efficient as usage is running low. 
- READ: .ghcprules/*
- Code changes MUST be derived from code EVIDENCE ONLY, code is the source of truth ultimately.

Diagnose BookLore logs for concrete errors and root causes.

Context:
- Runtime topology: [docker-compose.yml](../../docker-compose.yml)
- Project overview and deployment notes: [README.md](../../README.md)
- API logging configuration: [booklore-api/src/main/resources/application.yaml](../../booklore-api/src/main/resources/application.yaml)
- API request logging: [booklore-api/src/main/java/org/booklore/config/LoggingFilter.java](../../booklore-api/src/main/java/org/booklore/config/LoggingFilter.java)
- API exception mapping: [booklore-api/src/main/java/org/booklore/exception/GlobalExceptionHandler.java](../../booklore-api/src/main/java/org/booklore/exception/GlobalExceptionHandler.java)
- Frontend bootstrap and top-level console surface: [booklore-ui/src/main.ts](../../booklore-ui/src/main.ts)

Inputs:
- Source: ${input:source:Container, service, log file, endpoint, or feature}
- Symptom: ${input:symptom:Optional user-visible failure, timeframe, or reproduction note}
- Selected logs: ${selection}

Instructions:
1. Start with the provided log lines. If no log content is available, ask for the smallest relevant log segment instead of guessing.
2. Treat logs as primary evidence. Identify the exact error lines, timestamps, service names, request context, stack traces, and any immediately preceding warnings that narrow the cause.
3. Separate distinct error clusters. Do not merge unrelated noise into one diagnosis.
4. Map each error cluster to the most likely code path or runtime component in this repository using the linked code and config files when relevant.
5. Distinguish between the root cause, downstream failures, and expected handled errors.
6. If the evidence points outside this repository, say so explicitly. Common external surfaces here include MariaDB, Docker networking, filesystem mounts and permissions, OIDC providers, reverse proxies, and the optional AI service.
7. Do not speculate. If more than one cause remains possible, rank them by evidence and state what log line, config value, or reproduction detail would decide between them.
8. Recommend the smallest next diagnostic step that would materially increase confidence.
9. Only suggest a code change when the logs support a concrete repository-local fix.
10. Quote only the minimum necessary log content and call out anything that should be redacted.

Output format:

## Findings
- Present findings first, ordered by severity.
- For each finding, include:
  - severity
  - exact log evidence
  - interpretation
  - likely source component
  - correlated code or config files with line references when available

## Root Cause Assessment
- State the most likely root cause.
- If confidence is partial, list the next most plausible alternatives in descending order with the missing evidence.

## Recommended Next Step
- Give the smallest safe next action to confirm or fix the issue.
- Provide report to Desktop

## Suggested Fix
- Only include this section when the logs support a concrete change in this repository.
- Keep the proposed fix minimal and tied to the evidence.

If the provided logs are insufficient for a concrete diagnosis, say so plainly and request only the smallest missing log segment or reproduction detail.
