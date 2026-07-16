#!/bin/bash
# =============================================================================
# Mobile Styling Audit Script (Tightened & Enhanced)
# Scans fable-ui SCSS and HTML for violations of mobile phone styling standard.
# Read-only — no files are modified by this script.
# =============================================================================
#
# USAGE
# -----
#   chmod +x scripts/audit-mobile-styling.sh   # first time only
#   ./scripts/audit-mobile-styling.sh           # run from the project root
#   ./scripts/fixtures/mobile-audit/verify-fixtures.sh   # golden-pattern smoke check
#
# OUTPUT
#   Terminal:  colored output to stdout
#   Report:    scripts/reports/mobile-audit-YYYY-MM-DD.md (auto-generated)
#
# =============================================================================
# DESIGN INTENT (read this before changing rules or "fixing" findings)
# =============================================================================
#
# MOBILE ONLY — NEVER CHANGE DESKTOP TO PASS THIS AUDIT
#   - This script exists to protect the phone experience (≤768px).
#   - Remediation MUST be additive inside @media (max-width: 768px) (or
#     mobile-only TS bindings). Do NOT rewrite desktop base styles, grids,
#     or drag UX just to silence a finding.
#   - Ruleset: .roo/rules/mobile-phone-styling.md (§1.2 Desktop Isolation).
#
# WHY PAGES ARE IN SCOPE
#   - On phones, fullscreen dialogs and routed pages occupy nearly the same
#     viewport. Dialog-only audits missed Story Arc Reading Path scroll death
#     (v4.14.42): whole-card cdkDrag stole vertical pan.
#   - Surfaces: [dialog] | [page] | [chrome] | [other] (see surface_for()).
#   - Ruleset §§11–12 cover pages + drag/scroll coexistence.
#
# SEVERITY
#   - P0 = blocks use (scroll vs drag, orientation mismatch)
#   - P1 = density / safe-area / compaction
#   - P2 = polish (reserved)
#   Exit code 1 if any finding remains after allowlist.
#
# ALLOWLIST PHILOSOPHY
#   - File: scripts/audit-mobile-styling.allowlist
#   - Use for INTENTIONAL drag UX that is not a page-scroll conflict:
#       * metadata-picker author chips — whole-chip reorder; first = main author
#       * app.menu section reorder mode — deliberate full-section drag while
#         isReorderMode is on (important chrome feature; do not "fix")
#   - Prefer specific "file:line — message" substrings over whole filenames.
#   - Do not allowlist real scroll-blocking page lists (Story Arc class).
#
# FIX GUIDANCE WHEN A RULE FIRES
#   - P-Drag.1: add cdkDragHandle; do not make the whole card the drag surface
#     on scrollable pages. Exception: tiny chips / mode-gated reorder (allowlist).
#   - P-Drag.2: remove dead handles when cdkDragDisabled=true.
#   - P-Touch.1: handle = touch-action:none; content = pan-y — MOBILE MQ ONLY.
#   - P-Layout.1: bind cdkDropListOrientation to layout (vertical on mobile).
#   - P-Header.1 / 3.1: hide .subtitle / compact headers in ≤768 MQ only.
#   - P-Safe.1: safe-area on fixed/sticky bottom chrome; desktop bottom: may
#     remain if the same class has a mobile safe-area override.
#   - Never mass-migrate pages onto dialog panel mixins to satisfy heuristics.
#   - Rule 10.3: inline <p-dialog [(visible)]="flag"> must register/popstate
#     that flag. 10.1 only catches DialogService.open — topbar mobile search
#     was a real miss until 10.3 was added.
#   - P-Keyboard.1: search-only overlay (p-dialog wrapping app-book-searcher)
#     must focus the query field on open (onShow → focusInput / .focus()).
#   - P-Keyboard.2: no HTML autofocus on routed page hosts (page-load OSK).
#   - P-Keyboard.3: same search overlays must blur on close (blurInput / .blur()).
#   - Rule 5.2: dialog-ish p-select / autocomplete / etc. missing appendTo="body"
#     (delegates to scripts/audit-overlay-scroll.py --mode mobile). Fix is the
#     shared appendTo attribute — do NOT invent mobile-only layout changes.
#     Desktop/general scan remains: ./scripts/audit-overlay-scroll.sh
#   - Rule 2.3: scrollable dialogs need root/host height:100% (or 100dvh/svh)
#     on mobile — OR DialogSize.FULL with :host flex:1 + min-height:0.
#     max-height:none alone is NOT viewport fill (pushes footer off-screen).
#   - Rule 2.4: overflow-y:auto flex children need min-height:0; mobile
#     max-height:none without root fill breaks scroll containment.
#   - Rule 2.5: restrictive max-height must override to 100%/dvh/svh, or to
#     none ONLY when the dialog root already has viewport fill.
#
# FIXTURES
#   - scripts/fixtures/mobile-audit/ — golden broken page patterns for P0/P1.
#   - Not part of the Angular app; used by verify-fixtures.sh only.
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
#   2.3  Scrollable dialog lacks mobile viewport fill (footer scrolls away)
#   2.4  Flex scroll chain broken (missing min-height:0 / unconstrained parent)
#   2.5  Inefficient panel height limit on mobile
#   2.6  Dialog overlays not top-aligned on mobile
#   1.3  Breakpoints below 768px without a 768px sibling
#   3.1  Dialog/page headers without mobile compaction
#   3.2  dialog-nav without mobile top padding
#   3.3  Info banners not hidden on mobile
#   3.4  Row/toolbar action buttons with visible text on mobile
#   3.5  Status chips/badges with visible text on mobile
#   3.6  Validation status in footers not hidden on mobile
#   3.7  Truncated paths without mobile scroll fallback
#   3.8  Back-to-top action missing on long panels
#   3.9  Raw path interpolation without truncation formatting
#   3.10 Component transition scroll reset check
#   4.2  Footer/fixed-bottom chrome missing safe-area-inset-bottom
#   4.3  flex-direction: column in footer media queries
#   5.4  Top/Bottom header mode layout positioning conflicts
#   5.2  Dialog overlay controls missing appendTo="body" (mobile scroll clip)
#   5.5  Mobile popover boundary bounds check
#   6.1  Invalid CSS: justify-content: stretch
#   10.1 Direct DialogService.open usage (bypasses back gesture)
#   10.2 Dialog template lacks close-button
#   10.3 Inline p-dialog [(visible)] without MobileBack / popstate wiring
#   P-Drag.1  CDK drag without handle on scrollable hosts
#   P-Drag.2  Disabled drag with visible handle
#   P-Touch.1 Mobile drag missing touch-action split
#   P-Layout.1 Drop-list orientation vs mobile flex direction
#   P-Header.1 Page header compaction
#   P-Safe.1  Fixed/sticky bottom chrome safe-area
#   P-Keyboard.1 Search-only overlay missing focus-on-open
#   P-Keyboard.1b Search-only popover (search-input-full) missing focus-on-open
#   P-Keyboard.2 Page-load autofocus on mobile page hosts
#   P-Keyboard.3 Search-only overlay missing blur-on-close
#   P-Keyboard.3b Search-only popover missing blur-on-close
#
# ALLOWLIST
#   Optional: scripts/audit-mobile-styling.allowlist
#   One substring per line; matching findings are skipped (for known FPs).
#
# WHY 10.3 EXISTS
#   Rule 10.1 only greps dialogService.open(). The mobile topbar search uses
#   <p-dialog [(visible)]="mobileSearchVisible"> with no back registration —
#   back gesture left the dialog stuck open. 10.3 flags each visibility
#   binding that is not closed via mobileBackNavigation.register(...) or a
#   popstate handler referencing that same binding.
#
# WHY P-Keyboard RULES EXIST
#   Search-only overlays (user tapped Search) should focus the query field so
#   Android/iOS open the keyboard (Apple HIG dedicated search). Do NOT require
#   autofocus on every dialog with an input. Page-load autofocus is forbidden.
#   Close paths must explicitly blur — dialog hide alone can leave the OSK up.
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
P0_ISSUES=0
P1_ISSUES=0
P2_ISSUES=0
# Track unique files scanned across all rule loops
declare -A SCANNED_FILES

