# Mobile audit golden fixtures

Intentionally broken page patterns used by `verify-fixtures.sh` to ensure
P0/P1 detection logic still recognizes known failure shapes.

**Not part of the Angular app.** Do not import these into `fable-ui`.

Remediation of real app findings must stay **mobile-only**
(`@media (max-width: 768px)`); never change desktop to silence the audit.
