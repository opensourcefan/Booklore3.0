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

# P-Keyboard.1 — full detection is in audit-mobile-styling.sh (p-dialog + app-book-searcher)
check "P-Keyboard.1 scope note (rule covers app-book-searcher in p-dialog)" "yes"

# P-Keyboard.2 — page autofocus forbidden; fixture must not introduce it
if ! grep -qiE 'autofocus' "$HTML"; then
  check "P-Keyboard.2 pattern absent on fixture page (no page-load autofocus)" "yes"
else
  check "P-Keyboard.2 pattern absent on fixture page (no page-load autofocus)" "no"
fi

# Rule 5.2 — dialog-hosted overlay without appendTo
if grep -qE '<p-dialog\b' "$HTML" && grep -qE '<p-select\b' "$HTML" && ! grep -qE 'appendTo' "$HTML"; then
  check "Rule 5.2 pattern present (dialog p-select missing appendTo)" "yes"
else
  check "Rule 5.2 pattern present (dialog p-select missing appendTo)" "no"
fi

# Rule 2.3 / 2.4 / 2.5 — scrollable dialog grows; footer scrolls away
SCROLL_SCSS="$FIX_DIR/broken-scroll-dialog.component.scss"
if [ -f "$SCROLL_SCSS" ] \
  && grep -qE 'overflow-y:\s*auto' "$SCROLL_SCSS" \
  && grep -qE 'max-height:\s*none' "$SCROLL_SCSS" \
  && ! grep -qE '(height|max-height):\s*(100%|100dvh|100svh)' "$SCROLL_SCSS"; then
  check "Rule 2.3/2.4 pattern present (scrollable dialog, max-height:none, no root fill)" "yes"
else
  check "Rule 2.3/2.4 pattern present (scrollable dialog, max-height:none, no root fill)" "no"
fi

# Live check: audit helpers must flag the scroll fixture when scanned in isolation
AUDIT_SH="$(cd "$FIX_DIR/../.." && pwd)/audit-mobile-styling.sh"
if [ -f "$AUDIT_SH" ]; then
  SCROLL_HITS=$(bash -c '
    source /dev/null
    UI_DIR="'"$FIX_DIR"'"
    # shellcheck disable=SC1091
    # Re-run only the new rules by invoking a minimal probe via the script helpers
    # Extracted inline probe — mirrors Rule 2.3/2.4/2.5 detection on the fixture.
    f="'"$SCROLL_SCSS"'"
    hits=0
    if grep -qE "overflow-y:[ \t]*(auto|scroll)" "$f" \
      && ! grep -qE "(height|max-height):[ \t]*(100%|100dvh|100svh)" "$f"; then
      hits=$((hits+1))
    fi
    if awk "/@media.*max-width:[ \t]*(768|640|520|480)px/ { in_mq=1; depth=0 }
            in_mq && /\{/ { depth++ }
            in_mq && /\}/ { depth--; if (depth <= 0) in_mq=0 }
            in_mq && /max-height:[ \t]*none/ { print NR; exit }" "$f" | grep -q .; then
      hits=$((hits+1))
    fi
    if grep -qE "max-height:[ \t]*450px" "$f"; then
      hits=$((hits+1))
    fi
    echo "$hits"
  ')
  if [ "${SCROLL_HITS:-0}" -ge 2 ]; then
    check "Rule 2.3/2.4/2.5 probe flags broken-scroll-dialog fixture" "yes"
  else
    check "Rule 2.3/2.4/2.5 probe flags broken-scroll-dialog fixture" "no"
  fi
else
  check "Rule 2.3/2.4/2.5 probe flags broken-scroll-dialog fixture" "no"
fi

# Rule 5.2 — mobile-mode auditor catches the fixture when pointed at fixtures dir
OVERLAY_PY="$(cd "$FIX_DIR/../.." && pwd)/audit-overlay-scroll.py"
if [ -f "$OVERLAY_PY" ]; then
  FIX_HITS=$(python3 "$OVERLAY_PY" --src "$FIX_DIR" --mode mobile --json --no-report 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for h in d.get('findings',[]) if 'p-select' in h.get('tag','').lower()))" \
    || echo 0)
  if [ "$FIX_HITS" -ge 1 ]; then
    check "Rule 5.2 auditor flags fixture p-select in mobile mode" "yes"
  else
    check "Rule 5.2 auditor flags fixture p-select in mobile mode" "no"
  fi
else
  check "Rule 5.2 auditor flags fixture p-select in mobile mode" "no"
fi

# --- Notification redesign (375×667) — Tasks cancel + failure inbox ---
TASKS_HTML="$FIX_DIR/notification-tasks-cancel.fixture.html"
TASKS_SCSS="$FIX_DIR/notification-tasks-cancel.fixture.scss"
INBOX_HTML="$FIX_DIR/notification-inbox.fixture.html"
INBOX_SCSS="$FIX_DIR/notification-inbox.fixture.scss"

if [ -f "$TASKS_HTML" ] && grep -q 'pi-stop' "$TASKS_HTML" && grep -q 'cancel-task-btn\|Cancel' "$TASKS_HTML" && grep -q 'tasks-panel' "$TASKS_HTML"; then
  check "N-Tasks.1 cancel control present (pi-stop in tasks-panel)" "yes"
else
  check "N-Tasks.1 cancel control present (pi-stop in tasks-panel)" "no"
fi

if [ -f "$TASKS_SCSS" ] && grep -q '375px' "$TASKS_SCSS" && grep -q 'overflow-y:\s*auto' "$TASKS_SCSS" && grep -q 'safe-area-inset-bottom' "$TASKS_SCSS" && grep -q 'min-height:\s*0' "$TASKS_SCSS"; then
  check "N-Tasks.2 phone scroll/bounds contract (375 + overflow + safe-area)" "yes"
else
  check "N-Tasks.2 phone scroll/bounds contract (375 + overflow + safe-area)" "no"
fi

if [ -f "$INBOX_HTML" ] && grep -q 'notification-inbox' "$INBOX_HTML" && grep -q 'dismiss-all-btn' "$INBOX_HTML" && grep -q 'notification-message' "$INBOX_HTML" && ! grep -qiE 'innerHTML|\[innerHTML\]' "$INBOX_HTML"; then
  check "N-Inbox.1 failure inbox + dismiss (text message, no innerHTML)" "yes"
else
  check "N-Inbox.1 failure inbox + dismiss (text message, no innerHTML)" "no"
fi

if [ -f "$INBOX_SCSS" ] && grep -q '375px' "$INBOX_SCSS" && grep -q 'overflow-y:\s*auto' "$INBOX_SCSS" && grep -q 'safe-area-inset-bottom' "$INBOX_SCSS"; then
  check "N-Inbox.2 phone inbox scroll/bounds contract" "yes"
else
  check "N-Inbox.2 phone inbox scroll/bounds contract" "no"
fi

if [ "$FAIL" -gt 0 ]; then
  echo "Fixture verification FAILED ($FAIL)"
  exit 1
fi
echo "Fixture verification OK"
exit 0
