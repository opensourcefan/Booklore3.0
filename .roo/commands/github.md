---
description: "GitHub Repository Maintenance — Audit dependabot alerts, CodeQL code scanning, PRs, CI failures, releases, tags, branch hygiene, and safety protocol status. Generate a dark-themed HTML report on ~/Desktop."
argument-hint: "[full|alerts|code-scanning|prs|ci|releases|branches|alerts-prs-ci|all] — which area to audit; default 'full'"
---

## Preamble

- READ: .roo/rules/preferences.md, .roo/rules/confidence.md, .roo/rules/no-mode-switch.md
- Code changes MUST be derived from code EVIDENCE ONLY.
- Do NOT push unless explicitly instructed.
- Do NOT use docker-compose.yml or make changes to it.
- Report goes to ~/Desktop as `<Date>-<Task_Name>.html` with dark background.
- **Core Safety Principle: No update is better than a bad update.** When in doubt, flag for manual review rather than auto-merging.

## Safety Verification (Run Before Data Gathering)

Before auditing, verify the repo's safety controls are intact. This confirms the defense-in-depth posture is operational.

```bash
gh api repos/opensourcefan/fable --jq '{security_and_analysis: .security_and_analysis}'
```

Expected baseline (flag any deviation):

| Control | Expected | If Missing |
|---------|----------|------------|
| `dependabot_security_updates.status` | `enabled` | P0 — no automated vuln fixes |
| `secret_scanning.status` | `enabled` | P0 — no secret leak detection |
| `secret_scanning_push_protection.status` | `enabled` | P0 — secrets can be pushed |
| `secret_scanning_non_provider_patterns.status` | `disabled` | OK — custom patterns not configured |
| `secret_scanning_validity_checks.status` | `disabled` | P3 — consider enabling for stronger validation |

Also verify the dependabot auto-merge safety layers by reading [`.github/workflows/dependabot-auto-merge.yml`](.github/workflows/dependabot-auto-merge.yml):
- **Patch-only auto-merge** (line 47): Only `version-update:semver-patch` is auto-merged
- **High-risk package override** (line 73): Hibernate ORM and Spring Boot bumps force manual review even for patch versions — these framework-level packages can introduce subtle runtime regressions not caught by unit tests
- **7-day quarantine** (line 98): Packages < 7 days old are blocked from auto-merge
- **Workflow file block** (line 55): Any `.github/workflows/` change forces manual review
- **Fail-safe quarantine** (line 150): If publish date can't be verified for a supported ecosystem, quarantine activates

These five layers together ensure: **No update is better than a bad update.**

## 0. Questions First (Mandatory — But Only What You Cannot Resolve)

**Before any work begins**, review the scope and the actions listed in Step 6. Identify every decision that requires user input. Ask ALL questions upfront in a single batch using `ask_followup_question`. Group related decisions together.

**CRITICAL: Only ask about things you CANNOT resolve autonomously.** Step 6 now includes investigation actions (6d–6g). Before asking the user about a finding, you MUST first exhaust all autonomous investigation paths. If you can determine the answer yourself (e.g., checking dependabot config for why a PR is missing, reading source code to assess a CodeQL alert), do that FIRST — do not ask the user to do your job.

Questions to consider (only after exhausting autonomous investigation):
- Scope: If the user didn't specify a scope argument, ask: "Full audit or a specific area (alerts, prs, ci, releases, branches, alerts-prs-ci)?"
- For any PRs labeled `dependabot:manual-review` that you've investigated and believe should be merged: "PR #X is policy-blocked (major version bump). I've verified all checks pass and reviewed the changelog. Should I merge?"
- For any draft releases older than 7 days: "Publish or delete draft release [tag]?"
- For any non-dependabot PRs that are candidates for closing: "Close PR #X?"
- Any other finding where you've exhausted all autonomous options and are blocked by policy (not capability)

**If there are zero questions needed**, state: "No questions — proceeding with autonomous audit." and continue to Step 1.

**If there are questions**, ask them all at once. Wait for the user's answers before proceeding to Step 1. Once all questions are resolved, state: "All questions resolved — proceeding with autonomous audit."

## 1. Determine Scope

The user may specify a scope argument: `full`, `alerts`, `prs`, `ci`, `releases`, `branches`, or `all` (same as full). If no argument is given, default to `full`.

