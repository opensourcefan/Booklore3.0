# Dependency & Contract Integrity
- **No Signature Changes:** You are forbidden from changing a function's name, arguments, or return type without a plan to update ALL affected files in the same task.
- **Contextual Verification:** If you add a new library or import, you must first read the `package.json` to ensure the version is compatible.
- **Variable Trace:** If a variable's value comes from an external source (API, Env, or Global Store), you must verify the source's structure before writing logic that handles that variable.
