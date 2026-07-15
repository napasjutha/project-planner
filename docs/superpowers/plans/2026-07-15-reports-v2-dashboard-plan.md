# Reports Tab v2 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 11-page PDF-deck Reports tab with a 4-section dashboard (Executive Summary, Progress Roadmap, Weekly Actions, Risks & Detail), no divider pages, per-section "Copy as Image" export instead of `window.print()`.

**Architecture:** `src/js/reportsEngine.js` is fully rewritten: four pure section-data builders plus one assembler, replacing the old 9-function/11-page API. `src/js/ui/reports.js` is fully rewritten to render exactly those 4 sections and wire a Copy-as-Image button per section (reusing the already-shipped `PP.copyElementAsImage`). `src/index.html` loses the `#export-pdf-button`; `src/css/print.css` loses its now-dead `.report-page` pagination rules; `src/css/layout.css`'s entire `report-*` block (lines 363-437) is replaced with new `.report-section-*` rules.

**Tech Stack:** Vanilla JS, `node:test`, hand-rolled SVG for the roadmap timeline.

## Global Constraints

- Zero external dependencies. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`.
- Engines (`src/js/*.js`): UMD-lite, Node-tested, no DOM. `src/js/ui/*.js`: plain IIFEs, no Node coverage — verified only via the final controller-run Playwright task, never a fresh implementer subagent.
- Baseline: 253/253 Node tests passing as of this plan's start (re-verify via `node --test` before Task 1; if your count differs, use it and adjust later "Expected" counts).
- This plan is **independent** of the other 3 plans written alongside it (`2026-07-15-plan-tab-collapse-widen-plan.md`, `2026-07-15-activities-mass-upload-plan.md`, `2026-07-15-settings-excel-export-plan.md`) — different files, no merge-order dependency, safe on a parallel worktree.
- Roadmap lanes are derived generically (one lane per top-level task), never hardcoded to any specific project's phase names — this app runs multiple client projects on one codebase.
- Keep this app's existing KPMG palette (`--kpmg-blue: #00338D`, `--kpmg-blue-mid: #005EB8`, `--kpmg-blue-light: #0091DA`, pink `#E5007E`, workshop-purple `#7c4dff` already used by `.calendar-chip-Workshop`) — do not introduce the reference HTML's separate palette.
- Any user-controlled string (task name, owner, decision title, etc.) rendered into the DOM must go through the existing `el()` helper's `textContent`-based children or `document.createTextNode` — never raw `innerHTML` string concatenation.
- Run `python3 build.py` after every `src/` change, before any manual/browser verification step.

---

### Task 1: `buildExecutiveSummaryData`

**Files:**
- Modify: `src/js/reportsEngine.js` (delete `buildTitlePageData`, `buildAgendaPageData`, `buildClosingPageData` — see Task 3 for the full old-API removal; this task only adds the new function and its export)
- Test: `tests/reportsEngine.test.js` (this task replaces the whole file's contents — start the rewrite here, Tasks 2-3 extend it)

**Interfaces:**
- Produces: `buildExecutiveSummaryData(project, calc)` → `{ ragStatus, kpis, statusCounts }`. `kpis` is the same 6-tile array shape the old `buildProgressPageData` produced (`[{label,value}, ...]` for Actual/Planned/Variance/Delayed/Complete/Deliverables). `statusCounts` is `{ 'Not Start': n, 'In Progress': n, 'Delayed': n, 'Complete': n, 'Blocked': n, 'Cancelled': n }`, always all 6 keys present (zero-filled).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `tests/reportsEngine.test.js` with:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const {
  buildExecutiveSummaryData,
} = require('../src/js/reportsEngine.js');

function fixtureProject(overrides) {
  return Object.assign({
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '', deliverable: false },
      { id: 't2', parentId: null, order: 1, name: 'Build Phase', plannedStart: '2026-06-11', plannedFinish: '2026-06-20', actualStart: '2026-06-11', actualFinish: null, owner: 'Bob', remarks: 'Waiting on vendor', deliverable: true },
    ],
    holidays: [],
    issues: [], risks: [], decisions: [], activities: [],
  }, overrides);
}

test('buildExecutiveSummaryData produces the 6 KPI tiles matching calc.kpis', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const data = buildExecutiveSummaryData(project, calc);

  const pct = x => Math.round(x * 100) + '%';
  assert.deepEqual(data.kpis, [
    { label: 'Actual', value: pct(calc.kpis.actualPct) },
    { label: 'Planned', value: pct(calc.kpis.plannedPct) },
    { label: 'Variance', value: pct(calc.kpis.variance) },
    { label: 'Delayed', value: String(calc.kpis.delayedCount) },
    { label: 'Complete', value: calc.kpis.completeCount + '/' + calc.kpis.totalCount },
    { label: 'Deliverables', value: calc.kpis.deliverablesComplete + '/' + calc.kpis.deliverablesTotal },
  ]);
});

test('buildExecutiveSummaryData: ragStatus is On Track when variance >= 0', () => {
  const project = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Done', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '', deliverable: false },
    ],
  });
  const calc = recalc(project);
  assert.ok(calc.kpis.variance >= 0);
  assert.equal(buildExecutiveSummaryData(project, calc).ragStatus, 'On Track');
});

test('buildExecutiveSummaryData: ragStatus is Watch when -0.05 <= variance < 0, At Risk when variance < -0.05', () => {
  // Build Phase is 100% planned-to-date (finished window) but only 0% actual (no actualFinish, actualStart present but pa() -> partial). Force a clear At-Risk case:
  const atRiskProject = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Late', plannedStart: '2026-05-01', plannedFinish: '2026-05-10', actualStart: null, actualFinish: null, owner: 'Alice', remarks: '', deliverable: false },
    ],
  });
  const atRiskCalc = recalc(atRiskProject);
  assert.ok(atRiskCalc.kpis.variance < -0.05, 'fixture must produce variance below -0.05 for this test to be meaningful');
  assert.equal(buildExecutiveSummaryData(atRiskProject, atRiskCalc).ragStatus, 'At Risk');
});

test('buildExecutiveSummaryData: statusCounts always has all 6 status keys, zero-filled', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const counts = buildExecutiveSummaryData(project, calc).statusCounts;
  assert.deepEqual(Object.keys(counts).sort(), ['Blocked', 'Cancelled', 'Complete', 'Delayed', 'In Progress', 'Not Start'].sort());
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 2); // both leaf tasks in the default fixture counted exactly once
});

test('buildExecutiveSummaryData: statusCounts tallies leaf tasks only, by their calc.computed status', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const counts = buildExecutiveSummaryData(project, calc).statusCounts;
  assert.equal(counts['Complete'], 1); // Design Phase, actualFinish set
  assert.equal(counts['Delayed'], 1);  // Build Phase, plannedFinish before statusDate, no actualFinish
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `buildExecutiveSummaryData is not defined` (module doesn't export it yet).

- [ ] **Step 3: Implement `buildExecutiveSummaryData`**

Replace the entire contents of `src/js/reportsEngine.js` with (this task only needs `buildExecutiveSummaryData`; the remaining old exports are deleted here since they're being fully replaced across this plan — Tasks 2-3 add the other new functions into this same file):

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

  function pct(x) { return Math.round(x * 100) + '%'; }

  var STATUS_KEYS = ['Not Start', 'In Progress', 'Delayed', 'Complete', 'Blocked', 'Cancelled'];

  function buildExecutiveSummaryData(project, calc) {
    var kpis = calc.kpis;
    var tiles = [
      { label: 'Actual', value: pct(kpis.actualPct) },
      { label: 'Planned', value: pct(kpis.plannedPct) },
      { label: 'Variance', value: pct(kpis.variance) },
      { label: 'Delayed', value: String(kpis.delayedCount) },
      { label: 'Complete', value: kpis.completeCount + '/' + kpis.totalCount },
      { label: 'Deliverables', value: kpis.deliverablesComplete + '/' + kpis.deliverablesTotal },
    ];

    var ragStatus = kpis.variance >= 0 ? 'On Track' : (kpis.variance >= -0.05 ? 'Watch' : 'At Risk');

    var statusCounts = {};
    STATUS_KEYS.forEach(function (k) { statusCounts[k] = 0; });
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var status = calc.computed.get(id).status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { ragStatus: ragStatus, kpis: tiles, statusCounts: statusCounts };
  }

  return {
    buildExecutiveSummaryData: buildExecutiveSummaryData,
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — total count is your verified baseline minus the old `reportsEngine.test.js` tests (all removed in Step 1's full-file replace) plus 5 (this task's new tests). Don't worry about matching an exact number here — Task 3 finishes the file and the final count is checked at the end of Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/js/reportsEngine.js tests/reportsEngine.test.js
git commit -m "feat: buildExecutiveSummaryData for the Reports v2 dashboard"
```

---

### Task 2: `buildRoadmapData`

**Files:**
- Modify: `src/js/reportsEngine.js` (add the function + export, keep everything Task 1 added)
- Test: `tests/reportsEngine.test.js` (append)

**Interfaces:**
- Consumes: `project.tasks` (specifically `parentId`, `order`, `name`, `owner`, `plannedStart`, `plannedFinish`, `deliverable`, `statusOverride`), `project.meta.statusDate`.
- Produces: `buildRoadmapData(project, calc)` →
  ```
  {
    rangeStart, rangeEnd,   // ISO date strings, or null/null if no qualifying tasks
    statusDate,
    weeks: [ { start, end, label } ],   // 'W0', 'W1', ... — 7-day chunks from rangeStart to rangeEnd
    lanes: [ { id, name } ],            // one per top-level task (parentId === null), in `order`
    items: [ { taskId, name, owner, plannedStart, plannedFinish, laneId, deliverable, isMeeting, slot } ],
  }
  ```
  Task 4 (UI) consumes this directly — `weeks` for gridlines, `lanes` for row labels, `items` (with `slot`) for chevron/triangle placement.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reportsEngine.test.js` (add `buildRoadmapData` to the `require` list at the top first):

```js
const {
  buildExecutiveSummaryData,
  buildRoadmapData,
} = require('../src/js/reportsEngine.js');
```

```js
function roadmapFixtureProject() {
  return {
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 'phase1', parentId: null, order: 0, name: 'Phase 1', plannedStart: null, plannedFinish: null, owner: '', deliverable: false, statusOverride: null },
      { id: 'phase2', parentId: null, order: 1, name: 'Phase 2', plannedStart: null, plannedFinish: null, owner: '', deliverable: false, statusOverride: null },
      { id: 'p1-group', parentId: 'phase1', order: 0, name: 'Group', plannedStart: null, plannedFinish: null, owner: '', deliverable: false, statusOverride: null },
      { id: 'p1-leaf-a', parentId: 'p1-group', order: 0, name: 'Kickoff Workshop', plannedStart: '2026-07-06', plannedFinish: '2026-07-08', owner: 'KPMG', deliverable: false, statusOverride: null },
      { id: 'p1-leaf-b', parentId: 'p1-group', order: 1, name: 'Deliverable A', plannedStart: '2026-07-06', plannedFinish: '2026-07-10', owner: 'KPMG', deliverable: true, statusOverride: null },
      { id: 'p1-leaf-c', parentId: 'p1-group', order: 2, name: 'Overlapping Task', plannedStart: '2026-07-07', plannedFinish: '2026-07-09', owner: 'RAM', deliverable: false, statusOverride: null },
      { id: 'p2-leaf', parentId: 'phase2', order: 0, name: 'Phase 2 Task', plannedStart: '2026-07-13', plannedFinish: '2026-07-20', owner: 'KPMG', deliverable: false, statusOverride: null },
      { id: 'cancelled-leaf', parentId: 'phase2', order: 1, name: 'Cancelled Task', plannedStart: '2026-08-01', plannedFinish: '2026-08-05', owner: 'KPMG', deliverable: false, statusOverride: 'Cancelled' },
      { id: 'no-dates-leaf', parentId: 'phase2', order: 2, name: 'No Dates', plannedStart: null, plannedFinish: null, owner: 'KPMG', deliverable: false, statusOverride: null },
    ],
    holidays: [], issues: [], risks: [], decisions: [], activities: [],
  };
}

test('buildRoadmapData: rangeStart/rangeEnd span the min/max planned dates of qualifying leaf tasks', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.rangeStart, '2026-07-06');
  assert.equal(data.rangeEnd, '2026-07-20');
});

test('buildRoadmapData: lanes are one per top-level task, in order, not hardcoded names', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.deepEqual(data.lanes, [{ id: 'phase1', name: 'Phase 1' }, { id: 'phase2', name: 'Phase 2' }]);
});

test('buildRoadmapData: a leaf 2 levels deep is assigned to its top-level ancestor lane', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  const item = data.items.find(i => i.taskId === 'p1-leaf-a');
  assert.equal(item.laneId, 'phase1');
});

test('buildRoadmapData: excludes cancelled tasks and tasks missing planned dates', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.items.some(i => i.taskId === 'cancelled-leaf'), false);
  assert.equal(data.items.some(i => i.taskId === 'no-dates-leaf'), false);
});

test('buildRoadmapData: isMeeting true for workshop/meeting keyword in name, false otherwise', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-a').isMeeting, true);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-b').isMeeting, false);
});

test('buildRoadmapData: deliverable flag passes through from task.deliverable', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-b').deliverable, true);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-a').deliverable, false);
});

test('buildRoadmapData: overlapping items in the same lane get distinct slots, non-overlapping items can share a slot', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  // p1-leaf-a (07-06..07-08), p1-leaf-b (07-06..07-10), p1-leaf-c (07-07..07-09) all overlap pairwise -> 3 distinct slots
  const phase1Items = data.items.filter(i => i.laneId === 'phase1');
  const slots = new Set(phase1Items.map(i => i.slot));
  assert.equal(slots.size, 3);
});

test('buildRoadmapData: weeks are 7-day chunks from rangeStart to rangeEnd, labeled W0, W1, ...', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.weeks[0].start, '2026-07-06');
  assert.equal(data.weeks[0].label, 'W0');
  assert.equal(data.weeks[data.weeks.length - 1].label, 'W' + (data.weeks.length - 1));
});

test('buildRoadmapData: no qualifying tasks returns null range and empty items/weeks', () => {
  const project = { meta: { name: 'Empty', statusDate: '2026-07-09' }, tasks: [], holidays: [], issues: [], risks: [], decisions: [], activities: [] };
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.rangeStart, null);
  assert.equal(data.rangeEnd, null);
  assert.deepEqual(data.items, []);
  assert.deepEqual(data.weeks, []);
  assert.deepEqual(data.lanes, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `buildRoadmapData is not defined`.

- [ ] **Step 3: Implement `buildRoadmapData`**

Add to `src/js/reportsEngine.js`, inside the factory function, above the `return { ... }` statement (which Step needs updating too — see below). This task needs `parseISO`/`toISO` from `schedule.js`; since `reportsEngine.js` currently has no such import, add one at the top of the factory function:

```js
  var schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : globalThis.PP;
  var parseISO = schedule.parseISO;
  var toISO = schedule.toISO;
  var DAY_MS = 86400000;
```
(place this block directly below the `'use strict';` line, above `function pct(x) { ... }`)

Then add:

```js
  var MEETING_RE = /workshop|meeting|ประชุม|สัมมนา/i;

  function topLevelAncestorId(task, byId) {
    while (task.parentId != null) {
      var parent = byId.get(task.parentId);
      if (!parent) break;
      task = parent;
    }
    return task.id;
  }

  function buildRoadmapData(project, calc) {
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var qualifying = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      if (task.statusOverride === 'Cancelled') return;
      if (!task.plannedStart || !task.plannedFinish) return;
      qualifying.push(task);
    });

    var lanes = project.tasks
      .filter(function (t) { return t.parentId == null; })
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (t) { return { id: t.id, name: t.name }; });

    if (!qualifying.length) {
      return { rangeStart: null, rangeEnd: null, statusDate: project.meta.statusDate, weeks: [], lanes: lanes, items: [] };
    }

    var rangeStartMs = Math.min.apply(null, qualifying.map(function (t) { return parseISO(t.plannedStart); }));
    var rangeEndMs = Math.max.apply(null, qualifying.map(function (t) { return parseISO(t.plannedFinish); }));

    var weeks = [];
    var w = 0;
    for (var ms = rangeStartMs; ms <= rangeEndMs; ms += 7 * DAY_MS) {
      var endMs = Math.min(ms + 6 * DAY_MS, rangeEndMs);
      weeks.push({ start: toISO(ms), end: toISO(endMs), label: 'W' + w });
      w++;
    }

    var items = qualifying.map(function (task) {
      return {
        taskId: task.id, name: task.name, owner: task.owner || '',
        plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
        laneId: topLevelAncestorId(task, byId),
        deliverable: !!task.deliverable,
        isMeeting: MEETING_RE.test(task.name),
        slot: 0,
      };
    });

    lanes.forEach(function (lane) {
      var laneItems = items.filter(function (i) { return i.laneId === lane.id; })
        .sort(function (a, b) { return a.plannedStart < b.plannedStart ? -1 : 1; });
      var slotEndDates = [];
      laneItems.forEach(function (item) {
        var slot = slotEndDates.findIndex(function (endDate) { return endDate < item.plannedStart; });
        if (slot === -1) {
          slot = slotEndDates.length;
          slotEndDates.push(item.plannedFinish);
        } else {
          slotEndDates[slot] = item.plannedFinish;
        }
        item.slot = slot;
      });
    });

    return { rangeStart: toISO(rangeStartMs), rangeEnd: toISO(rangeEndMs), statusDate: project.meta.statusDate, weeks: weeks, lanes: lanes, items: items };
  }
```

Update the `return { ... }` statement at the bottom of the factory to add `buildRoadmapData: buildRoadmapData,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — Task 1's count + 9 (this task's new tests).

- [ ] **Step 5: Commit**

```bash
git add src/js/reportsEngine.js tests/reportsEngine.test.js
git commit -m "feat: buildRoadmapData with generic lane derivation and slot-packing for the Reports v2 roadmap"
```

---

### Task 3: `buildWeeklyActionsData`, `buildRisksDetailData`, `buildReportSections`

**Files:**
- Modify: `src/js/reportsEngine.js` (add both functions + the assembler + finalize exports)
- Test: `tests/reportsEngine.test.js` (append, finishing the file)

**Interfaces:**
- Produces: `buildWeeklyActionsData(project, calc)` → `{ completedPrior7Days: [{name,actualFinish}], next14Days: [{name,plannedStart}] }`, both sorted ascending by date.
- Produces: `buildRisksDetailData(project, calc)` → `{ delayedBlocked: [{name,status,plannedFinish}], decisions: [{id,title,description,decisionNeededBy,owner,status,decisionMade}], nearTermDetail: [{name,owner,plannedStart,plannedFinish,status}] }`.
- Produces: `buildReportSections(project, calc)` → `[{type:'summary',data},{type:'roadmap',data},{type:'weekly',data},{type:'risks',data}]`, calling all four builders in order.
- Consumes: `buildExecutiveSummaryData`, `buildRoadmapData` (Tasks 1-2), `parseISO`/`toISO`/`DAY_MS` (already imported in Task 2's step).

- [ ] **Step 1: Write the failing tests**

Update the `require` line at the top of `tests/reportsEngine.test.js`:

```js
const {
  buildExecutiveSummaryData,
  buildRoadmapData,
  buildWeeklyActionsData,
  buildRisksDetailData,
  buildReportSections,
} = require('../src/js/reportsEngine.js');
```

Append:

```js
function weeklyFixtureProject() {
  return {
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 'done-in-window', parentId: null, order: 0, name: 'Finished recently', plannedStart: '2026-06-25', plannedFinish: '2026-07-03', actualStart: '2026-06-25', actualFinish: '2026-07-05', owner: 'A', deliverable: false, statusOverride: null },
      { id: 'done-too-early', parentId: null, order: 1, name: 'Finished too long ago', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'A', deliverable: false, statusOverride: null },
      { id: 'upcoming-in-window', parentId: null, order: 2, name: 'Starting soon', plannedStart: '2026-07-15', plannedFinish: '2026-07-20', actualStart: null, actualFinish: null, owner: 'A', deliverable: false, statusOverride: null },
      { id: 'upcoming-too-late', parentId: null, order: 3, name: 'Starting far out', plannedStart: '2026-08-15', plannedFinish: '2026-08-20', actualStart: null, actualFinish: null, owner: 'A', deliverable: false, statusOverride: null },
      { id: 'blocked-task', parentId: null, order: 4, name: 'Blocked one', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: null, actualFinish: null, owner: 'A', deliverable: false, statusOverride: 'Blocked' },
      { id: 'delayed-task', parentId: null, order: 5, name: 'Delayed one', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: null, actualFinish: null, owner: 'A', deliverable: false, statusOverride: null },
    ],
    holidays: [], issues: [], risks: [],
    decisions: [{ id: 'd1', title: 'Pick a vendor', description: 'desc', decisionNeededBy: '2026-08-01', owner: 'Alice', status: 'Pending', decisionMade: '' }],
    activities: [],
  };
}

test('buildWeeklyActionsData: completedPrior7Days includes actualFinish within [statusDate-7d, statusDate], excludes older', () => {
  const project = weeklyFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildWeeklyActionsData(project, calc);
  assert.deepEqual(data.completedPrior7Days.map(t => t.name), ['Finished recently']);
});

test('buildWeeklyActionsData: next14Days includes plannedStart within [statusDate, statusDate+14d], excludes later', () => {
  const project = weeklyFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildWeeklyActionsData(project, calc);
  assert.deepEqual(data.next14Days.map(t => t.name), ['Starting soon']);
});

test('buildRisksDetailData: delayedBlocked includes both Delayed and Blocked statuses', () => {
  const project = weeklyFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRisksDetailData(project, calc);
  const names = data.delayedBlocked.map(t => t.name).sort();
  assert.deepEqual(names, ['Blocked one', 'Delayed one']);
});

test('buildRisksDetailData: decisions passes through project.decisions with the full field set', () => {
  const project = weeklyFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRisksDetailData(project, calc);
  assert.deepEqual(data.decisions, [{ id: 'd1', title: 'Pick a vendor', description: 'desc', decisionNeededBy: '2026-08-01', owner: 'Alice', status: 'Pending', decisionMade: '' }]);
});

test('buildRisksDetailData: nearTermDetail includes tasks with plannedStart within 45 days of statusDate, sorted ascending', () => {
  const project = weeklyFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRisksDetailData(project, calc);
  assert.ok(data.nearTermDetail.some(t => t.name === 'Starting soon'));
  assert.equal(data.nearTermDetail.some(t => t.name === 'Starting far out'), false);
});

test('buildReportSections assembles exactly 4 sections in order: summary, roadmap, weekly, risks', () => {
  const project = weeklyFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const sections = buildReportSections(project, calc);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections.map(s => s.type), ['summary', 'roadmap', 'weekly', 'risks']);
  assert.ok(sections[0].data.kpis);
  assert.ok(sections[1].data.lanes);
  assert.ok(sections[2].data.completedPrior7Days);
  assert.ok(sections[3].data.decisions);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `buildWeeklyActionsData is not defined`.

- [ ] **Step 3: Implement the remaining functions**

Add to `src/js/reportsEngine.js`, above the `return { ... }` statement:

```js
  function buildWeeklyActionsData(project, calc) {
    var statusDate = project.meta.statusDate;
    var priorMs = parseISO(statusDate) - 7 * DAY_MS;
    var nextMs = parseISO(statusDate) + 14 * DAY_MS;
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var completed = [];
    var upcoming = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      if (task.actualFinish && parseISO(task.actualFinish) >= priorMs && parseISO(task.actualFinish) <= parseISO(statusDate)) {
        completed.push({ name: task.name, actualFinish: task.actualFinish });
      }
      if (task.plannedStart && parseISO(task.plannedStart) >= parseISO(statusDate) && parseISO(task.plannedStart) <= nextMs) {
        upcoming.push({ name: task.name, plannedStart: task.plannedStart });
      }
    });

    completed.sort(function (a, b) { return a.actualFinish < b.actualFinish ? -1 : 1; });
    upcoming.sort(function (a, b) { return a.plannedStart < b.plannedStart ? -1 : 1; });

    return { completedPrior7Days: completed, next14Days: upcoming };
  }

  function buildRisksDetailData(project, calc) {
    var statusDate = project.meta.statusDate;
    var nearMs = parseISO(statusDate) + 45 * DAY_MS;
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var delayedBlocked = [];
    var nearTermDetail = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      var c = calc.computed.get(id);
      if (c.status === 'Delayed' || c.status === 'Blocked') {
        delayedBlocked.push({ name: task.name, status: c.status, plannedFinish: c.plannedFinish });
      }
      if (task.plannedStart && parseISO(task.plannedStart) >= parseISO(statusDate) && parseISO(task.plannedStart) <= nearMs) {
        nearTermDetail.push({ name: task.name, owner: task.owner || '', plannedStart: task.plannedStart, plannedFinish: c.plannedFinish, status: c.status });
      }
    });

    nearTermDetail.sort(function (a, b) { return a.plannedStart < b.plannedStart ? -1 : 1; });

    var decisions = project.decisions.map(function (d) {
      return { id: d.id, title: d.title, description: d.description, decisionNeededBy: d.decisionNeededBy, owner: d.owner, status: d.status, decisionMade: d.decisionMade };
    });

    return { delayedBlocked: delayedBlocked, decisions: decisions, nearTermDetail: nearTermDetail };
  }

  function buildReportSections(project, calc) {
    return [
      { type: 'summary', data: buildExecutiveSummaryData(project, calc) },
      { type: 'roadmap', data: buildRoadmapData(project, calc) },
      { type: 'weekly', data: buildWeeklyActionsData(project, calc) },
      { type: 'risks', data: buildRisksDetailData(project, calc) },
    ];
  }
```

Update the final `return { ... }` statement in `src/js/reportsEngine.js` to:

```js
  return {
    buildExecutiveSummaryData: buildExecutiveSummaryData,
    buildRoadmapData: buildRoadmapData,
    buildWeeklyActionsData: buildWeeklyActionsData,
    buildRisksDetailData: buildRisksDetailData,
    buildReportSections: buildReportSections,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — Task 2's count + 6 (this task's new tests). Record this final number — Task 4 and the final verification task both reference it.

- [ ] **Step 5: Commit**

```bash
git add src/js/reportsEngine.js tests/reportsEngine.test.js
git commit -m "feat: buildWeeklyActionsData, buildRisksDetailData, buildReportSections — completes the Reports v2 engine"
```

---

### Task 4: `reports.js` rewrite, CSS, and `index.html`/`print.css` cleanup

**Files:**
- Modify: `src/js/ui/reports.js` (full rewrite)
- Modify: `src/css/layout.css:363-437` (delete this whole block, replace with new rules)
- Modify: `src/css/print.css` (delete the `.report-page` pagination rules, keep the chrome-hiding selector list with `.report-page` removed from it)
- Modify: `src/index.html` (remove `#export-pdf-button`)

**Interfaces:**
- Consumes: `PP.buildReportSections` (Task 3), `PP.copyElementAsImage` (existing, `src/js/ui/imagecopy.js`), `PP.buildScurveSvg` is **not** used anymore (the S-Curve chart doesn't appear in this new dashboard — it was specific to the old Progress page).

- [ ] **Step 1: Remove the Export PDF button from `index.html`**

In `src/index.html`, change:
```html
    <div id="reports-toolbar">
      <button id="export-pdf-button">Export PDF</button>
    </div>
```
to:
```html
    <div id="reports-toolbar"></div>
```
(kept as an empty container — nothing currently needs it, but removing the div entirely risks a null-reference if some other code queries it; leaving an empty toolbar div is the lower-risk change and costs nothing.)

- [ ] **Step 2: Replace `src/js/ui/reports.js`**

Replace the entire file:

```js
(function () {
  'use strict';

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

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
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

  function sectionHeader(title, getSectionEl) {
    var btn = el('button', { class: 'report-copy-btn' }, ['Copy as Image']);
    btn.addEventListener('click', function () { PP.copyElementAsImage(getSectionEl()); });
    return el('div', { class: 'report-section-header' }, [el('h2', {}, [title]), btn]);
  }

  function renderSummarySection(data) {
    var section = el('section', { class: 'report-section report-section-summary' });
    var ragClass = 'report-rag-' + data.ragStatus.replace(/\s+/g, '');
    var ragBadge = el('span', { class: 'report-rag-badge ' + ragClass }, [data.ragStatus]);
    var header = sectionHeader('Executive Summary', function () { return section; });
    header.querySelector('h2').appendChild(ragBadge);
    section.appendChild(header);

    var kpiRow = el('div', { class: 'report-kpi-row' }, data.kpis.map(function (tile) {
      return el('div', { class: 'report-kpi-tile' }, [
        el('div', { class: 'report-kpi-tile-label' }, [tile.label]),
        el('div', { class: 'report-kpi-tile-value' }, [tile.value]),
      ]);
    }));
    section.appendChild(kpiRow);

    var statusRow = el('div', { class: 'report-status-counts' }, Object.keys(data.statusCounts).map(function (status) {
      return el('div', { class: 'report-status-count-item' }, [
        el('span', { class: 'report-status-count-label' }, [status]),
        el('span', { class: 'report-status-count-value' }, [String(data.statusCounts[status])]),
      ]);
    }));
    section.appendChild(statusRow);

    return section;
  }

  function renderRoadmapSection(data) {
    var section = el('section', { class: 'report-section report-section-roadmap' });
    section.appendChild(sectionHeader('Progress Roadmap', function () { return section; }));

    if (!data.rangeStart) {
      section.appendChild(el('p', { class: 'report-empty-note' }, ['No tasks with planned dates to chart.']));
      return section;
    }

    var LW = 160, HH = 40, RH = 60;
    var width = 1200;
    var height = HH + data.lanes.length * RH;
    var plotW = width - LW;

    var startMs = new Date(data.rangeStart + 'T00:00:00Z').getTime();
    var endMs = new Date(data.rangeEnd + 'T00:00:00Z').getTime();
    var span = Math.max(1, endMs - startMs);
    function xAt(dateISO) {
      var ms = new Date(dateISO + 'T00:00:00Z').getTime();
      return LW + ((ms - startMs) / span) * plotW;
    }

    var svg = svgEl('svg', { width: '100%', viewBox: '0 0 ' + width + ' ' + height, style: 'display:block' });

    data.weeks.forEach(function (week) {
      var x = xAt(week.start);
      svg.appendChild(svgEl('line', { x1: x, y1: HH, x2: x, y2: height, stroke: 'var(--border)', 'stroke-width': 1 }));
      var label = svgEl('text', { x: x + 4, y: HH - 8, 'font-size': 11, fill: 'var(--text-secondary)' });
      label.textContent = week.label;
      svg.appendChild(label);
    });

    data.lanes.forEach(function (lane, laneIndex) {
      var y = HH + laneIndex * RH;
      svg.appendChild(svgEl('rect', { x: 0, y: y, width: LW, height: RH, fill: 'var(--kpmg-blue)' }));
      var label = svgEl('text', { x: 10, y: y + RH / 2 + 4, fill: '#ffffff', 'font-size': 13, 'font-weight': 600 });
      label.textContent = lane.name;
      svg.appendChild(label);
      svg.appendChild(svgEl('rect', { x: LW, y: y, width: plotW, height: RH - 1, fill: laneIndex % 2 === 0 ? '#ffffff' : '#f7f7f8' }));
    });

    var tooltip = document.getElementById('scurve-tooltip');
    data.items.forEach(function (item) {
      var laneIndex = data.lanes.findIndex(function (l) { return l.id === item.laneId; });
      if (laneIndex === -1) return;
      var y = HH + laneIndex * RH + 6 + item.slot * 16;
      var x1 = Math.max(LW + 1, xAt(item.plannedStart));
      var x2 = Math.min(width - 1, xAt(item.plannedFinish) + 4);
      var color = item.isMeeting ? '#7c4dff' : (item.deliverable ? '#c00000' : 'var(--kpmg-blue-light)');

      var shape;
      if (item.deliverable) {
        var cx = x2;
        shape = svgEl('polygon', { points: (cx - 6) + ',' + (y + 12) + ' ' + (cx + 6) + ',' + (y + 12) + ' ' + cx + ',' + y, fill: color });
      } else {
        shape = svgEl('rect', { x: x1, y: y, width: Math.max(4, x2 - x1), height: 10, rx: 2, fill: color });
      }
      shape.addEventListener('mouseenter', function (e) {
        tooltip.hidden = false;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
        tooltip.textContent = item.name + ' — ' + item.owner + ' — ' + item.plannedStart + ' to ' + item.plannedFinish;
      });
      shape.addEventListener('mouseleave', function () { tooltip.hidden = true; });
      svg.appendChild(shape);
    });

    if (data.statusDate >= data.rangeStart && data.statusDate <= data.rangeEnd) {
      var sx = xAt(data.statusDate);
      svg.appendChild(svgEl('line', { x1: sx, y1: HH, x2: sx, y2: height, stroke: 'var(--status-delayed)', 'stroke-width': 2, 'stroke-dasharray': '5 3' }));
    }

    section.appendChild(svg);
    return section;
  }

  function renderWeeklySection(data) {
    var section = el('section', { class: 'report-section report-section-weekly' });
    section.appendChild(sectionHeader('Weekly Actions', function () { return section; }));

    var body = el('div', { class: 'report-two-col' }, [
      el('div', {}, [
        el('h3', { class: 'report-subheading' }, ['Completed (Last 7 Days)']),
        data.completedPrior7Days.length
          ? el('ul', { class: 'report-list' }, data.completedPrior7Days.map(function (t) { return el('li', {}, [t.name + ' — ' + t.actualFinish]); }))
          : el('p', { class: 'report-empty-note' }, ['Nothing completed in the last 7 days.']),
      ]),
      el('div', {}, [
        el('h3', { class: 'report-subheading' }, ['Next 14 Days']),
        data.next14Days.length
          ? el('ul', { class: 'report-list' }, data.next14Days.map(function (t) { return el('li', {}, [t.plannedStart + ' — ' + t.name]); }))
          : el('p', { class: 'report-empty-note' }, ['Nothing planned in the next 14 days.']),
      ]),
    ]);
    section.appendChild(body);
    return section;
  }

  function renderRisksSection(data) {
    var section = el('section', { class: 'report-section report-section-risks' });
    section.appendChild(sectionHeader('Risks & Detail', function () { return section; }));

    section.appendChild(el('h3', { class: 'report-subheading' }, ['Delayed / Blocked']));
    section.appendChild(
      data.delayedBlocked.length
        ? el('ul', { class: 'report-list' }, data.delayedBlocked.map(function (t) { return el('li', {}, [t.name + ' (' + t.status + ') — due ' + (t.plannedFinish || '')]); }))
        : el('p', { class: 'report-empty-note' }, ['No delayed or blocked tasks.'])
    );

    section.appendChild(el('h3', { class: 'report-subheading' }, ['Decisions']));
    section.appendChild(
      data.decisions.length
        ? buildTable(['Title', 'Description', 'Needed By', 'Owner', 'Status'], data.decisions, function (d) { return [d.title, d.description, d.decisionNeededBy || '', d.owner, d.status]; })
        : el('p', { class: 'report-empty-note' }, ['No open decisions.'])
    );

    section.appendChild(el('h3', { class: 'report-subheading' }, ['Near-Term Detail']));
    section.appendChild(
      data.nearTermDetail.length
        ? buildTable(['Task', 'Owner', 'Start', 'Finish', 'Status'], data.nearTermDetail, function (t) { return [t.name, t.owner, t.plannedStart, t.plannedFinish, t.status]; })
        : el('p', { class: 'report-empty-note' }, ['No near-term tasks.'])
    );

    return section;
  }

  function renderSection(section) {
    if (section.type === 'summary') return renderSummarySection(section.data);
    if (section.type === 'roadmap') return renderRoadmapSection(section.data);
    if (section.type === 'weekly') return renderWeeklySection(section.data);
    return renderRisksSection(section.data);
  }

  function renderReport(state) {
    var panel = document.getElementById('report-panel');
    panel.innerHTML = '';
    var sections = PP.buildReportSections(state.project, state.calc);
    sections.forEach(function (section) {
      panel.appendChild(renderSection(section));
    });
  }

  function wireReports() {
    // no toolbar-level wiring needed — each section's Copy as Image button is wired inline when rendered.
  }

  window.PP = window.PP || {};
  window.PP.renderReport = renderReport;
  window.PP.wireReports = wireReports;
})();
```

- [ ] **Step 3: Replace the report CSS block in `layout.css`**

Delete lines 363-437 of `src/css/layout.css` (from `#report-panel-wrap { ... }` through `.report-calendar-chip-Workshop { ... }`) and replace with:

```css
#report-panel-wrap { overflow: auto; background: var(--surface-sunken); padding: 24px; border-radius: var(--radius-lg); }
#report-panel { display: flex; flex-direction: column; gap: 24px; }

.report-section { background: #ffffff; color: #1d1d1f; border-radius: 15px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 24px 28px; }
.report-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 3px solid #E5007E; padding-bottom: 10px; }
.report-section-header h2 { font-size: 22px; font-weight: 600; color: #00338D; margin: 0; display: flex; align-items: center; gap: 10px; }
.report-copy-btn { background: var(--kpmg-blue); color: #fff; border: none; border-radius: var(--radius-sm); padding: 7px 14px; cursor: pointer; font-size: 13px; transition: background 150ms ease; }
.report-copy-btn:hover { background: var(--kpmg-blue-mid); }

.report-rag-badge { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.03em; }
.report-rag-OnTrack { background: rgba(52,199,89,0.15); color: #1a8a3d; }
.report-rag-Watch { background: rgba(255,149,0,0.15); color: #b3690a; }
.report-rag-AtRisk { background: rgba(192,0,0,0.15); color: #c00000; }

.report-kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
.report-kpi-tile { background: #f7f7f8; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.report-kpi-tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6e73; }
.report-kpi-tile-value { font-size: 22px; font-weight: 600; color: #00338D; }

.report-status-counts { display: flex; gap: 16px; flex-wrap: wrap; }
.report-status-count-item { display: flex; flex-direction: column; align-items: center; padding: 8px 12px; background: #f7f7f8; border-radius: 8px; min-width: 90px; }
.report-status-count-label { font-size: 11px; color: #6e6e73; text-transform: uppercase; }
.report-status-count-value { font-size: 18px; font-weight: 600; color: #00338D; }

.report-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.report-subheading { font-size: 15px; font-weight: 600; color: #005EB8; margin: 16px 0 6px 0; }
.report-list { font-size: 13px; padding-left: 20px; margin: 8px 0; }
.report-empty-note { color: #6e6e73; font-size: 13px; font-style: italic; }

.report-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
.report-table th, .report-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5ea; }
.report-table th { background: #f7f7f8; color: #00338D; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
```

- [ ] **Step 4: Remove pagination CSS from `print.css`**

Replace the entire contents of `src/css/print.css` with:

```css
@media print {
  body * { visibility: hidden; }
  #report-panel, #report-panel * { visibility: visible; }
  #report-panel-wrap { overflow: visible; padding: 0; background: none; }
  #report-panel { position: absolute; top: 0; left: 0; width: 100%; }
  #app-header, #toolbar, #view-tabs, #reports-toolbar, #name-picker, #context-menu, #scurve-tooltip { display: none !important; }
}
```
(the `.report-page` pagination block is gone — sections are no longer fixed-height pages; the chrome-hiding rules stay in case anyone still uses the browser's native print on this tab, but nothing in the app links to it anymore since Copy-as-Image is now the primary export.)

- [ ] **Step 5: Build and confirm no regressions**

```bash
node --check src/js/ui/reports.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 3's final count (this task touches no engine/logic file in a test-observable way).

- [ ] **Step 6: Commit**

```bash
git add src/js/ui/reports.js src/css/layout.css src/css/print.css src/index.html
git commit -m "feat: rewrite Reports tab UI into 4-section dashboard with per-section Copy as Image"
```

---

### Task 5: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as this repo's prior final-verification tasks: the controller drives a real browser via the Playwright tools already available in this session, not a dispatched subagent.

**Files:** none (verification only).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
python3 build.py
node --test
```

Expected: test count matches Task 3's final count exactly (Task 4 adds no tests).

- [ ] **Step 2: Serve the built app and seed a realistic project**

```bash
cd dist && python3 -m http.server 8794
```

Navigate to it with the Playwright browser tools (`file://` URLs are blocked by the sandbox). Complete the name-picker overlay if it appears. Load a project with tasks across at least 2 top-level phases, a mix of statuses (including at least one Delayed and one Blocked if possible), at least one deliverable-flagged task, at least one task with "Workshop" or "Meeting" in its name, and at least one open decision.

- [ ] **Step 3: Confirm all 4 sections render**

Open the Reports tab. Confirm: Executive Summary shows the RAG badge, 6 KPI tiles, and a status-count row; Progress Roadmap shows an SVG timeline with one row per top-level phase, colored items, and a dashed status-date line; Weekly Actions shows two lists; Risks & Detail shows the delayed/blocked list, decisions table, and near-term detail table. Zero console errors.

- [ ] **Step 4: Confirm Copy as Image works per section**

Click each section's "Copy as Image" button (a real `browser_click`, not a JS-evaluated click — clipboard writes need a genuine user gesture). Confirm no error alert appears for any of the 4.

- [ ] **Step 5: Confirm the roadmap tooltip and generic lane derivation**

Hover a roadmap item, confirm the tooltip shows name/owner/dates. Confirm the lane labels match the loaded project's actual top-level task names (not any hardcoded phase names).

- [ ] **Step 6: Verify zero regression to every other tab**

Click through Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Deliverable/Billing, Settings, Holidays, Activities, Issues/Risks/Decisions. Confirm no console errors and each tab still renders its content.

- [ ] **Step 7: Final test sweep**

```bash
node --test
```

Expected: same count as Step 1 — nothing regressed.

- [ ] **Step 8: Record the result**

If every check in Steps 1-7 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-4: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.
