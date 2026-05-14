---
description: "Review the BookLore frontend for concrete performance issues. Use when: auditing Angular UI changes, investigating slow rendering, bundle growth, change detection churn, list rendering, image loading, or network-heavy flows."
argument-hint: "Target route, component, feature, or file; optional focus like rendering, bundle size, lists, or network"
agent: "agent"
---

Preamble:
- Warning, must be efficient as usage is running low. 
- READ: .ghcprules/*
- Code changes MUST be derived from code EVIDENCE ONLY, code is the source of truth ultimately.

Review the BookLore frontend for performance issues.

Context:
- Frontend dependencies and stack: [booklore-ui/package.json](../../booklore-ui/package.json)
- Build configuration and budgets: [booklore-ui/angular.json](../../booklore-ui/angular.json)
- This frontend uses Angular standalone components, signals and effects, PrimeNG, virtual scrolling, lazy-loaded images, and production bundle budgets.

Inputs:
- Target: ${input:target:Route, component, feature, or file to inspect}
- Focus: ${input:focus:Optional focus such as rendering, bundle size, change detection, lists, images, or network}
- Selected code: ${selection}

Instructions:
1. Start with the requested target and any selected code. If the target is broad, limit the review to the most relevant files under `booklore-ui` instead of attempting a repo-wide audit.
2. Perform a code performance review based on actual evidence in the code. Do not speculate, and do not list generic best practices unless they are tied to specific files and lines.
3. Prioritize the highest-impact issues first. Look especially for:
   - expensive Angular template work, repeated function calls in bindings, and avoidable derived work during render
   - unnecessary signal, effect, observable, or event-stream recomputation that causes repeated UI work
   - large or unbounded DOM lists, missing stable identity tracking, or missed virtualization opportunities
   - avoidable rerenders caused by broad state updates, mutable inputs, or heavy component trees
   - eager loading of images, viewers, routes, or third-party widgets that could be deferred
   - bundle-size regressions or heavy dependencies that are risky relative to the production budgets
   - network or websocket patterns that duplicate requests, over-fetch, or fan out unnecessary updates
   - PrimeNG or other library usage that scales poorly for the rendered data size
4. Inspect neighboring templates, services, routing, styles, and tests when they materially affect confidence.
5. If a pattern looks intentional, explain the tradeoff before flagging it as a problem.
6. If you cannot prove a performance issue from static inspection alone, say what should be measured next instead of overstating confidence.

Output format:

## Findings
- Present findings first, ordered by severity.
- For each finding, include:
  - severity
  - the concrete issue
  - why it is a performance problem in this codebase
  - evidence with file and line references
  - the smallest practical fix or mitigation
  - any follow-up measurement needed to verify impact

## Open Questions
- Only include questions that materially affect confidence or require runtime data.

## Change Summary
- End with a short summary of the most important fixes.

If no concrete issues are found, say so explicitly and list the highest-value next measurements.