# Report tracking
REPORT_DIR="$PROJECT_DIR/scripts/reports"
REPORT_DATE=$(date '+%Y-%m-%d_%H%M')
REPORT_FILE="$REPORT_DIR/mobile-audit-${REPORT_DATE}.md"
ALLOWLIST_FILE="$SCRIPT_DIR/audit-mobile-styling.allowlist"
RULE_ORDER=()                # preserves section order
declare -A RULE_DESCRIPTIONS # rule_id -> description
declare -A RULE_ISSUES       # rule_id -> newline-separated issue strings
declare -A RULE_SEVERITY     # rule_id -> P0|P1|P2
CURRENT_RULE=""
CURRENT_SEVERITY="P1"

is_allowlisted() {
    local msg="$1"
    [ -f "$ALLOWLIST_FILE" ] || return 1
    while IFS= read -r pattern || [ -n "$pattern" ]; do
        [[ -z "$pattern" || "$pattern" =~ ^[[:space:]]*# ]] && continue
        if echo "$msg" | grep -qF "$pattern"; then
            return 0
        fi
    done < "$ALLOWLIST_FILE"
    return 1
}

section() {
    echo ""
    echo -e "${BOLD}${CYAN}━━━ $1 ━━━${NC}"
    CURRENT_RULE="$1"
    RULE_ORDER+=("$CURRENT_RULE")
    RULE_DESCRIPTIONS["$CURRENT_RULE"]="$1"
    CURRENT_SEVERITY="${2:-P1}"
    RULE_SEVERITY["$CURRENT_RULE"]="$CURRENT_SEVERITY"
}

warn() {
    local msg="$1"
    local surface="${2:-}"
    if [ -n "$surface" ]; then
        msg="[$surface] $msg"
    fi
    if is_allowlisted "$msg"; then
        return 0
    fi
    echo -e "  ${YELLOW}⚠  $msg${NC}"
    ISSUES=$((ISSUES + 1))
    case "$CURRENT_SEVERITY" in
        P0) P0_ISSUES=$((P0_ISSUES + 1)) ;;
        P2) P2_ISSUES=$((P2_ISSUES + 1)) ;;
        *)  P1_ISSUES=$((P1_ISSUES + 1)) ;;
    esac
    if [ -n "$CURRENT_RULE" ]; then
        if [ -n "${RULE_ISSUES[$CURRENT_RULE]+x}" ]; then
            RULE_ISSUES["$CURRENT_RULE"]+=$'\n'"$msg"
        else
            RULE_ISSUES["$CURRENT_RULE"]="$msg"
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
# Helper: check if a file is a dialog/panel component
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
# Helper: SCSS path → likely root class + Angular component symbol
#   shelf-assigner.component.scss → shelf-assigner / ShelfAssignerComponent
# =============================================================================
scss_root_class() {
    local base
    base=$(basename "$1" .scss)
    base=${base%.component}
    base=${base%-component}
    echo "$base"
}

scss_component_symbol() {
    local base
    base=$(scss_root_class "$1")
    echo "$base" | awk -F'-' '{
        for (i = 1; i <= NF; i++) {
            printf toupper(substr($i, 1, 1)) substr($i, 2)
        }
        print "Component"
    }'
}

