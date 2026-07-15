# Reports Tab v2 — 4-Section Dashboard — Design Spec

**Date:** 2026-07-15
**Status:** Approved design (brainstorm complete)
**Scope:** Replace the current 11-page PDF-deck Reports tab (title/agenda/divider/content/closing, `window.print()` export) with a 4-section dashboard matching the structure of the reference `RAM_Interactive_Executive_Dashboard_v3_fixed.html`: Executive Summary, Progress Roadmap, Weekly Actions, Risks & Detail. No divider/transition pages. Export switches from `window.print()` to a "Copy as Image" button per section, reusing the existing `PP.copyElementAsImage` helper (already shipped for the S-Curve tab). Independent of the Plan-tab, Activities-CSV, and Excel-export specs written alongside this one.

## 1. Why this replaces the 11-page deck

The prior Reports overhaul (2026-07-13) targeted pixel-fidelity with a reference PDF. That target is being dropped: the PDF's structure required section-divider "transition" pages that don't map cleanly onto a live in-app dashboard, and print-based PDF export is being replaced with per-section image export (the mechanism the app used before that overhaul). The reference HTML's 4-slide structure becomes the new target — it was always the second reference material for this feature, and it maps far more naturally onto an in-app panel: KPI summary, visual timeline, action lists, risk/detail tables, no filler pages between them.

## 2. Engine: `reportsEngine.js` (full rewrite)

Existing exports (`SECTION_TITLES`, `buildTitlePageData`, `buildAgendaPageData`, `buildProgressPageData`, `buildIssuesRisksPageData`, `buildDecisionsPageData`, `buildNextStepsCalendarPageData`, `buildClosingPageData`, `buildReportPages`) are replaced entirely by four section-builders plus one assembler:

```js
function buildExecutiveSummaryData(project, calc) { /* see 2.1 */ }
function buildRoadmapData(project, calc) { /* see 2.2 */ }
function buildWeeklyActionsData(project, calc) { /* see 2.3 */ }
function buildRisksDetailData(project, calc) { /* see 2.4 */ }
function buildReportSections(project, calc) {
  return [
    { type: 'summary', data: buildExecutiveSummaryData(project, calc) },
    { type: 'roadmap', data: buildRoadmapData(project, calc) },
    { type: 'weekly', data: buildWeeklyActionsData(project, calc) },
    { type: 'risks', data: buildRisksDetailData(project, calc) },
  ];
}
```

All four builders are pure functions of `(project, calc)`, Node-tested with fixture data — same discipline as the code being replaced.

### 2.1 Executive Summary

```js
{
  ragStatus: 'On Track' | 'Watch' | 'At Risk',   // variance >= 0 -> On Track; -0.05 <= variance < 0 -> Watch; variance < -0.05 -> At Risk
  kpis: [ /* same 6 tiles as today */
    { label: 'Actual', value: '26%' }, { label: 'Planned', value: '96%' },
    { label: 'Variance', value: '-70%' }, { label: 'Delayed', value: '10' },
    { label: 'Complete', value: '2/13' }, { label: 'Deliverables', value: '1/2' },
  ],
  statusCounts: { 'Not Start': 5, 'In Progress': 2, 'Delayed': 10, 'Complete': 2, 'Blocked': 0, 'Cancelled': 0 },
}
```
`kpis` and the RAG thresholds reuse `calc.kpis` exactly as `buildProgressPageData` did — no new calculation, just reshaped output. `statusCounts` tallies every leaf task's `calc.computed.get(id).status` (all six `STATUS` values from `status.js`, zero-filled if absent so the UI never has to guess a missing key).

### 2.2 Progress Roadmap

```js
{
  rangeStart, rangeEnd,          // ISO dates: min/max plannedStart/plannedFinish across all non-cancelled leaf tasks
  statusDate,                    // project.meta.statusDate
  weeks: [ { start: '2026-07-06', end: '2026-07-12', label: 'W0' }, ... ],
  lanes: [ { id: 't_cvxd7a6d', name: 'Phase 1: Strategize' }, ... ],  // one lane per top-level (parentId: null) task, in `order`
  items: [
    { taskId, name, owner, plannedStart, plannedFinish, laneId, deliverable, isMeeting, slot },
    ...
  ],
}
```