| Scope | What to audit |
|-------|---------------|
| `alerts` | Dependabot security alerts only |
| `code-scanning` | CodeQL code scanning alerts only |
| `prs` | Open dependabot PRs + their CI status + closed-unmerged PRs |
| `ci` | Failed workflow runs + their failure logs |
| `releases` | Releases (published + drafts) + tag sequence gaps |
| `branches` | Stale dependabot remote branches |
| `alerts-prs-ci` | Dependabot alerts + CodeQL alerts + open PRs + CI failures (common combo) |
| `full` / `all` | Everything above + repo config + open issues + safety verification |

## 2. Verify Authentication

Before anything else, verify `gh` is authenticated:
```bash
gh auth status 2>&1
```
If not logged in or token lacks `repo`/`workflow` scopes, report the issue and stop.

## 3. Gather Data (Run in Parallel Where Possible)

Run ALL queries below that match the requested scope. Launch independent queries simultaneously.

### 3a. Security Alerts (scope: alerts, full)
```bash
gh api repos/opensourcefan/fable/dependabot/alerts --paginate \
  --jq '[.[] | select(.state == "open")] | sort_by(.security_advisory.severity) | reverse | .[] | {number, severity: .security_advisory.severity, package: .security_vulnerability.package.name, ecosystem: .security_vulnerability.package.ecosystem, created: .created_at, summary: .security_advisory.summary[:120]}'
```
Also get fixed count for context:
```bash
gh api repos/opensourcefan/fable/dependabot/alerts --paginate \
  --jq '[.[] | select(.state == "fixed")] | length'
```

### 3b. Open Dependabot PRs (scope: prs, full)
```bash
gh pr list --repo opensourcefan/fable --author app/dependabot --state open --limit 30 \
  --json number,title,createdAt,labels,headRefName,statusCheckRollup \
  --jq '.[] | {number, title, created: .createdAt, labels: [.labels[].name], branch: .headRefName, checks: [.statusCheckRollup[]? | {name: .name, conclusion: .conclusion}]}'
```

### 3c. Closed-Unmerged PRs (scope: prs, full)
```bash
gh pr list --repo opensourcefan/fable --state closed --limit 30 \
  --json number,title,mergedAt,closedAt,labels \
  --jq '.[] | select(.mergedAt == null) | {number, title, closed: .closedAt, labels: [.labels[].name]}'
```

### 3d. Failed Workflow Runs (scope: ci, full)
```bash
gh run list --repo opensourcefan/fable --limit 30 --json databaseId,name,status,conclusion,headBranch,createdAt,event \
  --jq '.[] | select(.conclusion == "failure") | {id: .databaseId, name, branch: .headBranch, created: .createdAt, event}'
```

### 3e. Failure Logs for Each Failed Run (scope: ci, full)
For EACH failed run from 3d, get the failure log:
```bash
gh run view RUN_ID --repo opensourcefan/fable --log-failed 2>&1 | tail -80
```
Extract the root error message (e.g., `npm ERESOLVE`, compilation error, test failure). Do NOT dump the full log — extract only the actionable error lines.

### 3f. Releases & Tags (scope: releases, full)
```bash
gh api repos/opensourcefan/fable/releases --jq '.[] | {tag: .tag_name, name, draft, prerelease, published: .published_at}'
```
```bash
git ls-remote --tags origin | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -V | tail -20
```
Check for gaps:
```bash
git ls-remote --tags origin | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -t. -k1,1n -k2,2n -k3,3n | awk -F. 'NR>1 && $1==p1 && $2==p2 && $3>p3+1 {for(i=p3+1;i<$3;i++) print "MISSING: v"p1"."p2"."i} {p1=$1;p2=$2;p3=$3}'
```

### 3g. Stale Dependabot Branches (scope: branches, full)
```bash
gh api repos/opensourcefan/fable/branches --paginate \
  --jq '[.[] | select(.name | test("dependabot"))] | .[] | {name, commit: .commit.sha[:7]}'
```
Cross-reference each branch with its PR state:
- If the branch name contains a PR number pattern, check `gh pr view <number> --json state --jq '.state'`
- Flag branches whose PRs are CLOSED or MERGED as "ready to delete"

### 3h. Repo Config (scope: full only)
```bash
gh api repos/opensourcefan/fable --jq '{default_branch, visibility, archived, has_issues, has_wiki, has_projects, has_pages, allow_merge_commit, allow_squash_merge, allow_rebase_merge, delete_branch_on_merge}'
```