# =============================================================================
# Helper: does a class (or :host) block match a property regex anywhere inside?
# =============================================================================
class_block_matches() {
    local file="$1"
    local class="$2"
    local property_pattern="$3"
    local selector_regex

    if [ "$class" = "host" ]; then
        selector_regex=":host([^a-zA-Z0-9_-]|$)"
    else
        selector_regex="\\.${class}([^a-zA-Z0-9_-]|$)"
    fi

    local result
    result=$(awk -v sel_re="$selector_regex" -v pattern="$property_pattern" '
    BEGIN {
        depth = 0
        in_class = 0
        class_depth = -1
        pending = 0
        found = 0
    }
    {
        if (match($0, sel_re)) pending = 1
    }
    /\{/ {
        if (pending) {
            in_class = 1
            class_depth = depth
            pending = 0
        }
        depth++
    }
    {
        if (in_class && $0 ~ pattern) found = 1
    }
    /\}/ {
        depth--
        if (in_class && depth <= class_depth) {
            in_class = 0
            class_depth = -1
        }
    }
    END { if (found) print "yes" }
    ' "$file" 2>/dev/null)

    [ "$result" = "yes" ]
}

# Viewport-fill tokens from mobile-phone-styling.md §2.3
VIEWPORT_FILL_RE='(height|max-height):[ \t]*(100%|100dvh|100svh)'

# =============================================================================
# Helper: dialog root/:host has viewport fill, or FULL flex host participation
# =============================================================================
dialog_has_root_viewport_fill() {
    local file="$1"
    local root
    root=$(scss_root_class "$file")

    # Only treat the dialog shell as filled — not nested list wrappers that
    # happen to set height:100% (e.g. .shelves-list inside .shelf-assigner).
    local candidate
    for candidate in "$root" "${root}-container" "${root}-dialog" "host"; do
        if class_block_matches "$file" "$candidate" "$VIEWPORT_FILL_RE"; then
            return 0
        fi
    done

    # DialogSize.FULL content host: flex:1 + min-height:0 participates in
    # global.scss .dialog-full .p-dialog-content > * chain without height:100%.
    if class_block_matches "$file" "host" 'flex:[ \t]*1' \
        && class_block_matches "$file" "host" 'min-height:[ \t]*0' \
        && dialog_launched_as_full "$file"; then
        return 0
    fi
    for candidate in "$root" "${root}-container"; do
        if class_block_matches "$file" "$candidate" 'flex:[ \t]*1' \
            && class_block_matches "$file" "$candidate" 'min-height:[ \t]*0' \
            && dialog_launched_as_full "$file"; then
            return 0
        fi
    done
    return 1
}

# =============================================================================
# Helper: component is opened with DialogSize.FULL (possibly mobile-conditional)
# =============================================================================
dialog_launched_as_full() {
    local file="$1"
    local comp
    comp=$(scss_component_symbol "$file")

    # Multiline: openDialog(Comp ... DialogSize.FULL within a short window
    if grep -Rnl --include='*.ts' -e "$comp" "$UI_DIR" 2>/dev/null | head -40 | while read -r ts; do
        if awk -v comp="$comp" '
            index($0, comp) { hit=1; buf=$0; next }
            hit {
                buf = buf "\n" $0
                if (length(buf) > 1200) hit=0
                if (buf ~ /DialogSize\.FULL/ || buf ~ /dialog-full/) { print "yes"; exit }
                if (buf ~ /styleClass/ && buf ~ /;/) hit=0
            }
        ' "$ts" 2>/dev/null | grep -q yes; then
            echo yes
            break
        fi
    done | grep -q yes; then
        return 0
    fi
    return 1
}

file_has_scrollable_overflow() {
    local file="$1"
    grep -qE 'overflow-y:[ \t]*(auto|scroll)' "$file" 2>/dev/null
}

# =============================================================================
# Helper: check if a file is a routed page / full-viewport feature
# =============================================================================
is_page_component() {
    local file="$1"
    if echo "$file" | grep -qE '(-page|/browser/|/dashboard/|/stats/)'; then
        return 0
    fi
    if grep -qE '\.page-header|:host-context\(body\.header-bottom\)|height:\s*calc\(100dvh' "$file" 2>/dev/null; then
        return 0
    fi
    local html_sib="${file%.scss}.html"
    html_sib="${html_sib%.ts}.html"
    if [ -f "$html_sib" ] && grep -qE 'class="[^"]*page-header' "$html_sib" 2>/dev/null; then
        return 0
    fi
    return 1
}

# =============================================================================
# Helper: surface tag for a file
# =============================================================================
surface_for() {
    local file="$1"
    if is_dialog_component "$file"; then
        echo "dialog"
    elif is_page_component "$file"; then
        echo "page"
    elif echo "$file" | grep -qE '/(layout|shared)/'; then
        echo "chrome"
    else
        echo "other"
    fi
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
# Rule 2.3: Scrollable dialogs must fill the viewport on mobile (§2.3)
# Without root height containment, long lists push sticky footers off-screen.
# =============================================================================
section "Rule 2.3 — Scrollable dialog lacks mobile viewport fill" "P0"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if ! is_dialog_component "$file"; then
        continue
    fi
    if ! file_has_scrollable_overflow "$file"; then
        continue
    fi
    if dialog_has_root_viewport_fill "$file"; then
        continue
    fi

    line=$(grep -nE 'overflow-y:[ \t]*(auto|scroll)' "$file" | head -1 | cut -d: -f1)
    root=$(scss_root_class "$file")
    warn "$file:$line — scrollable dialog .$root lacks mobile viewport fill (height/max-height: 100%/100dvh/100svh on root, or DialogSize.FULL + flex host); long lists push the footer off-screen" "$(surface_for "$file")"
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 2.4: Flex scroll chain (§2.4)
# - flex + overflow-y scroll children need min-height: 0
# - max-height: none on mobile without root fill removes containment
# =============================================================================
section "Rule 2.4 — Flex scroll chain broken on mobile" "P0"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if ! is_dialog_component "$file"; then
        continue
    fi
    if ! file_has_scrollable_overflow "$file"; then
        continue
    fi

    # 2.4a: overflow-y:auto class that is also a flex:1 child without min-height:0
    while IFS=: read -r line rest; do
        class_name=$(get_enclosing_class "$file" "$line")
        [ -z "$class_name" ] && continue
        if ! class_block_matches "$file" "$class_name" 'flex:[ \t]*1'; then
            continue
        fi
        if class_block_matches "$file" "$class_name" 'min-height:[ \t]*0'; then
            continue
        fi
        warn "$file:$line — .$class_name is flex:1 + overflow-y scroll without min-height: 0 (flex item will not shrink; scroll chain breaks)" "$(surface_for "$file")"
    done < <(grep -nE 'overflow-y:[ \t]*(auto|scroll)' "$file" 2>/dev/null)

    # 2.4b: mobile max-height:none without root viewport fill → list grows, footer scrolls away
    if grep -qE 'max-height:[ \t]*none' "$file" 2>/dev/null; then
        if ! dialog_has_root_viewport_fill "$file"; then
            # Only flag when none appears inside a mobile media query
            none_line=$(awk '
                /@media.*max-width:[ \t]*(768|640|520|480)px/ { in_mq=1; depth=0 }
                in_mq && /\{/ { depth++ }
                in_mq && /\}/ { depth--; if (depth <= 0) in_mq=0 }
                in_mq && /max-height:[ \t]*none/ { print NR; exit }
            ' "$file" 2>/dev/null)
            if [ -n "$none_line" ]; then
                warn "$file:$none_line — mobile max-height: none on scrollable dialog without root viewport fill (list grows with content; save/footer scrolls away)" "$(surface_for "$file")"
            fi
        fi
    fi
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
# Rule 4.2: Missing safe-area-inset-bottom in footer / fixed-bottom chrome
# =============================================================================
section "Rule 4.2 — Footer/fixed-bottom chrome missing safe-area-inset-bottom" "P1"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    # Skip sub-widgets/charts/pickers/trigger zones where safe area is not applicable
    if [[ "$file" =~ (chart|heatmap|widget|picker) ]] || grep -qE 'trigger-zone' "$file" 2>/dev/null; then
        continue
    fi

    has_safe_area=$(grep -c 'safe-area-inset-bottom' "$file" 2>/dev/null || true)
    has_footer=$(grep -cE '(dialog-footer|\.footer|panel-footer|floating-banner|move-floating|sticky-bar|bottom-bar|\.fab\b)' "$file" 2>/dev/null || true)

    if [ "$has_footer" -gt 0 ] && [ "$has_safe_area" -eq 0 ]; then
        if grep -q '@include panel\.dialog-footer' "$file" 2>/dev/null; then
            continue
        fi
        line=$(grep -nE '(dialog-footer|\.footer|panel-footer|floating-banner|move-floating|sticky-bar|bottom-bar|\.fab\b)' "$file" | head -1 | cut -d: -f1)
        warn "$file:$line — footer/fixed-bottom chrome without safe-area-inset-bottom" "$(surface_for "$file")"
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
# Rule 3.1: Oversized dialog/page headers without mobile compaction
# =============================================================================
section "Rule 3.1 — Dialog/page headers without mobile compaction" "P1"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_header_icon=$(grep -c 'header-icon' "$file" 2>/dev/null || true)
    has_page_header=$(grep -cE '\.page-header|\.title-section' "$file" 2>/dev/null || true)
    has_768=$(grep -c 'max-width:\s*768px' "$file" 2>/dev/null || true)

    if [ "$has_header_icon" -gt 0 ] && [ "$has_768" -eq 0 ]; then
        if grep -q '@include panel\.panel-header' "$file" 2>/dev/null; then
            continue
        fi
        line=$(grep -n 'header-icon' "$file" | head -1 | cut -d: -f1)
        warn "$file:$line — dialog header without 768px mobile compaction" "$(surface_for "$file")"
    fi

    # Page headers: require 768px MQ when page-header/title-section present
    if [ "$has_page_header" -gt 0 ] && [ "$has_768" -eq 0 ]; then
        line=$(grep -nE '\.page-header|\.title-section' "$file" | head -1 | cut -d: -f1)
        warn "$file:$line — page header without 768px mobile compaction" "page"
    fi
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.3: Info banners not hidden on mobile
# =============================================================================
section "Rule 3.3 — Info banners not hidden on mobile" "P1"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    # Dialogs and pages both consume scarce vertical space with banners
    if ! is_dialog_component "$file" && ! is_page_component "$file"; then
        continue
    fi

    has_banner=$(grep -cE '(scan-note|info-note|info-banner|guidance|help-text|directory-scan-note|guide-url-edit-panel)' "$file" 2>/dev/null || true)
    [ "$has_banner" -eq 0 ] && continue

    while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z_-]*(?:scan-note|info-note|info-banner|guidance|help-text|directory-scan-note|guide-url-edit-panel)[a-zA-Z_-]*' | head -1)
        [ -z "$class_name" ] && continue

        if class_has_mobile_override "$file" "$class_name" 'display:[ \t]*none'; then
            continue
        fi
        # guide-url-edit-panel may compact labels instead of full hide — accept either
        if [ "$class_name" = "guide-url-edit-panel" ] && grep -qE 'guide-url-edit-panel' "$file" && \
           awk '/@media.*max-width:[ \t]*768px/{in=1} in && /guide-url-edit-panel/{found=1} in && found && /display:[ \t]*none/{print "yes"; exit}' "$file" | grep -q yes; then
            continue
        fi

        warn "$file:$line — '$class_name' info banner not hidden/compacted on mobile" "$(surface_for "$file")"
    done < <(grep -nE '(scan-note|info-note|info-banner|guidance|help-text|directory-scan-note|guide-url-edit-panel)' "$file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# Rule 3.4: Row/toolbar action buttons with text labels not hidden on mobile
# =============================================================================
section "Rule 3.4 — Row/toolbar action buttons with visible text on mobile" "P1"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    has_row_btn=$(grep -cE '(folder-rescan|folder-remove|row-action|item-action|directory-action|place-chapter-btn|cancel-move-btn)' "$file" 2>/dev/null || true)
    [ "$has_row_btn" -eq 0 ] && continue

    while IFS=: read -r line class; do
        class_name=$(echo "$class" | grep -oP '\.?\K[a-zA-Z0-9_-]*(?:folder-rescan|folder-remove|row-action|item-action|directory-action|place-chapter-btn|cancel-move-btn)[a-zA-Z0-9_-]*' | head -1)
        [ -z "$class_name" ] && continue

        if class_has_mobile_override "$file" "$class_name" 'display:[ \t]*none'; then
            continue
        fi
        # Accept .p-button-label { display: none } inside a 768 MQ near this class
        if awk -v cls="$class_name" '
            /@media.*max-width:[ \t]*768px/ { in_mq=1; depth=0 }
            in_mq && /\{/ { depth++ }
            in_mq && /\}/ { depth--; if (depth<=0) { in_mq=0; near=0; saw_label=0 } }
            in_mq && index($0, cls) { near=1 }
            in_mq && near && /\.p-button-label/ { saw_label=1 }
            in_mq && saw_label && /display:[ \t]*none/ { print "yes"; exit }
            in_mq && /\.p-button-label/ && /display:[ \t]*none/ { print "yes"; exit }
        ' "$file" 2>/dev/null | grep -q yes; then
            continue
        fi

        warn "$file:$line — '$class_name' row/toolbar button may have visible text on mobile" "$(surface_for "$file")"
    done < <(grep -nE '(folder-rescan|folder-remove|row-action|item-action|directory-action|place-chapter-btn|cancel-move-btn)' "$file" 2>/dev/null)
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
            # Prefer real viewport fill on the same class
            if [ -n "$class_name" ] && class_has_mobile_override "$file" "$class_name" '(max-height:[ \t]*(100%|100dvh|100svh)|height:[ \t]*(100%|100dvh|100svh))'; then
                continue
            fi
            # max-height:none is OK only when the dialog root already fills the viewport
            # (inner lists can grow within a constrained fullscreen host). Alone, none
            # removes containment and pushes footers off-screen — do NOT treat as fill.
            if [ -n "$class_name" ] && class_has_mobile_override "$file" "$class_name" 'max-height:[ \t]*none'; then
                if dialog_has_root_viewport_fill "$file"; then
                    continue
                fi
                warn "$file:$line — max-height: $val → mobile max-height: none without root viewport fill (list grows; footer scrolls away)" "$(surface_for "$file")"
                continue
            fi
            warn "$file:$line — max-height: $val restricts vertical space on mobile without mobile override to fill screen" "$(surface_for "$file")"
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
# Rule 5.2: Dialog overlay controls missing appendTo="body"
# =============================================================================
# Mobile ruleset §5.2 — p-select and similar overlays MUST use appendTo="body"
# so option lists are not clipped / scroll-fight inside fullscreen dialogs.
# Desktop/general sibling: scripts/audit-overlay-scroll.sh (default mode).
# This rule only ingests --mode mobile (high-priority dialog-ish hits).
# =============================================================================
section "Rule 5.2 — Dialog overlays missing appendTo=body" "P0"

OVERLAY_AUDIT_PY="$SCRIPT_DIR/audit-overlay-scroll.py"
if [ ! -f "$OVERLAY_AUDIT_PY" ]; then
    warn "$OVERLAY_AUDIT_PY — missing; cannot enforce Rule 5.2 (install scripts/audit-overlay-scroll.py)" "other"
else
    overlay_json=$(python3 "$OVERLAY_AUDIT_PY" --mode mobile --json --no-report 2>/dev/null || true)
    if [ -z "$overlay_json" ]; then
        warn "$OVERLAY_AUDIT_PY — failed to produce JSON for Rule 5.2" "other"
    else
        while IFS=$'\t' read -r file line tag; do
            [ -z "$file" ] && continue
            abs="$PROJECT_DIR/$file"
            SCANNED_FILES["$abs"]=1
            warn "$abs:$line — <$tag> missing appendTo=\"body\" (dialog overlay will clip/fight scroll on mobile; ruleset §5.2)" "$(surface_for "$abs")"
        done < <(printf '%s' "$overlay_json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for hit in data.get('findings', []):
    print(f\"{hit['file']}\t{hit['line']}\t{hit['tag']}\")
")
    fi
fi

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
    done < <(grep -nE '^\s*\.(mobile-sidebar-popover|mobile-right-sidebar-popover|dir-mobile-panel-popover|mobile-overflow-menu-popover|mobile-notifications-popover)(\.p-popover)?(\s*\{|\s*,|\s*$)' "$scss_file" 2>/dev/null)
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
# Rule 10.3: Inline p-dialog [(visible)] without back-gesture wiring
# =============================================================================
# Catches overlays that never call DialogService.open (so 10.1 misses them),
# e.g. topbar mobile search: <p-dialog [(visible)]="mobileSearchVisible">.
# A component that registers back for OTHER overlays still fails if THIS
# visibility flag is never closed from register()/popstate.
# =============================================================================
section "Rule 10.3 — Inline p-dialog without back-gesture wiring" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if [[ "$html_file" =~ \.spec\. ]]; then
        continue
    fi
    if ! grep -qE '<p-dialog\b' "$html_file" 2>/dev/null; then
        continue
    fi

    ts_file="${html_file%.html}.ts"
    [ -f "$ts_file" ] || continue

    # Collect [(visible)]="name" bindings that appear near a p-dialog open tag
    while IFS=: read -r line content; do
        # Only consider lines that are part of a p-dialog start (look back a few lines for <p-dialog)
        start=$((line - 12))
        [ "$start" -lt 1 ] && start=1
        window=$(sed -n "${start},${line}p" "$html_file" 2>/dev/null)
        if ! echo "$window" | grep -qE '<p-dialog\b'; then
            continue
        fi

        var=$(echo "$content" | grep -oP '\[\(visible\)\]="\K[a-zA-Z_][a-zA-Z0-9_]*' | head -1)
        [ -z "$var" ] && continue

        # Wired if register(...) close callback sets this var false, or popstate references it
        wired=false
        if awk -v var="$var" '
            /mobileBackNavigation\.register\s*\(/ { in_reg=1; lines_left=30 }
            in_reg && lines_left > 0 {
                lines_left--
                if ($0 ~ var && $0 ~ /=/ && $0 ~ /false/) { print "yes"; exit }
                if ($0 ~ /\);/ && lines_left < 28) { in_reg=0 }
            }
            /popstate/ { in_pop=1; lines_left=40 }
            in_pop && lines_left > 0 {
                lines_left--
                if ($0 ~ var) { print "yes"; exit }
            }
        ' "$ts_file" 2>/dev/null | grep -q yes; then
            wired=true
        fi

        if [ "$wired" = false ]; then
            warn "$html_file:$line — inline p-dialog [(visible)]=\"$var\" has no MobileBackNavigationService.register/popstate close for that flag (back gesture will not dismiss)" "$(surface_for "$html_file")"
        fi
    done < <(grep -nE '\[\(visible\)\]="[a-zA-Z_][a-zA-Z0-9_]*"' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Drag.1: CDK drag without handle on scrollable hosts
# =============================================================================
section "P-Drag.1 — CDK drag without handle on scrollable hosts" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if ! grep -q 'cdkDrag' "$html_file" 2>/dev/null; then
        continue
    fi
    scss_file="${html_file%.html}.scss"
    # Only flag scrollable page/dialog hosts (or any file with overflow-y scroll/auto / page markers)
    is_scroll_host=false
    if is_page_component "$html_file" || is_dialog_component "$html_file"; then
        is_scroll_host=true
    fi
    if [ -f "$scss_file" ] && grep -qE 'overflow-y:\s*(auto|scroll)' "$scss_file" 2>/dev/null; then
        is_scroll_host=true
    fi
    [ "$is_scroll_host" = true ] || continue

    # For each line with cdkDrag (not cdkDragHandle / cdkDragDisabled / cdkDragDrop / cdkDragPreview / cdkDragPlaceholder)
    while IFS=: read -r line content; do
        if echo "$content" | grep -qE 'cdkDragHandle|cdkDragDisabled|cdkDragDrop|cdkDragPreview|cdkDragPlaceholder|cdkDropList'; then
            continue
        fi
        if ! echo "$content" | grep -qE '\bcdkDrag\b'; then
            continue
        fi
        # Look ahead ~40 lines for a cdkDragHandle inside the same element block
        end=$((line + 40))
        block=$(sed -n "${line},${end}p" "$html_file" 2>/dev/null)
        if echo "$block" | grep -q 'cdkDragHandle'; then
            continue
        fi
        warn "$html_file:$line — cdkDrag on scrollable host without cdkDragHandle (blocks mobile scroll)" "$(surface_for "$html_file")"
    done < <(grep -nE '\bcdkDrag\b' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Drag.2: Disabled drag with visible handle
# =============================================================================
section "P-Drag.2 — Disabled drag with visible handle" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    while IFS=: read -r line content; do
        if echo "$content" | grep -qE 'cdkDragDisabled\]="true"|cdkDragDisabled="true"|\[cdkDragDisabled\]="true"'; then
            end=$((line + 50))
            block=$(sed -n "${line},${end}p" "$html_file" 2>/dev/null)
            if echo "$block" | grep -q 'cdkDragHandle'; then
                handle_line=$(echo "$block" | grep -n 'cdkDragHandle' | head -1 | cut -d: -f1)
                abs_line=$((line + handle_line - 1))
                warn "$html_file:$abs_line — cdkDragHandle present while cdkDragDisabled=true (dead handle)" "$(surface_for "$html_file")"
            fi
        fi
    done < <(grep -nE 'cdkDragDisabled' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Touch.1: Mobile drag missing touch-action split
# =============================================================================
section "P-Touch.1 — Mobile drag missing touch-action split" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if ! grep -qE '\bcdkDrag\b' "$html_file" 2>/dev/null; then
        continue
    fi
    if ! is_page_component "$html_file" && ! is_dialog_component "$html_file"; then
        continue
    fi
    scss_file="${html_file%.html}.scss"
    [ -f "$scss_file" ] || continue
    has_768=$(grep -c 'max-width:\s*768px' "$scss_file" 2>/dev/null || true)
    [ "$has_768" -gt 0 ] || continue

    has_pan_y=$(grep -c 'touch-action:\s*pan-y' "$scss_file" 2>/dev/null || true)
    has_none=$(grep -c 'touch-action:\s*none' "$scss_file" 2>/dev/null || true)
    if [ "$has_pan_y" -eq 0 ] || [ "$has_none" -eq 0 ]; then
        line=$(grep -nE '\bcdkDrag\b' "$html_file" | head -1 | cut -d: -f1)
        warn "$html_file:$line — CDK drag on mobile surface without touch-action split (need pan-y on content + none on handle)" "$(surface_for "$html_file")"
    fi
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Layout.1: Drop-list orientation vs mobile flex direction
# =============================================================================
section "P-Layout.1 — Drop-list orientation vs mobile flex direction" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if ! grep -qE 'cdkDropListOrientation="horizontal"|cdkDropListOrientation='\''horizontal'\''' "$html_file" 2>/dev/null; then
        continue
    fi
    # Bound orientation (property binding) is OK — skip attribute-only hardcode check when binding present
    if grep -qE '\[cdkDropListOrientation\]' "$html_file" 2>/dev/null; then
        continue
    fi
    scss_file="${html_file%.html}.scss"
    [ -f "$scss_file" ] || continue
    # If mobile MQ sets the drop list (or its common class) to column, flag mismatch
    if awk '
        /@media.*max-width:[ \t]*768px/ { in_mq=1; depth=0 }
        in_mq && /\{/ { depth++ }
        in_mq && /\}/ { depth--; if (depth<=0) in_mq=0 }
        in_mq && /flex-direction:[ \t]*column/ { print "yes"; exit }
    ' "$scss_file" 2>/dev/null | grep -q yes; then
        line=$(grep -nE 'cdkDropListOrientation="horizontal"' "$html_file" | head -1 | cut -d: -f1)
        warn "$html_file:$line — hard-coded horizontal drop orientation while mobile CSS uses flex-direction: column" "$(surface_for "$html_file")"
    fi
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Header.1: Page header subtitle not hidden on mobile
# =============================================================================
section "P-Header.1 — Page header compaction (subtitle)" "P1"

while IFS= read -r -d '' scss_file; do
    SCANNED_FILES["$scss_file"]=1
    if ! is_page_component "$scss_file"; then
        continue
    fi
    if ! grep -qE '\.subtitle' "$scss_file" 2>/dev/null; then
        continue
    fi
    if class_has_mobile_override "$scss_file" 'subtitle' 'display:[ \t]*none'; then
        continue
    fi
    # Also accept nested .title-section .subtitle { display: none } inside 768 MQ
    if awk '
        /@media.*max-width:[ \t]*768px/ { in_mq=1; depth=0 }
        in_mq && /\{/ { depth++ }
        in_mq && /\}/ { depth--; if (depth<=0) in_mq=0 }
        in_mq && /\.subtitle/ { saw=1 }
        in_mq && saw && /display:[ \t]*none/ { print "yes"; exit }
    ' "$scss_file" 2>/dev/null | grep -q yes; then
        continue
    fi
    line=$(grep -nE '\.subtitle' "$scss_file" | head -1 | cut -d: -f1)
    warn "$scss_file:$line — .subtitle on page without mobile display:none compaction" "page"
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# P-Safe.1: Fixed/sticky bottom without safe-area
# =============================================================================
section "P-Safe.1 — Fixed/sticky bottom chrome missing safe-area" "P1"

while IFS= read -r -d '' file; do
    SCANNED_FILES["$file"]=1
    if [[ "$file" =~ (chart|heatmap|widget|reader) ]]; then
        continue
    fi
    while IFS=: read -r line rest; do
        ctx_start=$((line - 8))
        [ "$ctx_start" -lt 1 ] && ctx_start=1
        ctx_end=$((line + 12))
        context=$(sed -n "${ctx_start},${ctx_end}p" "$file" 2>/dev/null)
        if ! echo "$context" | grep -qE 'position:\s*(fixed|sticky)'; then
            continue
        fi
        if echo "$context" | grep -q 'safe-area-inset-bottom'; then
            continue
        fi
        # Ignore tiny decorative bottoms unlikely to be chrome
        if echo "$context" | grep -qE '(tooltip|popover|dropdown|overlay-mask)'; then
            continue
        fi
        # If the enclosing class has a mobile safe-area override elsewhere in the file, accept it
        class_name=$(get_enclosing_class "$file" "$line")
        if [ -n "$class_name" ] && grep -q "$class_name" "$file" && \
           awk -v cls="$class_name" '
             index($0, cls) { near=1 }
             near && /safe-area-inset-bottom/ { print "yes"; exit }
             /@media.*max-width:[ \t]*768px/ { in_mq=1 }
             in_mq && index($0, cls) { mq_near=1 }
             in_mq && mq_near && /safe-area-inset-bottom/ { print "yes"; exit }
           ' "$file" 2>/dev/null | grep -q yes; then
            continue
        fi
        warn "$file:$line — fixed/sticky bottom without safe-area-inset-bottom nearby" "$(surface_for "$file")"
    done < <(grep -nE '^\s*bottom:\s*' "$file" 2>/dev/null | grep -vE 'bottom:\s*(auto|unset|initial|inherit|0\s*;|0px)')
done < <(find "$UI_DIR" -name "*.scss" -print0)

# =============================================================================
# P-Keyboard.1: Search-only overlay missing focus-on-open
# =============================================================================
# Narrow: p-dialog that hosts app-book-searcher (mobile topbar search).
# Multi-action dialogs (AI search with focusOnShow=false) are out of scope.
# Pass: (onShow) handler exists and TS focuses via focusInput / .focus(.
# =============================================================================
section "P-Keyboard.1 — Search-only overlay missing focus-on-open" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if [[ "$html_file" =~ \.spec\. ]]; then
        continue
    fi
    if ! grep -q 'app-book-searcher' "$html_file" 2>/dev/null; then
        continue
    fi
    if ! grep -qE '<p-dialog\b' "$html_file" 2>/dev/null; then
        continue
    fi

    ts_file="${html_file%.html}.ts"
    [ -f "$ts_file" ] || continue

    while IFS=: read -r line _content; do
        start=$((line - 40))
        [ "$start" -lt 1 ] && start=1
        window=$(sed -n "${start},${line}p" "$html_file" 2>/dev/null)
        if ! echo "$window" | grep -qE '<p-dialog\b'; then
            continue
        fi

        # Extract onShow handler name if present in the dialog open region
        on_show=$(echo "$window" | grep -oE '\(onShow\)="[a-zA-Z_][a-zA-Z0-9_]*\(' | head -1 | sed -E 's/\(onShow\)="([a-zA-Z_][a-zA-Z0-9_]*)\(.*/\1/')

        focused=false
        if [ -n "$on_show" ]; then
            # onShow handler body must focus the search field (focusInput / .focus)
            if awk -v fn="$on_show" '
                $0 ~ fn "\\s*\\(" { in_fn=1; depth=0; seen_open=0 }
                in_fn {
                    if ($0 ~ /\{/) { depth++; seen_open=1 }
                    if ($0 ~ /\}/) {
                        depth--
                        if (depth <= 0 && seen_open) { in_fn=0 }
                    }
                    if (in_fn && /(focusInput|\.focus\s*\(|nativeElement\.focus)/) { print "yes"; exit }
                }
            ' "$ts_file" 2>/dev/null | grep -q yes; then
                focused=true
            fi
        fi

        # Autofocus on an input inside the dialog region also counts (not preferred)
        if [ "$focused" = false ] && echo "$window" | grep -qiE 'autofocus'; then
            focused=true
        fi
        # Look a few lines after searcher for autofocus on sibling inputs
        end=$((line + 5))
        after=$(sed -n "${line},${end}p" "$html_file" 2>/dev/null)
        if [ "$focused" = false ] && echo "$after" | grep -qiE 'autofocus'; then
            focused=true
        fi

        if [ "$focused" = false ]; then
            warn "$html_file:$line — search-only p-dialog hosts app-book-searcher but does not focus the query field on open (need onShow → focusInput/.focus)" "$(surface_for "$html_file")"
        fi
    done < <(grep -nE '<app-book-searcher\b' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Keyboard.1b: Search-only popover missing focus-on-open
# =============================================================================
# Narrow: p-popover that hosts an input.search-input-full (book-browser mobile
# search). Pass: (onShow) handler focuses via focusSearchOverlayInput / .focus(.
# =============================================================================
section "P-Keyboard.1b — Search-only popover missing focus-on-open" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if [[ "$html_file" =~ \.spec\. ]]; then
        continue
    fi
    if ! grep -qE 'class="[^"]*search-input-full' "$html_file" 2>/dev/null \
        && ! grep -qE "class='[^']*search-input-full" "$html_file" 2>/dev/null \
        && ! grep -qE 'search-input-full' "$html_file" 2>/dev/null; then
        continue
    fi
    if ! grep -qE '<p-popover\b' "$html_file" 2>/dev/null; then
        continue
    fi

    ts_file="${html_file%.html}.ts"
    [ -f "$ts_file" ] || continue

    while IFS=: read -r line _content; do
        start=$((line - 40))
        [ "$start" -lt 1 ] && start=1
        window=$(sed -n "${start},${line}p" "$html_file" 2>/dev/null)
        if ! echo "$window" | grep -qE '<p-popover\b'; then
            continue
        fi

        on_show=$(echo "$window" | grep -oE '\(onShow\)="[a-zA-Z_][a-zA-Z0-9_]*\(' | head -1 | sed -E 's/\(onShow\)="([a-zA-Z_][a-zA-Z0-9_]*)\(.*/\1/')

        focused=false
        if [ -n "$on_show" ]; then
            if awk -v fn="$on_show" '
                $0 ~ fn "\\s*\\(" { in_fn=1; depth=0; seen_open=0 }
                in_fn {
                    if ($0 ~ /\{/) { depth++; seen_open=1 }
                    if ($0 ~ /\}/) {
                        depth--
                        if (depth <= 0 && seen_open) { in_fn=0 }
                    }
                    if (in_fn && /(focusSearchOverlayInput|focusInput|\.focus\s*\(|nativeElement\.focus)/) { print "yes"; exit }
                }
            ' "$ts_file" 2>/dev/null | grep -q yes; then
                focused=true
            fi
        fi

        if [ "$focused" = false ]; then
            warn "$html_file:$line — search-only p-popover hosts search-input-full but does not focus the query field on open (need onShow → focusSearchOverlayInput/.focus)" "$(surface_for "$html_file")"
        fi
    done < <(grep -nE 'search-input-full' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Keyboard.2: Page-load autofocus on mobile page hosts
# =============================================================================
# Forbidden: autofocus on routed/full-viewport pages (unexpected OSK on load).
# Dialogs opened by user action are out of scope here.
# =============================================================================
section "P-Keyboard.2 — Page-load autofocus on mobile page hosts" "P1"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if [[ "$html_file" =~ \.spec\. ]]; then
        continue
    fi
    if ! is_page_component "$html_file"; then
        continue
    fi
    while IFS=: read -r line content; do
        # Skip commented-out attributes
        if echo "$content" | grep -qE '^\s*<!--'; then
            continue
        fi
        warn "$html_file:$line — page host uses autofocus (opens keyboard on load; use focus-on-open only for user-opened search overlays)" "$(surface_for "$html_file")"
    done < <(grep -niE '(^|[^a-zA-Z_-])autofocus([^a-zA-Z_-]|$)|\[autofocus\]' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Keyboard.3: Search-only overlay missing blur-on-close
# =============================================================================
# Same scope as P-Keyboard.1. Closing (back / X / mask) must blur so the OSK
# dismisses; do not rely on dialog hide alone.
# Pass: companion TS calls blurInput( (or input .blur() in a close* method).
# =============================================================================
section "P-Keyboard.3 — Search-only overlay missing blur-on-close" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if [[ "$html_file" =~ \.spec\. ]]; then
        continue
    fi
    if ! grep -q 'app-book-searcher' "$html_file" 2>/dev/null; then
        continue
    fi
    if ! grep -qE '<p-dialog\b' "$html_file" 2>/dev/null; then
        continue
    fi

    ts_file="${html_file%.html}.ts"
    [ -f "$ts_file" ] || continue

    while IFS=: read -r line _content; do
        start=$((line - 40))
        [ "$start" -lt 1 ] && start=1
        window=$(sed -n "${start},${line}p" "$html_file" 2>/dev/null)
        if ! echo "$window" | grep -qE '<p-dialog\b'; then
            continue
        fi

        blurred=false
        # Preferred: explicit blurInput() call from the host (close / onHide path)
        if grep -qE 'blurInput\s*\(' "$ts_file" 2>/dev/null; then
            blurred=true
        fi
        # Also accept a close* method that calls .blur(
        if [ "$blurred" = false ]; then
            if awk '
                /[a-zA-Z_]*[Cc]lose[a-zA-Z_]*\s*\(/ { in_fn=1; depth=0; seen_open=0 }
                in_fn {
                    if ($0 ~ /\{/) { depth++; seen_open=1 }
                    if ($0 ~ /\}/) {
                        depth--
                        if (depth <= 0 && seen_open) { in_fn=0 }
                    }
                    if (in_fn && /\.blur\s*\(/) { print "yes"; exit }
                }
            ' "$ts_file" 2>/dev/null | grep -q yes; then
                blurred=true
            fi
        fi

        if [ "$blurred" = false ]; then
            warn "$html_file:$line — search-only p-dialog hosts app-book-searcher but does not blur the query field on close (need onHide/close → blurInput/.blur)" "$(surface_for "$html_file")"
        fi
    done < <(grep -nE '<app-book-searcher\b' "$html_file" 2>/dev/null)
done < <(find "$UI_DIR" -name "*.html" -print0)

# =============================================================================
# P-Keyboard.3b: Search-only popover missing blur-on-close
# =============================================================================
section "P-Keyboard.3b — Search-only popover missing blur-on-close" "P0"

while IFS= read -r -d '' html_file; do
    SCANNED_FILES["$html_file"]=1
    if [[ "$html_file" =~ \.spec\. ]]; then
        continue
    fi
    if ! grep -qE 'search-input-full' "$html_file" 2>/dev/null; then
        continue
    fi
    if ! grep -qE '<p-popover\b' "$html_file" 2>/dev/null; then
        continue
    fi

    ts_file="${html_file%.html}.ts"
    [ -f "$ts_file" ] || continue

    while IFS=: read -r line _content; do
        start=$((line - 40))
        [ "$start" -lt 1 ] && start=1
        window=$(sed -n "${start},${line}p" "$html_file" 2>/dev/null)
        if ! echo "$window" | grep -qE '<p-popover\b'; then
            continue
        fi

        on_hide=$(echo "$window" | grep -oE '\(onHide\)="[a-zA-Z_][a-zA-Z0-9_]*\(' | head -1 | sed -E 's/\(onHide\)="([a-zA-Z_][a-zA-Z0-9_]*)\(.*/\1/')

        blurred=false
        if [ -n "$on_hide" ]; then
            if awk -v fn="$on_hide" '
                $0 ~ fn "\\s*\\(" { in_fn=1; depth=0; seen_open=0 }
                in_fn {
                    if ($0 ~ /\{/) { depth++; seen_open=1 }
                    if ($0 ~ /\}/) {
                        depth--
                        if (depth <= 0 && seen_open) { in_fn=0 }
                    }
                    if (in_fn && /(blurSearchOverlayInput|blurInput|\.blur\s*\()/ ) { print "yes"; exit }
                }
            ' "$ts_file" 2>/dev/null | grep -q yes; then
                blurred=true
            fi
        fi
        if [ "$blurred" = false ] && grep -qE 'blurSearchOverlayInput\s*\(|blurInput\s*\(' "$ts_file" 2>/dev/null; then
            # Accept any blur helper in companion TS when onHide is wired
            if [ -n "$on_hide" ]; then
                blurred=true
            fi
        fi

        if [ "$blurred" = false ]; then
            warn "$html_file:$line — search-only p-popover hosts search-input-full but does not blur the query field on close (need onHide → blurSearchOverlayInput/.blur)" "$(surface_for "$html_file")"
        fi
    done < <(grep -nE 'search-input-full' "$html_file" 2>/dev/null)
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
    echo -e "  Severity: ${RED}P0=$P0_ISSUES${NC}  ${YELLOW}P1=$P1_ISSUES${NC}  ${CYAN}P2=$P2_ISSUES${NC}"
fi
echo ""
echo -e "  Ruleset: ${CYAN}.roo/rules/mobile-phone-styling.md${NC}"
echo -e "  Scanned:  ${CYAN}$UI_DIR${NC}"
echo -e "  Allowlist: ${CYAN}$ALLOWLIST_FILE${NC}"
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
    echo "**Severity totals:** P0=$P0_ISSUES · P1=$P1_ISSUES · P2=$P2_ISSUES · All=$ISSUES"
    echo ""
    echo "Surfaces: \`[dialog]\` · \`[page]\` · \`[chrome]\` · \`[other]\`"
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
                sev="${RULE_SEVERITY[$rule]:-P1}"
                echo "### $rule \`$sev\`"
                echo ""
                echo "| # | File | Line | Description |"
                echo "|---|------|------|-------------|"

                count=0
                while IFS= read -r issue; do
                    count=$((count + 1))
                    # Strip optional [surface] prefix for table parsing of path:line
                    bare="$issue"
                    if [[ "$issue" =~ ^\[(dialog|page|chrome|other)\]\ (.+)$ ]]; then
                        bare="${BASH_REMATCH[2]}"
                        surface_tag="[${BASH_REMATCH[1]}] "
                    else
                        surface_tag=""
                    fi
                    if [[ "$bare" =~ ^(.+):([0-9]+)\ —\ (.+)$ ]]; then
                        filepath="${BASH_REMATCH[1]}"
                        lineno="${BASH_REMATCH[2]}"
                        desc="${surface_tag}${BASH_REMATCH[3]}"
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
