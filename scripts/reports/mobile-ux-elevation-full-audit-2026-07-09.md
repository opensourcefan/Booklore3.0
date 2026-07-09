# Fable Mobile UX Elevation — Full Audit Report

**Date:** 2026-07-09 11:57 PDT
**Source:** Mobile UX Elevation Master Plan + `audit-mobile-styling.sh`
**Scan target:** `fable-ui/src/app` (896 files scanned, 195 SCSS files)

---

## Executive Summary

| Category | Status | Detail |
|---|---|---|
| Audit Script (22 rules) | ⚠️ 9 open issues | 20/22 rules clean, 2 rules have violations |
| Phase 1 — Core Navigation & Layout | ⚠️ Partial | Key services exist but have defects; `mobile-layout.scss` missing |
| Phase 2 — Touch Interaction Directives | ❌ Not Started | No gesture directives, no global touch feedback |
| Phase 3 — Centralized Dialog & Grid Components | ⚠️ Partial | Dialog size classes done; `app-mobile-dialog` wrapper & `mobile-table-card` missing |
| Phase 4 — Component Migration & Verification | ⚠️ In Progress | 35/56 dialogs use `panel-header` mixin; 8 dialogs have un-migrated footers |

---

## Part A: Audit Script Results (22-Rule Scan)

### ⚠️ Rule 4.3 — `flex-direction: column` in footer media queries (5 issues)

These footers stack buttons vertically on mobile, wasting space. 4 of 5 do not use the `@include panel.dialog-footer` mixin.

| # | File | Line | Uses `dialog-footer` mixin? |
|---|------|------|----|
| 1 | `library-stats.component.scss` | 925 | ❌ No |
| 2 | `reading-session-heatmap.component.scss` | 177 | ❌ No |
| 3 | `user-stats.component.scss` | 398 | ❌ No |
| 4 | `user-management.component.scss` | 727 | ❌ No |
| 5 | `file-mover-component.scss` | 506 | ✅ Yes — but has an additional manual override |

**Fix:** Migrate all 5 to `@include panel.dialog-footer` or `dialog-footer-end`, which handles `flex-direction: row` with wrapped buttons on mobile.

---

### ⚠️ Rule 5.4 — Top/Bottom header mode positioning conflicts (4 issues)

These files define `top:` or `padding-top:` in a mobile media query but lack a corresponding `body.header-bottom` override, risking positioning overlap.

| # | File | Line | Has `body.header-bottom` override? |
|---|------|------|---|
| 1 | `completion-timeline-chart.component.scss` | 104 | ❌ No |
| 2 | `cover-search.component.scss` | 313 | ❌ No |
| 3 | `ai-scan-directory-dialog.component.scss` | 331 | ❌ No |
| 4 | `_panel-shared.scss` | 79 | ❌ No |

**Fix:** Add `:host-context(body.header-bottom)` overrides or conditional styling for each file's mobile `top`/`padding-top` rules.

---

### ✅ Rules With No Issues (20/22 clean)

| Rule | Description |
|------|-------------|
| Rule 2.1 | Hardcoded min-height on dialog/panel roots |
| Rule 2.2 | Hardcoded width on dialog/panel roots |
| Rule 1.3 | Breakpoints below 768px without a 768px sibling |
| Rule 4.2 | Footer patterns missing safe-area-inset-bottom |
| Rule 6.1 | Invalid CSS: justify-content: stretch |
| Rule 3.1 | Dialog headers without mobile compaction |
| Rule 3.3 | Info banners not hidden on mobile |
| Rule 3.4 | Row action buttons with visible text on mobile |
| Rule 3.6 | Validation status in footers not hidden on mobile |
| Rule 3.7 | Truncated paths without mobile scroll fallback |
| Rule 3.5 | Status chips/badges with visible text on mobile |
| Rule 3.2 | dialog-nav without mobile top padding |
| Rule 2.5 | Inefficient panel height limit on mobile |
| Rule 2.6 | Dialog overlays not top-aligned on mobile |
| Rule 3.8 | Back-to-top action missing on long panels |
| Rule 3.10 | Component transition scroll reset check |
| Rule 3.9 | Raw path interpolation without last-two-folders truncation |
| Rule 5.5 | Mobile popover boundary bounds check |
| Rule 10.1 | Direct DialogService.open usage (bypasses back gesture) |
| Rule 10.2 | Dialog template lacks close-button |

