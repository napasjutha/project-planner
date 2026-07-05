# ProjectPlanner.html — Single-File Project Planning Application

**Date:** 2026-07-05
**Status:** Approved design (brainstorm complete)
**Source of business rules:** `SDS_Salesforce_Ph2_Project_Detail_Plan_VF3.0.xlsx`, sheet `SFDC_Detailed plan (V4.0)` and companions

## 1. Purpose

Build a self-contained, single-file HTML project planning application usable for **any new project** brought to the team — implementation projects, PMO/governance tracking, change-management programs — at any scale or timeline, from a two-week sprint to a multi-year program. The file is shared via OneDrive/shared drive; anyone opens it in a browser and continues working. No installation, no Excel, no server, no external dependencies.

The SDS Salesforce Phase 2 Excel workbook (`SDS_Salesforce_Ph2_Project_Detail_Plan_VF3.0.xlsx`) is the **reference example only** — it demonstrates the calculation rules (WBS roll-ups, weights, planned-vs-actual progress, holiday-aware durations, dynamic status, S-curve) the app must get right, and its real rows are reused as **test fixtures** to verify the calculation engine against known-correct numbers. Nothing about the app is specific to SDS or Salesforce: phase names, task counts, WBS depth, and holiday lists are all just data the user enters per project, never hardcoded.

The app must cover every function the workbook demonstrates (WBS, roll-ups, weights, planned-vs-actual progress, holiday-aware durations, dynamic status, Gantt, S-curve, weekly snapshots, dashboard) and go beyond it (interactive Gantt, dependencies, filters, dashboard charts, snapshot comparison, PowerPoint-ready reports, audit log, undo/redo, themes).

No Excel import/export. Every project starts from a blank WBS the user builds out; the Excel serves as the specification for business rules and as a test fixture only, never as shipped default content.

## 2. Decisions Log

