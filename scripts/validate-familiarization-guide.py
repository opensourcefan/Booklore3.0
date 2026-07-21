#!/usr/bin/env python3
"""Synchronize and validate Fable's modular and single-page user guides."""

from __future__ import annotations

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "fable-ui" / "public" / "docs"
MODULAR = DOCS / "guide"
SINGLE = DOCS / "Fable-Familiarization-Guide.html"
INDEX = MODULAR / "index.html"
README = ROOT / "README.md"
BACKEND_BUILD = ROOT / "fable-api" / "build.gradle"
FRONTEND_PACKAGE = ROOT / "fable-ui" / "package.json"
SECTION_START = "<!-- ==================== SECTION {number} ==================== -->"
GUIDE_HOME_START = "<!-- ==================== GUIDE HOME START ==================== -->"
GUIDE_HOME_END = "<!-- ==================== GUIDE HOME END ==================== -->"
SINGLE_TOC_START = "<!-- ==================== TABLE OF CONTENTS ==================== -->"
SINGLE_TOC_END = "<!-- ==================== TABLE OF CONTENTS END ==================== -->"
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

    converted = re.sub(
        r'href="sec(?P<section>\d+)\.html(?:#(?P<anchor>[^"]+))?"',
        replace,
        block,
    )
    return converted.replace('href="index.html"', 'href="#guide-home"')


def marked_block(document: str, start_marker: str, end_marker: str) -> str:
    start = document.find(start_marker)
    end = document.find(end_marker, start)
    if start < 0 or end < 0:
        raise ValueError(f"missing marked block {start_marker} / {end_marker}")
    return document[start : end + len(end_marker)]


def single_page_toc() -> str:
    navigation = links_for_single_page(navigation_block(read(INDEX)))
    navigation = navigation.replace(
        '<nav id="sidebar-toc">',
        f'{SINGLE_TOC_START}\n<div class="toc">',
        1,
    )
    navigation = navigation.replace("<h2>Contents</h2>", "<h2>Workflow Chapters</h2>", 1)
    navigation = navigation.replace("</nav>", f"</div>\n{SINGLE_TOC_END}", 1)
    return navigation


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
    canonical_navigation = links_for_single_page(navigation_block(read(INDEX)))
    single = single.replace(navigation_block(single), canonical_navigation, 1)

    canonical_home = links_for_single_page(
        marked_block(read(INDEX), GUIDE_HOME_START, GUIDE_HOME_END)
    )
    current_home = marked_block(single, GUIDE_HOME_START, GUIDE_HOME_END)
    single = single.replace(current_home, canonical_home, 1)

    current_toc = marked_block(single, SINGLE_TOC_START, SINGLE_TOC_END)
    single = single.replace(current_toc, single_page_toc(), 1)

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
    expected_home = links_for_single_page(
        marked_block(read(INDEX), GUIDE_HOME_START, GUIDE_HOME_END)
    )
    actual_home = marked_block(single, GUIDE_HOME_START, GUIDE_HOME_END)
    if expected_home != actual_home:
        errors.append(
            "guide home: modular index and single-page front matter differ "
            f"(run {Path(__file__).name} --sync)"
        )

    expected_single_navigation = links_for_single_page(navigation_block(read(INDEX)))
    if navigation_block(single) != expected_single_navigation:
        errors.append(
            "single-page sidebar navigation differs from modular index "
            f"(run {Path(__file__).name} --sync)"
        )

    actual_toc = marked_block(single, SINGLE_TOC_START, SINGLE_TOC_END)
    if actual_toc != single_page_toc():
        errors.append(
            "single-page workflow table of contents differs from modular index "
            f"(run {Path(__file__).name} --sync)"
        )

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

    backend_match = re.search(r"^version\s*=\s*['\"]([^'\"]+)['\"]", read(BACKEND_BUILD), re.MULTILINE)
    frontend_version = json.loads(read(FRONTEND_PACKAGE)).get("version")
    if not backend_match or not frontend_version:
        errors.append("could not read backend and frontend app versions")
    elif backend_match.group(1) != frontend_version:
        errors.append(
            f"app versions differ: backend={backend_match.group(1)} frontend={frontend_version}"
        )
    elif f"App <code>v{frontend_version}</code>" not in read(MODULAR / "sec30.html"):
        errors.append(
            f"maintenance log has no entry for current app version v{frontend_version}"
        )


def validate_navigation(errors: list[str]) -> None:
    canonical = navigation_block(read(INDEX))
    ordered_sections = [
        int(value)
        for value in re.findall(r'href="sec(\d+)\.html(?:#[^"]+)?"', canonical)
    ]
    first_occurrences = list(dict.fromkeys(ordered_sections))
    if first_occurrences != list(range(1, 31)):
        errors.append(
            "canonical sidebar must link Sections 1-30 in numeric order; "
            f"found {first_occurrences}"
        )

    for number in range(1, 31):
        document = read(MODULAR / f"sec{number}.html")
        if number > 1 and f'href="sec{number - 1}.html" class="nav-link nav-prev"' not in document:
            errors.append(f"sec{number}.html: previous link does not target sec{number - 1}.html")
        if number < 30 and f'href="sec{number + 1}.html" class="nav-link nav-next"' not in document:
            errors.append(f"sec{number}.html: next link does not target sec{number + 1}.html")


def validate_readme_links(errors: list[str]) -> None:
    for target_text in re.findall(r"\[[^\]]+\]\(([^)]+)\)", read(README)):
        target_text = target_text.strip().split(maxsplit=1)[0]
        url = urlsplit(target_text)
        if url.scheme or url.netloc or not url.path:
            continue
        target = (README.parent / unquote(url.path)).resolve()
        if not target.exists():
            errors.append(f"README.md: missing linked file {target_text}")


def validate_content(errors: list[str]) -> None:
    paths = [SINGLE, INDEX, *(MODULAR / f"sec{number}.html" for number in range(1, 31))]
    for path in paths:
        content = read(path)
        for match in RAW_MARKDOWN.finditer(content):
            line = content.count("\n", 0, match.start()) + 1
            errors.append(f"{path.name}:{line}: raw Markdown emphasis {match.group(0)}")
        if "Fable 3.0" in content:
            errors.append(f"{path.name}: stale Fable 3.0 guide branding")
        if 'class="guide-badge guide-badge-ogg"' in content:
            errors.append(f"{path.name}: OGG is not a supported audiobook extension")

    required = {
        MODULAR / "sec6.html": ['id="staging-lifecycle"'],
        MODULAR / "sec17.html": ['id="embedding"'],
        INDEX: [
            GUIDE_HOME_START,
            GUIDE_HOME_END,
            "What Do You Want to Do?",
            "Guide Home &amp; Workflow Paths",
            "sec6.html#staging-lifecycle",
        ],
        SINGLE: [
            GUIDE_HOME_START,
            GUIDE_HOME_END,
            SINGLE_TOC_START,
            SINGLE_TOC_END,
            "What Do You Want to Do?",
            'href="#guide-home"',
            'href="#staging-lifecycle"',
        ],
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
        help="synchronize modular navigation plus single-page home, navigation, and section bodies",
    )
    args = argument_parser.parse_args()

    if args.sync:
        sync_modular_navigation()
        sync_single_page()

    errors: list[str] = []
    validate_links(errors)
    validate_parity(errors)
    validate_versions(errors)
    validate_navigation(errors)
    validate_readme_links(errors)
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
