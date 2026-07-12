#!/usr/bin/env python3
"""
Overlay Scroll-Fight Audit (desktop / general)
==============================================
Scans fable-ui Angular HTML templates for PrimeNG overlay controls that are
missing appendTo="body" (or any appendTo binding). Nested overlays inside
scrolling dialogs/pages can fight the parent scroll container — the Story Arc
Assigner chapter select (v4.15.15) was one instance.

This script is the DESKTOP/GENERAL auditor. Mobile-specific enforcement of the
same pattern lives in scripts/audit-mobile-styling.sh as Rule 5.2 (which calls
this tool with --mode mobile). Do not merge mobile layout remediation into
desktop-only CSS when fixing hits from either tool.

Read-only — never modifies application source.

USAGE
-----
  ./scripts/audit-overlay-scroll.sh                  # desktop/general (default)
  ./scripts/audit-overlay-scroll.sh --mode mobile    # dialog-ish high priority only
  ./scripts/audit-overlay-scroll.sh --json
  ./scripts/audit-overlay-scroll.sh --strict         # exit 1 if high-priority hits

OUTPUT
------
  Terminal: colored summary + findings
  Report:   scripts/reports/overlay-scroll-audit-YYYY-MM-DD_HHMM.md
            (skipped with --no-report; mobile audit uses this)

SIDE EFFECTS OF FIXING WITH appendTo="body"
-------------------------------------------
  Usually safe — and already required by .roo/rules/mobile-phone-styling.md §5.2.
  Watch for:
  - Component-scoped ::ng-deep / nested selectors targeting .p-select-overlay
    (or similar) inside the dialog will no longer match; use panelStyleClass
    or global styles instead.
  - Overlay width/position is calculated against the trigger still; rare
    mismatches if custom CSS assumed in-flow overlay placement.
  - Nested dialogs: rely on PrimeNG autoZIndex (default); if a panel hides
    behind a mask, set an explicit baseZIndex / panelStyleClass.
  - appendTo itself does NOT change desktop vs mobile layout — it only portals
    the overlay. Keep mobile density/safe-area fixes inside ≤768px MQs.

WHAT COUNTS AS A HIT
--------------------
  Opening tags for: p-select, p-multiSelect / p-multiselect, p-autoComplete /
  p-autocomplete, p-cascadeselect, p-datepicker, p-calendar, p-treeselect,
  p-dropdown — when the opening tag has no appendTo= attribute/binding.

MODES
-----
  desktop (default): all missing appendTo; split high vs other.
  mobile: only high-priority dialog-ish hits (DynamicDialog hosts, dialog paths,
    p-dialog markup). Used by audit-mobile-styling.sh Rule 5.2.

HIGH PRIORITY
-------------
  Hits in dialog/modal-ish paths (dialog, assigner, uploader, picker, creator,
  editor, drawer, popover, modal), templates that contain p-dialog /
  DynamicDialog / dialog- style markers, OR whose companion .ts injects
  DynamicDialogConfig / DynamicDialogRef.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = REPO_ROOT / "fable-ui" / "src"
REPORT_DIR = REPO_ROOT / "scripts" / "reports"

OVERLAY_TAGS = (
    "p-select",
    "p-multiselect",
    "p-multiSelect",
    "p-autocomplete",
    "p-autoComplete",
    "p-cascadeselect",
    "p-datepicker",
    "p-calendar",
    "p-treeselect",
    "p-dropdown",
)

# Case-insensitive match for the opening tag name
TAG_NAME_RE = re.compile(
    r"<(" + "|".join(re.escape(t) for t in OVERLAY_TAGS) + r")\b",
    re.IGNORECASE,
)

APPEND_TO_RE = re.compile(r"\bappendTo\s*=", re.IGNORECASE)

DIALOG_PATH_RE = re.compile(
    r"(dialog|modal|assigner|creator|uploader|picker|editor|drawer|popover|overlay|sidebar)",
    re.IGNORECASE,
)

DIALOG_MARKUP_RE = re.compile(
    r"(p-dialog|DynamicDialog|dialog-sm|dialog-md|dialog-lg|dialog-xl|dialog-full|dialog-minimal|openDialog\()",
    re.IGNORECASE,
)

# ANSI
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
CYAN = "\033[36m"
RESET = "\033[0m"


def extract_opening_tag(text: str, start: int) -> tuple[str, int]:
    """Return (opening_tag, end_index_exclusive) starting at '<' of a tag."""
    i = start
    quote: str | None = None
    while i < len(text):
        c = text[i]
        if quote:
            if c == quote:
                quote = None
        else:
            if c in ("'", '"'):
                quote = c
            elif c == ">":
                return text[start : i + 1], i + 1
        i += 1
    return text[start:], len(text)


def line_number_at(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def companion_ts_is_dynamic_dialog(html_path: Path) -> bool:
    """True when the paired .ts injects DynamicDialogConfig/Ref (dialog host)."""
    candidates = [
        html_path.with_suffix(".ts"),
        html_path.with_name(html_path.name.replace(".component.html", ".component.ts")),
        html_path.with_name(html_path.name.replace("-component.html", "-component.ts")),
        html_path.with_name(html_path.name.replace(".html", ".ts")),
    ]
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen or not candidate.is_file():
            continue
        seen.add(candidate)
        try:
            ts = candidate.read_text(encoding="utf-8")
        except OSError:
            continue
        if "DynamicDialogConfig" in ts or "DynamicDialogRef" in ts:
            return True
    return False


def is_dialogish(path: Path, text: str, tag_start: int) -> bool:
    if DIALOG_PATH_RE.search(str(path)):
        return True
    if companion_ts_is_dynamic_dialog(path):
        return True
    if DIALOG_MARKUP_RE.search(text):
        return True
    window = text[max(0, tag_start - 400) : tag_start + 80]
    return bool(DIALOG_PATH_RE.search(window))


def scan_file(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    findings: list[dict] = []
    for match in TAG_NAME_RE.finditer(text):
        tag_name = match.group(1)
        opening, _ = extract_opening_tag(text, match.start())
        if APPEND_TO_RE.search(opening):
            continue
        if opening.startswith("</"):
            continue
        line = line_number_at(text, match.start())
        relative = path.relative_to(REPO_ROOT).as_posix()
        findings.append(
            {
                "file": relative,
                "line": line,
                "tag": tag_name,
                "priority": "high" if is_dialogish(path, text, match.start()) else "other",
                "snippet": " ".join(opening.split())[:140],
            }
        )
    return findings


def collect_findings(src_root: Path) -> list[dict]:
    findings: list[dict] = []
    for path in sorted(src_root.rglob("*.html")):
        findings.extend(scan_file(path))
    return findings


def summarize(findings: list[dict]) -> dict:
    by_priority: dict[str, int] = defaultdict(int)
    by_file: dict[str, list] = defaultdict(list)
    by_tag: dict[str, int] = defaultdict(int)
    for hit in findings:
        by_priority[hit["priority"]] += 1
        by_file[hit["file"]].append(hit)
        by_tag[hit["tag"].lower()] += 1
    return {
        "total": len(findings),
        "high": by_priority["high"],
        "other": by_priority["other"],
        "by_file": dict(by_file),
        "by_tag": dict(by_tag),
    }


def print_terminal(findings: list[dict], summary: dict, report_path: Path | None, mode: str) -> None:
    title = (
        "Overlay Scroll-Fight Audit (mobile dialogs)"
        if mode == "mobile"
        else "Overlay Scroll-Fight Audit (desktop/general)"
    )
    print(f"{BOLD}{title}{RESET}")
    print(f"{DIM}Source: {DEFAULT_SRC.relative_to(REPO_ROOT)} · mode={mode}{RESET}")
    print()
    print(f"  Total missing appendTo: {BOLD}{summary['total']}{RESET}")
    print(f"  {RED}High priority (dialog-ish):{RESET} {summary['high']}")
    if mode == "desktop":
        print(f"  {YELLOW}Other:{RESET} {summary['other']}")
    print()

    def section(title: str, priority: str, color: str) -> None:
        hits = [h for h in findings if h["priority"] == priority]
        if not hits:
            print(f"{color}{title}{RESET}: none")
            return
        print(f"{color}{BOLD}{title}{RESET} ({len(hits)})")
        grouped: dict[str, list[dict]] = defaultdict(list)
        for h in hits:
            grouped[h["file"]].append(h)
        for file, file_hits in grouped.items():
            tags = ", ".join(f"{h['tag']}@{h['line']}" for h in file_hits)
            print(f"  {CYAN}{file}{RESET}")
            print(f"    {tags}")
        print()

    section("HIGH PRIORITY", "high", RED)
    if mode == "desktop":
        section("OTHER", "other", YELLOW)
    if report_path is not None:
        print(f"{DIM}Report: {report_path.relative_to(REPO_ROOT)}{RESET}")
    else:
        print(f"{DIM}Report: skipped (--no-report){RESET}")


def write_report(findings: list[dict], summary: dict, report_path: Path, mode: str) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"# Overlay Scroll-Fight Audit ({mode})",
        "",
        f"Generated: {stamp}",
        f"Mode: `{mode}`",
        "",
        "## Summary",
        "",
        f"- Total missing `appendTo`: **{summary['total']}**",
        f"- High priority (dialog-ish): **{summary['high']}**",
        f"- Other: **{summary['other']}**",
        "",
        "### By tag",
        "",
    ]
    for tag, count in sorted(summary["by_tag"].items(), key=lambda x: (-x[1], x[0])):
        lines.append(f"- `{tag}`: {count}")
    lines += ["", "## High priority", ""]
    high = [h for h in findings if h["priority"] == "high"]
    if not high:
        lines.append("_None_")
    else:
        current = None
        for h in high:
            if h["file"] != current:
                current = h["file"]
                lines += ["", f"### `{current}`", ""]
            lines.append(f"- L{h['line']}: `{h['tag']}` — `{h['snippet']}`")
    if mode == "desktop":
        lines += ["", "## Other", ""]
        other = [h for h in findings if h["priority"] == "other"]
        if not other:
            lines.append("_None_")
        else:
            current = None
            for h in other:
                if h["file"] != current:
                    current = h["file"]
                    lines += ["", f"### `{current}`", ""]
                lines.append(f"- L{h['line']}: `{h['tag']}` — `{h['snippet']}`")
    lines += [
        "",
        "## Remediation",
        "",
        "Prefer `appendTo=\"body\"` (or `[appendTo]=\"'body'\"`) on overlay controls",
        "hosted inside scrolling dialogs/pages so the option list portals out of the",
        "parent scroll container. Validate long option lists manually.",
        "",
        "Mobile density/safe-area remediations remain in ≤768px media queries only",
        "(see `.roo/rules/mobile-phone-styling.md`). `appendTo` itself is shared.",
        "",
    ]
    report_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit PrimeNG overlays missing appendTo")
    parser.add_argument(
        "--src",
        type=Path,
        default=DEFAULT_SRC,
        help="HTML source root (default: fable-ui/src)",
    )
    parser.add_argument(
        "--mode",
        choices=("desktop", "mobile"),
        default="desktop",
        help="desktop=all findings; mobile=high-priority dialog-ish only",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON summary to stdout")
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Skip writing scripts/reports markdown (used by mobile audit)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit 1 when any high-priority finding exists",
    )
    parser.add_argument(
        "--fail-on-any",
        action="store_true",
        help="Exit 1 when any finding exists (after mode filter)",
    )
    args = parser.parse_args()

    src_root = args.src if args.src.is_absolute() else REPO_ROOT / args.src
    if not src_root.is_dir():
        print(f"Source root not found: {src_root}", file=sys.stderr)
        return 2

    findings = collect_findings(src_root)
    if args.mode == "mobile":
        findings = [h for h in findings if h["priority"] == "high"]
    summary = summarize(findings)

    report_path: Path | None = None
    if not args.no_report:
        stamp = dt.datetime.now().strftime("%Y-%m-%d_%H%M")
        prefix = "overlay-scroll-audit-mobile" if args.mode == "mobile" else "overlay-scroll-audit"
        report_path = REPORT_DIR / f"{prefix}-{stamp}.md"
        write_report(findings, summary, report_path, args.mode)

    if args.json:
        payload = {
            "mode": args.mode,
            "summary": {
                "total": summary["total"],
                "high": summary["high"],
                "other": summary["other"],
                "by_tag": summary["by_tag"],
            },
            "findings": findings,
            "report": report_path.relative_to(REPO_ROOT).as_posix() if report_path else None,
        }
        print(json.dumps(payload, indent=2))
    else:
        print_terminal(findings, summary, report_path, args.mode)

    if args.fail_on_any and summary["total"] > 0:
        return 1
    if args.strict and summary["high"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
