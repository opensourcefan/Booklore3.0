---
paths: ["fable-ui/src/**/*.scss", "fable-ui/src/**/*.html", "fable-ui/src/**/*.ts"]
---

# Mobile (Phone) Styling Standard

**Core Principle:** Every dialog, panel, and form MUST be fully operable on a 375×667 viewport (iPhone SE) without requiring fullscreen mode, zooming, or horizontal scrolling. Mobile changes MUST NEVER alter desktop behavior.

---

## 1. Breakpoint & Scope Rules

### 1.1 Single Source of Truth
- All phone-specific styles MUST live inside `@media (max-width: 768px)`.
- Narrower breakpoints (`640px`, `520px`) are permitted ONLY for additional refinements within the already-mobile context — never as the sole mobile breakpoint.
- The 768px breakpoint intentionally covers phones in both portrait and landscape, plus small tablets (iPad Mini portrait).

### 1.2 Desktop Isolation
- NEVER modify a style rule outside a `@media` query for mobile purposes.
- NEVER change a desktop selector's base properties. Add overrides inside the media query only.
- If a base property (e.g., `min-height: 750px`) breaks mobile, override it inside the media query with `min-height: 0` — do NOT change the base value.

### 1.3 Breakpoint Consistency
- When a component has multiple breakpoints, verify no "gap ranges" exist where mobile styles partially apply.
- Example BUG: safe-area padding at `≤640px` but dialog goes fullscreen at `≤768px` → landscape phones (641-768px) get no notch padding.
- Rule: The WIDEST mobile breakpoint must include safe-area-inset, full-width, and full-height rules.

---

## 2. Dialog & Panel Container Rules

### 2.1 No Hardcoded Minimum Heights
- **FORBIDDEN:** `min-height: 750px`, `min-height: 600px`, or any fixed-pixel `min-height` on a dialog/panel root.
- **REQUIRED:** `min-height: 0` inside the mobile media query. Let the flex layout derive height from the viewport.

### 2.2 No Hardcoded Widths
- **FORBIDDEN:** `width: 700px` or any fixed-pixel width on a dialog/panel root.
- **REQUIRED:** `width: 100%; max-width: 100%` inside the mobile media query.

### 2.3 Full-Height Dialogs
- Any dialog that contains a scrollable list or form MUST fill the viewport on mobile:
  ```scss
  @media (max-width: 768px) {
    height: 100%;
    max-height: 100%;
    min-height: 0;
    border-radius: 0;
  }
  ```

### 2.4 Flex Scrolling Chain
- Every ancestor of a scrollable area MUST form an unbroken flex column chain:
  - Parent: `display: flex; flex-direction: column; overflow: hidden;`
  - Scrollable child: `flex: 1; min-height: 0; overflow-y: auto;`
- **CRITICAL:** `min-height: 0` is required on EVERY flex child in the chain. Without it, the flex item defaults to `min-height: auto` and will NOT shrink below its content size — breaking scroll entirely.
- Fixed elements (header, nav tabs, footer) MUST be siblings of the scrollable body, NOT children of it.

---

## 3. Content Density Rules

### 3.1 Informational Banners
- Multi-line info boxes, help text, and "did you know" banners inside dialog bodies MUST be hidden on mobile:
  ```scss
  @media (max-width: 768px) {
    display: none;
  }
  ```
- If the information is critical, collapse it to a single tappable `(?)` icon with a tooltip or popover. Do NOT keep the full banner.

### 3.2 Row Action Buttons
- Text labels on per-row action buttons (Edit, Delete, Re-scan, Remove, etc.) MUST be hidden on mobile. The button becomes icon-only:
  ```scss
  @media (max-width: 768px) {
    width: 32px;
    height: 32px;
    padding: 0;
    justify-content: center;
    gap: 0;
    span { display: none; }
    i { font-size: 0.875rem; }
  }
  ```
- The button MUST retain its `title` and `aria-label` attributes for accessibility.
- Touch target MUST be ≥32×32px. Prefer 36-40px when space allows.

### 3.3 Status Chips & Badges
- Text inside status chips/badges (e.g., "Imported", "Active", "Pending") MUST be hidden on mobile. Keep only the icon:
  ```scss
  @media (max-width: 768px) {
    .chip-text { display: none; }
  }
  ```
- If the icon alone is ambiguous, reduce to a single keyword (e.g., "Imported" → check icon only).

### 3.4 Validation & Status Messages in Footers
- Validation messages ("No changes yet", "Ready to save", "3 errors") in sticky footers MUST be hidden on mobile:
  ```scss
  @media (max-width: 768px) {
    .validation-status { display: none; }
  }
  ```
