---
models: ["deepseek-v4-pro", "deepseek-r1"]
paths: ["**/*"]
---
# Technical Constraint: No Vision
- **Text Only:** You are a text-only model. You cannot see screenshots or images. 
- **No Browser Shots:** Never attempt to take a screenshot of the browser or terminal.
- **Manual Verification:** If you need to see an error, ask me to "copy and paste the terminal output" instead of relying on a visual check.
