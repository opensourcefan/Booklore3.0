#!/usr/bin/env bash
# Thin wrapper for the desktop/general overlay scroll auditor.
# Mobile enforcement of the same pattern: scripts/audit-mobile-styling.sh Rule 5.2
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/scripts/audit-overlay-scroll.py" "$@"
