# Reports Overhaul & PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Reports tab's current Weekly/Executive/Summary template system with a fixed 11-page biweekly status-deck (title, agenda, 4× divider+content section pairs, closing), styled per the reference dashboard's KPMG blue/pink visual language, exportable as a real multi-page PDF via the browser's native print dialog (`window.print()`).

**Architecture:** Task 1 adds a new pure engine file, `src/js/reportsEngine.js`, exporting page-assembly/data-mapping functions — given a `project` (and, for the progress page, a `calc` from `PP.recalc`), it decides exactly which tasks/issues/risks/decisions/months land on which of the 11 pages. This is Node-tested against concrete fixture data, with zero DOM dependency. Task 2 fully rewrites `src/js/ui/reports.js` to build all 11 `.report-page` DOM sections from Task 1's functions (plus `PP.computeCalendarLayout` for the Next-Steps calendar page, reused directly — not reimplemented), removes the old template-select/Copy-as-Image/Copy-as-Table UI (which doesn't fit a fixed 11-page deck), and adds the visual-language CSS. Task 3 rewrites `src/css/print.css` so each `.report-page` gets `page-break-after: always` and wires an "Export PDF" button to `window.print()`. Task 4 is controller-run Playwright verification.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies, Python 3 stdlib-only build script.

## Global Constraints

- Zero external dependencies, runtime or dev — ever. No npm packages, no CDN, no bundler.
- Engines (`src/js/*.js`): UMD-lite wrapper — `module.exports` for Node, attach to `globalThis.PP` for browser. Pure logic, no DOM, Node-tested. `src/js/ui/*.js` files: plain IIFEs, no UMD, never required by Node tests, no jsdom — verified only via real-browser Playwright checks.
- Any user-controlled string (task name, remarks, issue/risk/decision title/description/owner/mitigation, activity name) reaching the DOM must be escaped or built via `.textContent`/`createTextNode`/`createElement` property assignment — never concatenated into `innerHTML`. This plan's UI file builds every page node via a small `el(tag, attrs, children)` helper that always uses `createElement`/`createTextNode`, matching the pattern the current `reports.js` already uses — no raw-string `innerHTML` concatenation of any dynamic content is introduced anywhere. The only `innerHTML` write anywhere in this plan is `panel.innerHTML = ''` (clearing, not concatenating), identical to the codebase's existing convention in `reports.js`/`issues.js`/`holidays.js`.
- **This plan depends on the Issues/Risks/Decisions tab plan AND the Activities calendar tab plan both being merged to main first. Do not execute this plan's tasks until both have merged — verify by grepping for `project.issues`/`computeCalendarLayout` in the current `src/` before starting:**
  ```bash
  cd project-planner
  grep -rn "computeCalendarLayout" src/js/calendar.js
  grep -n "this.issues" src/js/store.js
  ```
  Both must produce a match. If either is empty, stop — those plans haven't merged yet.
- **This is the last plan in the dependency graph — it has no plans depending on it.**
- **Exact data contract from the Issues/Risks/Decisions tab plan (reference, do not invent an alternate shape):**
  ```js
  project.issues = [{ id, title, description, owner, status /* 'Open'|'Resolved' */, dateRaised, dateResolved }]
  project.risks = [{ id, title, description, likelihood /* 'Low'|'Medium'|'High' */, impact /* 'Low'|'Medium'|'High' */,
    mitigation, owner, status /* 'Open'|'Mitigated'|'Closed' */, dateRaised }]
  project.decisions = [{ id, title, description, decisionNeededBy /* date */, owner,
    status /* 'Pending'|'Decided' */, decisionMade, dateDecided }]
  ```
- **Exact engine contract from the Activities calendar tab plan (reference, do not invent an alternate signature):**
  ```js
  computeCalendarLayout(year, month, activities)
  // year: four-digit number. month: 0-based (0=Jan..11=Dec).
  // activities: project.activities array, each { id, type: 'Meeting'|'Workshop', name, dateStart, dateEnd, timeStart, timeEnd, groupIds, keyDate, remarks }
  // Returns: { year, month, weeks, segments }
  //   weeks: array of week rows, each { days: [cell|null x5] } (Mon..Fri). cell = { date, dayOfMonth, keyDate } or null for out-of-month padding.
  //   segments: flat array, one per (activity x week-row it touches): { activity, weekIndex, startCol, endCol, lane }
  ```
  Also available: `project.activityGroups = [{ id, name, color }]`.
- **Page-by-page mapping (copied verbatim from the design spec §2 — the binding requirement this whole plan implements):**

  | # | Page | Content source |
  |---|---|---|
  | 1 | Title | Project name, "Progress Meeting", current status date (all already available via `project.meta`) |
  | 2 | Agenda | Static 4-item list, generated from the four section titles below (not user-editable data, just a fixed template page) |
  | 3 | Divider "01 ผลการดำเนินงาน" | Static divider (title only) |
  | 4 | ผลการดำเนินงาน content | Reuses the existing Executive Summary report content already in `reports.js` (KPI tiles: Actual/Planned/Variance/Delayed/Complete/Milestones→Deliverables, plus the delayed-task list) |
  | 5 | Divider "02 ประเด็นปัญหาและความเสี่ยง" | Static divider |
  | 6 | Issues & Risks content | `project.issues` and `project.risks`, rendered as two short tables |
  | 7 | Divider "03 ประเด็นเพื่อหารือ" | Static divider |
  | 8 | Decisions content | `project.decisions`, rendered as a table |
  | 9 | Divider "04 การดำเนินการลำดับถัดไป" | Static divider |
  | 10 | Next Steps calendar | The Activities tab's calendar-layout function, rendered for the current + next month |
  | 11 | Closing | Simple "Thank you" / project name footer — no KPMG-specific legal/contact boilerplate |

