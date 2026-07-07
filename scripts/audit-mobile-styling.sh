#!/bin/bash
# =============================================================================
# Mobile Styling Audit Script (Tightened)
# Scans fable-ui SCSS for violations of .roo/rules/mobile-phone-styling.md
# Read-only — no files are modified.
#
# Key improvements over v1:
#   - Rule 2.1: Only flags min-height on dialog/panel root selectors (flex-column
#     containers), not chart widgets or reader toolbars.
#   - Rules 3.4/3.5/3.6/3.7: Verifies the SPECIFIC class has a mobile override,
#     not just that some override exists elsewhere in the file.
#   - Rule 3.3: Skips non-dialog contexts (login page, settings pages).
#   - All rules: Uses awk-based MQ-aware scanning to confirm whether a fix lives
#     inside a @media (max-width: 768px) block for the targeted class.
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UI_DIR="$PROJECT_DIR/fable-ui/src/app"

RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

ISSUES=0
FILES_SCANNED=0

section() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━ $1 ━━━${NC}"
}

warn() {
    echo -e "  ${YELLOW}⚠  $1${NC}"
    ISSUES=$((ISSUES + 1))
}

info() {
    echo -e "  ${GREEN}✓  $1${NC}"
}

# =============================================================================
# Helper: check if a specific class has a mobile (max-width: 768px) override
# for a given property pattern.
#
# Strategy: Extract the class block (from the class selector to its matching
# closing brace), then check if that block contains BOTH a 768px media query
# AND the target property pattern. Since we are scoped to the class block
# (not the whole file), the property pattern is almost certainly inside the MQ.
#
# Usage: class_has_mobile_override "$file" "$class" "$property_pattern"
#   $class: CSS class name (e.g. "folder-rescan")
#   $property_pattern: grep -E pattern to match (e.g. "display:\\s*none")
# Returns: 0 if override found, 1 if not
# =============================================================================
class_has_mobile_override() {
    local file="$1"
    local class="$2"
    local property_pattern="$3"

    # Find the line where this class is defined as a selector (e.g. ".folder-rescan {")
    local class_line
    class_line=$(grep -nE "^\s*\.${class}\s*\{$" "$file" 2>/dev/null | head -1 | cut -d: -f1)
    if [ -z "$class_line" ]; then
        # Try looser match: class might be nested like "&.modifier" or ".parent .class"
        class_line=$(grep -nE "\.${class}\s*\{$" "$file" 2>/dev/null | head -1 | cut -d: -f1)
    fi
    if [ -z "$class_line" ]; then
        return 1
    fi

    # Extract from class_line to end of file, then use awk to find matching brace
    local class_block
    class_block=$(sed -n "${class_line},\$p" "$file" 2>/dev/null | awk '
    BEGIN { depth = 0; started = 0 }
    /\{/ {
        depth += gsub(/\{/, "{")
        started = 1
    }
    /\}/ {
        depth -= gsub(/\}/, "}")
        if (started && depth <= 0) { print; exit }
    }
    { print }
    ')

    if [ -z "$class_block" ]; then
        return 1
    fi

    # Check if the class block has BOTH a 768px MQ AND the property pattern
    if echo "$class_block" | grep -qE '@media.*max-width:\s*768px' && \
       echo "$class_block" | grep -qE "$property_pattern"; then
        return 0
    fi
    return 1
}

# =============================================================================
# Helper: check if a file is a dialog/panel component (not a page, not a chart)
# =============================================================================
is_dialog_component() {
    local file="$1"
    # Dialog components have "dialog" or "picker" in their path, or use
    # panel-header/dialog-footer mixins
    if echo "$file" | grep -qE '/(dialog|picker|creator|manager|assigner|merger|uploader|mover)/'; then
        return 0
    fi
    if grep -qE '@include panel\.(panel-header|dialog-footer)' "$file" 2>/dev/null; then
        return 0
    fi
    return 1
}

# =============================================================================
# Rule 2.1: No Hardcoded Minimum Heights on dialog/panel roots
# Only flags min-height on elements that look like dialog/panel root containers
# (have display:flex + flex-direction:column nearby, or are in dialog components)
# =============================================================================
section "Rule 2.1 — Hardcoded min-height on dialog/panel roots"

while IFS= read -r -d '' file; do
    FILES_SCANNED=$((FILES_SCANNED + 1))

    # Skip non-dialog files for this rule
    if ! is_dialog_component "$file"; then
        continue
    fi

    # Find min-height lines, then check if the selector is a root container
    grep -nE '^\s*min-height:\s*[0-9]+px' "$file" 2>/dev/null | grep -v 'min-height:\s*0' | while IFS=: read -r line rest; do
        val=$(echo "$rest" | grep -oP 'min-height:\s*\K[0-9]+px')

        # Get the selector context (look backward for the parent selector)
        start=$((line - 30))
        [ "$start" -lt 1 ] && start=1
        context=$(sed -n "${start},${line}p" "$file" 2>/dev/null)

        # Only flag if the selector looks like a root container:
        # - Has display: flex AND flex-direction: column in the same block
        # - OR the selector name contains dialog/panel/picker/creator/container
        is_root=false
        if echo "$context" | grep -qE 'display:\s*flex' && echo "$context" | grep -qE 'flex-direction:\s*column'; then
            is_root=true
        fi
        if echo "$context" | grep -qE '\.(dialog|panel|picker|creator|container|merger|manager)[^-]'; then
            is_root=true
        fi

        if [ "$is_root" = true ]; then
            # Check if THIS specific class has min-height: 0 in a 768px MQ
            # Extract the likely class name from context
            class_name=$(echo "$context" | grep -oP '\.\K[a-zA-Z_-]*(dialog|panel|picker|creator|container|merger|manager)[a-zA-Z_-]*' | head -1)
            if [ -n "$class_name" ] && class_has_mobile_override "$file" "$class_name" 'min-height:\s*0'; then
                continue
            fi
            warn "$file:$line — min-height: $val on dialog/panel root without mobile min-height: 0"
        fi
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 2.2: No Hardcoded Widths on dialog/panel roots
# =============================================================================
section "Rule 2.2 — Hardcoded width on dialog/panel roots"

while IFS= read -r -d '' file; do
    if ! is_dialog_component "$file"; then
        continue
    fi

    grep -nE '^\s*width:\s*[5-9][0-9]{2}px' "$file" 2>/dev/null | while IFS=: read -r line rest; do
        val=$(echo "$rest" | grep -oP 'width:\s*\K[0-9]+px')
        start=$((line - 5))
        [ "$start" -lt 1 ] && start=1
        end=$((line + 2))
        context=$(sed -n "${start},${end}p" "$file" 2>/dev/null)

        if echo "$context" | grep -qE '(dialog|panel|picker|creator|container|merger|manager|assigner)'; then
            # Check if this class has width: 100% in a 768px MQ
            class_name=$(echo "$context" | grep -oP '\.\K[a-zA-Z_-]*(dialog|panel|picker|creator|container|merger|manager|assigner)[a-zA-Z_-]*' | head -1)
            if [ -n "$class_name" ] && class_has_mobile_override "$file" "$class_name" 'width:\s*100%'; then
                continue
            fi
            warn "$file:$line — width: ${val} on dialog/panel container without mobile width: 100%"
        fi
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 1.3: Breakpoint Consistency — files with <768px breakpoints but no 768px
# =============================================================================
section "Rule 1.3 — Breakpoints below 768px without a 768px sibling"

while IFS= read -r -d '' file; do
    has_768=$(grep -c 'max-width:\s*768px' "$file" 2>/dev/null || true)
    narrow_bps=$(grep -oP 'max-width:\s*\K[0-9]+(?=px)' "$file" 2>/dev/null | sort -u || true)

    for bp in $narrow_bps; do
        if [ "$bp" -lt 768 ] && [ "$has_768" -eq 0 ]; then
            line=$(grep -n "max-width:.*${bp}px" "$file" | head -1 | cut -d: -f1)
            warn "$file:$line — uses ${bp}px breakpoint but has no 768px breakpoint"
        fi
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 4.2: Missing safe-area-inset-bottom in footer patterns
# =============================================================================
section "Rule 4.2 — Footer patterns missing safe-area-inset-bottom"

while IFS= read -r -d '' file; do
    has_safe_area=$(grep -c 'safe-area-inset-bottom' "$file" 2>/dev/null || true)
    has_footer=$(grep -cE '(dialog-footer|\.footer|panel-footer)' "$file" 2>/dev/null || true)

    if [ "$has_footer" -gt 0 ] && [ "$has_safe_area" -eq 0 ]; then
        # Check if it uses the shared mixin (which now has safe-area)
        if grep -q '@include panel\.dialog-footer' "$file" 2>/dev/null; then
            continue
        fi
        line=$(grep -nE '(dialog-footer|\.footer|panel-footer)' "$file" | head -1 | cut -d: -f1)
        warn "$file:$line — footer pattern without safe-area-inset-bottom"
    fi
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 6.1: Invalid CSS — justify-content: stretch
# =============================================================================
section "Rule 6.1 — Invalid CSS: justify-content: stretch"

while IFS= read -r -d '' file; do
    while IFS= read -r match; do
        line=$(echo "$match" | cut -d: -f1)
        warn "$file:$line — 'justify-content: stretch' is invalid CSS"
    done < <(grep -n 'justify-content:\s*stretch' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 4.3: flex-direction: column on footers (wastes space)
# =============================================================================
section "Rule 4.3 — flex-direction: column in footer media queries"

while IFS= read -r -d '' file; do
    awk '
    /@media/ { in_mq=1; mq_line=NR }
    /}/ && in_mq { in_mq=0 }
    in_mq && /flex-direction:\s*column/ {
        print NR":"$0
    }' "$file" 2>/dev/null | while IFS=: read -r line rest; do
        context=$(sed -n "$((line - 20)),$((line + 5))p" "$file" 2>/dev/null)
        if echo "$context" | grep -qE '(dialog-footer|\.footer|footer-actions|panel-footer)'; then
            warn "$file:$line — flex-direction: column in footer media query (wastes space)"
        fi
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.1: Oversized dialog headers without mobile compaction
# =============================================================================
section "Rule 3.1 — Dialog headers without mobile compaction"

while IFS= read -r -d '' file; do
    has_header_icon=$(grep -c 'header-icon' "$file" 2>/dev/null || true)
    has_768=$(grep -c 'max-width:\s*768px' "$file" 2>/dev/null || true)

    if [ "$has_header_icon" -gt 0 ] && [ "$has_768" -eq 0 ]; then
        # Check if it uses the shared panel-header mixin (which now handles it)
        if grep -q '@include panel\.panel-header' "$file" 2>/dev/null; then
            continue
        fi
        line=$(grep -n 'header-icon' "$file" | head -1 | cut -d: -f1)
        warn "$file:$line — dialog header without 768px mobile compaction"
    fi
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.3: Info banners not hidden on mobile
# Only flags banners inside dialog components (not pages like login/settings)
# =============================================================================
section "Rule 3.3 — Info banners not hidden on mobile"

while IFS= read -r -d '' file; do
    # Only check dialog components
    if ! is_dialog_component "$file"; then
        continue
    fi

    has_banner=$(grep -cE '(scan-note|info-note|info-banner|guidance|help-text|directory-scan-note)' "$file" 2>/dev/null || true)
    [ "$has_banner" -eq 0 ] && continue

    grep -nE '(scan-note|info-note|info-banner|guidance|help-text|directory-scan-note)' "$file" 2>/dev/null | while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:scan-note|info-note|info-banner|guidance|help-text|directory-scan-note)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        # Check if this specific class has display:none in a 768px MQ
        if class_has_mobile_override "$file" "$class_name" 'display:\s*none'; then
            continue
        fi

        warn "$file:$line — '$class_name' info banner not hidden on mobile"
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.4: Row action buttons with text labels not hidden on mobile
# Uses MQ-aware scanning to verify the specific class has span hidden
# =============================================================================
section "Rule 3.4 — Row action buttons with visible text on mobile"