### 3i. Open Issues (scope: full only)
```bash
gh issue list --repo opensourcefan/fable --state open --limit 30 \
  --json number,title,labels,createdAt \
  --jq '.[] | {number, title, labels: [.labels[].name], created: .createdAt}'
```

### 3j. Code Scanning Alerts (scope: code-scanning, full)
```bash
gh api repos/opensourcefan/fable/code-scanning/alerts --paginate \
  --jq '[.[] | select(.state == "open")] | group_by(.rule.security_severity_level) | map({security_severity: .[0].rule.security_severity_level, count: length})'
```
Then get breakdown by rule:
```bash
gh api repos/opensourcefan/fable/code-scanning/alerts --paginate \
  --jq '[.[] | select(.state == "open")] | group_by(.rule.id) | map({rule: .[0].rule.id, severity: .[0].rule.severity, security_severity: .[0].rule.security_severity_level, count: length, description: .[0].rule.description[:100]}) | sort_by(-.count)'
```
And top affected files:
```bash
gh api repos/opensourcefan/fable/code-scanning/alerts --paginate \
  --jq '[.[] | select(.state == "open")] | group_by(.most_recent_instance.location.path) | map({path: .[0].most_recent_instance.location.path, count: length, severities: [.[].rule.security_severity_level] | unique}) | sort_by(-.count) | .[:10]'
```

## 4. Analyze Findings

After gathering all data, analyze and categorize:

### Safety Controls
- Verify all expected controls match baseline (from Safety Verification section)
- Flag any disabled control that should be enabled

### Security Alerts (Dependabot)
- Group by severity (CRITICAL > HIGH > MEDIUM > LOW)
- Group by package — multiple alerts on the same package indicate a cluster
- Identify which alerts have corresponding open dependabot PRs
- Flag alerts older than 7 days with no PR as "unaddressed"

### Code Scanning Alerts (CodeQL)
- Group by security_severity (critical > high > medium > low)
- Group by rule — identify the most prevalent vulnerability classes
- Identify top affected files — files with the most alerts
- Flag any critical-severity alerts in authentication/authorization code paths as P0
- Note: CodeQL alerts are static analysis findings, not runtime vulnerabilities. They represent potential weaknesses that should be reviewed.

### Dependabot PRs
- Categorize each PR:
  - **Failed CI**: PRs where any check conclusion is FAILURE
  - **Pending**: PRs with no failed checks but not yet merged
  - **Automerge-stuck**: PRs labeled `dependabot:automerge` open > 3 days
  - **Manual review needed**: PRs labeled `dependabot:manual-review`
- For failed PRs, identify the root cause from the failure log
- Determine if any failed PRs are superseded by a grouped PR (e.g., individual @angular/core bump vs angular-framework group)

### CI Failures
- Identify patterns: same branch prefix, same error type, same workflow
- Determine if failures are on `develop`/`master` (critical) or on dependabot branches (routine)

### Releases
- Flag draft releases older than 7 days
- Flag missing tags in semver sequence
- Verify latest tag matches latest release

### Branches
- Flag branches whose PRs are CLOSED (orphaned — delete)
- Flag branches whose PRs are MERGED but branch still exists (should have been auto-deleted if `delete_branch_on_merge` is enabled)

## 5. Prioritize Action Items

Assign priority to each finding:

| Priority | Criteria |
|----------|----------|
| **P0** | CRITICAL/HIGH dependabot alert with no PR, CI failure on develop/master, safety control disabled, or critical-severity CodeQL alert in auth/security code |
| **P1** | HIGH/MEDIUM dependabot alert with open PR that needs review, stuck automerge PR, or high-severity CodeQL alerts in core service files |
| **P2** | LOW dependabot alerts, medium-severity CodeQL alerts, draft releases, missing tags, orphaned branches |
| **P3** | Low-severity CodeQL alerts, repo config anomalies, open issues with no activity |

## 6. Take Autonomous Actions (Exhaust Before Asking)

You MUST exhaust all autonomous actions below before asking the user for help. The principle is: **if you can do it, do it. If policy blocks you, provide exact CLI instructions in the report.**

