#!/usr/bin/env python3
"""Generate all PNG icons from the source SVG using cairosvg."""

import os
import cairosvg

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SVG_PATH = os.path.join(PROJECT_DIR, "fable-ui", "src", "assets", "favicon.svg")

# Output directories
PUBLIC_ICONS_DIR = os.path.join(PROJECT_DIR, "fable-ui", "public", "icons")
PUBLIC_FAVICONS_DIR = os.path.join(PROJECT_DIR, "fable-ui", "public")
ASSETS_FAVICONS_DIR = os.path.join(PROJECT_DIR, "assets", "favicons")

# Ensure output directories exist
os.makedirs(PUBLIC_ICONS_DIR, exist_ok=True)
os.makedirs(PUBLIC_FAVICONS_DIR, exist_ok=True)
os.makedirs(ASSETS_FAVICONS_DIR, exist_ok=True)

# Read SVG
with open(SVG_PATH, "rb") as f:
    svg_data = f.read()

# Icon sizes for manifest (public/icons/)
icon_sizes = [72, 96, 128, 144, 152, 192, 384, 512]
for size in icon_sizes:
    output_path = os.path.join(PUBLIC_ICONS_DIR, f"icon-{size}x{size}.png")
    cairosvg.svg2png(bytestring=svg_data, write_to=output_path, output_width=size, output_height=size)
    print(f"Generated {output_path}")

# Favicon sizes (public/)
favicon_sizes = [16, 32, 96, 128, 196]
for size in favicon_sizes:
    output_path = os.path.join(PUBLIC_FAVICONS_DIR, f"favicon-{size}x{size}.png")
    cairosvg.svg2png(bytestring=svg_data, write_to=output_path, output_width=size, output_height=size)
    print(f"Generated {output_path}")

# Asset favicon sizes (assets/favicons/)
asset_sizes = [
    ("android-chrome", 192),
    ("android-chrome", 512),
    ("apple-touch-icon", 57),
    ("apple-touch-icon", 60),
    ("apple-touch-icon", 72),
    ("apple-touch-icon", 76),
    ("apple-touch-icon", 114),
    ("apple-touch-icon", 120),
    ("apple-touch-icon", 144),
    ("apple-touch-icon", 152),
    ("apple-touch-icon", 167),
    ("apple-touch-icon", 180),
    ("favicon", 16),
    ("favicon", 32),
    ("favicon", 96),
    ("favicon", 128),
    ("favicon", 196),
    ("mstile", 70),
    ("mstile", 144),
    ("mstile", 150),
    ("mstile", 310),
]
for name, size in asset_sizes:
    if name == "mstile" and size == 310:
        # mstile-310x150.png
        output_path = os.path.join(ASSETS_FAVICONS_DIR, f"{name}-{size}x150.png")
        cairosvg.svg2png(bytestring=svg_data, write_to=output_path, output_width=size, output_height=150)
    else:
        output_path = os.path.join(ASSETS_FAVICONS_DIR, f"{name}-{size}x{size}.png")
        cairosvg.svg2png(bytestring=svg_data, write_to=output_path, output_width=size, output_height=size)
    print(f"Generated {output_path}")

# mstile-310x310.png
output_path = os.path.join(ASSETS_FAVICONS_DIR, "mstile-310x310.png")
cairosvg.svg2png(bytestring=svg_data, write_to=output_path, output_width=310, output_height=310)
print(f"Generated {output_path}")

print("\nAll icons generated successfully!")