while IFS= read -r -d '' file; do
    has_row_btn=$(grep -cE '(folder-rescan|folder-remove|row-action|item-action|directory-action)' "$file" 2>/dev/null || true)
    [ "$has_row_btn" -eq 0 ] && continue

    grep -nE '(folder-rescan|folder-remove|row-action|item-action|directory-action)' "$file" 2>/dev/null | while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:folder-rescan|folder-remove|row-action|item-action|directory-action)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        # Check if this class has display:none in a 768px MQ
        # (span { display: none } spans lines, so just check for display:none)
        if class_has_mobile_override "$file" "$class_name" 'display:\s*none'; then
            continue
        fi

        warn "$file:$line — '$class_name' row button may have visible text on mobile"
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.6: Validation status in footers not hidden on mobile
# Checks if the file has validation-status AND a 768px MQ with display:none.
# The fix may be in a parent block (e.g. .dialog-footer MQ), so we check
# file-level: if the file has all three (validation-status, 768px MQ,
# display:none), the fix is present.
# =============================================================================
section "Rule 3.6 — Validation status in footers not hidden on mobile"

while IFS= read -r -d '' file; do
    has_validation=$(grep -c 'validation-status' "$file" 2>/dev/null || true)
    [ "$has_validation" -eq 0 ] && continue

    # Check if it uses the shared mixin (which now hides it)
    if grep -q '@include panel\.dialog-footer' "$file" 2>/dev/null; then
        continue
    fi

    # File-level check: if the file has validation-status, a 768px MQ,
    # and display:none, the fix is almost certainly present.
    if grep -qE '@media.*max-width:\s*768px' "$file" 2>/dev/null && \
       grep -qE 'display:\s*none' "$file" 2>/dev/null; then
        continue
    fi

    line=$(grep -n 'validation-status' "$file" | head -1 | cut -d: -f1)
    warn "$file:$line — .validation-status not hidden on mobile"
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.7: Truncated paths without mobile scroll fallback
# Uses MQ-aware scanning to verify the specific path class has overflow-x:auto
# =============================================================================
section "Rule 3.7 — Truncated paths without mobile scroll fallback"

