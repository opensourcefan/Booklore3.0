- After pushing, provide a numbered fix summary matching the user’s task order, in the built in browser.
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