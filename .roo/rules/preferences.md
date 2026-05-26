---
paths: ["**/*"]
---

- After pushing, provide a numbered fix summary matching the user's task order, in the built in browser.
- For frontend interaction regressions, prefer DOM-backed mock tests that verify real click behavior and the presence or absence of directives, not only component state.
- Do not push unless advised to push.
- Do not use 'milestone' within a tag unless explicitly advised.
- Do not ask to do something if it has already been asked.
- After changes, check README.md, Familairization-Guide, and codespace.md for required updates.
- "tag up" = least significant digit incremented by 1, usually v#.##.x

- do not attempt to use http://localhost:4200 for verification or anything else.

## Reporting: Whenever a report is requested:
- it should be placed on the ~/Desktop in HTML format.
- it should have a dark background unless otherwise stated.

- Assume file changes are "auto accept" — execute file modifications directly or bypass IDE prompts whenever possible.
- After each batch of changes or fixes, explicitly list specific edge cases and workflows the user should manually test to confirm there are no regressions.

## Anti-Laziness & Completion
- **No Snippets:** NEVER use placeholders like `// ... rest of code` or `/* existing logic */`.
- **Full File Output:** You must always provide the COMPLETE content of the file. This ensures the user can apply the change with one click without manual merging.
- **No Guessing:** If you are unsure of a path or a dependency, use the `ls` or `read_file` tool. If a tool fails, admit it rather than hallucinating a solution.

## Senior Reviewer Self-Critique
- **The "Rubber Duck" Step:** Once a solution is ready, but BEFORE presenting it, perform a quick internal review. Ask: "Is there a simpler way?" or "Will this break the build on a different OS/environment?"
- **Consistency:** Ensure all naming conventions (camelCase vs snake_case) and architectural styles match the current codebase perfectly.

- **Definition of Done Checklist:** Before declaring any task complete, the AI MUST output a point-by-point checklist of these preferences and explicitly confirm it has executed each one. This ensures the AI evaluates whether it has completed the push, generated the report, outputted the diff, and listed the edge cases before generating the final response.

## Git Safety Protocol
- **NEVER `git pull` or `git pull --rebase` without explicit user approval.**
  If `git push` is rejected with "non-fast-forward," STOP immediately.
  Run `git fetch origin && git log --oneline HEAD..origin/develop` to inspect
  what is on the remote. Report the divergence to the user and ask how to proceed.
  Never follow the git "use git pull" hint blindly.


## Always Check For Downstream Impacts
- **Before recommending OR implementing any code change**, you MUST trace all callers, consumers, and dependents of the affected code.
- For JPA entity changes (fetch type, cascade, relationship mapping): grep for all references to the field's getter and all methods that load or traverse the entity. Verify whether each call site runs inside a transaction/session.
- For repository method changes: grep for all callers in both service and controller layers. Verify pagination, transaction boundaries, and expected return types at each call site.
- For config changes: verify that the setting is supported by the current version of the dependency (driver, ORM, pool). Check for conflicts with existing settings.
- For Flyway migrations: always list existing migrations first (`ls -1 .../db/migration/ | sort -V | tail -20`) and use the next available version number. Never assume version numbers are free.
- For any recommendation, answer: "If we make this change, could any existing feature break at runtime?" If the answer is "yes" or "maybe," explain exactly how and either add a mitigation step or mark the recommendation as RISKY with a warning.

- Before making a code change, you must list your top 3 assumptions and prove them by reading the specific file lines.

- If a project uses multi-stage builds or generated code, you must locate the outputs of those builds before declaring a task complete.

## Versioning & Tagging Safety
- **Always Verify Latest Remote Tag:** Before deciding on the next version number or pushing a new tag, you MUST run `git ls-remote --tags origin` or `git tag -l | sort -V` to find the actual latest tag on the repository. Do NOT rely solely on the version string found in local files (e.g., `build.gradle` or `package.json`), as they may be outdated. Sync the local files to the true latest remote version before incrementing and tagging.

## Browser Updates & Broadcasting
- **100% Reliable Refreshes via AOP:** Never use `notificationService.sendMessage` manually in a Controller for state changes (like metadata updates or shelf moves). All operations that mutate book state MUST delegate to a Service layer method that returns the modified `Book` or `Collection<Book>` and is annotated with `@BroadcastBookUpdate`. This ensures the websocket browser refresh is centrally enforced and impossible to bypass.