**Lane derivation — explicit departure from the reference HTML:** the reference hardcodes six lanes (Governance/Tech/HIS/SAP/COA/SSC) matched by regex against this one project's phase names. ProjectPlanner runs multiple client projects (this RAM engagement and TCEB, at minimum) on the same codebase, so hardcoded lane names would break for every project except this one. Lanes are derived generically instead: **one lane per top-level task** (`parentId === null`), ordered by `order`. For this project that yields "Phase 1: Strategize" / "Phase 2: Discover" / "Phase 3: Design" as lanes — coarser than the reference's six, but generic and correct for any project structure.

**`isMeeting`:** `/workshop|meeting|ประชุม|สัมมนา/i.test(task.name)` — same keyword heuristic as the reference, ported to also catch the Thai equivalents already present in this project's task names (the reference's regex used Thai keywords too, garbled by a mojibake round-trip in the HTML source — this spec uses correct UTF-8 Thai instead).

**`deliverable`:** passed through from `task.deliverable` directly — this is the exact field the app already renders as a ♦ marker elsewhere; the roadmap's triangle marker is the same concept, no new data needed.

**`slot`:** greedy interval-packing within each lane, identical algorithm to `calendar.js`'s `computeCalendarLayout` segment-lane packing (sort by `plannedStart`, assign the first free stacking row whose last-placed item ends before this item starts) — same mental model, ported to operate on plannedStart/plannedFinish instead of calendar day cells. This is what lets `reports.js` place SVG rows without doing any collision logic itself.

Only leaf tasks with both `plannedStart` and `plannedFinish` set, and not cancelled, are included in `items`. A leaf task's lane is its top-level ancestor, found by walking `parentId` to the root.

### 2.3 Weekly Actions

```js
{
  completedPrior7Days: [ { name, actualFinish } ],   // leaf tasks, actualFinish in [statusDate-7d, statusDate]
  next14Days: [ { name, plannedStart } ],             // leaf tasks, plannedStart in [statusDate, statusDate+14d]
}
```
Both lists sorted by date ascending, matching the reference's "prior 7 days done / next 14 days" framing exactly — this section keeps the reference's content shape unchanged, since it was already simple and well-scoped.

### 2.4 Risks & Detail

```js
{
  delayedBlocked: [ { name, status, plannedFinish } ],           // leaf tasks with status Delayed or Blocked
  decisions: [ { title, description, decisionNeededBy, owner, status } ],  // project.decisions, all fields (reuse buildDecisionsPageData's shape)
  nearTermDetail: [ { name, owner, plannedStart, plannedFinish, status } ],  // leaf tasks, plannedStart in [statusDate, statusDate+45d], sorted by plannedStart
}
```
`decisions` replaces the reference's free-text "Decisions and support required" editable box — this app already has a real Issues/Risks/Decisions data model (shipped 2026-07-13), so the dashboard shows real decision records instead of a static note. `delayedBlocked` extends the old `delayedTasks` (Delayed-only) to also include Blocked, matching the reference's `['Delayed','Blocked'].includes(status)` filter.

## 3. UI: `reports.js` (full rewrite)

Four render functions producing one `<section class="report-section">` each, appended to `#report-panel` in order, no divider elements between them. Each section header carries a "Copy as Image" button:

```js
function sectionHeader(title, sectionEl) {
  var btn = el('button', { class: 'report-copy-btn' }, ['Copy as Image']);
  btn.addEventListener('click', function () { PP.copyElementAsImage(sectionEl); });
  return el('div', { class: 'report-section-header' }, [el('h2', {}, [title]), btn]);
}
```
(exact wiring detail — the plan can adjust the helper's shape as long as every section gets its own working Copy-as-Image button scoped to that section's own element, not the whole panel)

