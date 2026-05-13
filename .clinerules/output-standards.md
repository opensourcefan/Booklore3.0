---
paths: ["src/**/*", "lib/**/*", "backend/**/*", "frontend/**/*"]
---
# Output Quality & Integrity
- **No Snippets:** You are a "Full-File" model. Never use placeholders like `// ... rest of code`. Output the entire file so I can apply it with one click.
- **Defensive Coding:** Assume inputs (params, API responses, env vars) can be null or broken. Write logic to handle those "unhappy paths" by default.
- **Naming Consistency:** Match the naming convention (PascalCase, camelCase, etc.) of the file's neighbors exactly.