### 6a. Close Failed Dependabot PRs That Are Superseded
If a dependabot PR has failed CI and there is a newer grouped PR that covers the same packages, close it:
```bash
gh pr close PR_NUMBER --repo opensourcefan/fable \
  --comment "Closing: CI failed due to [reason]. Superseded by grouped PR #[NEWER_PR]."
```

### 6b. Delete Orphaned Dependabot Branches
If a dependabot branch's PR is CLOSED (not merged), delete the branch:
```bash
gh api repos/opensourcefan/fable/git/refs/heads/BRANCH_NAME -X DELETE
```

### 6c. Enable Auto-Merge on Reviewed Patch PRs
If a PR is labeled `dependabot:automerge` and has been open > 3 days with all checks passing, enable auto-merge:
```bash
gh pr merge PR_NUMBER --repo opensourcefan/fable --auto --squash
```

### 6d. Close Automerge PRs That Are Conflicting (Dependabot Will Rebase)
If a PR is labeled `dependabot:automerge` but has merge conflicts (mergeable=CONFLICTING, mergeStateStatus=DIRTY), close it with an explanation. Dependabot will automatically rebase and reopen:
```bash
gh pr close PR_NUMBER --repo opensourcefan/fable \
  --comment "Closing: Merge conflict with [other PR / base branch]. Dependabot will rebase and reopen automatically. [Optional: Merge PR #X first to clear the conflict path.]"
```

### 6e. Investigate Uncovered Alerts (No PR Exists)
When a dependabot alert has no corresponding PR, investigate WHY before flagging it:
1. Read `.github/dependabot.yml` — check if the package ecosystem is configured, check grouping patterns
2. Check if the package is a **direct** or **transitive** dependency:
   - For npm: `grep '"package-name"' fable-ui/package.json` — if not found, it's transitive
   - For pip: check `docker/*/requirements.txt` files
3. If transitive: document that dependabot doesn't open PRs for transitive deps, identify which direct dependency pulls it in, and note which group PR would resolve it
4. If direct but no PR: check if the package is in an `ignore` list in dependabot config, or if the open-PR limit has been reached
5. **Downgrade priority accordingly** — a transitive dep alert is P2 at most, not P0

### 6f. Audit CodeQL Alerts for False Positives
When CodeQL flags critical/high alerts, read the source files to assess exploitability:
1. For SSRF (`java/ssrf`): Check if the URL is hardcoded or user-controlled. If the base URL is a `static final String` constant and user input only goes into query params via `UriComponentsBuilder.queryParam()`, it's a **false positive** — document and recommend dismissal.
2. For CSRF (`java/spring-disabled-csrf-protection`): If the project uses stateless JWT auth (not cookie-based sessions), CSRF is not applicable — **intentional, not actionable**.
3. For path-injection: Check if the path is constructed from user-controlled input or internal data. Internal service paths are not exploitable.
4. **Document findings in the report** with source line references and clear reasoning.

### 6g. Investigate CI Failure Root Causes Beyond Logs
When a PR has failed CI and the log shows `npm ERESOLVE` or similar dependency errors:
1. Read the PR description to see what packages are being bumped
2. Check `fable-ui/package.json` for peer dependency constraints on related packages
3. Identify the likely conflicting package (e.g., `@analogjs/vite-plugin-angular` may not support the new Angular major version)
4. **Provide specific investigation instructions** in the report (e.g., "Run `npm install` locally on this branch to identify the exact conflicting package")

### Actions That REQUIRE User Approval (Ask First — But Provide Instructions)
- Merging any PR that is NOT labeled `dependabot:automerge` → **Provide the exact CLI command in the report**
- Publishing a draft release → **Provide the exact CLI command**
- Deleting a draft release → **Provide the exact CLI command**
- Closing a PR that is NOT a dependabot PR → **Provide the exact CLI command**
- Pushing any code or tags
- Any database operation

**For policy-blocked actions, always include the exact CLI command the user needs to run in the HTML report's action items table.**

## 7. Generate HTML Report

Write the report to `~/Desktop/<YYYY-MM-DD>-Fable_Repo_Maintenance.html`.

### Report Structure (CRITICAL — Follow This Exact Order)

The report MUST be structured so the user can see what needs their attention in the first 5 seconds. Do NOT bury action items at the bottom.

#### 7a. HEADER: Title, subtitle, generation timestamp