- **Executive Summary section:** RAG badge (colored pill: green/amber/red for On Track/Watch/At Risk), the existing 6-tile KPI grid (unchanged styling from the current shipped version), a status-count bar chart or table underneath (implementer's call on bar-vs-table, whichever renders cleanly with plain CSS/SVG — no charting library).
- **Progress Roadmap section:** SVG swimlane timeline. Fixed pixel layout constants analogous to the reference (`LW` = lane-label column width, `HH` = header row height, `RH` = row height per lane), week-column vertical gridlines with week labels, one row per lane with the lane name in a colored label cell on the left, task items rendered as chevron polygons positioned by `week range × lane × slot`, colored by rule: `isMeeting` → `#7c4dff` (this app's existing Workshop-purple, see `layout.css`'s `.calendar-chip-Workshop`), `deliverable` → red triangle marker instead of a chevron (reference used `#c00000`, kept as-is — this one color is a direct visual borrow, not reinvented), otherwise `var(--kpmg-blue-light)`. A vertical status-date line (`var(--status-delayed)` or a dedicated red, implementer's call) marks `statusDate` across all lanes. Hovering an item shows a tooltip with name/owner/dates/status — reuse the existing lightweight tooltip pattern already used by the Gantt chart and Activities calendar (a shared `#scurve-tooltip`-style element, not a new mechanism).
- **Weekly Actions section:** two-column layout, "Completed (last 7 days)" list and "Next 14 Days" list — same visual pattern as the current Progress page's KPI-tile-plus-list sections (bulleted lists, `report-empty-note` styling when empty).
- **Risks & Detail section:** delayed/blocked list, decisions table (reusing the existing `buildTable` helper and column set from the old `renderDecisionsPage`), near-term detail table (Task/Owner/Start/Finish/Status columns, reusing `buildTable`).

**Visual language:** keep this app's already-established KPMG palette (`--kpmg-blue: #00338D`, `--kpmg-blue-mid: #005EB8`, `--kpmg-blue-light: #0091DA`, pink accent `#E5007E`) for headings, borders, and tables — do not adopt the reference HTML's separate palette (`--b:#00338d` is close but its pink `#f72b91` and background `#eaf0f8` differ from what's already shipped elsewhere in this Reports tab). Sections get natural height (no fixed `1280×720` page box) since they're no longer paginated print pages — `overflow: visible`, sized to content, matching how the pre-overhaul Reports tab and the current S-Curve tab both already behave.

**Craft bar ("Jonny Ive" ask):** consistent spacing rhythm across all 4 sections (same heading/subheading/body padding scale already used on the Executive Summary page today), the RAG badge and status-count visualization should read at a glance without a legend, the roadmap's week gridlines and status-date line should be crisp 1px hairlines not blurry sub-pixel strokes, and every interactive element (Copy as Image buttons, roadmap item hover) gets a visible hover/focus state consistent with the rest of the app's button styling (`transition: background 150ms ease`, already the app-wide convention).

## 4. Export mechanism change

- Remove `#export-pdf-button` from `index.html`'s `#reports-toolbar` and its `window.print()` wiring in `reports.js`.
- Remove `src/css/print.css`'s page-break rules for `.report-page` (renamed/restructured to `.report-section`, which is never paginated) — the file can keep the app-chrome-hiding selectors in case a future "print the whole panel" need returns, but the per-page pagination rules no longer apply to anything.
- Each section's "Copy as Image" button calls `PP.copyElementAsImage(sectionEl)` exactly as the S-Curve tab's existing "Copy as Image" button already does — no new rasterization code.

## 5. Testing

- `tests/reportsEngine.test.js`: full rewrite. Fixture project needs multiple top-level phases (to test lane derivation), tasks spanning meeting/workshop keywords (isMeeting), a mix of deliverable/non-deliverable tasks, tasks in each status bucket, tasks inside/outside the 7-day-prior and 14-day-next windows, and enough overlapping date ranges within one lane to exercise the slot-packing algorithm (at least 3 overlapping items needing 3 stacked slots). Cover: `buildExecutiveSummaryData`'s RAG thresholds at the boundary (variance exactly 0, exactly -0.05), `buildRoadmapData`'s lane assignment for deeply nested tasks (a leaf 4 levels below its top-level ancestor), `buildWeeklyActionsData`'s date-window edges, `buildRisksDetailData`'s Delayed+Blocked combination, `buildReportSections`'s 4-element output shape and type order.
- UI (`reports.js`): no Node coverage (UI file, existing convention) — controller-run Playwright checks: all 4 sections render with real seeded data, each section's Copy-as-Image button produces a clipboard image without console errors, roadmap tooltip appears on hover, RAG badge shows the correct color for the seeded project's actual variance, zero regressions to every other tab.

## 6. Out of Scope

- Any change to the live S-Curve tab, Activities tab, or Plan tab (separate specs, or already shipped).
- A full slide-carousel/tabbed navigation UI matching the reference HTML's prev/next slide chrome — sections render as a single scrollable stack (matching how every other multi-part tab in this app already works), not a paginated carousel. This can be revisited later if requested.
- Recomputing or changing any KPI formula — `calc.kpis` and `calc.scurve` are unchanged; this spec only reshapes how existing calculated values are presented.