- **PDF export mechanism (spec §3, binding):** each report page is a `<section class="report-page">` in the DOM; a `@media print` stylesheet gives each one `page-break-after: always` and hides all app chrome (sidebar, toolbar, tab bar); the "Export PDF" button calls `window.print()` — the browser's native print dialog (with "Save as PDF") produces the multi-page PDF. This must extend the existing `@media print` rules already proven in `src/css/print.css` for the rest of the app (currently scoped to the old single `#report-panel`), not duplicate a second `@media print` block elsewhere or conflict with it — `print.css` remains the only file in this codebase containing an `@media print` block.
- **Out of scope (spec §5):** KPMG-specific legal/contact/social-media boilerplate on the closing page; any interactivity in the exported PDF (it's a static print artifact); any change to the Issues/Risks/Decisions or Activities tabs' own data model or UI — this plan only consumes what those two plans produce, read-only.
- Removing the old Weekly/Executive/Summary template system (`#report-template-select`, `#report-copy-image-button`, `#report-copy-table-button`, and `reports.js`'s `renderWeeklyReport`/`renderExecutiveReport`/`renderSummaryReport`/`copyPanelAsImage`/`copyPanelAsTable`) is in scope and intentional: the spec directs a full replacement of the Reports tab's content with one fixed deck, and a per-template Copy-as-Image/Copy-as-Table UX doesn't fit an 11-page deck. `window.print()` is the sole export mechanism per spec §3.
- Testing: the page-assembly/data-mapping logic (which tasks/issues/risks/decisions/months appear on which page) is pure functions in `src/js/reportsEngine.js`, Node-tested directly against fixture data covering all 4 content pages. The UI rewrite (`src/js/ui/reports.js`) and the print stylesheet have no automated test coverage (UI/CSS, no jsdom) — verified only via Task 4's controller-run Playwright checks.
- `python3 build.py`; register `reportsEngine.js` in `build.py`'s `JS_ORDER`, among the top-level engines (not the `ui/*` group), before `ui/imagecopy.js`.
- No code comments except where genuinely non-obvious.
- Baseline: **verify via `cd project-planner && node --test` at execution start — this will be the combined total after both the Issues/Risks/Decisions plan and the Activities calendar plan have merged. Do not assume a specific number; the two source plans each computed a +23 delta off their own independently-stated 174 anchor (174→197), so the true combined baseline once both have merged is expected to be in the neighborhood of 220 — but re-verify with a real `node --test` run before trusting any count in this plan.** All step-by-step counts below are expressed relative to that freshly-verified number, using 220 as the concrete illustrative anchor.

---

### Task 1: Page-assembly engine (`src/js/reportsEngine.js`)

**Files:**
- Create: `project-planner/src/js/reportsEngine.js`
- Create: `project-planner/tests/reportsEngine.test.js`

**Interfaces:**
- Consumes: `project.issues`/`project.risks`/`project.decisions` (exact shape above), `project.meta.name`/`project.meta.statusDate`, `project.tasks`, and `PP.recalc(project)`'s return shape `{ computed, order, children, wbs, overall, kpis, scurve }` (existing `calc.js`, unchanged — `calc` is passed in by the caller, this file does not call `recalc` itself and has no dependency on `calc.js`).
- Produces, all attached to `PP` in the browser / exported via `module.exports` in Node:
  - `SECTION_TITLES` — array of exactly 4 strings: `['01 ผลการดำเนินงาน', '02 ประเด็นปัญหาและความเสี่ยง', '03 ประเด็นเพื่อหารือ', '04 การดำเนินการลำดับถัดไป']`.
  - `buildTitlePageData(project)` → `{ projectName, subtitle: 'Progress Meeting', statusDate }`.
  - `buildAgendaPageData()` → `{ items: SECTION_TITLES }` (a copy).
  - `buildProgressPageData(project, calc)` → `{ kpis: [{label, value}, ...6 entries...], delayedTasks: [{name, plannedFinish, remarks}, ...] }`.
  - `buildIssuesRisksPageData(project)` → `{ issues: [...], risks: [...] }`, full field pass-through per the contract above.
  - `buildDecisionsPageData(project)` → `{ decisions: [...] }`, full field pass-through except `dateDecided` (not a displayed field, matching the Issues/Risks/Decisions tab's own displayed-column convention).
  - `buildNextStepsCalendarPageData(project)` → `{ months: [{year, month}, {year, month}] }` — the current and next calendar month derived from `project.meta.statusDate`, rolling the year over at December. Does **not** call `computeCalendarLayout` itself (that call happens in Task 2's UI layer, which has direct access to `project.activities`); this function only decides *which* two months are in scope.
  - `buildClosingPageData(project)` → `{ projectName }`.
  - `buildReportPages(project, calc)` → ordered array of exactly 11 `{ type, data }` descriptors, `type` ∈ `'title'|'agenda'|'divider'|'progress'|'issuesRisks'|'decisions'|'calendar'|'closing'`, in the exact spec §2 order. Divider descriptors carry `data: { title }` where `title` is one of `SECTION_TITLES`, in order.
- Task 2 depends on every one of these exact names/signatures.

- [ ] **Step 1: Write the failing tests**

Create `project-planner/tests/reportsEngine.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const {
  SECTION_TITLES,
  buildTitlePageData,
  buildAgendaPageData,
  buildProgressPageData,
  buildIssuesRisksPageData,
  buildDecisionsPageData,
  buildNextStepsCalendarPageData,
  buildClosingPageData,
  buildReportPages,
} = require('../src/js/reportsEngine.js');

function fixtureProject(overrides) {
  return Object.assign({
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '' },
      { id: 't2', parentId: null, order: 1, name: 'Build Phase', plannedStart: '2026-06-11', plannedFinish: '2026-06-20', actualStart: '2026-06-11', actualFinish: null, owner: 'Bob', remarks: 'Waiting on vendor' },
    ],
    holidays: [],
    issues: [
      { id: 'i1', title: 'Server outage', description: 'Prod outage in Bangkok region', owner: 'Somchai', status: 'Open', dateRaised: '2026-07-01', dateResolved: null },
    ],
    risks: [
      { id: 'r1', title: 'Vendor delay', description: 'Vendor missed a milestone', likelihood: 'High', impact: 'Medium', mitigation: 'Add backup vendor', owner: 'Bob', status: 'Open', dateRaised: '2026-07-01' },
    ],
    decisions: [
      { id: 'd1', title: 'Choose cloud provider', description: 'Pick primary hosting provider', decisionNeededBy: '2026-08-01', owner: 'Alice', status: 'Pending', decisionMade: '', dateDecided: null },
    ],
    activities: [
      { id: 'a1', type: 'Meeting', name: 'Steering Review', dateStart: '2026-07-09', dateEnd: '2026-07-09', timeStart: '14:30', timeEnd: '15:30', groupIds: [], keyDate: true, remarks: '' },
      { id: 'a2', type: 'Workshop', name: 'Discovery Workshop', dateStart: '2026-07-27', dateEnd: '2026-08-03', timeStart: null, timeEnd: null, groupIds: [], keyDate: false, remarks: '' },
    ],
  }, overrides);
}

test('SECTION_TITLES has exactly 4 titles matching the reference PDF structure', () => {
  assert.equal(SECTION_TITLES.length, 4);
  assert.equal(SECTION_TITLES[0], '01 ผลการดำเนินงาน');
  assert.equal(SECTION_TITLES[1], '02 ประเด็นปัญหาและความเสี่ยง');
  assert.equal(SECTION_TITLES[2], '03 ประเด็นเพื่อหารือ');
  assert.equal(SECTION_TITLES[3], '04 การดำเนินการลำดับถัดไป');
});

test('buildTitlePageData pulls project name, fixed subtitle, and status date from project.meta', () => {
  const data = buildTitlePageData(fixtureProject());
  assert.deepEqual(data, { projectName: 'RAM Modernization', subtitle: 'Progress Meeting', statusDate: '2026-07-09' });
});

test('buildAgendaPageData returns the four section titles as agenda items, in order', () => {
  const data = buildAgendaPageData();
  assert.deepEqual(data.items, SECTION_TITLES);
});

test('buildClosingPageData carries the project name only', () => {
  assert.deepEqual(buildClosingPageData(fixtureProject()), { projectName: 'RAM Modernization' });
});

test('buildProgressPageData produces 6 KPI tiles (Actual/Planned/Variance/Delayed/Complete/Deliverables) matching calc.kpis, and lists exactly the delayed leaf task', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);

  const pct = x => Math.round(x * 100) + '%';
  assert.deepEqual(data.kpis, [
    { label: 'Actual', value: pct(calc.kpis.actualPct) },
    { label: 'Planned', value: pct(calc.kpis.plannedPct) },
    { label: 'Variance', value: pct(calc.kpis.variance) },
    { label: 'Delayed', value: String(calc.kpis.delayedCount) },
    { label: 'Complete', value: calc.kpis.completeCount + '/' + calc.kpis.totalCount },
    { label: 'Deliverables', value: calc.kpis.deliverablesComplete + '/' + calc.kpis.deliverablesTotal },
  ]);

  assert.equal(data.delayedTasks.length, 1);
  assert.deepEqual(data.delayedTasks[0], { name: 'Build Phase', plannedFinish: '2026-06-20', remarks: 'Waiting on vendor' });
});

test('buildProgressPageData returns an empty delayedTasks array when nothing is delayed', () => {
  const project = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '' },
    ],
  });
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);
  assert.deepEqual(data.delayedTasks, []);
});

test('buildIssuesRisksPageData passes through project.issues and project.risks with the full field set', () => {
  const project = fixtureProject();
  const data = buildIssuesRisksPageData(project);
  assert.deepEqual(data.issues, [
    { id: 'i1', title: 'Server outage', description: 'Prod outage in Bangkok region', owner: 'Somchai', status: 'Open', dateRaised: '2026-07-01', dateResolved: null },
  ]);
  assert.deepEqual(data.risks, [
    { id: 'r1', title: 'Vendor delay', description: 'Vendor missed a milestone', likelihood: 'High', impact: 'Medium', mitigation: 'Add backup vendor', owner: 'Bob', status: 'Open', dateRaised: '2026-07-01' },
  ]);
});

test('buildIssuesRisksPageData returns empty arrays when the project has none', () => {
  const data = buildIssuesRisksPageData(fixtureProject({ issues: [], risks: [] }));
  assert.deepEqual(data.issues, []);
  assert.deepEqual(data.risks, []);
});

test('buildDecisionsPageData passes through project.decisions, excluding dateDecided (not a displayed field)', () => {
  const project = fixtureProject();
  const data = buildDecisionsPageData(project);
  assert.deepEqual(data.decisions, [
    { id: 'd1', title: 'Choose cloud provider', description: 'Pick primary hosting provider', decisionNeededBy: '2026-08-01', owner: 'Alice', status: 'Pending', decisionMade: '' },
  ]);
});

test('buildNextStepsCalendarPageData resolves the current and next calendar month from meta.statusDate', () => {
  const data = buildNextStepsCalendarPageData(fixtureProject());
  assert.deepEqual(data.months, [{ year: 2026, month: 6 }, { year: 2026, month: 7 }]);
});

test('buildNextStepsCalendarPageData rolls the year over when the status date is in December', () => {
  const project = fixtureProject({ meta: { name: 'RAM Modernization', statusDate: '2026-12-05' } });
  const data = buildNextStepsCalendarPageData(project);
  assert.deepEqual(data.months, [{ year: 2026, month: 11 }, { year: 2027, month: 0 }]);
});

test('buildReportPages assembles all 11 pages in the exact spec order with matching divider titles', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const pages = buildReportPages(project, calc);

  assert.equal(pages.length, 11);
  assert.deepEqual(pages.map(p => p.type), [
    'title', 'agenda', 'divider', 'progress', 'divider', 'issuesRisks',
    'divider', 'decisions', 'divider', 'calendar', 'closing',
  ]);

  const dividerTitles = pages.filter(p => p.type === 'divider').map(p => p.data.title);
  assert.deepEqual(dividerTitles, SECTION_TITLES);

  assert.equal(pages[0].data.projectName, 'RAM Modernization');
  assert.equal(pages[10].data.projectName, 'RAM Modernization');
  assert.equal(pages[5].data.issues.length, 1);
  assert.equal(pages[5].data.risks.length, 1);
  assert.equal(pages[7].data.decisions.length, 1);
  assert.deepEqual(pages[9].data.months, [{ year: 2026, month: 6 }, { year: 2026, month: 7 }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `Cannot find module '../src/js/reportsEngine.js'`, since the file doesn't exist yet.

- [ ] **Step 3: Implement `reportsEngine.js`**

Create `project-planner/src/js/reportsEngine.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  var SECTION_TITLES = [
    '01 ผลการดำเนินงาน',
    '02 ประเด็นปัญหาและความเสี่ยง',
    '03 ประเด็นเพื่อหารือ',
    '04 การดำเนินการลำดับถัดไป',
  ];

  function pct(x) { return Math.round(x * 100) + '%'; }

  function buildTitlePageData(project) {
    return {
      projectName: project.meta.name,
      subtitle: 'Progress Meeting',
      statusDate: project.meta.statusDate,
    };
  }

  function buildAgendaPageData() {
    return { items: SECTION_TITLES.slice() };
  }

  function buildProgressPageData(project, calc) {
    var kpis = calc.kpis;
    var tiles = [
      { label: 'Actual', value: pct(kpis.actualPct) },
      { label: 'Planned', value: pct(kpis.plannedPct) },
      { label: 'Variance', value: pct(kpis.variance) },
      { label: 'Delayed', value: String(kpis.delayedCount) },
      { label: 'Complete', value: kpis.completeCount + '/' + kpis.totalCount },
      { label: 'Deliverables', value: kpis.deliverablesComplete + '/' + kpis.deliverablesTotal },
    ];

    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));
    var delayedTasks = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var c = calc.computed.get(id);
      if (c.status !== 'Delayed') return;
      var task = byId.get(id);
      delayedTasks.push({ name: task.name, plannedFinish: c.plannedFinish, remarks: task.remarks || '' });
    });

    return { kpis: tiles, delayedTasks: delayedTasks };
  }

  function buildIssuesRisksPageData(project) {
    return {
      issues: project.issues.map(function (i) {
        return { id: i.id, title: i.title, description: i.description, owner: i.owner, status: i.status, dateRaised: i.dateRaised, dateResolved: i.dateResolved };
      }),
      risks: project.risks.map(function (r) {
        return { id: r.id, title: r.title, description: r.description, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation, owner: r.owner, status: r.status, dateRaised: r.dateRaised };
      }),
    };
  }

  function buildDecisionsPageData(project) {
    return {
      decisions: project.decisions.map(function (d) {
        return { id: d.id, title: d.title, description: d.description, decisionNeededBy: d.decisionNeededBy, owner: d.owner, status: d.status, decisionMade: d.decisionMade };
      }),
    };
  }

  function monthsFromStatusDate(statusDate) {
    var year = Number(statusDate.slice(0, 4));
    var month = Number(statusDate.slice(5, 7)) - 1;
    var nextYear = year;
    var nextMonth = month + 1;
    if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
    return [{ year: year, month: month }, { year: nextYear, month: nextMonth }];
  }

  function buildNextStepsCalendarPageData(project) {
    return { months: monthsFromStatusDate(project.meta.statusDate) };
  }

  function buildClosingPageData(project) {
    return { projectName: project.meta.name };
  }

  function buildReportPages(project, calc) {
    return [
      { type: 'title', data: buildTitlePageData(project) },
      { type: 'agenda', data: buildAgendaPageData() },
      { type: 'divider', data: { title: SECTION_TITLES[0] } },
      { type: 'progress', data: buildProgressPageData(project, calc) },
      { type: 'divider', data: { title: SECTION_TITLES[1] } },
      { type: 'issuesRisks', data: buildIssuesRisksPageData(project) },
      { type: 'divider', data: { title: SECTION_TITLES[2] } },
      { type: 'decisions', data: buildDecisionsPageData(project) },
      { type: 'divider', data: { title: SECTION_TITLES[3] } },
      { type: 'calendar', data: buildNextStepsCalendarPageData(project) },
      { type: 'closing', data: buildClosingPageData(project) },
    ];
  }

  return {
    SECTION_TITLES: SECTION_TITLES,
    buildTitlePageData: buildTitlePageData,
    buildAgendaPageData: buildAgendaPageData,
    buildProgressPageData: buildProgressPageData,
    buildIssuesRisksPageData: buildIssuesRisksPageData,
    buildDecisionsPageData: buildDecisionsPageData,
    buildNextStepsCalendarPageData: buildNextStepsCalendarPageData,
    buildClosingPageData: buildClosingPageData,
    buildReportPages: buildReportPages,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 232/232 total (220 verified baseline + 12 new tests in this task). If the verified baseline from the Global Constraints step differed from 220, use `<verified baseline> + 12` instead.

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/reportsEngine.js tests/reportsEngine.test.js
git commit -m "Add reportsEngine.js: pure page-assembly/data-mapping functions for the 11-page report deck"
```

---

### Task 2: Reports tab UI rewrite — 11-page DOM deck

**Files:**
- Modify: `project-planner/build.py`
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/js/ui/reports.js` (full rewrite)

**Interfaces:**
- Consumes: Task 1's `PP.SECTION_TITLES`, `PP.buildReportPages(project, calc)` (and the individual `buildXPageData` functions indirectly through it); `PP.computeCalendarLayout(year, month, activities)` (Activities calendar plan, exact contract in Global Constraints); `state.project.activities`/`state.project.activityGroups` (Activities calendar plan); `state.project`/`state.calc` (existing `state` shape, unchanged).
- Produces: a rewritten `PP.renderReport(state)` (same exported name, now building 11 `.report-page` sections) and a new one-argument `PP.wireReports(state)` stub (replacing the old two-argument `wireReports(state, onTemplateChanged)` — there is no longer a template to change). Task 3 depends on this exact new one-argument signature to add the Export PDF button listener inside it.
- No automated tests (UI file) — verified via Task 4's controller-run Playwright checks. This task's own "done" signal is `node --check`, `python3 build.py`, and `node --test` all passing with the Task 1 count unchanged (this task touches no engine/logic files).

- [ ] **Step 1: Register `reportsEngine.js` in `build.py`**

In `project-planner/build.py`, change:
```python
    "criticalpath.js",
    "workload.js",
    "ui/imagecopy.js",
```
to:
```python
    "criticalpath.js",
    "workload.js",
    "reportsEngine.js",
    "ui/imagecopy.js",
```

- [ ] **Step 2: Replace the Reports tab's toolbar/panel markup in `index.html`**

In `project-planner/src/index.html`, change:
```html
  <div id="reports-view" hidden>
    <div id="reports-toolbar">
      <select id="report-template-select">
        <option value="weekly">Weekly Status Report</option>
        <option value="executive">Executive Dashboard</option>
        <option value="summary">Management Summary</option>
      </select>
      <button id="report-copy-image-button">Copy as Image</button>
      <button id="report-copy-table-button">Copy as Table</button>
    </div>
    <div id="report-panel-wrap">
      <div id="report-panel"></div>
    </div>
  </div>
```
to:
```html
  <div id="reports-view" hidden>
    <div id="reports-toolbar"></div>
    <div id="report-panel-wrap">
      <div id="report-panel"></div>
    </div>
  </div>
```

(The `#reports-toolbar` div is intentionally empty until Task 3 adds the "Export PDF" button — this keeps this task's own change self-consistent: no button references a function this task doesn't wire.)

- [ ] **Step 3: Simplify the `wireReports` call site in `app.js`**

In `project-planner/src/js/ui/app.js`, change:
```js
    PP.wireReports(state, function () { PP.renderReport(state); });
```
to:
```js
    PP.wireReports(state);
```

- [ ] **Step 4: Replace the reports CSS block in `layout.css`**

In `project-planner/src/css/layout.css`, change:
```css
#reports-view { flex: 1; overflow: auto; padding: 12px 20px; }
#reports-toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
#reports-toolbar select, #reports-toolbar button {
  padding: 7px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  transition: background 150ms ease;
}
#report-copy-image-button, #report-copy-table-button { background: var(--kpmg-blue); color: #fff; border: none; }
#report-copy-image-button:hover, #report-copy-table-button:hover { background: var(--kpmg-blue-mid); }
#report-panel-wrap { overflow: auto; }
#report-panel { width: 1280px; min-height: 720px; background: #ffffff; color: #1d1d1f; padding: 40px; box-sizing: border-box; }
.report-panel-inner h1 { font-size: 28px; font-weight: 500; color: #00338D; margin: 0 0 8px 0; }
.report-panel-inner h2 { font-size: 20px; margin: 20px 0 10px 0; color: #005EB8; }
.report-meta { font-size: 15px; color: #6e6e73; margin-bottom: 6px; }
.report-kpi-row { display: flex; gap: 20px; margin: 16px 0; }
.report-kpi { background: #f7f7f8; border-radius: var(--radius-lg); padding: 12px 20px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.report-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
.report-table th, .report-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5ea; }
.report-list { font-size: 14px; padding-left: 20px; margin: 8px 0; }
```
to:
```css
#reports-view { flex: 1; overflow: auto; padding: 12px 20px; }
#reports-toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
#reports-toolbar select, #reports-toolbar button {
  padding: 7px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  transition: background 150ms ease;
}
#report-panel-wrap { overflow: auto; background: var(--surface-sunken); padding: 24px; border-radius: var(--radius-lg); }
#report-panel { display: flex; flex-direction: column; align-items: center; gap: 24px; }

.report-page {
  width: 1280px; height: 720px; flex-shrink: 0; box-sizing: border-box;
  background: #ffffff; color: #1d1d1f; padding: 56px 64px;
  display: flex; flex-direction: column; position: relative; overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.16);
}

.report-page-title, .report-page-divider, .report-page-closing {
  justify-content: center; align-items: flex-start; color: #ffffff;
  background: linear-gradient(135deg, #00338D 0%, #005EB8 60%, #E5007E 100%);
}
.report-page-closing { align-items: center; text-align: center; }

.report-title-project { font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-bottom: 16px; }
.report-title-heading { font-size: 48px; font-weight: 600; margin: 0 0 16px 0; }
.report-title-date { font-size: 16px; opacity: 0.9; }

.report-divider-inner { border-left: 6px solid #ffffff; padding-left: 24px; }
.report-divider-title { font-size: 40px; font-weight: 600; margin: 0; }

.report-closing-heading { font-size: 40px; font-weight: 600; margin: 0 0 12px 0; }
.report-closing-project { font-size: 16px; opacity: 0.9; }

.report-page-agenda .report-agenda-list { font-size: 22px; line-height: 2.2; padding-left: 28px; margin: 24px 0 0 0; }

.report-page-heading { font-size: 24px; font-weight: 600; color: #00338D; margin: 0 0 20px 0; border-bottom: 3px solid #E5007E; padding-bottom: 10px; }
.report-subheading { font-size: 16px; font-weight: 600; color: #005EB8; margin: 20px 0 8px 0; }

.report-kpi-row { display: flex; gap: 16px; flex-wrap: wrap; }
.report-kpi-tile { background: #f7f7f8; border-radius: 12px; padding: 14px 22px; min-width: 130px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.report-kpi-tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6e73; }
.report-kpi-tile-value { font-size: 26px; font-weight: 600; color: #00338D; }

.report-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
.report-table th, .report-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5ea; }
.report-table th { background: #f7f7f8; color: #00338D; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }

.report-list { font-size: 13px; padding-left: 20px; margin: 8px 0; }
.report-empty-note { color: #6e6e73; font-size: 13px; font-style: italic; }

.report-calendar-months { display: flex; gap: 24px; margin-top: 8px; }
.report-calendar-month { flex: 1; }
.report-calendar-month-label { font-size: 14px; font-weight: 600; color: #00338D; margin-bottom: 6px; }
.report-calendar-day-header { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; font-size: 9px; text-transform: uppercase; color: #6e6e73; margin-bottom: 3px; }
.report-calendar-week { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: minmax(16px, auto); gap: 2px; background: #f7f7f8; border-radius: 6px; padding: 3px; margin-bottom: 3px; }
.report-calendar-daynum { font-size: 9px; color: #98989d; padding: 1px 3px; }
.report-calendar-daynum-empty { visibility: hidden; }
.report-calendar-keydate-star { color: #d4af37; margin-left: 2px; }
.report-calendar-chip { border-radius: 4px; padding: 1px 4px; font-size: 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.report-calendar-chip-Meeting { background: rgba(0, 145, 218, 0.25); border: 1px solid #0091DA; }
.report-calendar-chip-Workshop { background: rgba(124, 77, 255, 0.25); border: 1px solid #7c4dff; }
```

(This block is deliberately theme-independent — a fixed light "print deck" palette regardless of `[data-theme="dark"]`, continuing the exact same behavior the old `#report-panel { background: #ffffff; color: #1d1d1f; }` already had.)

- [ ] **Step 5: Replace the entire contents of `reports.js`**

Replace the full contents of `project-planner/src/js/ui/reports.js` with:

```js
(function () {
  'use strict';

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function buildTable(headers, rows, cellsFn) {
    var table = el('table', { class: 'report-table' });
    table.appendChild(el('tr', {}, headers.map(function (h) { return el('th', {}, [h]); })));
    rows.forEach(function (row) {
      table.appendChild(el('tr', {}, cellsFn(row).map(function (v) { return el('td', {}, [v || '']); })));
    });
    return table;
  }

  function renderTitlePage(data) {
    return el('section', { class: 'report-page report-page-title' }, [
      el('div', { class: 'report-title-project' }, [data.projectName]),
      el('h1', { class: 'report-title-heading' }, [data.subtitle]),
      el('div', { class: 'report-title-date' }, ['Status date: ' + data.statusDate]),
    ]);
  }

  function renderAgendaPage(data) {
    var list = el('ol', { class: 'report-agenda-list' }, data.items.map(function (item) {
      return el('li', {}, [item]);
    }));
    return el('section', { class: 'report-page report-page-agenda' }, [
      el('h2', { class: 'report-page-heading' }, ['Agenda']),
      list,
    ]);
  }

  function renderDividerPage(data) {
    return el('section', { class: 'report-page report-page-divider' }, [
      el('div', { class: 'report-divider-inner' }, [
        el('h1', { class: 'report-divider-title' }, [data.title]),
      ]),
    ]);
  }

  function renderProgressPage(data) {
    var kpiRow = el('div', { class: 'report-kpi-row' }, data.kpis.map(function (tile) {
      return el('div', { class: 'report-kpi-tile' }, [
        el('div', { class: 'report-kpi-tile-label' }, [tile.label]),
        el('div', { class: 'report-kpi-tile-value' }, [tile.value]),
      ]);
    }));
    var delayedBody = data.delayedTasks.length
      ? el('ul', { class: 'report-list' }, data.delayedTasks.map(function (t) {
          return el('li', {}, [t.name + ' — due ' + (t.plannedFinish || '') + (t.remarks ? ' (' + t.remarks + ')' : '')]);
        }))
      : el('p', { class: 'report-empty-note' }, ['No delayed items.']);
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[0]]),
      kpiRow,
      el('h3', { class: 'report-subheading' }, ['Delayed Items']),
      delayedBody,
    ]);
  }

  function renderIssuesRisksPage(data) {
    var issuesBody = data.issues.length
      ? buildTable(
          ['Title', 'Description', 'Owner', 'Status', 'Date Raised', 'Date Resolved'],
          data.issues,
          function (i) { return [i.title, i.description, i.owner, i.status, i.dateRaised || '', i.dateResolved || '']; }
        )
      : el('p', { class: 'report-empty-note' }, ['No issues logged.']);
    var risksBody = data.risks.length
      ? buildTable(
          ['Title', 'Description', 'Likelihood', 'Impact', 'Mitigation', 'Owner', 'Status', 'Date Raised'],
          data.risks,
          function (r) { return [r.title, r.description, r.likelihood, r.impact, r.mitigation, r.owner, r.status, r.dateRaised || '']; }
        )
      : el('p', { class: 'report-empty-note' }, ['No risks logged.']);
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[1]]),
      el('h3', { class: 'report-subheading' }, ['Issues']),
      issuesBody,
      el('h3', { class: 'report-subheading' }, ['Risks']),
      risksBody,
    ]);
  }

  function renderDecisionsPage(data) {
    var body = data.decisions.length
      ? buildTable(
          ['Title', 'Description', 'Decision Needed By', 'Owner', 'Status', 'Decision Made'],
          data.decisions,
          function (d) { return [d.title, d.description, d.decisionNeededBy || '', d.owner, d.status, d.decisionMade || '']; }
        )
      : el('p', { class: 'report-empty-note' }, ['No decisions logged.']);
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[2]]),
      body,
    ]);
  }

  function renderCalendarMonth(year, month, activities) {
    var layout = PP.computeCalendarLayout(year, month, activities);

    var monthEl = el('div', { class: 'report-calendar-month' }, [
      el('div', { class: 'report-calendar-month-label' }, [MONTH_NAMES[month] + ' ' + year]),
    ]);
    var dayHeader = el('div', { class: 'report-calendar-day-header' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(function (l) {
      return el('span', {}, [l]);
    }));
    monthEl.appendChild(dayHeader);

    layout.weeks.forEach(function (week, weekIndex) {
      var weekEl = el('div', { class: 'report-calendar-week' });
      week.days.forEach(function (day, col) {
        var cell = el('div', { class: 'report-calendar-daynum' + (day ? '' : ' report-calendar-daynum-empty') });
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = '1';
        if (day) {
          cell.appendChild(document.createTextNode(String(day.dayOfMonth)));
          if (day.keyDate) {
            cell.appendChild(el('span', { class: 'report-calendar-keydate-star' }, ['★']));
          }
        }
        weekEl.appendChild(cell);
      });
      layout.segments.filter(function (s) { return s.weekIndex === weekIndex; }).forEach(function (seg) {
        var chip = el('div', { class: 'report-calendar-chip report-calendar-chip-' + seg.activity.type }, [seg.activity.name]);
        chip.style.gridColumn = (seg.startCol + 1) + ' / ' + (seg.endCol + 2);
        chip.style.gridRow = String(seg.lane + 2);
        weekEl.appendChild(chip);
      });
      monthEl.appendChild(weekEl);
    });

    return monthEl;
  }

  function renderCalendarPage(data, activities) {
    var monthsRow = el('div', { class: 'report-calendar-months' }, data.months.map(function (m) {
      return renderCalendarMonth(m.year, m.month, activities);
    }));
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[3]]),
      monthsRow,
    ]);
  }

  function renderClosingPage(data) {
    return el('section', { class: 'report-page report-page-closing' }, [
      el('h1', { class: 'report-closing-heading' }, ['Thank You']),
      el('div', { class: 'report-closing-project' }, [data.projectName]),
    ]);
  }

  function renderPage(page, state) {
    if (page.type === 'title') return renderTitlePage(page.data);
    if (page.type === 'agenda') return renderAgendaPage(page.data);
    if (page.type === 'divider') return renderDividerPage(page.data);
    if (page.type === 'progress') return renderProgressPage(page.data);
    if (page.type === 'issuesRisks') return renderIssuesRisksPage(page.data);
    if (page.type === 'decisions') return renderDecisionsPage(page.data);
    if (page.type === 'calendar') return renderCalendarPage(page.data, state.project.activities);
    return renderClosingPage(page.data);
  }

  function renderReport(state) {
    var panel = document.getElementById('report-panel');
    panel.innerHTML = '';
    var pages = PP.buildReportPages(state.project, state.calc);
    pages.forEach(function (page) {
      panel.appendChild(renderPage(page, state));
    });
  }

  function wireReports(state) {
  }

  window.PP = window.PP || {};
  window.PP.renderReport = renderReport;
  window.PP.wireReports = wireReports;
})();
```

- [ ] **Step 6: Build and confirm no regressions**

```bash
cd project-planner
node --check src/js/reportsEngine.js
node --check src/js/ui/reports.js
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: all `node --check` calls print nothing (syntax clean); build succeeds with no error about missing markers; 232/232 tests pass (this task touches no engine/logic files in a way that changes test-observable behavior — the count from Task 1 must be unchanged, since UI files have no automated coverage).

- [ ] **Step 7: Commit**

```bash
cd project-planner
git add build.py src/index.html src/js/ui/app.js src/css/layout.css src/js/ui/reports.js
git commit -m "Rewrite Reports tab: 11-page biweekly status deck replacing the old template system"
```

---

### Task 3: Print pagination + Export PDF button

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/css/print.css` (full rewrite)
- Modify: `project-planner/src/js/ui/reports.js`

**Interfaces:**
- Consumes: Task 2's `PP.wireReports(state)` one-argument stub and the `.report-page`/`#report-panel`/`#reports-toolbar` DOM structure it builds.
- Produces: a real `#export-pdf-button` inside `#reports-toolbar`, wired to `window.print()`; a `print.css` that gives every `.report-page` `page-break-after: always` and hides all app chrome. Task 4 verifies this live — no automated coverage (CSS + UI wiring).

- [ ] **Step 1: Add the Export PDF button to `index.html`**

In `project-planner/src/index.html`, change:
```html
    <div id="reports-toolbar"></div>
```
to:
```html
    <div id="reports-toolbar">
      <button id="export-pdf-button">Export PDF</button>
    </div>
```

- [ ] **Step 2: Style the button in `layout.css`**

In `project-planner/src/css/layout.css`, change:
```css
#reports-toolbar select, #reports-toolbar button {
  padding: 7px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  transition: background 150ms ease;
}
```
to:
```css
#reports-toolbar select, #reports-toolbar button {
  padding: 7px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  transition: background 150ms ease;
}
#export-pdf-button { background: var(--kpmg-blue); color: #fff; border: none; }
#export-pdf-button:hover { background: var(--kpmg-blue-mid); }
```

- [ ] **Step 3: Wire the button to `window.print()` in `reports.js`**

In `project-planner/src/js/ui/reports.js`, change:
```js
  function wireReports(state) {
  }
```
to:
```js
  function wireReports(state) {
    document.getElementById('export-pdf-button').addEventListener('click', function () {
      window.print();
    });
  }
```

- [ ] **Step 4: Replace the entire contents of `print.css`**

Replace the full contents of `project-planner/src/css/print.css` with:

```css
@media print {
  body * { visibility: hidden; }
  #report-panel, #report-panel * { visibility: visible; }
  #report-panel-wrap { overflow: visible; padding: 0; background: none; }
  #report-panel { position: absolute; top: 0; left: 0; width: 100%; gap: 0; }
  #app-header, #toolbar, #view-tabs, #reports-toolbar, #name-picker, #context-menu, #scurve-tooltip { display: none !important; }
  .report-page {
    width: 100%;
    height: 100vh;
    box-shadow: none;
    page-break-after: always;
    break-after: page;
  }
  .report-page:last-child { page-break-after: auto; break-after: auto; }
  @page { size: landscape; margin: 0; }
}
```

This extends the exact same rules already proven for the rest of the app (`body * { visibility: hidden }` / `#report-panel, #report-panel * { visibility: visible }` / the app-chrome `display: none !important` list are unchanged) and adds the new pagination rules needed now that `#report-panel` holds 11 stacked `.report-page` sections instead of one block.

- [ ] **Step 5: Build and confirm no regressions**

```bash
cd project-planner
node --check src/js/ui/reports.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 232/232 tests pass (this task touches no engine/logic files — the count from Task 1 must be unchanged).

- [ ] **Step 6: Commit**

```bash
cd project-planner
git add src/index.html src/css/layout.css src/css/print.css src/js/ui/reports.js
git commit -m "Add Export PDF button and paginated print stylesheet for the 11-page report deck"
```

---

### Task 4: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd project-planner
python3 build.py
node --test
```
Expected: 232/232 tests pass (the exact final count established in Task 1 — confirm it matches, don't assume).

- [ ] **Step 2: Serve the built app and seed a realistic project**

```bash
cd project-planner/dist && python3 -m http.server <port>
```
Navigate to it with the Playwright browser tools (`file://` URLs are blocked by the sandbox). Complete the name-picker overlay if it appears. Set the status date (header input) to `2026-07-09` so the calendar page's current/next-month math is predictable (July/August 2026).

Seed real data via each tab's own UI (not `browser_evaluate` state poking — this app's `state` object is a local closure variable in `app.js`, not exposed on `window`, so seeding must go through real clicks, matching every prior plan's verification convention):
- Plan tab: add at least 2 tasks with planned/actual dates such that one is Delayed relative to the 2026-07-09 status date (e.g. planned finish well before 2026-07-09, no actual finish set) and one is Complete.
- Issues, Risks & Decisions tab: click "+ Add Issue", "+ Add Risk", "+ Add Decision" once each; edit their Title fields (double-click, type, Enter) to distinct, recognizable names.
- Activities tab: add one Meeting (e.g. dateStart/dateEnd `2026-07-09`, with a time range, "Key date" checked) and one Workshop spanning multiple days in July (e.g. `2026-07-13` to `2026-07-17`).

- [ ] **Step 3: Confirm all 11 pages render in order with real seeded data**

Click the "Reports" tab. Confirm it is not blank (the historical gotcha in this repo). Using `browser_evaluate`, read `document.querySelectorAll('#report-panel > .report-page')` and confirm:
- Exactly 11 elements, in this class order: `report-page-title`, `report-page-agenda`, `report-page-divider`, `report-page-content`, `report-page-divider`, `report-page-content`, `report-page-divider`, `report-page-content`, `report-page-divider`, `report-page-content`, `report-page-closing`.
- Page 1's `.report-title-project`/`.report-title-heading` text matches the project name / "Progress Meeting".
- Page 2's `.report-agenda-list` has exactly 4 `<li>` items matching the four Thai section titles.
- Pages 3/5/7/9's `.report-divider-title` text matches `01 ผลการดำเนินงาน` / `02 ประเด็นปัญหาและความเสี่ยง` / `03 ประเด็นเพื่อหารือ` / `04 การดำเนินการลำดับถัดไป` respectively.
- Page 4 (progress) has 6 `.report-kpi-tile` elements labeled Actual/Planned/Variance/Delayed/Complete/Deliverables, and its delayed-items list contains the Delayed task seeded in Step 2.
- Page 6 (issues & risks) has both a table row for the seeded issue and one for the seeded risk, with the exact titles typed in Step 2 (confirm no HTML-escaping artifacts like `&amp;` if a title contained an ampersand — try one with a `&` or `<` in it specifically to confirm the escaping rule holds).
- Page 8 (decisions) has a table row for the seeded decision.
- Page 10 (calendar) shows two `.report-calendar-month` blocks labeled "July 2026" and "August 2026"; the Meeting chip appears on July 9 with a `.report-calendar-keydate-star`, and the Workshop banner appears across July 13–17.
- Page 11's `.report-closing-project` text matches the project name.

- [ ] **Step 4: Confirm the print stylesheet's CSSOM content**

Since a real OS print-preview dialog can't be driven by automation, verify the parsed stylesheet directly via `browser_evaluate`:
```js
() => {
  var found = { pageBreak: false, chromeHidden: false };
  Array.from(document.styleSheets).forEach(function (sheet) {
    var rules;
    try { rules = Array.from(sheet.cssRules || []); } catch (e) { return; }
    rules.forEach(function (rule) {
      if (rule.media && Array.from(rule.media).includes('print')) {
        var text = Array.from(rule.cssRules).map(function (r) { return r.cssText; }).join('\n');
        if (text.includes('.report-page') && text.includes('page-break-after')) found.pageBreak = true;
        if (text.includes('#reports-toolbar') && text.includes('display: none')) found.chromeHidden = true;
      }
    });
  });
  return found;
}
```
Expected: `{ pageBreak: true, chromeHidden: true }`.

- [ ] **Step 5: Confirm "Export PDF" triggers `window.print()`**

Via `browser_evaluate`, monkey-patch before the click: `window.__ppPrintCalled = false; window.print = function () { window.__ppPrintCalled = true; };`. Then perform a real `browser_click` on `#export-pdf-button` (not a JS-evaluated `.click()` — this codebase's convention requires genuine user-gesture clicks for browser-native actions). Then `browser_evaluate` to confirm `window.__ppPrintCalled === true`.

- [ ] **Step 6: Verify zero regression to every other tab**

Click through every other view tab (Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Billing, Settings, Holidays, Activities, Issues/Risks/Decisions) and confirm each still renders and the previously-active tab correctly hides. Confirm Save (JSON) still works and the saved file's JSON is unaffected by this plan (it never touched `store.js`'s `toJSON()`/data model). Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected).

- [ ] **Step 7: Final test sweep**

```bash
cd project-planner
node --test
```
Confirm the same count from Step 1 still passes.

- [ ] **Step 8: Record the result**

If every check in Steps 1–7 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1–3: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: the Reports tab renders a fixed 11-page biweekly status deck (title, agenda, 4 divider+content section pairs for Progress/Issues & Risks/Decisions/Next-Steps-calendar, closing) styled in the KPMG blue/pink visual language, sourced from real `project.issues`/`risks`/`decisions`/`activities` data and the existing progress KPIs via a pure, Node-tested page-assembly engine (`reportsEngine.js`), and exportable as a real multi-page PDF through the browser's native print dialog via a paginated `@media print` stylesheet and an "Export PDF" button.