- The button disabled/enabled state already communicates validity. If additional feedback is needed, use a Toast notification.

---

## 4. Footer & Safe Area Rules

### 4.1 Full-Width Footer Buttons
- Footer action buttons MUST stretch full width on mobile:
  ```scss
  @media (max-width: 768px) {
    .footer-actions {
      width: 100%;
      .p-button { flex: 1; min-width: 0; }
    }
  }
  ```

### 4.2 Safe Area Insets
- The footer MUST include `safe-area-inset-bottom` padding at the WIDEST mobile breakpoint (768px):
  ```scss
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  ```
- **FORBIDDEN:** Applying safe-area only at narrow breakpoints (e.g., 640px) while the dialog goes fullscreen at a wider breakpoint (768px). This creates a gap where notched phones in landscape get no padding.

### 4.3 Footer Column Direction
- Do NOT use `flex-direction: column` on the footer when the validation status is hidden. A single row of stretched buttons is sufficient and saves vertical space.

---

## 5. Form & Input Rules

### 5.1 Multi-Column Forms
- Two-column form layouts MUST stack to single-column on mobile:
  ```scss
  @media (max-width: 520px) {
    flex-direction: column;
  }
  ```

### 5.2 Select Dropdowns
- `<p-select>` and similar overlay components MUST use `appendTo="body"` to avoid being clipped by the dialog's `overflow: hidden`.

### 5.3 Touch Target Minimums
- All interactive elements (buttons, toggles, checkboxes, select triggers) MUST have a touch target of at least 32×32px. Prefer 40-44px for primary actions.

---

## 6. CSS Validity Rules

### 6.1 No Invalid Property Values
- **FORBIDDEN:** `justify-content: stretch` — this is NOT a valid CSS value. Use `flex: 1` on children instead.
- **FORBIDDEN:** Any CSS property/value combination that is silently ignored by browsers.

### 6.2 No Unnecessary `!important`
- `!important` is permitted ONLY when overriding a PrimeNG component's inline style that cannot be targeted otherwise.

### 6.3 `::ng-deep` Usage
- `::ng-deep` is permitted ONLY for piercing PrimeNG component encapsulation. Do NOT use it to override styles in your own components.

---

## 7. Pre-Implementation Checklist

Before writing any mobile CSS, the agent MUST:

1. **Read the component's HTML template** — identify all elements that may need mobile treatment (info banners, row buttons, chips, validation messages, footer structure).
2. **Read the component's SCSS** — identify existing breakpoints, hardcoded dimensions, and the flex/overflow chain.
3. **Read the dialog launcher service entry** — identify which dialog size class is used and at what breakpoint it goes fullscreen.
4. **Read the dialog size class CSS in `global.scss`** — verify the wrapper's `overflow`, `display`, and `height` properties.
5. **Trace the full flex chain** from dialog wrapper to innermost scrollable element. Verify `min-height: 0` at every level.

---

## 8. Post-Implementation Verification

After writing mobile CSS, the agent MUST:

1. **Run `npx vitest run`** — all tests must pass.
2. **Run `npx ng build --configuration production`** — no compilation errors.
3. **Mentally verify these viewports:**
   - 375×667 (iPhone SE) — footer reachable, content scrolls
   - 390×844 (iPhone 14) — notch safe area works
   - 812×375 (landscape phone) — dialog fills viewport
   - 769×1024 (desktop) — zero visual changes from base styles
4. **List specific edge cases** the user should manually test, including: many items, zero items, submitting state, error state.

---

## 9. Common Anti-Patterns — Quick Reference

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| `min-height: 750px` on dialog root | Forces dialog taller than phone viewport | `min-height: 0` in mobile MQ |
| Safe-area only at narrowest breakpoint | Landscape phones miss padding | Safe-area at widest mobile MQ (768px) |
| Text labels on row action buttons | Wastes horizontal space, causes overflow | Icon-only on mobile, keep `aria-label` |
| Multi-line info banners in body | Consumes prime vertical real estate | `display: none` or collapse to tooltip |
| Validation messages in sticky footer | Pushes buttons down/off-screen | Hide on mobile; disabled state is enough |
| `justify-content: stretch` | Invalid CSS, silently ignored | `flex: 1` on children |
| `flex-direction: column` on footer with hidden validation | Unnecessary vertical stacking | Single row of stretched buttons |
| Inconsistent breakpoint coverage | Creates "gap" ranges with partial styles | Use 768px for all base mobile rules |
