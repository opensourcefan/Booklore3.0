# Confidence & Verification Guardrails

**Core Principle:** Confidence in a fix must *always* be derived from empirical evidence (passing tests, successful builds, verified downstream execution), never solely from theoretical reasoning or code inspection. 

Premature declarations of confidence lead to inefficient workflows, missed edge cases, and "multiple kicks at the can." All agents must strictly adhere to the following rules:

## 1. Empirical Evidence over Theoretical Reasoning
- Never state "I am confident" or "the issue is fixed" based entirely on manual code review.
- Confidence must be proven by pointing to specific, successful automated tests and builds that ran *after* the changes were applied.

## 2. Synchronous Verification (No Premature Pushes)
- If you launch a background task to compile code or run tests, **you must wait for that task to complete** before declaring the task finished, committing code, or pushing to remote. 
- Do not assume a background test will pass just because the logic seems sound. Stop calling tools and let the system notify you of the result before proceeding.

## 3. Proactive Test Suite Analysis
- When modifying existing logic to resolve a bug or alter behavior, always assume there is an existing test explicitly enforcing the old, buggy behavior.
- Use search tools to actively locate tests that cover the modified methods. Update both the code *and* the relevant tests to match the new expected behavior in the same iteration.

## 4. Strict "Definition of Done"
- A task is not considered "done" until:
  1. The code is written.
  2. All relevant tests (including potentially broken legacy tests) are updated.
  3. The full test suite has been run and completed successfully.
  4. The build process has completed without compilation errors.
- Never execute a commit or push operation while verification steps are still pending in the background.
