#!/usr/bin/env bash
# =============================================================================
#  Fable UI Patch Script v2
#  Based on actual source files from opensourcefan/fable
#
#  Applies:
#    1. Resizable left nav sidebar (hover + drag, width saved to localStorage)
#    2. Resizable right filter panel (hover + drag, width saved to localStorage)
#    3. Cover Preview panel at bottom of filter sidebar (click any book to preview)
#
#  Usage:
#    cd ~/fable_test
#    bash patches/apply-patches.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓  $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠  $*${NC}"; }
fail() { echo -e "${RED}  ✗  $*${NC}"; exit 1; }
step() { echo -e "\n${CYAN}▶  $*${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$HOME/fable_test"
UI="$REPO/fable-ui/src/app"
STYLES="$REPO/fable-ui/src/styles.scss"
NEW="$SCRIPT_DIR/new-files"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║    Fable UI Patch Applicator v2       ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Repo : $REPO"
echo "  UI   : $UI"

# ── Sanity checks ─────────────────────────────────────────────────────────────
step "Checking prerequisites"
[[ -d "$UI" ]]     || fail "Angular src not found at $UI"
[[ -f "$STYLES" ]] || fail "styles.scss not found at $STYLES"
ok "Repo structure OK"

# ── Step 1: Install new source files ──────────────────────────────────────────
step "Step 1/5 — Installing new source files"

# Directive
DIRDIR="$UI/shared/directives"
mkdir -p "$DIRDIR"
if [[ ! -f "$DIRDIR/resizable-divider.directive.ts" ]]; then
  cp "$NEW/fable-ui/src/app/shared/directives/resizable-divider.directive.ts" "$DIRDIR/"
  ok "resizable-divider.directive.ts installed → $DIRDIR"
else
  warn "resizable-divider.directive.ts already exists — skipping"
fi

# Cover preview component
COVDIR="$UI/shared/components/cover-preview"
mkdir -p "$COVDIR"
if [[ ! -f "$COVDIR/cover-preview.component.ts" ]]; then
  cp "$NEW/fable-ui/src/app/shared/components/cover-preview/cover-preview.component.ts" "$COVDIR/"
  ok "cover-preview.component.ts installed → $COVDIR"
else
  warn "cover-preview.component.ts already exists — skipping"
fi

# ── Step 2: Append resize styles to styles.scss ───────────────────────────────
step "Step 2/5 — Appending resize styles to styles.scss"
if grep -q "bl-resize-handle" "$STYLES"; then
  warn "Resize styles already in styles.scss — skipping"
else
  echo "" >> "$STYLES"
  cat "$NEW/resize-styles.scss" >> "$STYLES"
  ok "Resize styles appended to styles.scss"
fi

# ── Step 3: Replace app.layout.component.html and .ts ─────────────────────────
step "Step 3/5 — Patching app.layout.component (sidebar resizable)"

LAYOUT_HTML="$UI/shared/layout/component/layout-main/app.layout.component.html"
LAYOUT_TS="$UI/shared/layout/component/layout-main/app.layout.component.ts"

# Always replace these
cp "$NEW/app.layout.component.html" "$LAYOUT_HTML"
ok "app.layout.component.html replaced"

cp "$NEW/app.layout.component.ts" "$LAYOUT_TS"
ok "app.layout.component.ts replaced"

# ── Step 4: Replace book-browser component files ──────────────────────────────
step "Step 4/5 — Patching book-browser component (resizable filter panel + cover preview)"

BB_DIR="$UI/features/book/components/book-browser"
BB_HTML="$BB_DIR/book-browser.component.html"
BB_TS="$BB_DIR/book-browser.component.ts"

# Always replace these — a previous broken version may be present
cp "$NEW/book-browser.component.html" "$BB_HTML"
ok "book-browser.component.html replaced"

cp "$NEW/book-browser.component.ts" "$BB_TS"
ok "book-browser.component.ts replaced"

cp "$NEW/book-browser.component.scss" "$BB_DIR/book-browser.component.scss"
ok "book-browser.component.scss replaced"

# ── Step 5: Patch book-card to emit bookClicked on hover ──────────────────────
step "Step 5/5 — Patching book-card component (emit bookClicked on hover)"

BC_TS="$BB_DIR/book-card/book-card.component.ts"
BC_HTML="$BB_DIR/book-card/book-card.component.html"

# Add @Output() bookClicked to TS if not already there
if grep -q "bookClicked" "$BC_TS"; then
  ok "book-card.component.ts already has bookClicked"
else
  sed -i "s|@Output() checkboxClick = new EventEmitter|@Output() bookClicked = new EventEmitter<Book>();\n  @Output() checkboxClick = new EventEmitter|" "$BC_TS"
  ok "@Output() bookClicked added to book-card.component.ts"
fi

# Add (mouseenter) to root div in HTML
if grep -q "mouseenter" "$BC_HTML"; then
  ok "book-card.component.html already has mouseenter"
else
  sed -i 's|(click)="onCardClick(\$event)"|(click)="onCardClick($event)"\n     (mouseenter)="bookClicked.emit(book)"|' "$BC_HTML"
  ok "(mouseenter) added to book-card.component.html"
fi

# ── Step 6: Remove telemetry UI from settings ─────────────────────────────────
step "Step 6/6 — Removing telemetry UI from settings"

GP_HTML="$UI/features/settings/global-preferences/global-preferences.component.html"
if grep -q "telemetry.sectionTitle" "$GP_HTML"; then
  cp "$NEW/global-preferences.component.html" "$GP_HTML"
  ok "Telemetry section removed from global-preferences.component.html"
else
  warn "Telemetry section already removed — skipping"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo -e "  ║  ${GREEN}All patches applied successfully!${NC}        ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo ""
echo "    1. Review changes:    cd ~/fable_test && git diff --stat"
echo "    2. Build the image:   cd ~/fable_test && docker compose down && docker compose build --no-cache && docker compose up -d"
echo "    3. Start dev server:  npm start   (or use your normal Docker build)"
echo ""
echo "  What to test:"
echo "    • Hover over the left sidebar edge — a blue handle appears, drag to resize"
echo "    • Open the right filter panel, hover its left edge — same resize handle"
echo "    • Panel widths survive page reload (saved to localStorage)"
echo "    • Click any book card — its cover appears in the preview panel at the bottom right"
echo ""