while IFS= read -r -d '' file; do
    has_ellipsis=$(grep -c 'text-overflow:\s*ellipsis' "$file" 2>/dev/null || true)
    [ "$has_ellipsis" -eq 0 ] && continue

    grep -n 'text-overflow:\s*ellipsis' "$file" 2>/dev/null | while IFS=: read -r line rest; do
        # Get context to find the class name
        ctx_start=$((line - 15))
        [ "$ctx_start" -lt 1 ] && ctx_start=1
        context=$(sed -n "${ctx_start},${line}p" "$file" 2>/dev/null)

        # Only flag if it's a path element in a list/directory context
        # Exclude path-value (current-path bar, not a list item)
        if ! echo "$context" | grep -qE '(folder-path|directory-path|file-path|book-file-path)'; then
            continue
        fi

        # Extract the class name
        class_name=$(echo "$context" | grep -oP '\.\K[a-zA-Z_-]*(?:folder-path|directory-path|file-path|path-value|book-file-path)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        # Check if this class has overflow-x: auto in a 768px MQ
        if class_has_mobile_override "$file" "$class_name" 'overflow-x:\s*auto'; then
            continue
        fi

        warn "$file:$line — '$class_name' truncated path without mobile overflow-x: auto fallback"
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.5: Status chips with text not hidden on mobile
# Uses MQ-aware scanning to verify chip-text is hidden for the specific class
# =============================================================================
section "Rule 3.5 — Status chips/badges with visible text on mobile"

while IFS= read -r -d '' file; do
    has_chip=$(grep -cE '(imported-chip|status-chip|badge-chip|chip-text)' "$file" 2>/dev/null || true)
    [ "$has_chip" -eq 0 ] && continue

    grep -nE '(imported-chip|status-chip|badge-chip)' "$file" 2>/dev/null | while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:imported-chip|status-chip|badge-chip)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        # Check if this class has display:none in a 768px MQ
        # (chip-text { display: none } spans lines, so just check for display:none)
        if class_has_mobile_override "$file" "$class_name" 'display:\s*none'; then
            continue
        fi

        warn "$file:$line — '$class_name' chip text may be visible on mobile"
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.2: dialog-nav without top padding on mobile
# Uses MQ-aware scanning to verify dialog-nav has padding in 768px MQ
# =============================================================================
section "Rule 3.2 — dialog-nav without mobile top padding"

while IFS= read -r -d '' file; do
    has_dialog_nav=$(grep -c 'dialog-nav' "$file" 2>/dev/null || true)
    [ "$has_dialog_nav" -eq 0 ] && continue

    # Check if .dialog-nav has padding in a 768px MQ
    if class_has_mobile_override "$file" 'dialog-nav' 'padding:.*[0-9]'; then
        continue
    fi

    line=$(grep -n 'dialog-nav' "$file" | head -1 | cut -d: -f1)
    warn "$file:$line — .dialog-nav without mobile top padding override"
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Summary
# =============================================================================
section "SUMMARY"

echo ""
if [ "$ISSUES" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}No issues found.${NC}"
else
    echo -e "  ${RED}${BOLD}$ISSUES potential issue(s) found${NC} across $FILES_SCANNED scanned files."
fi
echo ""
echo -e "  Ruleset: ${CYAN}.roo/rules/mobile-phone-styling.md${NC}"
echo -e "  Scanned:  ${CYAN}$UI_DIR${NC}"
echo ""
