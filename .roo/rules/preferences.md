---
paths: ["**/*"]
---

## Database Safety:

- You are NEVER allowed to delete anything from any database WITHOUT asking for permission AND obtaining confirmation. 

## General:

- After pushing, provide a numbered fix summary matching the user's task order, in the built in browser.
- For frontend interaction regressions, prefer DOM-backed mock tests that verify real click behavior and the presence or absence of directives, not only component state.
- Do not push unless explicitly stated to do so in the most recent task or subtask.
- Do not use 'milestone' within a tag unless explicitly advised.
- Do not ask to do something if it has already been asked.
- After changes, check README.md, Familairization-Guide, and codespace.md for required updates.
- "tag up" = least significant digit incremented by 1, usually v#.##.x

- do not attempt to use http://localhost:4200 for verification or anything else.

## Reporting: Whenever a report is requested:
- it should be placed on the ~/Desktop in HTML format.
- it should be named <Date>-<Task_Name>.html
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
- **Autonomous Divergence Handling:** If `git push` is rejected with "non-fast-forward," or if you encounter a merge conflict during a rebase or pull, you are expected to handle it autonomously. Do NOT ask the user to babysit or resolve it for you.
- **Mandatory Context Investigation:** Before resolving any merge conflict or overriding upstream code, you MUST run `git fetch origin && git log -p -n 5 <conflicting_file>` (or the entire branch divergence) to understand the exact context, intent, and rationale of the upstream changes. 
- **Respect Upstream Intent:** If the upstream commit was a deliberate fix, revert, or parameter adjustment, you MUST adapt your local changes to respect and integrate the upstream intent. Never blindly steamroll upstream changes with your local stashed code. If uncertain, err on the side of preserving the upstream logic.


## Always Check For Downstream Impacts
- **State Gap Analysis:** Whenever implementing deferral, lazy-loading, or asynchronous caching logic, you MUST explicitly perform a "State Gap Analysis". Trace every component that depends on the deferred data and verify exactly what its UI state will look like during the introduced loading gap, ensuring that the temporary state does not break critical user workflows (like navigating empty filters).
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

## Node.js Build Environment
- The system default `node` (v18) is too old for Angular CLI. 
- Always prepend Angular build commands with: `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" &&`
- Example: `export PATH="$HOME/.nvm/versions/node/v22.12.0/bin:$PATH" && cd fable-ui && npx ng build --configuration production`
