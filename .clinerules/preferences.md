- After pushing, provide a numbered fix summary matching the user’s task order, in the built in browser.
- For frontend interaction regressions, prefer DOM-backed mock tests that verify real click behavior and the presence or absence of directives, not only component state.
- Do not push unless advised to push.
- Do not use 'milestone' within a tag unless explicitly advised.
- Do not ask to do something if it has already been asked.
- After changes, check README.md, Familairization-Guide, and codespace.md for required updates.
- "tag up" = least significant digit incremented by 1, usually v#.##.x

## Reporting: Whenever a report is requested:
- it should be placed on the ~/Desktop in HTML format.
- it should have a dark background unless otherwise stated.

- Assume file changes are "auto accept" — execute file modifications directly or bypass IDE prompts whenever possible.
- After each batch of changes or fixes, explicitly list specific edge cases and workflows the user should manually test to confirm there are no regressions.

# DeepSeek 4 Pro: Master Engineer & Debugging Rules

## 1. The "Plan Twice, Code Once" Mandate
- **Architecture First:** Before any code is written, you MUST perform a "Deep Search" of the codebase using available tools. Do not assume file structures or variable names.
- **The <PLANNING> Block:** Before every task, output a `<PLANNING>` section in plain English. You must identify:
  1. Affected files and their current role.
  2. Potential "Breaking Changes" or side effects.
  3. How this change aligns with the existing project's patterns.

## 2. The "Circuit Breaker" Debugging Protocol
- **The 3-Strike Limit:** If a bug fix fails after **TWO attempts**, you must STOP. Do not attempt a third similar fix.
- **The "Zoom Out" Reset:** On the third attempt, you must discard your previous hypothesis. You are required to:
  1. Search for the "Caller" files (the code that sends data to the failing section).
  2. Check for type mismatches, environment variables, or silent failures in dependencies.
  3. List three NEW potential causes that are NOT related to your first two attempts.

## 3. Scientific Debugging Standard
- For every bug fix, you must follow this structure before coding:
  - **Observation:** What is the exact error/behavior?
  - **Hypothesis:** Why is this happening? (Specific logic reason).
  - **Evidence:** What line of code or log output proves this hypothesis?
  - **Experiment:** What is the smallest, surgical change to test this?

## 4. Anti-Laziness & Completion
- **No Snippets:** NEVER use placeholders like `// ... rest of code` or `/* existing logic */`.
- **Full File Output:** You must always provide the COMPLETE content of the file. This ensures the user can apply the change with one click without manual merging.
- **No Guessing:** If you are unsure of a path or a dependency, use the `ls` or `read_file` tool. If a tool fails, admit it rather than hallucinating a solution.

## 5. Senior Reviewer Self-Critique
- **The "Rubber Duck" Step:** Once a solution is ready, but BEFORE presenting it, perform a quick internal review. Ask: "Is there a simpler way?" or "Will this break the build on a different OS/environment?"
- **Consistency:** Ensure all naming conventions (camelCase vs snake_case) and architectural styles match the current codebase perfectly.

## 6. Thinking & Context Management
- **Reading Files:** When browsing, keep "Thinking" minimal and provide high-level summaries.
- **Problem Solving:** Use "Think Max" reasoning depth for debugging and new feature creation.
- Styling must be consistent within the app — ALWAYS check for prior component styles (route-return-control, .close-button, etc.) before creating new CSS classes.
- If `./gradlew clean` fails due to root-owned files in `build/`, ignore it — just run `./gradlew test` or `./gradlew build` directly without `clean`. The root-owned files (from Docker builds inside containers) do not block compilation or testing, only `clean`.
- Always clean up any automatically generated temporary backup files created by you or patching tools after any push if required.
- Always clean up temporary or residual files (e.g., .patch, .orig, .rej) generated during the task before finishing.
- Do Not use the term "grimmory" in build descriptions.
- Use subagents when helpful.

- **Definition of Done Checklist:** Before declaring any task complete, the AI MUST output a point-by-point checklist of these preferences and explicitly confirm it has executed each one. This ensures the AI evaluates whether it has completed the push, generated the report, outputted the diff, and listed the edge cases before generating the final response.