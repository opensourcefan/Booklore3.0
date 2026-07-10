#!/bin/bash
# Verifies that audit rules would catch the golden broken-page fixture patterns.
# Does not run the full app scan — pattern-level smoke checks only.
set -euo pipefail

FIX_DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$FIX_DIR/broken-page.component.html"
SCSS="$FIX_DIR/broken-page.component.scss"
FAIL=0

check() {
  local name="$1"
  local ok="$2"
  if [ "$ok" = "yes" ]; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "Fixture smoke checks: $FIX_DIR"

# P-Drag.1: comic-flow-card has cdkDrag and no handle before card-details closes
card_block=$(awk '/comic-flow-card/,/card-details/' "$HTML")
if echo "$card_block" | grep -q 'cdkDrag' && ! echo "$card_block" | grep -q 'cdkDragHandle'; then
  check "P-Drag.1 pattern present (drag without handle)" "yes"
else
  check "P-Drag.1 pattern present (drag without handle)" "no"
fi

# P-Drag.2
if grep -q 'cdkDragDisabled]="true"' "$HTML" && grep -q 'cdkDragHandle' "$HTML"; then
  check "P-Drag.2 pattern present (disabled + handle)" "yes"
else
  check "P-Drag.2 pattern present (disabled + handle)" "no"
fi

# P-Layout.1
if grep -q 'cdkDropListOrientation="horizontal"' "$HTML" && \
   grep -q 'flex-direction:\s*column' "$SCSS"; then
  check "P-Layout.1 pattern present (horizontal + mobile column)" "yes"
else
  check "P-Layout.1 pattern present (horizontal + mobile column)" "no"
fi

# P-Touch.1
if ! grep -q 'touch-action:\s*pan-y' "$SCSS"; then
  check "P-Touch.1 pattern present (missing touch-action split)" "yes"
else
  check "P-Touch.1 pattern present (missing touch-action split)" "no"
fi

# P-Header.1 — subtitle exists; no display:none for it in the file
if grep -q '\.subtitle' "$SCSS" && ! grep -E 'subtitle|display:\s*none' "$SCSS" | paste - - 2>/dev/null | grep -q 'display'; then
  if ! grep -n 'display:\s*none' "$SCSS" | grep -q .; then
    check "P-Header.1 pattern present (subtitle not hidden)" "yes"
  elif ! awk '/\.subtitle/{s=1} s && /display:[ \t]*none/{print "hit"}' "$SCSS" | grep -q hit; then
    check "P-Header.1 pattern present (subtitle not hidden)" "yes"
  else
    check "P-Header.1 pattern present (subtitle not hidden)" "no"
  fi
else
  if grep -q '\.subtitle' "$SCSS" && ! awk '/\.subtitle/{s=1} s && /display:[ \t]*none/{print "hit"; exit}' "$SCSS" | grep -q hit; then
    check "P-Header.1 pattern present (subtitle not hidden)" "yes"
  else
    check "P-Header.1 pattern present (subtitle not hidden)" "no"
  fi
fi

# P-Safe.1
if grep -q 'position:\s*fixed' "$SCSS" && grep -q 'bottom:' "$SCSS" && ! grep -q 'safe-area-inset-bottom' "$SCSS"; then
  check "P-Safe.1 pattern present (fixed bottom, no safe-area)" "yes"
else
  check "P-Safe.1 pattern present (fixed bottom, no safe-area)" "no"
fi

if [ "$FAIL" -gt 0 ]; then
  echo "Fixture verification FAILED ($FAIL)"
  exit 1
fi
echo "Fixture verification OK"
exit 0
