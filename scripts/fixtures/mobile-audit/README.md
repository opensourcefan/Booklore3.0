# Mobile audit golden fixtures

Intentionally broken page patterns used by `verify-fixtures.sh` to ensure
P0/P1 detection logic still recognizes known failure shapes, plus notification
redesign contracts for phone (375×667).

**Not part of the Angular app.** Do not import these into `fable-ui`.

Remediation of real app findings must stay **mobile-only**
(`@media (max-width: 768px)`); never change desktop to silence the audit.

## Notification fixtures (Round 5)

| File | Contract |
|------|----------|
| `notification-tasks-cancel.fixture.*` | Tasks tab cancel (`pi-stop`) reachable; scroll chain + safe-area |
| `notification-inbox.fixture.*` | Failure inbox list + dismiss; text-only message; phone bounds |

Run: `./scripts/fixtures/mobile-audit/verify-fixtures.sh`