---

## Part B: Phase 1 — Core Navigation & Layout Utilities

### B.1 `MobileBackNavigationService` ⚠️ Needs Fix

**File:** `shared/service/mobile-back-navigation.service.ts`
**Status:** Exists and works, but has two defects identified by the master plan:

| Property | Current Value | Master Plan Target | Status |
|---|---|---|---|
| `MOBILE_BREAKPOINT` | `767` | `768` | ⚠️ Off by 1 |
| `MOBILE_LONG_EDGE_MAX_PX` | `1200` | Remove entirely | ⚠️ Still present |

**Impact:** The `longEdge` check at line 103 excludes iPad Pro 12.9" (1366px long edge) and similar devices from back-gesture support, even when at phone widths.

**Fix:** Change breakpoint to `768`, remove `longEdge` check from `isMobileInteractionMode()`.

---

### B.2 `ScrollLockService` ❌ Does Not Exist

**Master Plan Requirement:** Phase 1, Step 1 — "Create a global service that toggles body-scroll locking on layout overlays."
**Risk Assessment Dependency:** Section 5, Row 3 — "The ScrollLockService tracks open overlays as a count. The lock is only released when the active overlay count reaches zero."

**Current state:** No scroll-lock mechanism exists. Opening/closing overlays in quick succession could leave the parent page permanently locked/unscrollable.

**Fix:** Create `shared/service/scroll-lock.service.ts` with stack-based overlay counting.

---

### B.3 `mobile-layout.scss` ❌ Does Not Exist

**Master Plan Requirement:** Phase 1, Step 3 — "Create `mobile-layout.scss` to store standard grid, stack, and viewport dimension utility classes."

The following centralized utility classes referenced in the plan are missing:

| Utility Class | Purpose | Covers Audit Rule |
|---|---|---|
| `.fable-flex-scroll-chain` | Enforces strict vertical flex scrolling chains | Rule 2.4 |
| `.hide-banner-mobile` | Auto-hides info banners on mobile | Rule 3.3 |
| `.folder-path` / `.file-path` overrides | Mobile scroll fallback for truncated paths | Rules 3.7, 3.9 |
| Viewport/grid utility classes | Standard layout scaffolding | General |

**Note:** These rules currently pass the audit because individual components handle overrides ad-hoc. The master plan's goal is to centralize them.

---

### B.4 Breakpoint Variable Centralization ⚠️ Not Done

**Master Plan Requirement:** Section 3, Rule 1.3 — "Standardized MQ breakpoints defined in `_variables.scss`."

**Current state:** 146 SCSS files hardcode `@media (max-width: 768px)` individually. No SCSS variable (e.g., `$bp-mobile: 768px`) exists in `_variables.scss`.

**Fix:** Define `$bp-mobile`, `$bp-tablet`, etc. in `_variables.scss` and refactor components to use them.

---

## Part C: Phase 2 — Unified Interaction Directives

### C.1 Touch Gesture Directives ❌ Not Started

| Directive | Master Plan Reference | Status |
|---|---|---|
| `appLongPress` | Phase 2, Step 1 | ❌ Does not exist |
| `appTouchSwipe` | Phase 2, Step 1 | ❌ Does not exist |
| Touch Target Enforcement (40px min) | Phase 2, Step 2 | ❌ Does not exist |