| Question | Decision |
|---|---|
| Persistence | Self-saving HTML: Save button downloads updated copy of the file with data embedded; user replaces the OneDrive copy. localStorage auto-save protects unsaved work. |
| Excel role | Guideline only. No import/export of .xlsx. |
| Scope | Full vision in V1 (parity + Gantt drag, dependencies, reports, filters, themes). |
| Dependencies | Zero external libraries. Hand-built SVG charts/Gantt, custom tree grid. |
| Snapshots | Full deep-copy of plan state per snapshot; supports weekly consulting report deltas. |
| Users | Simple name picker (no auth). Drives "my tasks" filter and audit log attribution. |
| Theme | KPMG style (white, KPMG blue #00338D / #005EB8 / #0091DA), dark-mode toggle secondary. |
| Reports | Slide-shaped (16:9) report panels with one-click Copy-as-Image (PNG) and Copy-as-Table (HTML) to clipboard for PowerPoint. Print CSS as PDF fallback. |
| Build | `src/` modules + build script producing single `dist/ProjectPlanner.html`. |
| S-curve | Recomputed in the same recalc pass as everything else — always live. |
| UX direction | Ive-inspired restraint (see §9). |

## 3. Architecture

### 3.1 Development layout

```
project-planner/
├── build.py                  # inliner: src → dist/ProjectPlanner.html
├── src/
│   ├── index.html            # shell + embedded seed data block
│   ├── css/
│   │   ├── theme.css         # KPMG light + dark variables
│   │   ├── layout.css        # app chrome, grid, views
│   │   └── print.css         # report print styles
│   └── js/
│       ├── store.js          # data model, persistence, undo/redo, audit
│       ├── schedule.js       # NETWORKDAYS port, holidays, date math
│       ├── calc.js           # weights, planned %, rollups, recalc()
│       ├── status.js         # status derivation + overrides
│       ├── deps.js           # FS dependency forward pass
│       ├── snapshot.js       # take/list/compare snapshots
│       ├── ui/
│       │   ├── app.js        # boot, tabs, header, KPI cards, name picker
│       │   ├── tree.js       # WBS tree grid, inline edit, context menu
│       │   ├── gantt.js      # SVG Gantt, drag/resize, zoom
│       │   ├── scurve.js     # SVG S-curve, tooltip, snapshot overlay
│       │   ├── dashboard.js  # donut/bars/tables
│       │   ├── snapshots.js  # snapshot view + comparison
│       │   ├── reports.js    # report panels + clipboard copy
│       │   ├── holidays.js   # holiday management page
│       │   └── settings.js   # PIC list, theme, audit viewer
│       └── util.js           # dates, dom helpers, clipboard, canvas render
├── tests/                    # Node-run unit tests for pure engines
└── dist/ProjectPlanner.html  # the single shippable artifact
```

Engines (`store`, `schedule`, `calc`, `status`, `deps`, `snapshot`) are pure ES6 classes with no DOM access, so they run under Node for tests. UI modules render from computed state.

`build.py` reads `src/index.html`, inlines every CSS and JS file in declared order into `<style>` / `<script>` blocks, and writes `dist/ProjectPlanner.html`. No minification required; a smoke test verifies the output parses and boots.

### 3.2 Runtime structure of the shipped file

```
ProjectPlanner.html
├── <style>                              all CSS
├── <script type="application/json"
│           id="project-data">           embedded project database
└── <script>                             all engines + UI
```

### 3.3 Save model

1. Every edit → `recalc()` → serialize project → `localStorage` (keyed by project id). Instant crash protection.
2. **Save button**: clone `document.documentElement`, replace the `#project-data` block content with current JSON (revision counter +1, `savedBy` = picked name, `savedAt` = now), serialize to string, trigger download of `ProjectPlanner.html`. User replaces the OneDrive copy.
3. On open: if localStorage holds the same project id with a **higher revision** than the embedded block, offer "Restore unsaved work from <time>?".
4. Header shows a dirty dot (`● unsaved changes`) whenever in-memory state differs from last download; `beforeunload` warns.
5. Save validation: before offering the download, re-parse the serialized JSON and run `recalc()` on it; abort with an error message if it fails to round-trip.

**Concurrency:** last save wins (same as Excel on a shared drive). Mitigations: header shows "last saved by X at T"; the save dialog reminds the user to confirm they started from the latest file. No merge in V1.

## 4. Data Model

### 4.1 Project root

```json
{
  "meta": { "id": "uuid", "name": "New Project", "statusDate": "2026-07-05",
            "revision": 42, "savedBy": "Peem", "savedAt": "ISO", "createdAt": "ISO" },
  "tasks": [ Task ],
  "holidays": [ { "date": "2026-01-01", "label": "New Year" } ],
  "picList": [ "KPMG_BA", "KPMG_Dev", "SDS_IT" ],
  "snapshots": [ Snapshot ],
  "auditLog": [ { "when": "ISO", "who": "Peem", "taskId": "t_042",
                  "field": "actualPct", "old": 0.4, "new": 0.5 } ],
  "settings": { "theme": "kpmg-light", "ganttZoom": "week" }
}
```

### 4.2 Task

```json
{
  "id": "t_042", "parentId": "t_035", "order": 12,
  "name": "Build Field Service flow",
  "pic": "KPMG_Dev", "deliverable": "", "jira": "SFDC-123", "remarks": "",
  "plannedStart": "2026-10-01", "plannedFinish": "2026-10-15",
  "actualStart": null, "actualFinish": null,
  "actualPct": 0.5,
  "weightOverride": null,
  "milestone": false,
  "statusOverride": null,
  "predecessors": ["t_038"],
  "collapsed": false
}
```

- `tasks` is a flat array; hierarchy via `parentId` + `order`. WBS numbers (`1`, `1.1`, `3.2.4`) derived at render time — never stored, so restructure is free.
- Unlimited depth. Leaf tasks hold planning data. Parents' dates/%/weight are **always computed** (mirrors Excel where phase rows are formulas).
- `statusOverride`: `null | "Blocked" | "Cancelled"` — manual states Excel expressed informally.
- `predecessors`: finish-to-start links, leaf-to-leaf only.

## 5. Calculation Engine

Single `recalc()` pass after any mutation: leaf computations → bottom-up rollups → KPIs → S-curve series. All views re-render from the computed state. O(n); instant at 200–2,000 tasks.

### 5.1 Working days (`schedule.js`)

`networkdays(start, end, holidays)` — inclusive count of Mon–Fri excluding the holiday list. Port of Excel `NETWORKDAYS`, verified against a truth table generated from the workbook. Also: `addWorkdays(date, n, holidays)` for Gantt drag and dependency shifting, `remainingWorkdays(statusDate, projectFinish)` for the KPI card.

Holiday list managed in the dedicated Holidays view (§6.7); ships empty by default. A "Load Thailand preset" button offers the public-holiday list sourced from the reference workbook (2024, extendable to 2025–2026) as a one-click starting point — fully editable/removable, never assumed.

### 5.2 Per-leaf computed values (Excel column ↔ rule)

| Excel | Rule |
|---|---|
| I (Duration) | `networkdays(plannedStart, plannedFinish, holidays)`; empty start → "assign start date" state |
| J (Weight) | default `duration / Σ(all leaf durations)`; if `weightOverride` set, overridden tasks keep their value and remaining auto tasks renormalize so total = 100% (shown in UI) |
| K (% Plan to date) | `clamp(networkdays(plannedStart, statusDate) / duration, 0, 1)`; `1` when `statusDate ≥ plannedFinish`; `0` before start |
| L (Status) | `Complete` if actualPct = 1 → else `Not Start` if statusDate < plannedStart → else `In Progress` if within window → else `Delayed` (past finish, < 100%). `statusOverride` (Blocked/Cancelled) wins. Cancelled tasks drop out of weight/rollup math. |
| M (% Actual) | user-entered `actualPct` (0–100%) |

**Status Date** is a header-level control (Excel `C2`): changing it re-derives all planned-% and statuses live. Defaults to today on open; can be pinned for reporting.

### 5.3 Rollups

For each parent, over non-cancelled descendants:
- `plannedPct` and `actualPct` = Σ(leaf weight × leaf pct) / Σ(leaf weight)  *(weighted — improvement over the Excel's unweighted AVERAGE at summary level, which disagreed with its own weighting scheme; flagged in UI docs)*
- dates = min(child starts) / max(child finishes); duration = networkdays over that span
- weight = Σ(child weights)
- status = same derivation rule as §5.2 row L, applied to the rolled-up dates/actualPct (parents get a real status, not blank as in the workbook)
- Overall = rollup of root nodes. KPIs derive from Overall + status counts.

These three rollup rules (weighted %, computed parent status, live S-curve) are the finalized, enhanced calculation engine — confirmed correct and not to be reverted to the workbook's unweighted/blank/snapshot-only behavior.

### 5.4 S-curve series — finalized rule

Weekly buckets (7-day steps) from Overall planned start to `max(Overall planned finish, statusDate)`. For each bucket date `d`:
- **Planned cumulative** = Σ over non-cancelled leaves of `weight × plannedPctToDate(leaf, d)` — same formula as §5.2 row K, evaluated at `d` instead of the global status date. Exact, not an approximation.
- **Actual cumulative** = Σ over non-cancelled leaves of `weight × actualProgressAt(leaf, d)`, where `actualProgressAt(leaf, d) = 0` if `d < actualStart` (or no `actualStart` recorded), else `leaf.actualPct` (the task's current recorded actual %, flat-extrapolated backward from `actualStart`). This intentionally does not fabricate a smooth historical ramp — actual progress before now is only known precisely at snapshot dates (§6.6); the live curve is deliberately honest about that limit. Comparing the live curve against a snapshot's stored curve (S-Curve view overlay) is how real week-by-week history is shown.

This is simpler and more honest than the workbook's SUMIFS approach (which also only approximates historical actual % via the manually-maintained weekly snapshot sheets) — same limitation, cleaner implementation. Recomputed inside `recalc()` → S-curve is always real-time on every edit.

### 5.5 Dependencies (`deps.js`)

Finish-to-start only. When a task's dates move (edit or Gantt drag), successors whose start < predecessor finish + 1 workday are pushed forward (`addWorkdays`), recursively. Cycle prevention on link creation. Arrows drawn in Gantt. No critical path, no lag/lead in V1.

## 6. UI

### 6.1 Chrome

```
┌──────────────────────────────────────────────────────────────┐
│ KPMG mark · Project name · Status date picker · [Save] ●     │
├──────────────────────────────────────────────────────────────┤
│ KPI cards: Actual % | Plan % | Variance | Delayed | Complete │
│           | Milestones x/y | Remaining working days          │
├──────────────────────────────────────────────────────────────┤
│ Tabs: Plan │ Gantt │ S-Curve │ Dashboard │ Snapshots │ Reports │ ⚙ (Holidays·Settings)│
└──────────────────────────────────────────────────────────────┘
```

First open: name picker (choose or add name from `picList`); remembered in localStorage.

### 6.2 Plan view (WBS tree grid)

- Columns: WBS #, Task, PIC, Deliverable, Jira, P-Start, P-Finish, Duration, Weight, % Plan, % Actual, Status, A-Start, A-Finish, Remarks.
- Collapse arrows per parent (VS Code explorer pattern); collapse state persisted.
- Inline edit: double-click cell → editor (text, date picker, % stepper, PIC dropdown), Enter commits, Esc cancels.
- Context menu: New Task / New Child / Duplicate / Delete / Move Up / Move Down / Indent / Outdent / Toggle Milestone / Set Blocked / Add Dependency.
- Keyboard: arrows navigate, Tab/Shift-Tab indent/outdent, Ctrl+Z / Ctrl+Shift+Z undo/redo.
- Toolbar: search-as-you-type (name/remarks/jira) + filters: PIC, phase, status, date range, "only delayed", "only mine". Filters compose; tree shows matching tasks with their ancestor chain.

### 6.3 Gantt view (SVG)

- Rows mirror the tree (respect collapse + filters). Time axis zoom: day / week / month / quarter.
- Planned bar (KPMG blue); actual progress fill (green; red segment when delayed); parent bars as brackets; milestones as diamonds; dependency arrows.
- Today line + status-date line; weekend/holiday shading.
- Drag bar body = move both dates (snapped to workdays); drag right edge = resize. Drop → task update → `recalc()` → all views update, successors shift.

### 6.4 S-Curve view (SVG)

Planned vs actual cumulative curves, weekly points. Hover: date, plan %, actual %, gap. Optional overlay of any snapshot's curve for week-over-week narrative. Zoom week/month/quarter. Copy-as-image button.

### 6.5 Dashboard view

Status donut, progress-by-phase horizontal bars (plan vs actual), workload by PIC, next-14-days milestone list, top delayed tasks table (with remarks). All SVG, all recomputed live.

### 6.6 Snapshots view

"Take Snapshot" → deep copy of `tasks` + meta + computed KPIs + S-curve series, stamped with date/taker/note. List with delete. Select two → comparison: overall/phase progress deltas, tasks that slipped (finish moved out), newly added/removed tasks, status changes. Feeds the Weekly Status Report automatically (current vs latest snapshot).

### 6.7 Holidays view

Dedicated management page (reachable from Settings and from any duration cell's "…" affordance):

- Table of holidays: date, label (Thai/English), weekday shown, sorted chronologically, grouped by year.
- Add single holiday (date picker + label), edit inline, delete with confirm.
- Bulk paste: paste rows of `date<TAB>label` (e.g. from the SDS HR sheet) → parsed and merged, duplicates skipped with notice.
- Year calendar strip: 12 mini-months highlighting weekends (gray) and holidays (KPMG blue) so gaps are visible at a glance.
- Impact awareness: banner shows "N tasks span this date" when adding/removing a holiday; any change triggers full `recalc()` — durations, weights, plan-%, S-curve all update live.
- Empty by default; "Load Thailand preset" populates the 2024 SDS public-holiday list (extendable to 2025–2026) as an optional, fully editable starting point.

### 6.8 Settings

PIC list editor, theme toggle (KPMG light / dark), project rename, audit log viewer, link to Holidays view, "reset local cache".

## 7. Reports (PowerPoint-ready)

Three templates rendered as fixed 16:9 panels (1280×720 logical px), KPMG-styled:

1. **Weekly Status Report** — status date, plan vs actual + variance, S-curve thumbnail, phase progress table, milestones done this week / due next week, delayed items with remarks, delta vs latest snapshot ("progress this week +4.2%").
2. **Executive Dashboard** — KPI cards, RAG per phase, S-curve, top risks/blocked items.
3. **Management Summary** — full phase table + condensed Gantt strip.

Per panel:
- **Copy as Image**: serialize panel (SVG/HTML → canvas at 2× scale) → PNG `ClipboardItem`. Pastes into PowerPoint as a crisp picture.
- **Copy as Table** (table sections): write `text/html` + `text/plain` clipboard flavors → pastes as native editable PowerPoint/Excel table.
- Where supported, both flavors on one clipboard write so the pasting app picks its best format.
- `print.css` gives clean Print → Save-as-PDF output as fallback.

## 8. Error Handling & Resilience

- Corrupt embedded JSON on open → attempt localStorage recovery → else show raw-data download + "start blank" choice. Never a white screen.
- Save round-trip validation (§3.3) before any download.
- Destructive actions (delete task with children, delete snapshot, reset) require confirm.
- Undo/redo stack (50 steps) over all mutations.
- `beforeunload` guard when dirty.
- Audit log capped at 2,000 entries; oldest pruned.

## 9. Design Principles (Ive-inspired)

- **One thing on screen at a time.** Tabs, not panels-everywhere. Each view owns the canvas.
- **Chrome recedes, content leads.** Thin header, hairline rules, no boxes-within-boxes; data tables are the interface.
- **Restraint in color.** Near-monochrome surface; KPMG blue reserved for structure and interaction; status colors (green/orange/red) appear only on status itself — never decoratively.
- **Motion explains.** 150–200 ms eases on collapse, tab change, bar drag; no gratuitous animation.
- **Type does the hierarchy.** 2 weights, 4 sizes, generous line-height; no icon soup — text labels first, icons only where universal (▸, ⋮, ⌄).
- **Direct manipulation.** Edit where the data lives (inline cells, draggable bars), no modal forms unless creating something new.
- **Materials honesty.** It's a document that computes — it should feel precise and instant, not skeuomorphic or "app-cosplay".

## 10. Testing

- **Unit (Node):** `networkdays`/`addWorkdays` vs Excel-derived truth table incl. Thai holidays; weight normalization incl. overrides & cancelled tasks; planned-% clamp cases; status matrix (all branches + overrides); rollup math on a fixture tree; S-curve points vs hand-computed fixture; dependency forward pass incl. chains and cycle rejection; snapshot diff.
- **Integration:** build script output parses; boots in headless browser; blank starter template renders; edit → recalc → KPI change; save produces valid self-containing HTML that re-opens with identical state. Excel-derived rows used only as fixtures verifying engine correctness (§10 Unit), never as shipped content.
- **Manual checklist:** clipboard copy into PowerPoint/Excel, print output, dark mode, Safari + Chrome + Edge.

## 11. Build Order (implementation phases)

1. **Foundation** — build script, data model, store, schedule engine, calc engine + tests.
2. **Plan view** — tree grid, inline edit, context menu, undo, filters, search, KPI header, save/load cycle.
3. **Gantt** — SVG timeline, zoom, drag/resize, dependencies.
4. **Analytics** — S-curve, dashboard, snapshots + comparison.
5. **Reports & polish** — report panels, clipboard copy, print CSS, themes, settings, audit log, blank starter template + "New Project" flow, cross-browser pass.

Each phase ends with the single-file artifact building and opening cleanly.

## 12. Out of Scope (V1)

Real multi-user merge/conflict resolution, server sync, authentication, critical-path analysis, resource leveling, lag/lead on dependencies, Excel import/export, SharePoint API integration, AI suggestions.
