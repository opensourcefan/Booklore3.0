---
paths: ["src/**/*", "lib/**/*", "tests/**/*"]
---
# Debugging & The "Circuit Breaker"
- **The 2-Strike Rule:** If a fix fails twice, STOP. You are in a "Tunnel Vision" loop. 
- **The Reset:** On the 3rd attempt, you must discard your previous hypothesis. Search the files that provide data *to* the failing code instead of the failing code itself.
- **Scientific Proof:** For every fix, you must state the **Observation** (error), the **Hypothesis** (why), and the **Evidence** (line number/log) before writing code.
- **Log Literacy:** Read the entire error log. Do not guess a fix based on the first line of the error.
