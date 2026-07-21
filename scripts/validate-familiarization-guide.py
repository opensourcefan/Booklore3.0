#!/usr/bin/env python3
"""Synchronize and validate Fable's modular and single-page user guides."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "fable-ui" / "public" / "docs"
MODULAR = DOCS / "guide"
SINGLE = DOCS / "Fable-Familiarization-Guide.html"
INDEX = MODULAR / "index.html"
SECTION_START = "<!-- ==================== SECTION {number} ==================== -->"
RAW_MARKDOWN = re.compile(r"(?<!\*)\*\*[^*\n]+\*\*(?!\*)")
VERSION = re.compile(r"Version\s+([0-9.]+)\s+&mdash;\s+([^<]+)<br>")


class GuideParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        element_id = values.get("id")
        if element_id:
            self.ids.add(element_id)
        if tag == "a" and values.get("href"):
            self.links.append(values["href"] or "")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def section_block(document: str, number: int, *, modular: bool) -> str:
    start_marker = SECTION_START.format(number=number)
    start = document.find(start_marker)
    if start < 0:
        raise ValueError(f"missing section marker {number}")

    if modular:
        end = document.find('<nav class="section-nav">', start)
    else:
        next_marker = SECTION_START.format(number=number + 1)
        end = document.find(next_marker, start) if number < 30 else len(document)
        if number == 30:
            script = document.find("<script>", start)
            if script >= 0:
                end = script

    if end < 0:
        raise ValueError(f"missing section boundary {number}")
    return document[start:end].rstrip()


def links_for_single_page(block: str) -> str:
    def replace(match: re.Match[str]) -> str:
        section = match.group("section")
        anchor = match.group("anchor")
        return f'href="#{anchor or f"sec{section}"}"'

    return re.sub(
        r'href="sec(?P<section>\d+)\.html(?:#(?P<anchor>[^"]+))?"',
        replace,
        block,
    )


def navigation_block(document: str) -> str:
    start = document.find('<nav id="sidebar-toc">')
    end = document.find("</nav>", start)
    if start < 0 or end < 0:
        raise ValueError("missing sidebar navigation")
    return document[start : end + len("</nav>")]


def sync_modular_navigation() -> None:
    canonical = navigation_block(read(INDEX))
    for number in range(1, 31):
        path = MODULAR / f"sec{number}.html"
        document = read(path)
        active = canonical.replace(
            f'href="sec{number}.html"',
            f'href="sec{number}.html" class="active"',
            1,
        )
        document = document.replace(navigation_block(document), active, 1)
        path.write_text(document, encoding="utf-8")


def sync_single_page() -> None:
    single = read(SINGLE)
    for number in range(1, 31):
        modular_block = links_for_single_page(
            section_block(read(MODULAR / f"sec{number}.html"), number, modular=True)
        )
        old_block = section_block(single, number, modular=False)
        single = single.replace(old_block, modular_block, 1)
    SINGLE.write_text(single, encoding="utf-8")


def parse(path: Path) -> GuideParser:
    parser = GuideParser()
    parser.feed(read(path))
    return parser


def validate_links(errors: list[str]) -> None:
    parsed = {path.resolve(): parse(path) for path in MODULAR.glob("*.html")}
    for path, parser in parsed.items():
        for href in parser.links:
            url = urlsplit(href)
            if url.scheme or url.netloc or href.startswith(("mailto:", "javascript:")):
                continue
            target = path if not url.path else (path.parent / url.path).resolve()
            if not target.exists():
                errors.append(f"{path.name}: missing linked file {href}")
                continue
            if url.fragment:
                target_parser = parsed.get(target) or parse(target)
                if url.fragment not in target_parser.ids:
                    errors.append(f"{path.name}: missing anchor {href}")

    single_parser = parse(SINGLE)
    for href in single_parser.links:
        url = urlsplit(href)
        if not url.path and url.fragment and url.fragment not in single_parser.ids:
            errors.append(f"{SINGLE.name}: missing anchor {href}")
        elif url.path and not url.scheme and not url.netloc:
            errors.append(f"{SINGLE.name}: unexpected relative page link {href}")


def validate_parity(errors: list[str]) -> None:
    single = read(SINGLE)
    for number in range(1, 31):
        expected = links_for_single_page(
            section_block(read(MODULAR / f"sec{number}.html"), number, modular=True)
        )
        actual = section_block(single, number, modular=False)
        if expected != actual:
            errors.append(
                f"section {number}: modular and single-page content differ "
                f"(run {Path(__file__).name} --sync)"
            )

    canonical_navigation = navigation_block(read(INDEX))
    for number in range(1, 31):
        actual_navigation = navigation_block(read(MODULAR / f"sec{number}.html"))
        normalized = re.sub(r'\s+class="active"', "", actual_navigation)
        if normalized != canonical_navigation:
            errors.append(
                f"sec{number}.html: sidebar navigation differs from index "
                f"(run {Path(__file__).name} --sync)"
            )


def validate_versions(errors: list[str]) -> None:
    index_match = VERSION.search(read(INDEX))
    single_match = VERSION.search(read(SINGLE))
    if not index_match or not single_match:
        errors.append("could not read cover version from both guide formats")
    elif index_match.groups() != single_match.groups():
        errors.append(
            "cover versions differ: "
            f"modular={index_match.groups()} single={single_match.groups()}"
        )

    if index_match:
        version = index_match.group(1)
        maintenance = read(MODULAR / "sec30.html")
        if f"<td>{version}</td>" not in maintenance:
            errors.append(f"maintenance log has no entry for cover version {version}")


def validate_content(errors: list[str]) -> None:
    paths = [SINGLE, INDEX, *(MODULAR / f"sec{number}.html" for number in range(1, 31))]
    for path in paths:
        for match in RAW_MARKDOWN.finditer(read(path)):
            line = read(path).count("\n", 0, match.start()) + 1
            errors.append(f"{path.name}:{line}: raw Markdown emphasis {match.group(0)}")

    required = {
        MODULAR / "sec6.html": ['id="staging-lifecycle"'],
        MODULAR / "sec17.html": ['id="embedding"'],
        INDEX: ["What Do You Want to Do?", "sec6.html#staging-lifecycle"],
        SINGLE: ["What Do You Want to Do?", 'href="#staging-lifecycle"'],
    }
    for path, markers in required.items():
        content = read(path)
        for marker in markers:
            if marker not in content:
                errors.append(f"{path.name}: missing required task marker {marker}")


def main() -> int:
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument(
        "--sync",
        action="store_true",
        help="replace single-page section bodies with canonical modular content",
    )
    args = argument_parser.parse_args()

    if args.sync:
        sync_modular_navigation()
        sync_single_page()

    errors: list[str] = []
    validate_links(errors)
    validate_parity(errors)
    validate_versions(errors)
    validate_content(errors)

    if errors:
        print("Familiarization Guide validation failed:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print("Familiarization Guide validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
