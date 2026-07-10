# Fable Project Rules

## Mobile & Responsive UI Development

### 1. Overlay & Popover Usability
* **Explicit Dismissal:** Any mobile popover, menu, or sheet must include an explicit close/dismiss button (e.g., an 'X' button in a header). Do not rely solely on tapping outside the overlay to close it.
* **Auto-Closing:** Popovers or panels used for navigation or filtering (such as directory explorers or menus) must automatically close once a selection is made or a route/filter changes.
* **Trigger Visibility:** Avoid fixed positioning that covers the trigger button unless a robust close interface is provided.

### 2. Layout Containment & Clipping Checks
* **Traces of Ancestor Clipping:** When adding or increasing dimensions (like `min-width`, `margin`, or `padding`) for text headers on mobile screens, always trace parent containers. Ensure no ancestor has `overflow: hidden` which would clip and hide adjacent actions/buttons.
* **Toolbar Placement:** Place action buttons directly under the scrollable flex container (e.g., `.book-browser-toolbar`) rather than nesting them inside text wrappers (`.entity-info-wrapper`), ensuring they participate in horizontal scrolling if the viewport shrinks.

### 3. Third-Party Component API Safety
* **Avoid Unverified Bindings:** Do not bind properties/inputs to third-party framework components (e.g., PrimeNG `<p-popover>`) without verifying that the property exists in the dependency version listed in `package.json`.
* **Prefer CSS Overrides:** If a visual detail (like hiding popover arrows) can be styled, prefer CSS/SCSS overrides (`display: none` on pointers) over custom template inputs to avoid breaking builds in strict CI/CD environments.
