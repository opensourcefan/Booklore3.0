#!/bin/bash
# =============================================================================
# Mobile Styling Audit Script (Tightened & Enhanced)
# Scans fable-ui SCSS and HTML for violations of mobile phone styling standard.
# Read-only — no files are modified.
# =============================================================================
#
# USAGE
# -----
#   chmod +x scripts/audit-mobile-styling.sh   # first time only
#   ./scripts/audit-mobile-styling.sh           # run from the project root
#
# OUTPUT
#   Terminal:  colored output to stdout
#   Report:    scripts/reports/mobile-audit-YYYY-MM-DD.md (auto-generated)
#
# WHAT IT DOES
#   Scans every .scss, .html, and .ts file under fable-ui/src/app for
#   violations of the mobile-phone styling ruleset defined in
#   .roo/rules/mobile-phone-styling.md. The script is read-only and
#   never modifies any files.
#
# RULES CHECKED
#   2.1  Hardcoded min-height on dialog/panel roots
#   2.2  Hardcoded width on dialog/panel roots
#   2.5  Inefficient panel height limit on mobile
#   2.6  Dialog overlays not top-aligned on mobile
#   1.3  Breakpoints below 768px without a 768px sibling
#   3.1  Dialog headers without mobile compaction
#   3.2  dialog-nav without mobile top padding
#   3.3  Info banners not hidden on mobile
#   3.4  Row action buttons with visible text on mobile
#   3.5  Status chips/badges with visible text on mobile
#   3.6  Validation status in footers not hidden on mobile
#   3.7  Truncated paths without mobile scroll fallback
#   3.8  Back-to-top action missing on long panels
#   3.9  Raw path interpolation without truncation formatting
#   3.10 Component transition scroll reset check
#   4.2  Footer patterns missing safe-area-inset-bottom
#   4.3  flex-direction: column in footer media queries
#   5.4  Top/Bottom header mode layout positioning conflicts
#   5.5  Mobile popover boundary bounds check
#   6.1  Invalid CSS: justify-content: stretch
#
# REQUIREMENTS
#   bash 4+, GNU grep (with -P / PCRE), awk, sed, find, wc
#
# EXIT CODES
#   0 — no issues found
#   1 — one or more issues found
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
# Track unique files scanned across all rule loops
declare -A SCANNED_FILES

# Report tracking
REPORT_DIR="$PROJECT_DIR/scripts/reports"
REPORT_DATE=$(date '+%Y-%m-%d_%H%M')
REPORT_FILE="$REPORT_DIR/mobile-audit-${REPORT_DATE}.md"
RULE_ORDER=()                # preserves section order
declare -A RULE_DESCRIPTIONS # rule_id -> description
declare -A RULE_ISSUES       # rule_id -> newline-separated issue strings
CURRENT_RULE=""

section() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━ $1 ━━━${NC}"
    CURRENT_RULE="$1"
    RULE_ORDER+=("$CURRENT_RULE")
    RULE_DESCRIPTIONS["$CURRENT_RULE"]="$1"
}

