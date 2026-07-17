---
paths: ["**/*"]
---

# Tablet Profile: Lenovo Duet 3 (Wormdingler)

Keep in sync with `.cursor/rules/tablet-duet3-wormdingler.mdc`.

## Confirmed environment

- **Board:** wormdingler (Lenovo Duet 3), SC7180, arm64
- **Image:** `chromebook_trogdor aarch64 trixie 6c0dc6d837cf8e2dc5d5b5bdea625564e34ced40` (Velvet `/etc/imagebuilder-info`)
- **OS:** Debian 13; kernel `6.12.42-stb-cbq+`; GNOME Shell 48.7 **Wayland**; Mutter 48.7; Mesa 25.0.7
- **Browser:** Chromium 150.0.7871.114, **Ozone Wayland**; Fable at `http://192.168.1.50:6060`
- **User:** `linux`

## Measured Chromium viewport (landscape sample)

- `screen` 2000×1200, `inner` **1156×840**, `dpr` **1.25**, `touch` 10
- `fullscreenElement` false at sample time
- **`(pointer: coarse) = false`, `(hover: none) = false`** → desktop pointer/hover semantics on a touch tablet (cursor-under-finger / click synthesis)

## Intended Fable layout mode

**`auto-shape`** (Viewport Shape Aware):

- **Landscape** → desktop chrome (`layout-desktop`)
- **Portrait** → tablet chrome (`layout-tablet`)
- Width ≤ phone breakpoint → phone (should not be normal on this Duet)

Landscape sample `innerWidth` 1156 correctly maps to desktop under `auto-shape`. Do not force permanent `tablet` or `desktop` mode when fixing Duet bugs — preserve orientation-aware behavior.

Touch still needs ghost-click / live-fullscreen handling because pointer media queries look “desktop” even in tablet portrait.

## Rotation risk

Owner uses **xrandr/xinput rotation on Wayland** + cros-ec accel udev matrix. Post-rotate touch misfires: suspect OS script before Fable.

## Owner prefs (confirmed)

- Layout: **`auto-shape`** / layout aware
- Tablet nav gestures: **on**
- Cursor under finger: **sometimes** (improved on Wayland vs X11; still treat as desktop-touch capable)
- Top strange issues: TBD after next push

## Hard constraints

- Never break Phone Mode.
- Do not fix Duet bugs by changing phone ≤768 styling unless phone-only.
- Prefer live Fullscreen API sync + overlay ghost-click guards over device-specific forks.
- Keep **`auto-shape`** as the Duet’s intended mode (desktop landscape / tablet portrait).
