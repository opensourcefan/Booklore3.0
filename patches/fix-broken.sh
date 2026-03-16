#!/usr/bin/env bash
# =============================================================================
#  BookLore EMERGENCY FIX SCRIPT
#  Run this from ~/booklore_test to fix the broken book-browser.component.ts
#  This script writes the correct files DIRECTLY without relying on the
#  patches/new-files folder.
#
#  Usage:
#    cd ~/booklore_test
#    bash patches/fix-broken.sh
# =============================================================================

set -euo pipefail
REPO="$HOME/booklore_test"
BB_TS="$REPO/booklore-ui/src/app/features/book/components/book-browser/book-browser.component.ts"
SHARED="$REPO/booklore-ui/src/app/shared"

echo "Fixing broken book-browser.component.ts..."

# Step 1 — hard-reset the broken file from git
cd "$REPO"
git checkout -- booklore-ui/src/app/features/book/components/book-browser/book-browser.component.ts
git checkout -- booklore-ui/src/app/features/book/components/book-browser/book-browser.component.html
git checkout -- booklore-ui/src/app/shared/layout/component/layout-main/app.layout.component.html
git checkout -- booklore-ui/src/app/shared/layout/component/layout-main/app.layout.component.ts
git checkout -- booklore-ui/src/styles.scss
echo "  ✓ All patched files reverted to original git state"

# Step 2 — verify new source files exist where expected
DIRECTIVE="$SHARED/directives/resizable-divider.directive.ts"
COVER="$SHARED/components/cover-preview/cover-preview.component.ts"

[[ -f "$DIRECTIVE" ]] || { echo "  ✗ Missing: $DIRECTIVE — run apply-patches.sh first"; exit 1; }
[[ -f "$COVER" ]]     || { echo "  ✗ Missing: $COVER — run apply-patches.sh first"; exit 1; }
echo "  ✓ New source files found"

# Step 3 — copy the GOOD files from our new-files folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW="$SCRIPT_DIR/new-files"

BB_DIR="$REPO/booklore-ui/src/app/features/book/components/book-browser"
LAYOUT_DIR="$REPO/booklore-ui/src/app/shared/layout/component/layout-main"

cp "$NEW/app.layout.component.html" "$LAYOUT_DIR/app.layout.component.html"
cp "$NEW/app.layout.component.ts"   "$LAYOUT_DIR/app.layout.component.ts"
cp "$NEW/book-browser.component.html" "$BB_DIR/book-browser.component.html"
cp "$NEW/book-browser.component.ts"   "$BB_DIR/book-browser.component.ts"
cp "$NEW/book-browser.component.scss" "$BB_DIR/book-browser.component.scss"
cp "$NEW/booklore-ui/src/app/shared/directives/resizable-divider.directive.ts" "$SHARED/directives/resizable-divider.directive.ts"
cp "$NEW/booklore-ui/src/app/shared/components/cover-preview/cover-preview.component.ts" "$SHARED/components/cover-preview/cover-preview.component.ts"
echo "  ✓ All patched files replaced with clean versions"

# Verify key changes made it in
grep -q "app-cover-preview" "$BB_DIR/book-browser.component.html" || { echo "  ✗ ERROR: book-browser.component.html missing app-cover-preview — aborting"; exit 1; }
grep -q "CoverPreviewComponent" "$BB_DIR/book-browser.component.ts" || { echo "  ✗ ERROR: book-browser.component.ts missing CoverPreviewComponent — aborting"; exit 1; }
echo "  ✓ Verification passed"

# Step 4 — append styles if not already there
STYLES="$REPO/booklore-ui/src/styles.scss"
if ! grep -q "bl-resize-handle" "$STYLES"; then
  echo "" >> "$STYLES"
  cat "$NEW/resize-styles.scss" >> "$STYLES"
  echo "  ✓ Resize styles appended to styles.scss"
else
  echo "  ✓ Resize styles already in styles.scss"
fi

# Step 5 — patch book-card for hover-based cover preview
BC_TS="$REPO/booklore-ui/src/app/features/book/components/book-browser/book-card/book-card.component.ts"
BC_HTML="$REPO/booklore-ui/src/app/features/book/components/book-browser/book-card/book-card.component.html"

# Always revert book-card to clean state first
git checkout -- booklore-ui/src/app/features/book/components/book-browser/book-card/book-card.component.ts
git checkout -- booklore-ui/src/app/features/book/components/book-browser/book-card/book-card.component.html

# Add @Output() bookClicked
sed -i "s|@Output() checkboxClick = new EventEmitter|@Output() bookClicked = new EventEmitter<Book>();\n  @Output() checkboxClick = new EventEmitter|" "$BC_TS"
echo "  ✓ @Output() bookClicked added to book-card.component.ts"

# Add (mouseenter) to root div
sed -i 's|(click)="onCardClick(\$event)"|(click)="onCardClick($event)"\n     (mouseenter)="bookClicked.emit(book)"|' "$BC_HTML"
echo "  ✓ (mouseenter) added to book-card.component.html"

# Step 6 — remove telemetry section from global-preferences UI
GP_HTML="$REPO/booklore-ui/src/app/features/settings/global-preferences/global-preferences.component.html"
cp "$NEW/global-preferences.component.html" "$GP_HTML"
echo "  ✓ Telemetry section removed from global-preferences.component.html"

echo ""
echo "  ✓ All done! Now run:"
echo "    cd ~/booklore_test && docker compose down && docker compose build --no-cache && docker compose up -d"
echo ""
