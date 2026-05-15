---
paths: ["**/*"]
---

## 1. Thinking & Context Management
- **Reading Files:** When browsing, keep "Thinking" minimal and provide high-level summaries.
- **Problem Solving:** Use "Think Max" reasoning depth for debugging and new feature creation.
- Styling must be consistent within the app — ALWAYS check for prior component styles (route-return-control, .close-button, etc.) before creating new CSS classes.
- If `./gradlew clean` fails due to root-owned files in `build/`, ignore it — just run `./gradlew test` or `./gradlew build` directly without `clean`. The root-owned files (from Docker builds inside containers) do not block compilation or testing, only `clean`.
- Always clean up any automatically generated temporary backup files created by you or patching tools after any push if required.
- Always clean up temporary or residual files (e.g., .patch, .orig, .rej) generated during the task before finishing.
- Do Not use the term "grimmory" in build descriptions.
- Use subagents when helpful.


# 2. Model Behavior Override: Determinism
- You are strictly operating in "Precision Mode" (Temperature 0.0).
- Do not offer creative solutions, alternative approaches, or guesses.
- If a logic path is not 100% clear from the existing code, you must STOP and ask for clarification rather than attempting a probabilistic guess.
- Your goal is logical consistency and syntax perfection over speed or innovation.