warn() {
    echo -e "  ${YELLOW}⚠  $1${NC}"
    ISSUES=$((ISSUES + 1))
    if [ -n "$CURRENT_RULE" ]; then
        if [ -n "${RULE_ISSUES[$CURRENT_RULE]+x}" ]; then
            RULE_ISSUES["$CURRENT_RULE"]+=$'\n'"$1"
        else
            RULE_ISSUES["$CURRENT_RULE"]="$1"
        fi
    fi
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
# AND the target property pattern. Also matches selectors nested inside
# media query blocks.
# =============================================================================
class_has_mobile_override() {
    local file="$1"
    local class="$2"
    local property_pattern="$3"

    local result
    result=$(awk -v class_name="$class" -v pattern="$property_pattern" '
    BEGIN {
        depth = 0
        in_class = 0
        class_depth = -1
        in_mq = 0
        mq_depth = -1
        pending_class = 0
        pending_mq = 0
        found = 0
    }
    /@media.*max-width:[ \t]*768px/ {
        pending_mq = 1
    }
    {
        class_regex = "\\." class_name "([^a-zA-Z0-9_-]|$)"
        if (match($0, class_regex)) {
            pending_class = 1
        }
    }
    /\{/ {
        if (pending_mq) {
            in_mq = 1
            mq_depth = depth
            pending_mq = 0
        }
        if (pending_class) {
            in_class = 1
            class_depth = depth
            pending_class = 0
        }
        depth++
    }
    /\}/ {
        depth--
        if (in_mq && depth <= mq_depth) {
            in_mq = 0
            mq_depth = -1
        }
        if (in_class && depth <= class_depth) {
            in_class = 0
            class_depth = -1
        }
    }
    {
        if (in_class && in_mq) {
            if (match($0, pattern)) {
                found = 1
                exit 0
            }
        }
        if (match($0, /^[ \t]*\.[a-zA-Z0-9_-]+/) && !match($0, class_name)) {
            pending_class = 0
        }
    }
    END {
        if (found) print "yes"
        else print "no"
    }
    ' "$file" 2>/dev/null)

    if [ "$result" = "yes" ]; then
        return 0
    fi
    return 1
}

# =============================================================================
# Helper: Find the enclosing class name of a property match (preceding selector)
# =============================================================================
get_enclosing_class() {
    local file="$1"
    local line="$2"
    
    awk -v target="$line" '
    NR > target { exit }
    {
        lines[NR] = $0
    }
    END {
        depth = 0
        for (i = target; i >= 1; i--) {
            line_str = lines[i]
            n_close = gsub(/\}/, "}", line_str)
            n_open = gsub(/\{/, "{", line_str)
            
            depth += n_close - n_open
            if (depth < 0) {
                for (j = i; j >= 1; j--) {
                    if (lines[j] ~ /\.[a-zA-Z0-9_-]+/) {
                        match(lines[j], /\.[a-zA-Z0-9_-]+/)
                        print substr(lines[j], RSTART+1, RLENGTH-1)
                        exit
                    }
                }
                exit
            }
        }
        for (i = target; i >= 1; i--) {
            if (lines[i] ~ /\.[a-zA-Z0-9_-]+/) {
                match(lines[i], /\.[a-zA-Z0-9_-]+/)
                print substr(lines[i], RSTART+1, RLENGTH-1)
                exit
            }
        }
    }' "$file" 2>/dev/null
}

# =============================================================================
# Helper: check if a file is a dialog/panel component (not a page, not a chart)
# =============================================================================
is_dialog_component() {
    local file="$1"
    if echo "$file" | grep -qE '/(dialog|picker|creator|manager|assigner|merger|uploader|mover)/'; then
        return 0
    fi
    if grep -qE '@include panel\.(panel-header|dialog-footer)' "$file" 2>/dev/null; then
        return 0
    fi
    return 1
}

# =============================================================================
# Helper: check if a file is an HTML dialog/panel component template
# =============================================================================
is_html_dialog_component() {
    local html_file="$1"
    local ts_file="${html_file%.html}.ts"
    if [ -f "$ts_file" ]; then
        if grep -q 'DynamicDialogRef' "$ts_file" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

# =============================================================================
# Rule 2.1: No Hardcoded Minimum Heights on dialog/panel roots
# =============================================================================
section "Rule 2.1 — Hardcoded min-height on dialog/panel roots"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1

    if ! is_dialog_component "$file"; then
        continue
    fi

    while IFS=: read -r line rest; do
        val=$(echo "$rest" | grep -oP 'min-height:\s*\K[0-9]+px')

        # Get context
        start=$((line - 30))
        [ "$start" -lt 1 ] && start=1
        context=$(sed -n "${start},${line}p" "$file" 2>/dev/null)

        is_root=false
        if echo "$context" | grep -qE 'display:\s*flex' && echo "$context" | grep -qE 'flex-direction:\s*column'; then
            is_root=true
        fi
        if echo "$context" | grep -qE '\.(dialog|panel|picker|creator|container|merger|manager)[^-]'; then
            is_root=true
        fi

        if [ "$is_root" = true ]; then
            class_name=$(get_enclosing_class "$file" "$line")
            if [ -n "$class_name" ] && class_has_mobile_override "$file" "$class_name" 'min-height:[ \t]*0'; then
                continue
            fi
            warn "$file:$line — min-height: $val on dialog/panel root without mobile min-height: 0"
        fi
    done < <(grep -nE '^\s*min-height:\s*[0-9]+px' "$file" 2>/dev/null | grep -v 'min-height:\s*0')
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 2.2: No Hardcoded Widths on dialog/panel roots
# =============================================================================
section "Rule 2.2 — Hardcoded width on dialog/panel roots"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if ! is_dialog_component "$file"; then
        continue
    fi

    while IFS=: read -r line rest; do
        val=$(echo "$rest" | grep -oP 'width:\s*\K[0-9]+px')
        start=$((line - 5))
        [ "$start" -lt 1 ] && start=1
        end=$((line + 2))
        context=$(sed -n "${start},${end}p" "$file" 2>/dev/null)

        if echo "$context" | grep -qE '(dialog|panel|picker|creator|container|merger|manager|assigner)'; then
            class_name=$(get_enclosing_class "$file" "$line")
            if [ -n "$class_name" ] && class_has_mobile_override "$file" "$class_name" 'width:[ \t]*100%'; then
                continue
            fi
            warn "$file:$line — width: ${val} on dialog/panel container without mobile width: 100%"
        fi
    done < <(grep -nE '^\s*width:\s*[5-9][0-9]{2}px' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 1.3: Breakpoint Consistency — files with <768px breakpoints but no 768px
# =============================================================================
section "Rule 1.3 — Breakpoints below 768px without a 768px sibling"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_768=$(grep -c 'max-width:\s*768px' "$file" 2>/dev/null || true)
    narrow_bps=$(grep -oP '@media.*max-width:\s*\K[0-9]+(?=px)' "$file" 2>/dev/null | sort -u || true)

    for bp in $narrow_bps; do
        if [ "$bp" -lt 768 ] && [ "$has_768" -eq 0 ]; then
            line=$(grep -n "@media.*max-width:.*${bp}px" "$file" | head -1 | cut -d: -f1)
            warn "$file:$line — uses ${bp}px breakpoint but has no 768px breakpoint"
        fi
    done
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 4.2: Missing safe-area-inset-bottom in footer patterns
# =============================================================================
section "Rule 4.2 — Footer patterns missing safe-area-inset-bottom"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    # Skip sub-widgets/charts/pickers/trigger zones where safe area is not applicable
    if [[ "$file" =~ (chart|heatmap|widget|picker) ]] || grep -qE 'trigger-zone' "$file" 2>/dev/null; then
        continue
    fi

    has_safe_area=$(grep -c 'safe-area-inset-bottom' "$file" 2>/dev/null || true)
    has_footer=$(grep -cE '(dialog-footer|\.footer|panel-footer)' "$file" 2>/dev/null || true)

    if [ "$has_footer" -gt 0 ] && [ "$has_safe_area" -eq 0 ]; then
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
    SCANNED_FILES["$file"]=1
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
    SCANNED_FILES["$file"]=1
    while IFS=: read -r line rest; do
        class_name=$(get_enclosing_class "$file" "$line")
        if [[ "$class_name" =~ (footer|actions) ]]; then
            warn "$file:$line — flex-direction: column in footer media query (wastes space)"
        fi
    done < <(awk '
    BEGIN { depth=0; in_mq=0 }
    /@media/ { in_mq=1; mq_start_depth=depth }
    /\{/ { depth++ }
    /\}/ { depth--; if (in_mq && depth <= mq_start_depth) in_mq=0 }
    in_mq && /flex-direction:[ \t]*column/ {
        print NR":"$0
    }' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.1: Oversized dialog headers without mobile compaction
# =============================================================================
section "Rule 3.1 — Dialog headers without mobile compaction"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_header_icon=$(grep -c 'header-icon' "$file" 2>/dev/null || true)
    has_768=$(grep -c 'max-width:\s*768px' "$file" 2>/dev/null || true)

    if [ "$has_header_icon" -gt 0 ] && [ "$has_768" -eq 0 ]; then
        if grep -q '@include panel\.panel-header' "$file" 2>/dev/null; then
            continue
        fi
        line=$(grep -n 'header-icon' "$file" | head -1 | cut -d: -f1)
        warn "$file:$line — dialog header without 768px mobile compaction"
    fi
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.3: Info banners not hidden on mobile
# =============================================================================
section "Rule 3.3 — Info banners not hidden on mobile"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if ! is_dialog_component "$file"; then
        continue
    fi

    has_banner=$(grep -cE '(scan-note|info-note|info-banner|guidance|help-text|directory-scan-note)' "$file" 2>/dev/null || true)
    [ "$has_banner" -eq 0 ] && continue

    while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:scan-note|info-note|info-banner|guidance|help-text|directory-scan-note)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        if class_has_mobile_override "$file" "$class_name" 'display:[ \t]*none'; then
            continue
        fi

        warn "$file:$line — '$class_name' info banner not hidden on mobile"
    done < <(grep -nE '(scan-note|info-note|info-banner|guidance|help-text|directory-scan-note)' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.4: Row action buttons with text labels not hidden on mobile
# =============================================================================
section "Rule 3.4 — Row action buttons with visible text on mobile"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_row_btn=$(grep -cE '(folder-rescan|folder-remove|row-action|item-action|directory-action)' "$file" 2>/dev/null || true)
    [ "$has_row_btn" -eq 0 ] && continue

    while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:folder-rescan|folder-remove|row-action|item-action|directory-action)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        if class_has_mobile_override "$file" "$class_name" 'display:[ \t]*none'; then
            continue
        fi

        warn "$file:$line — '$class_name' row button may have visible text on mobile"
    done < <(grep -nE '(folder-rescan|folder-remove|row-action|item-action|directory-action)' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.6: Validation status in footers not hidden on mobile
# =============================================================================
section "Rule 3.6 — Validation status in footers not hidden on mobile"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_validation=$(grep -c 'validation-status' "$file" 2>/dev/null || true)
    [ "$has_validation" -eq 0 ] && continue

    if grep -q '@include panel\.dialog-footer' "$file" 2>/dev/null; then
        continue
    fi

    if class_has_mobile_override "$file" 'validation-status' 'display:[ \t]*none'; then
        continue
    fi

    line=$(grep -n 'validation-status' "$file" | head -1 | cut -d: -f1)
    warn "$file:$line — .validation-status not hidden on mobile"
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.7: Truncated paths without mobile scroll fallback
# =============================================================================
section "Rule 3.7 — Truncated paths without mobile scroll fallback"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_ellipsis=$(grep -c 'text-overflow:\s*ellipsis' "$file" 2>/dev/null || true)
    [ "$has_ellipsis" -eq 0 ] && continue

    while IFS=: read -r line rest; do
        ctx_start=$((line - 15))
        [ "$ctx_start" -lt 1 ] && ctx_start=1
        context=$(sed -n "${ctx_start},${line}p" "$file" 2>/dev/null)

        if ! echo "$context" | grep -qE '(folder-path|directory-path|file-path|book-file-path)'; then
            continue
        fi

        class_name=$(echo "$context" | grep -oP '\.\K[a-zA-Z_-]*(?:folder-path|directory-path|file-path|path-value|book-file-path)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && class_name="folder-path"
        
        if class_has_mobile_override "$file" "$class_name" 'overflow-x:[ \t]*auto'; then
            continue
        fi

        warn "$file:$line — '$class_name' truncated path without mobile overflow-x: auto fallback"
    done < <(grep -n 'text-overflow:\s*ellipsis' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.5: Status chips with text not hidden on mobile
# =============================================================================
section "Rule 3.5 — Status chips/badges with visible text on mobile"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_chip=$(grep -cE '(imported-chip|status-chip|badge-chip|chip-text)' "$file" 2>/dev/null || true)
    [ "$has_chip" -eq 0 ] && continue

    while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:imported-chip|status-chip|badge-chip)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        if class_has_mobile_override "$file" "$class_name" 'display:[ \t]*none'; then
            continue
        fi

        warn "$file:$line — '$class_name' chip text may be visible on mobile"
    done < <(grep -nE '(imported-chip|status-chip|badge-chip)' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.2: dialog-nav without mobile top padding
# =============================================================================
section "Rule 3.2 — dialog-nav without mobile top padding"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_dialog_nav=$(grep -c 'dialog-nav' "$file" 2>/dev/null || true)
    [ "$has_dialog_nav" -eq 0 ] && continue

    if class_has_mobile_override "$file" 'dialog-nav' 'padding:.*[0-9]'; then
        continue
    fi

    line=$(grep -n 'dialog-nav' "$file" | head -1 | cut -d: -f1)
    warn "$file:$line — .dialog-nav without mobile top padding override"
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 2.5: Inefficient panel height limit on mobile (scroll without screen-fill)
# =============================================================================
section "Rule 2.5 — Inefficient panel height limit on mobile"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if ! is_dialog_component "$file"; then
        continue
    fi

    while IFS=: read -r line rest; do
        val=$(echo "$rest" | grep -oP 'max-height:\s*\K[0-9]+(vh|px|%)')
        is_limit=false
        if [[ "$val" =~ vh$ ]]; then
            num=$(echo "$val" | tr -d 'vh')
            [ "$num" -lt 80 ] && is_limit=true
        elif [[ "$val" =~ px$ ]]; then
            num=$(echo "$val" | tr -d 'px')
            [ "$num" -lt 550 ] && is_limit=true
        elif [[ "$val" =~ %$ ]]; then
            num=$(echo "$val" | tr -d '%')
            [ "$num" -lt 80 ] && is_limit=true
        fi

        if [ "$is_limit" = true ]; then
            class_name=$(get_enclosing_class "$file" "$line")
            if [ -n "$class_name" ] && ! class_has_mobile_override "$file" "$class_name" '(max-height:[ \t]*(100%|none|100dvh|100svh)|height:[ \t]*(100%|100dvh))'; then
                warn "$file:$line — max-height: $val restricts vertical space on mobile without mobile override to fill screen"
            fi
        fi
    done < <(grep -nE '^\s*max-height:\s*[0-9]+(vh|px|%)' "$file" 2>/dev/null | grep -vE '(100vh|100dvh|100svh|100%)')
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 2.6: Dialog mask not top-aligned on mobile
# =============================================================================
section "Rule 2.6 — Dialog overlays not top-aligned on mobile"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if [[ ! "$file" =~ (global.scss|styles.scss) ]]; then
        continue
    fi

    has_top_align=false
    if grep -qE '@media.*max-width:\s*768px' "$file" 2>/dev/null; then
        if awk '
        /@media.*max-width:[ \t]*768px/ { in_mq=1; depth=0 }
        in_mq && /\{/ { depth++ }
        in_mq && /\}/ { depth--; if (depth <= 0) in_mq=0 }
        in_mq && /(align-items:[ \t]*flex-start|top:[ \t]*0)/ { print "found"; exit }
        ' "$file" | grep -q "found"; then
            has_top_align=true
        fi
    fi

    if [ "$has_top_align" = false ]; then
        warn "$file — dialog overlays are not top-aligned on mobile (needs align-items: flex-start on mobile viewport)"
    fi
done < <(find "$PROJECT_DIR/fable-ui/src" -name "*.scss" -print0)

# =============================================================================
# Rule 3.8: Back-to-top action missing on long panels
# =============================================================================
section "Rule 3.8 — Back-to-top action missing on long panels"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if ! is_dialog_component "$html_file"; then
        continue
    fi

    line_count=$(wc -l < "$html_file")
    section_count=$(grep -cE '(<section|class="form-section")' "$html_file" || true)

    if [ "$line_count" -gt 150 ] || [ "$section_count" -ge 3 ]; then
        if ! grep -qE '(scrollToTop|scroll-to-top|scrollTop)' "$html_file" && \
           ! grep -qE '(class|id|title|aria-label)="[^"]*(scroll-to-top|back-to-top|scrollToTop)[^"]*"' "$html_file"; then
            warn "$html_file — long panel (>150 lines or 3+ sections) lacks a 'Back to Top' button"
        fi
    fi
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# Rule 3.10: Component transition scroll reset check
# =============================================================================
section "Rule 3.10 — Component transition scroll reset check"

while IFS= read -r -d '' ts_file; do
    SCANNED_FILES["$ts_file"]=1
    if [[ "$ts_file" =~ \.spec\.ts$ ]]; then
        continue
    fi
    if grep -qE '(selectedFetchedMetadata\$|onBookClick)' "$ts_file" 2>/dev/null; then
        if ! grep -qE '(scrollTo|scrollTop)' "$ts_file"; then
            warn "$ts_file — transitions views on selection change but lacks scroll-reset logic (risks scroll persistence)"
        fi
    fi
done < <(find "$UI_DIR" -name "*.ts" -print0)

# =============================================================================
# Rule 3.9: Raw path interpolation without last-two-folders truncation
# =============================================================================
section "Rule 3.9 — Raw path interpolation without last-two-folders truncation"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    while IFS=: read -r line content; do
        if echo "$content" | grep -qE '\{\{\s*[a-zA-Z0-9_\.]+\s*\}\}' && \
           ! echo "$content" | grep -qE '(getDisplayPath|truncatePath)'; then
            class_name=$(echo "$content" | grep -oP 'class="[^"]*(folder-path|directory-path|file-path|path-value)[^"]*"' | grep -oP '(folder-path|directory-path|file-path|path-value)' | head -1)
            [ -z "$class_name" ] && class_name="path"
            warn "$html_file:$line — raw interpolation on '$class_name' without path truncation formatting (e.g. getDisplayPath)"
        fi
    done < <(grep -nE '(class="[^"]*(folder-path|directory-path|file-path|path-value)[^"]*")' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# Rule 5.4: Top/Bottom header mode layout positioning conflicts
# =============================================================================
section "Rule 5.4 — Top/Bottom header mode layout positioning conflicts"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    while IFS=: read -r line rest; do
        ctx_start=$((line - 15))
        [ "$ctx_start" -lt 1 ] && ctx_start=1
        ctx_end=$((line + 15))
        context=$(sed -n "${ctx_start},${ctx_end}p" "$file" 2>/dev/null)
        
        if ! echo "$context" | grep -qE '(body\.header-bottom|header-bottom)'; then
            if echo "$context" | grep -qE '(header|topbar|toolbar|menu|nav)'; then
                warn "$file:$line — defines top/padding-top in mobile MQ without body.header-bottom override (risks positioning overlap)"
            fi
        fi
    done < <(awk '
    BEGIN { depth=0; in_mq=0 }
    /@media.*max-width:[ \t]*768px/ { in_mq=1; mq_start_depth=depth }
    /\{/ { depth++ }
    /\}/ { depth--; if (in_mq && depth <= mq_start_depth) in_mq=0 }
    in_mq && /(top:|padding-top:)/ {
        print NR":"$0
    }' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 5.5: Mobile popover boundary bounds check
# =============================================================================
section "Rule 5.5 — Mobile popover boundary bounds check"

while IFS= read -r -d '' scss_file; do
    SCANNED_FILES["$scss_file"]=1
    while IFS=: read -r line selector; do
        start=$((line - 1))
        [ "$start" -lt 1 ] && start=1
        end=$((line + 40))
        context=$(sed -n "${start},${end}p" "$scss_file" 2>/dev/null)
        
        if ! echo "$context" | grep -qE '(top:|bottom:)' || ! echo "$context" | grep -qE 'body\.header-bottom'; then
            warn "$scss_file:$line — popover class '$selector' lacks explicit top/bottom bounds for top-header and bottom-header modes"
        fi
    done < <(grep -nE '^\s*\.(mobile-sidebar-popover|mobile-right-sidebar-popover|dir-mobile-panel-popover|mobile-overflow-menu-popover)(\.p-popover)?(\s*\{|\s*,|\s*$)' "$scss_file" 2>/dev/null)
done < <(find "$PROJECT_DIR/fable-ui/src" -name "*.scss" -print0)

# =============================================================================
# Rule 10.1: Direct DialogService.open usage (bypasses back gesture)
# =============================================================================
section "Rule 10.1 — Direct DialogService.open usage (bypasses back gesture)"

while IFS= read -r -d '' ts_file; do
    SCANNED_FILES["$ts_file"]=1
    if [[ "$ts_file" =~ \.spec\.ts$ || "$ts_file" =~ dialog-launcher\.service\.ts$ ]]; then
        continue
    fi
    while IFS=: read -r line content; do
        if echo "$content" | grep -qE 'dialogService\.open\('; then
            warn "$ts_file:$line — uses direct 'dialogService.open' (must use DialogLauncherService to enable back gesture interception)"
        fi
    done < <(grep -nE 'dialogService\.open\(' "$ts_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.ts" -print0)

# =============================================================================
# Rule 10.2: Dialog template lacks close-button
# =============================================================================
section "Rule 10.2 — Dialog template lacks close-button"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if ! is_html_dialog_component "$html_file"; then
        continue
    fi
    # If the dialog template renders a custom header, it must have a custom close button with close-button class
    if grep -qE '(class="[^"]*(dialog-header|panel-header)[^"]*"|<header)' "$html_file" 2>/dev/null; then
        if ! grep -q 'close-button' "$html_file"; then
            warn "$html_file:1 — dialog template has a custom header but lacks standard 'close-button' class"
        fi
    fi
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# Summary
# =============================================================================
section "SUMMARY"

echo ""
FILES_SCANNED=${#SCANNED_FILES[@]}
if [ "$ISSUES" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}No issues found.${NC}"
else
    echo -e "  ${RED}${BOLD}$ISSUES potential issue(s) found${NC} across $FILES_SCANNED scanned files."
fi
echo ""
echo -e "  Ruleset: ${CYAN}.roo/rules/mobile-phone-styling.md${NC}"
echo -e "  Scanned:  ${CYAN}$UI_DIR${NC}"
echo ""

# =============================================================================
# Generate Markdown Report
# =============================================================================
mkdir -p "$REPORT_DIR"

{
    echo "# Mobile Styling Audit Report"
    echo ""
    echo "**Date:** $(date '+%Y-%m-%d %H:%M %Z')"
    echo "**Script:** \`scripts/audit-mobile-styling.sh\`"
    echo "**Ruleset:** \`.roo/rules/mobile-phone-styling.md\`"
    echo "**Scan target:** \`fable-ui/src/app\` ($FILES_SCANNED files scanned)"
    echo ""
    echo "---"
    echo ""

    if [ "$ISSUES" -eq 0 ]; then
        echo "## ✅ No Issues Found"
        echo ""
        echo "All $FILES_SCANNED files passed every rule."
    else
        echo "## Results: $ISSUES Issue(s) Found"
        echo ""

        # Rules with issues — grouped into tables
        for rule in "${RULE_ORDER[@]}"; do
            [[ "$rule" == "SUMMARY" ]] && continue

            if [ -n "${RULE_ISSUES[$rule]+x}" ]; then
                echo "### $rule"
                echo ""
                echo "| # | File | Line | Description |"
                echo "|---|------|------|-------------|"

                count=0
                while IFS= read -r issue; do
                    count=$((count + 1))
                    if [[ "$issue" =~ ^(.+):([0-9]+)\ —\ (.+)$ ]]; then
                        filepath="${BASH_REMATCH[1]}"
                        lineno="${BASH_REMATCH[2]}"
                        desc="${BASH_REMATCH[3]}"
                        file_basename=$(basename "$filepath")
                        echo "| $count | \`$file_basename\` | $lineno | $desc |"
                    else
                        echo "| $count | — | — | $issue |"
                    fi
                done <<< "${RULE_ISSUES[$rule]}"
                echo ""
                echo "---"
                echo ""
            fi
        done

        # Clean rules list
        echo "### Rules With No Issues ✓"
        echo ""
        echo "| Rule |"
        echo "|------|"
        for rule in "${RULE_ORDER[@]}"; do
            [[ "$rule" == "SUMMARY" ]] && continue
            if [ -z "${RULE_ISSUES[$rule]+x}" ]; then
                echo "| ${rule} |"
            fi
        done
        echo ""
    fi
} > "$REPORT_FILE"

echo -e "  ${GREEN}Report saved:${NC} ${CYAN}$REPORT_FILE${NC}"
echo ""

exit $(( ISSUES > 0 ? 1 : 0 ))
