# Fable UI Patch Package v2

Applies two UI enhancements to your `~/fable_test` clone:

1. **Resizable panels** — hover over any panel edge to reveal a drag handle.
   Drag to resize. Width is saved to `localStorage` and restored on reload.
   - Left nav sidebar (resizable right edge)
   - Right filter sidebar (resizable left edge)

2. **Cover Preview panel** — appears at the bottom of the right filter sidebar.
   Click any book card to display its full cover image, auto-sized to the panel.

---

## Requirements (Ubuntu 24.04)

All of these should already be installed if you followed the setup guide:

```bash
git --version    # any recent version
node --version   # v18+ recommended (use nvm)
npm --version    # comes with node
```

---

## Installation

### Step 1 — Make sure your repo is cloned

```bash
ls ~/fable_test/fable-ui
```

If that fails, clone it first:

```bash
git clone https://github.com/opensourcefan/fable.git ~/fable_test
```

### Step 2 — Copy the patch folder into your repo

```bash
cp -r /path/to/downloaded/fable-patch2  ~/fable_test/patches
```

Or if you extracted the tar.gz:

```bash
tar -xzf fable-ui-patches-v2.tar.gz
cp -r fable-patch2  ~/fable_test/patches
```

### Step 3 — Make the script executable

```bash
chmod +x ~/fable_test/patches/apply-patches.sh
```

### Step 4 — Run the patch script

```bash
cd ~/fable_test
bash patches/apply-patches.sh
```

You should see a ✓ for each step. A ⚠ means that step was already applied and was safely skipped.

### Step 5 — Build the UI

```bash
cd ~/fable_test/fable-ui
npm install
npm run build
```

A clean build with no TypeScript errors = success.

### Step 6 — Test

Start your Fable instance and verify:

- Hovering the right edge of the left sidebar shows a faint blue resize handle
- Dragging it resizes the sidebar; the new width persists after reload
- Opening the right filter panel and hovering its left edge shows the same handle
- Clicking a book card (in grid view) shows its cover in the preview panel at the bottom of the filter sidebar

---

## What files are changed

| File | Change |
|------|--------|
| `shared/directives/resizable-divider.directive.ts` | **New** — the drag-to-resize Angular directive |
| `shared/components/cover-preview/cover-preview.component.ts` | **New** — the cover preview panel component |
| `src/styles.scss` | **Appended** — resize handle CSS |
| `shared/layout/component/layout-main/app.layout.component.html` | **Replaced** — adds `blResizable` to `.layout-sidebar` |
| `shared/layout/component/layout-main/app.layout.component.ts` | **Replaced** — imports `ResizableDividerDirective` |
| `features/book/components/book-browser/book-browser.component.html` | **Replaced** — adds directive to filter panel + cover preview |
| `features/book/components/book-browser/book-browser.component.ts` | **Replaced** — imports new components, adds `onBookClicked()` |
| `features/book/components/book-browser/book-card/book-card.component.ts` | **Patched** — adds `@Output() bookClicked` and emits on card click |

---

## Reverting

All changes are tracked by git:

```bash
cd ~/fable_test
git checkout -- fable-ui/src/styles.scss
git checkout -- fable-ui/src/app/shared/layout/component/layout-main/
git checkout -- fable-ui/src/app/features/book/components/book-browser/
# Remove the new files
rm -rf fable-ui/src/app/shared/directives/resizable-divider.directive.ts
rm -rf fable-ui/src/app/shared/components/cover-preview/
```