#### 7b. WHAT STILL NEEDS YOUR ATTENTION (Red-bordered summary box — ALWAYS FIRST)
This is the most important section. It appears BEFORE any detail sections. Use a prominent red-bordered box containing:
- **Numbered list** of every item that still needs user action
- Each item has a **colored count badge**: red `needs-you` for policy-blocked merges, yellow `investigate` for things needing investigation
- **Exact CLI command** for each actionable item, formatted as a `<code>` block with green monospace styling (`.cmd` class)
- **Clear explanation** of what's blocking it (policy? investigation needed? dependency chain?)
- **Low priority / backlog** items separated at the bottom in muted text
- Items ordered by: merges first (highest impact), then investigations, then reviews

Example structure:
```html
<div class="summary-box" style="border-color: var(--danger);">
  <h3 style="color: var(--danger);">⚠ What Still Needs Your Attention</h3>
  <p style="color: var(--text-muted);">Everything the AI could do autonomously has been done...</p>
  
  <div class="action-needed">
    <strong><span class="count-badge needs-you">1</span> MERGE NOW — PR #X: [title]</strong><br>
    <span style="color: var(--text-muted);">[explanation of what this resolves and what's blocking it]</span><br>
    <strong>Run this command:</strong> <span class="cmd">gh pr merge X --repo opensourcefan/fable --squash</span>
  </div>
  ... (more items)
</div>
```

#### 7c. ALREADY HANDLED (Green-bordered summary box — SECOND)
Immediately after the "needs attention" box, show what was already done:
- **Autonomous actions taken** (PRs closed, branches deleted, automerge enabled)
- **Investigations completed** (false positives identified, root causes analyzed, transitive deps traced)
- Each item in a green-bordered `.action-taken` or blue-bordered `.investigation` div

#### 7d. STAT CARDS (Summary grid)
Grid of stat cards: open alerts, open CodeQL alerts, open PRs, failed CI runs, fixed alerts, autonomous actions taken.

#### 7e. DETAIL SECTIONS (Only after the summary boxes)
Each detail section follows. Every table MUST include a **resolution/action column** so the user never has to cross-reference:

1. **Safety Controls Status** (always included)
2. **Dependabot Security Alerts** — table MUST have a "Resolution" column showing exactly what action resolves each alert (e.g., "MERGE #146", "FIX #136", "MONITOR", "AWAITING #136")
   - Also include a **Package Clusters & Resolution Path** sub-table with a "What Needs To Happen" column
3. **CodeQL Code Scanning Alerts** — by-severity table MUST have an "Actionable?" column; by-rule table MUST have an "Assessment" column marking false positives and intentional findings
4. **Open Dependabot PRs** — table MUST have a "What To Do" column with the exact CLI command or investigation instruction
   - Include a "Closed During This Audit" sub-table
5. **Failed Workflow Runs** — table with root cause extracted; note which PRs are already closed
6. **Closed-Unmerged PRs** — with branch deletion status
7. **Investigation Details** (if any investigations were performed) — one subsection per investigation with source references
8. *(Releases & Tags, Branch Hygiene, Repo Config, Open Issues — only if in scope)*