**Current touch handling:**
- 4 TypeScript files handle raw `touchstart`/`touchmove`/`touchend` events directly
- 10 SCSS files define `touch-action` properties individually
- 1 file uses passive event listener flags
- 28 files use CDK Drag (Angular's `cdkDrag` / `cdkDropList`)

---

### C.2 CDK Drag Touch Handles ⚠️ Present but Not Standardized

**Master Plan Requirement:** Phase 2, Step 3 — "Standardize touch handles inside Story Arc sorting rows to block scroll defaults during active sorting actions."

**Current state:** Story Arc page (`story-arc-page.component.html`) uses `cdkDrag`, `cdkDragHandle`, and `cdkDropList` correctly. However, there is no `touch-action: none` applied to drag handles to prevent scroll interference on mobile.

---

### C.3 Global Touch Feedback ❌ Not Implemented

| Feature | Master Plan Section | Status |
|---|---|---|
| `-webkit-tap-highlight-color: transparent` | Section 2, Item 1 | ❌ Not set globally |
| Unified press feedback (`scale(0.97)` + primary color blend) | Section 2, Item 2 | ❌ Not implemented |
| Context overlay → bottom-sheet collapse on mobile | Section 2, Item 3 | ❌ Not implemented |

---

## Part D: Phase 3 — Centralized Dialogs & Grid Components

### D.1 Dialog Size Classes ✅ Complete

All 6 size classes exist in `global.scss`:

| Class | Max Width | Status |
|---|---|---|
| `.dialog-xs` | 400px | ✅ |
| `.dialog-sm` | 550px | ✅ |
| `.dialog-md` | 700px | ✅ |
| `.dialog-lg` | 900px | ✅ |
| `.dialog-xl` | 1200px | ✅ |
| `.dialog-full` | viewport | ✅ |

Plus `.dialog-minimal` modifier and legacy aliases for backward compatibility.

---

### D.2 `DialogLauncherService` ✅ Complete

**File:** `shared/services/dialog-launcher.service.ts`
**Status:** Fully operational.

| Metric | Value |
|---|---|
| Total dialog launcher methods | 22 |
| Components using `DialogLauncherService` | 19 files |
| Direct `dialogService.open()` bypasses | **0** ✅ |
| All dialogs get back-gesture support | ✅ via `MobileBackNavigationService` |

---

### D.3 `_panel-shared.scss` Mixins ✅ Complete

**File:** `shared/styles/_panel-shared.scss`

| Mixin | Purpose | Includes safe-area? | Mobile overrides? |
|---|---|---|---|
| `panel-header` | Dialog header styling + mobile compaction | N/A | ✅ |
| `dialog-footer` | Footer with validation + safe area | ✅ `env(safe-area-inset-bottom)` | ✅ |
| `dialog-footer-end` | Right-aligned footer variant | ✅ | ✅ |
| `validation-message` | Error/success badge styling | N/A | ✅ |

---

### D.4 `app-mobile-dialog` Wrapper Component ❌ Does Not Exist

**Master Plan Requirement:** Phase 3, Step 1 — "Create the shared dialog header/body shell, linking it to the ScrollLockService and MobileBackNavigationService."

**Note:** The current approach uses `@include panel.panel-header` / `dialog-footer` mixins at the SCSS level. This works but doesn't provide the structural TypeScript wrapper the plan envisions.

---

### D.5 `mobile-table-card` ❌ Does Not Exist

**Master Plan Requirement:** Phase 3, Step 2 — "Deploy the table collapse styles in global stylesheets, converting columns to vertical cards."

No centralized table-to-card collapse utility exists.

---

## Part E: Phase 4 — Component Migration & Verification

### E.1 `panel-header` Mixin Adoption

| Metric | Count |
|---|---|
| Total dialog components (with `DynamicDialogRef`) | 56 |
| Dialogs using `@include panel.panel-header` | **35** (62.5%) |
| Dialogs NOT using the mixin | **17** (30.4%) |
| Non-dialog components (layout/service files) | 4 (not applicable) |

**Unmigrated dialogs (17):**

| File |
|------|
| `library-creator.component.scss` |
| `bookdrop-bulk-edit-dialog.component.scss` |
| `bookdrop-pattern-extract-dialog.component.scss` |
| `story-arc-book-picker.component.scss` |
| `story-arc-assigner.component.scss` |
| `author-photo-search.component.scss` |
| `metadata-viewer.component.scss` (×2 instances) |
| `metadata-picker.component.scss` |
| `ai-scan-directory-dialog.component.scss` |
| `email-v2-provider.component.scss` |
| `email-v2-recipient.component.scss` |
| `book-browser.component.scss` (×2 instances) |
| `series-page.component.scss` |
| `icon-picker-component.scss` |
| `upload-dialog.component.scss` |

---

### E.2 `dialog-footer` Mixin Adoption

| Metric | Count |
|---|---|
| Dialogs using `@include panel.dialog-footer` | **21** |
| Dialogs with footer styles NOT using the mixin | **8** |

**Unmigrated footer dialogs (8):**

| File |
|------|
| `ai-scan-directory-dialog.component.scss` |
| `bookdrop-bulk-edit-dialog.component.scss` |
| `bookdrop-pattern-extract-dialog.component.scss` |
| `library-creator.component.scss` |
| `metadata-fetch-options.component.scss` |
| `multi-book-metadata-fetch-component.scss` |
| `series-page.component.scss` |
| `upload-dialog.component.scss` |

---

### E.3 Close Button Adoption ✅ Complete

All 39 dialog templates with custom headers include the `close-button` class. Zero audit violations.

---

## Part F: Overall Progress Dashboard

| Master Plan Item | Status | Progress |
|---|---|---|
| **Phase 1: Core Navigation & Layout** | | |
| ├─ `ScrollLockService` | ❌ Missing | 0% |
| ├─ `MobileBackNavigationService` breakpoint fix | ⚠️ Needs 2 changes | 80% |
| ├─ `mobile-layout.scss` utilities | ❌ Missing | 0% |
| └─ Breakpoint variable centralization | ❌ Not done | 0% |
| **Phase 2: Touch Interaction Directives** | | |
| ├─ `appLongPress` directive | ❌ Missing | 0% |
| ├─ `appTouchSwipe` directive | ❌ Missing | 0% |
| ├─ Touch target enforcement (40px) | ❌ Missing | 0% |
| ├─ Global tap highlight removal | ❌ Missing | 0% |
| ├─ Unified press feedback | ❌ Missing | 0% |
| └─ CDK drag touch handle standardization | ⚠️ Partial | 30% |
| **Phase 3: Centralized Dialogs & Grids** | | |
| ├─ Dialog size classes | ✅ Complete | 100% |
| ├─ `DialogLauncherService` | ✅ Complete | 100% |
| ├─ `_panel-shared.scss` mixins | ✅ Complete | 100% |
| ├─ `app-mobile-dialog` component | ❌ Missing | 0% |
| └─ `mobile-table-card` styles | ❌ Missing | 0% |
| **Phase 4: Component Migration** | | |
| ├─ `panel-header` mixin adoption | ⚠️ 35/56 | 62% |
| ├─ `dialog-footer` mixin adoption | ⚠️ 21/29 | 72% |
| ├─ Close button adoption | ✅ 39/39 | 100% |
| ├─ `DialogLauncherService` migration | ✅ 0 bypasses | 100% |
| └─ Audit script (22 rules) | ⚠️ 9 open issues | 59% |

---

## Recommended Fix Priority

### Priority 1 — Quick Wins (Fix existing audit violations)
1. Migrate 4 footer files to `@include panel.dialog-footer` (fixes Rule 4.3)
2. Assess `file-mover-component.scss` Rule 4.3 false positive (already uses mixin)
3. Add `body.header-bottom` overrides to 4 files (fixes Rule 5.4)

### Priority 2 — Service Fixes (Low risk, high impact)
4. Fix `MobileBackNavigationService` breakpoint (`767` → `768`) and remove `longEdge` check
5. Create `ScrollLockService` with stack-based counting

### Priority 3 — Centralization (Reduce ad-hoc patterns)
6. Create `mobile-layout.scss` with utility classes
7. Centralize breakpoint variables in `_variables.scss`
8. Migrate remaining 17 dialogs to `panel-header` mixin
9. Migrate remaining 8 dialogs to `dialog-footer` mixin

### Priority 4 — New Features (Touch UX, Phase 2)
10. Add global `-webkit-tap-highlight-color: transparent`
11. Add unified press feedback mixin
12. Create `appLongPress` and `appTouchSwipe` directives
13. Implement touch target enforcement
14. Standardize CDK drag touch handles for story arcs

### Priority 5 — Structural Components (Phase 3 completions)
15. Evaluate `app-mobile-dialog` wrapper vs current mixin approach
16. Create `mobile-table-card` collapse styles

---

# Master Instructions for Downstream Agent

Follow these instructions to implement the Mobile UX Elevation plan. You must adhere to the exact code patterns, file structures, and safety guidelines provided.

## 🚨 Critical Guidelines & Failure Mitigations

1. **Working Directory & Path Safety**:
   - Always run commands in the terminal with `/home/michael/fable` as the working directory. Do NOT use `/tmp` or write temporary files there.
   - Do not edit file extensions. All files must maintain their original extensions.
2. **TypeScript Import Pitfalls**:
   - Be extremely careful with relative paths. Note that `MobileBackNavigationService` is in `src/app/shared/service/` (singular), while `DialogLauncherService` is in `src/app/shared/services/` (plural).
   - Standalone directives/components must be imported directly in the component files where they are used.
3. **Sass Compile Errors**:
   - Sass `@use` directives **must** be placed at the very top of files, before any selectors or rules.
   - Do not mix `@import` and `@use` in a way that creates circular dependencies.
4. **Preserve Context & Docstrings**:
   - Do not delete or modify existing code comments or docstrings unrelated to your styling and navigation fixes.

---

## 🛠️ Step 1: Implement Phase 1 Infrastructure

### 1.1 Create `ScrollLockService`
Create a new file at `file:///home/michael/fable/fable-ui/src/app/shared/service/scroll-lock.service.ts` with the following code. This service tracks open dialogs and locks the body scroll dynamically.

```typescript
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ScrollLockService {
  private lockCount = 0;
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  lock(): void {
    if (!this.isBrowser) return;
    this.lockCount++;
    if (this.lockCount === 1) {
      document.body.style.overflow = 'hidden';
    }
  }

  unlock(): void {
    if (!this.isBrowser) return;
    if (this.lockCount > 0) {
      this.lockCount--;
      if (this.lockCount === 0) {
        document.body.style.overflow = '';
      }
    }
  }
}
```

### 1.2 Modify `MobileBackNavigationService`
Modify `file:///home/michael/fable/fable-ui/src/app/shared/service/mobile-back-navigation.service.ts` to update the breakpoint and remove the `longEdge` limitations.

```diff
-  private readonly MOBILE_BREAKPOINT = 767;
-  private readonly MOBILE_LONG_EDGE_MAX_PX = 1200;
+  private readonly MOBILE_BREAKPOINT = 768;

...

   private isMobileInteractionMode(): boolean {
-    const shortEdge = Math.min(window.innerWidth, window.innerHeight);
-    const longEdge = Math.max(window.innerWidth, window.innerHeight);
-    return shortEdge <= this.MOBILE_BREAKPOINT && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
+    const shortEdge = Math.min(window.innerWidth, window.innerHeight);
+    return shortEdge <= this.MOBILE_BREAKPOINT;
   }
```

### 1.3 Update `DialogLauncherService`
Modify `file:///home/michael/fable/fable-ui/src/app/shared/services/dialog-launcher.service.ts` to import `ScrollLockService` and lock/unlock screen scrolling:

```typescript
// Add at the top:
import { ScrollLockService } from '../service/scroll-lock.service';

// Inject inside the DialogLauncherService class:
private scrollLock = inject(ScrollLockService);

// Update openDialog() method:
openDialog(component: unknown, options: object): DynamicDialogRef | null {
  const ref = this.dialogService.open(component as Type<object>, {
    ...this.defaultDialogOptions,
    ...options,
  });

  if (ref) {
    // Lock scroll on open
    this.scrollLock.lock();

    const backHandle = this.mobileBackNavigation.register(() => {
      ref.close();
    });

    const sub = ref.onClose.subscribe(() => {
      backHandle.release();
      // Unlock scroll on close
      this.scrollLock.unlock();
      sub.unsubscribe();
    });
  }

  return ref;
}
```

### 1.4 Create Centralized `_mobile-layout.scss`
Create `file:///home/michael/fable/fable-ui/src/assets/layout/styles/layout/_mobile-layout.scss`:

```scss
// Standard centralized mobile utilities
@use 'variables' as var;

@media (max-width: 768px) {
  // Rule 2.4: flex scroll chains
  .fable-flex-scroll-chain {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;

    .fable-scroll-content {
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
    }
  }

  // Rule 3.3: hide banner mobile
  .hide-banner-mobile {
    display: none !important;
  }

  // Rule 3.7 & 3.9: mobile scroll fallback for path values
  .folder-path, .directory-path, .file-path, .path-value, .book-file-path {
    overflow-x: auto !important;
    white-space: nowrap !important;
    text-overflow: clip !important;
  }
}
```

Now import it globally. Add this line at the bottom of `file:///home/michael/fable/fable-ui/src/assets/layout/styles/layout/layout.scss`:
```scss
@use "_mobile-layout";
```

### 1.5 Centralize Breakpoint Variables
Add mobile breakpoint variables to the bottom of `file:///home/michael/fable/fable-ui/src/assets/layout/styles/layout/_variables.scss`:
```scss
/* Breakpoints */
$mobile-breakpoint: 768px;
$tablet-breakpoint: 991px;
```

---

## 🛠️ Step 2: Implement Phase 2 Touch UX Directives

Create the gesture directives under `file:///home/michael/fable/fable-ui/src/app/shared/directives/`.

### 2.1 Create `LongPressDirective`
File: `file:///home/michael/fable/fable-ui/src/app/shared/directives/long-press.directive.ts`

```typescript
import { Directive, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

@Directive({
  selector: '[appLongPress]',
  standalone: true
})
export class LongPressDirective implements OnInit, OnDestroy {
  @Input() duration = 500; // ms
  @Output() appLongPress = new EventEmitter<TouchEvent | MouseEvent>();

  private timeoutId: any;
  private isPressing = false;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;
    element.addEventListener('touchstart', this.onPressStart, { passive: true });
    element.addEventListener('touchend', this.onPressEnd, { passive: true });
    element.addEventListener('touchcancel', this.onPressEnd, { passive: true });
    element.addEventListener('mousedown', this.onPressStart);
    element.addEventListener('mouseup', this.onPressEnd);
    element.addEventListener('mouseleave', this.onPressEnd);
  }

  ngOnDestroy(): void {
    const element = this.el.nativeElement;
    element.removeEventListener('touchstart', this.onPressStart);
    element.removeEventListener('touchend', this.onPressEnd);
    element.removeEventListener('touchcancel', this.onPressEnd);
    element.removeEventListener('mousedown', this.onPressStart);
    element.removeEventListener('mouseup', this.onPressEnd);
    element.removeEventListener('mouseleave', this.onPressEnd);
    this.clearTimeout();
  }

  private onPressStart = (event: TouchEvent | MouseEvent): void => {
    this.isPressing = true;
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      if (this.isPressing) {
        this.appLongPress.emit(event);
      }
    }, this.duration);
  };

  private onPressEnd = (): void => {
    this.isPressing = false;
    this.clearTimeout();
  };

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

### 2.2 Create `TouchSwipeDirective`
File: `file:///home/michael/fable/fable-ui/src/app/shared/directives/touch-swipe.directive.ts`

```typescript
import { Directive, ElementRef, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';

@Directive({
  selector: '[appTouchSwipe]',
  standalone: true
})
export class TouchSwipeDirective implements OnInit, OnDestroy {
  @Output() swipeLeft = new EventEmitter<TouchEvent>();
  @Output() swipeRight = new EventEmitter<TouchEvent>();
  @Output() swipeUp = new EventEmitter<TouchEvent>();
  @Output() swipeDown = new EventEmitter<TouchEvent>();

  private startX = 0;
  private startY = 0;
  private minSwipeDistance = 50; // pixels

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;
    element.addEventListener('touchstart', this.onTouchStart, { passive: true });
    element.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy(): void {
    const element = this.el.nativeElement;
    element.removeEventListener('touchstart', this.onTouchStart);
    element.removeEventListener('touchend', this.onTouchEnd);
  }

  private onTouchStart = (event: TouchEvent): void => {
    if (event.touches && event.touches.length > 0) {
      this.startX = event.touches[0].clientX;
      this.startY = event.touches[0].clientY;
    }
  };

  private onTouchEnd = (event: TouchEvent): void => {
    if (event.changedTouches && event.changedTouches.length > 0) {
      const diffX = event.changedTouches[0].clientX - this.startX;
      const diffY = event.changedTouches[0].clientY - this.startY;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > this.minSwipeDistance) {
          if (diffX > 0) {
            this.swipeRight.emit(event);
          } else {
            this.swipeLeft.emit(event);
          }
        }
      } else {
        if (Math.abs(diffY) > this.minSwipeDistance) {
          if (diffY > 0) {
            this.swipeDown.emit(event);
          } else {
            this.swipeUp.emit(event);
          }
        }
      }
    }
  };
}
```

### 2.3 Create `TouchTargetDirective` (40px Tap Zones)
File: `file:///home/michael/fable/fable-ui/src/app/shared/directives/touch-target.directive.ts`

```typescript
import { Directive, ElementRef, OnInit, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appTouchTarget]',
  standalone: true
})
export class TouchTargetDirective implements OnInit {
  constructor(private el: ElementRef, private renderer: Renderer2) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;
    this.renderer.setStyle(element, 'min-width', '40px');
    this.renderer.setStyle(element, 'min-height', '40px');
    this.renderer.setStyle(element, 'display', 'inline-flex');
    this.renderer.setStyle(element, 'align-items', 'center');
    this.renderer.setStyle(element, 'justify-content', 'center');
  }
}
```

### 2.4 Add Global Tap Highlight & Press Feedback Overrides
Add this stylesheet block to `file:///home/michael/fable/fable-ui/src/styles.scss` to remove highlight overlay gray and add tap scale feedback:

```scss
// Global Tactile Press Feedback for Touch UX
button, a, .p-button, .p-link, [role="button"], .chapter-sort-item {
  -webkit-tap-highlight-color: transparent !important;
  
  &:active {
    transform: scale(0.97);
    filter: brightness(0.9) saturate(1.1);
    transition: transform 0.05s ease;
  }
}
```

---

## 🛠️ Step 3: Fix Existing Audit Violations

### 3.1 Fix Rule 4.3 Violations (Vertical Flex Stacking)

Open the following files and modify their media query styling so that actions layout horizontally using wrapping instead of vertical column stacks:

1. **`library-stats.component.scss` (Line 925)**:
   Change `.config-modal-actions` column direction to `row` with `flex-wrap: wrap`.
2. **`reading-session-heatmap.component.scss` (Line 177)**:
   Change `.chart-footer` to lay out as `row` with `flex-wrap: wrap`.
3. **`user-stats.component.scss` (Line 398)**:
   Change `.p_dialog_footer` to use flex row wrapping instead of force stacking column buttons.
4. **`user-management.component.scss` (Line 727)**:
   Change `.dialog-actions` to row layout.
5. **`file-mover-component.scss` (Line 506)**:
   Remove the custom `.dialog-footer { flex-direction: column; ... }` overrides completely. Because the file already includes `@include panel.dialog-footer`, removing this manual override allows the mixin to automatically structure the buttons correctly.

### 3.2 Handle Rule 5.4 False Positives

> [!NOTE]
> The audit report flags four violations for Rule 5.4. These are **false positives** because the audit's regex matches `margin-top` as `top`, or matches close button positioning within dialog headers rather than page toolbar placement.
> **DO NOT modify these files for Rule 5.4**, as doing so will break header layout alignments:
> - `completion-timeline-chart.component.scss:104` (uses `margin-top: 0.5rem`)
> - `cover-search.component.scss:313` (uses `margin-top: 0.5rem`)
> - `ai-scan-directory-dialog.component.scss:331` (positions close button absolutely)
> - `_panel-shared.scss:79` (positions standard panel close button absolutely)

### 3.3 Standardize CDK Drag Handles
To prevent scroll default actions during item sorting, add `touch-action: none` to drag handles:
In `file:///home/michael/fable/fable-ui/src/app/features/story-arc/components/story-arc-page/story-arc-page.component.scss` add:
```scss
.sort-drag-handle, .row-drag-handle {
  touch-action: none !important;
}
```

---

## 🛠️ Step 4: Verification & Quality Check

Verify that all changes build and pass checks cleanly before finishing.

Run these commands inside `/home/michael/fable`:
1. Check styling rules:
   ```bash
   ./scripts/audit-mobile-styling.sh
   ```
   *Expected: All rules pass, zero failures.*
2. Check linting:
   ```bash
   npm run lint
   ```
   *Expected: 0 lint errors.*
3. Run tests:
   ```bash
   npx vitest run
   ```
   *Expected: 100% test suites pass.*

