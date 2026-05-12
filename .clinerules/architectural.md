# Architectural & Dependency Awareness Rules

## 1. The "Impact Analysis" Phase
- BEFORE modifying any function, class, or variable, you MUST use the `grep` or `search` tool to find all references to that entity across the entire codebase.
- You must list every file that imports or calls the code you are about to change. 
- In your `<PLANNING>` block, you must answer: "If I change this, what other files will need an update to prevent a crash?"

## 2. The "Adjacent File" Scan
- If you are editing a file in `src/components`, you are required to at least `read_file` the parent component or the main `App` file to see how data flows into your target file.
- If you are editing a backend API, you must check the corresponding Frontend "Types" or "Interfaces" to ensure the contract isn't broken.

## 3. Contract Enforcement
- NEVER change a function signature (the inputs it takes) without immediately providing a plan to update all calling files.
- If you find a "Global Constant" or "Environment Variable," you must verify its value in the `.env` or `config` files before assuming how it behaves.

## 4. The "No-Ghosting" Rule
- You are prohibited from assuming a variable or function "probably exists" elsewhere. 
- If you haven't seen the definition of a function in your current chat context, you MUST find it using `read_file` before using it.