### Styling Requirements
- Dark background (#0d1117 GitHub-style)
- Color-coded badges: CRITICAL=darkred, HIGH=red, MEDIUM=yellow, LOW=gray, FAILED=red, PASSING=green, AUTOMERGE=green, MANUAL=yellow, FALSE_POSITIVE=green, DONE=green, NEEDS_YOU=red, INVESTIGATE=yellow
- **CLI commands** MUST be styled as `<span class="cmd">command</span>` with green monospace on dark background — they must visually pop
- **Count badges** for the summary boxes: `.count-badge.needs-you` (red), `.count-badge.investigate` (yellow), `.count-badge.done` (green)
- Clickable PR links to `https://github.com/opensourcefan/fable/pull/<number>`
- Footer with generation timestamp, scope, safety posture summary, and counts of autonomous actions + investigations + remaining items

### CSS Classes Reference
Include these CSS classes in every report:
- `.summary-box` — the bordered container for "Needs Attention" and "Already Handled"
- `.action-needed` — red-bordered item in the needs-attention box
- `.action-investigate` — yellow-bordered item for investigation-needed items
- `.action-taken` — green-bordered item for completed autonomous actions
- `.investigation` — blue-bordered item for completed investigations
- `.cmd` — green monospace CLI command styling
- `.count-badge` + `.count-badge.needs-you` / `.count-badge.investigate` / `.count-badge.done`
- `.badge-needs-you` / `.badge-investigate` / `.badge-done` / `.badge-false-positive` — for table cells

## 8. Output Summary to User

After the report is written, present a concise summary:
- Top 3-5 critical findings
- Actions you already took autonomously (if any) — include investigations completed
- Actions that need user approval — **include the exact CLI command for each**
- Path to the HTML report
- **Confirm that all autonomous actions were exhausted before any user ask**

## 9. Efficiency Rules

- **Parallel queries**: Launch all independent `gh` API calls simultaneously in step 3
- **Extract, don't dump**: When viewing failure logs, extract only the root error lines — do not output full logs
- **One report per invocation**: Always generate the HTML report, even for scoped audits
- **No repeated queries**: If data was already gathered in a previous step, reuse it — don't re-query
- **Use --jq filters**: Always filter API output with `--jq` to minimize data transfer

## 10. Known Patterns & Institutional Knowledge

These are patterns observed in this repo. Apply them during analysis:

| Pattern | Recognition | Action |
|---------|-------------|--------|
| **Angular major mismatch** | `@angular/build` bumped to v22 while `@angular/compiler` stays v21 → `npm ERESOLVE` | Close the individual PR; the `angular-framework` group PR should handle the coordinated bump |
| **Pillow vulnerability cluster** | Multiple pillow alerts in `docker/ai-search` | Point to the pillow bump PR; if it passes CI, recommend merge (may be policy-blocked as major version bump — provide CLI command) |
| **Automerge stuck** | PR labeled `dependabot:automerge` open > 3 days | Check if quarantine hold is active or if required status checks are pending |
| **Automerge merge conflict** | PR labeled `dependabot:automerge` with mergeStateStatus=DIRTY | Close it; dependabot will rebase and reopen. If conflict is with another dependabot PR, close the newer one and note which PR to merge first. |
| **Draft release accumulation** | Draft releases older than 7 days | Flag for publish or delete |
| **Tag sequence gaps** | Missing patch numbers in semver sequence | Investigate if a master pipeline run failed silently at that tag |
| **Default branch is develop** | `default_branch: "develop"` | This is intentional for this project. Do NOT suggest changing it. |
| **CodeQL CSRF warnings** | `java/spring-disabled-csrf-protection` alerts in SecurityConfig | These are intentional — the project uses stateless JWT auth, not cookie-based sessions. CSRF protection is not applicable. Do NOT flag these as actionable. |
| **CodeQL path-injection** | `java/path-injection` alerts in file/metadata services | These are static analysis warnings about file path construction. Review each one for actual user-controlled input before flagging. Many are internal service paths, not exploitable. |
| **CodeQL SSRF** | `java/ssrf` alerts in metadata parsers | **Read the source file before flagging.** If the base URL is a hardcoded constant and user input is confined to query params via `UriComponentsBuilder.queryParam()`, it's a false positive — document and recommend dismissal. Only flag if user input controls the host/path. |
| **Transitive dependency alerts** | Dependabot alert for a package not in `package.json` (e.g., esbuild) | Check if it's a transitive dep. Dependabot only opens PRs for direct dependencies. Identify which direct dep pulls it in and which group PR would resolve it. Downgrade to P2. |
| **npm ERESOLVE on group PR** | Angular framework group PR fails with peer dependency errors | Check if `@analogjs/vite-plugin-angular` (or similar peer dep holder) supports the new Angular major version. The group bump itself is correct — the blocker is a non-Angular package with restrictive peer deps. |
| **Hibernate/Spring Boot dependabot PR** | PR titled "bump the hibernate-orm group" or "bump the spring-boot group" — labeled `dependabot:manual-review` even for patch bumps | These are framework-level packages that can introduce subtle runtime regressions not caught by unit tests (e.g., Hibernate 7.4.1 changed `FetchMode.SUBSELECT` + `EntityGraph` interaction, breaking comic metadata writes). **Before recommending merge:** (1) Read the upstream changelog for the exact version, (2) Check if the project uses any affected Hibernate features (`@Fetch(FetchMode.SUBSELECT)`, `@EntityGraph`, `Hibernate.initialize()`), (3) Verify CI passes, (4) If uncertain, flag as "investigate" and recommend the user test comic metadata writes after merge. |
