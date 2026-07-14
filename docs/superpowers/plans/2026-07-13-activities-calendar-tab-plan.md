# Activities Calendar Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, independent "Activities" tab where Workshop and Meeting entries (with date ranges, optional times, linked participant groups, and an optional key-date flag) are logged and rendered as a monthly Mon–Fri calendar grid — matching the reference PDF's "การดำเนินการลำดับถัดไป" (Next Steps) calendar page: colored event chips by type, participant-group color tags, multi-day banner bars, and gold-star key dates.

**Architecture:** Task 1 adds a new pure engine file, `src/js/calendar.js`, exporting `computeCalendarLayout(year, month, activities)` — a standalone, Node-testable function that turns a month + a flat activities array into a renderable week/day grid plus per-activity "segments" (which day-columns each activity/banner occupies, with stacking lanes for same-day overlaps). This function has no DOM dependency and is the exact contract the separate, not-yet-started Reports overhaul plan will call to render the same calendar inside a printed report page — its name and signature are fixed by this plan and cannot change without breaking that future plan sight-unseen. Task 2 adds `activityGroups` and `activities` collections plus CRUD methods to the `Project` class in `store.js` (mirroring the existing `addTask`/`updateTask`/`deleteTask` shape), Node-tested. Task 3 wires up the UI: a new view tab (button + container + `VIEW_IDS` + `build.py` JS_ORDER entries), a new `src/js/ui/activities.js` UI file (Add Activity form, participant-group manager, month nav, calendar grid rendering via Task 1's engine function, hover tooltip reusing the existing `#scurve-tooltip` element), and supporting CSS. Task 4 is controller-run browser verification.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies, Python 3 stdlib-only build script.

## Global Constraints

- Zero external dependencies, runtime or dev — ever. No npm packages, no CDN, no bundler.
- Engines (`src/js/*.js`): UMD-lite wrapper — `module.exports` for Node, attach to `globalThis.PP` for browser. Pure logic, no DOM, Node-tested. `src/js/ui/*.js` files: plain IIFEs, no UMD, never required by Node tests, no jsdom — verified only via real-browser Playwright checks.
- Any user-controlled string (activity name, remarks, participant group name) going into the DOM must be escaped or built via `.textContent`/`createTextNode`/property assignment — never concatenated into `innerHTML`. This plan's UI file builds all content via `createElement`/`textContent` (the same pattern `holidays.js` and `resources.js` already use), so no raw-string `innerHTML` concatenation is introduced anywhere.
- Adding a new view tab must update all three places or the tab is clickable but stays blank: the `.view-tab[data-view=...]` button in `src/index.html`, the `<div id="...-view">` container in `src/index.html`, and the `VIEW_IDS` array in `src/js/ui/app.js`. Task 3 touches all three.
- `activityGroups` is project-level and configurable (same pattern as `picList`), **not** hardcoded to the three KPMG committee names shown in the reference screenshot — a project can define its own groups and colors.
- The calendar grid is Mon–Fri only (5 columns) — weekends are collapsed/omitted, matching the reference. Multi-day activities that span a weekend must render as separate banner segments, one per week row, since there is no weekend day-cell for a banner to visually cross.
- The calendar-layout computation (given a month + activities, compute which day cells each activity/banner occupies) **must** be a standalone, pure, Node-testable function in an engine file (`src/js/calendar.js`), not buried inside the UI file — because the separate, future Reports overhaul plan reuses this exact function to render the same calendar inside a printed report page.
- Out of scope (per the design spec, do not build): recurring/weekly-standing activities (every activity is a one-off entry), any conflict/overlap detection between activities on the same day beyond visual lane-stacking, and the Reports overhaul's specific print layout of this calendar (this plan only guarantees the underlying layout function is reusable).
- This plan has no dependency on any other pending plan and can be built on an independent branch/worktree in parallel with the Issues/Risks/Decisions tab plan. It must merge before the Reports overhaul plan, which reuses this plan's calendar-layout engine function to render the report's Next Steps calendar page — that function's exact exported name and signature must be stated unambiguously in this plan's Task 1 Interfaces block since the Reports plan depends on it sight-unseen.
- Current baseline: **verify via `cd project-planner && node --test` at the start of execution — do not assume a count.** As of the writing of this plan the verified baseline was 174/174. Since this branch is independent of other in-flight plans, the true baseline at execution time may differ; all step-by-step counts below are expressed relative to whatever that freshly-verified number is, using 174 as the concrete anchor for illustration.

---

### Task 1: Calendar-layout engine (`src/js/calendar.js`)

**Files:**
- Create: `project-planner/src/js/calendar.js`
- Create: `project-planner/tests/calendar.test.js`

**Interfaces (binding contract for the future Reports overhaul plan):**
- Exported function: **`computeCalendarLayout(year, month, activities)`**, exported from `src/js/calendar.js`, attached as `PP.computeCalendarLayout` in the browser and via `module.exports` in Node (same UMD-lite pattern as `calc.js`).
  - `year`: four-digit number, e.g. `2026`.
  - `month`: 0-based month index, `0`=January .. `11`=December (matches `Date.UTC`'s convention, the same convention already used by `holidays.js`'s `renderCalendarStrip`).
  - `activities`: a flat array of activity objects shaped exactly like `project.activities` entries (Task 2's data model): `{ id, type, name, dateStart, dateEnd, timeStart, timeEnd, groupIds, keyDate, remarks }`. `dateStart`/`dateEnd` are required ISO date strings (`YYYY-MM-DD`); an activity missing either is silently skipped (no crash, zero segments contributed).
  - Returns: `{ year, month, weeks, segments }`.
    - `weeks`: an array of week rows, each `{ days: [cell|null, cell|null, cell|null, cell|null, cell|null] }` — exactly 5 entries per row, index 0=Monday..4=Friday. A cell is `null` when that weekday column falls outside the target month (padding), otherwise `{ date: 'YYYY-MM-DD', dayOfMonth: Number, keyDate: Boolean }`. Rows that would be entirely padding (only possible as the very first row, when the 1st of the month falls on a Saturday or Sunday) are trimmed from the array entirely — `weeks[0]` always has at least one non-null cell.
    - `segments`: a flat array, one entry per (activity × week-row it touches): `{ activity, weekIndex, startCol, endCol, lane }`. `activity` is the **original object reference** passed in (not a clone) so the caller has every field (`type`, `name`, `timeStart`, `timeEnd`, `groupIds`, `keyDate`, `remarks`, etc.) without a second lookup. `weekIndex` is the index into the returned `weeks` array. `startCol`/`endCol` are 0-based inclusive Mon(0)..Fri(4) columns within that week row (equal for a single-day activity). `lane` is a 0-based stacking index — segments in the same week row whose column ranges overlap are assigned different `lane` values (greedy interval packing) so a renderer can stack them without visual collision; non-overlapping segments in the same row may share `lane` 0.
    - An activity's date range is clipped to `[year-month-01, year-month-last-day]` before layout — an activity that starts in the previous month or ends in the next month only contributes segments for the days that fall inside the requested month. An activity entirely outside the requested month contributes zero segments.
  - This exact name, parameter order, and return shape is what the Reports overhaul plan will call directly — do not rename fields or reorder parameters in a later plan without updating this contract.

- [ ] **Step 1: Write the failing tests**

Create `project-planner/tests/calendar.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCalendarLayout } = require('../src/js/calendar.js');

function act(overrides) {
  return Object.assign({
    type: 'Meeting', name: 'Untitled', dateStart: null, dateEnd: null,
    timeStart: null, timeEnd: null, groupIds: [], keyDate: false, remarks: '',
  }, overrides);
}

test('computeCalendarLayout returns a Mon-Fri week grid for July 2026 with correct day numbers and no activities', () => {
  const layout = computeCalendarLayout(2026, 6, []);
  assert.equal(layout.year, 2026);
  assert.equal(layout.month, 6);
  assert.equal(layout.weeks.length, 5);
  const dayNumbers = layout.weeks.map(w => w.days.map(d => d ? d.dayOfMonth : null));
  assert.deepEqual(dayNumbers, [
    [null, null, 1, 2, 3],
    [6, 7, 8, 9, 10],
    [13, 14, 15, 16, 17],
    [20, 21, 22, 23, 24],
    [27, 28, 29, 30, 31],
  ]);
  assert.equal(layout.weeks[1].days[3].date, '2026-07-09');
  assert.deepEqual(layout.segments, []);
});

test('computeCalendarLayout trims an entirely-blank leading week row when the month starts on a weekend (August 2026)', () => {
  const layout = computeCalendarLayout(2026, 7, []);
  assert.equal(layout.weeks.length, 5);
  const dayNumbers = layout.weeks.map(w => w.days.map(d => d ? d.dayOfMonth : null));
  assert.deepEqual(dayNumbers, [
    [3, 4, 5, 6, 7],
    [10, 11, 12, 13, 14],
    [17, 18, 19, 20, 21],
    [24, 25, 26, 27, 28],
    [31, null, null, null, null],
  ]);
});

test('a single-day Meeting occupies exactly one day cell (one segment, lane 0)', () => {
  const meeting = act({ id: 'act_single', type: 'Meeting', name: 'Internal Meeting', dateStart: '2026-07-09', dateEnd: '2026-07-09', timeStart: '14:30', timeEnd: '15:30' });
  const layout = computeCalendarLayout(2026, 6, [meeting]);
  assert.equal(layout.segments.length, 1);
  const seg = layout.segments[0];
  assert.equal(seg.weekIndex, 1);
  assert.equal(seg.startCol, 3);
  assert.equal(seg.endCol, 3);
  assert.equal(seg.lane, 0);
  assert.equal(seg.activity, meeting);
});

test('a multi-day Workshop spanning a weekend gap splits into two segments, one per week row', () => {
  const workshop = act({ id: 'act_multi', type: 'Workshop', name: 'Discovery Workshop', dateStart: '2026-07-09', dateEnd: '2026-07-13' });
  const layout = computeCalendarLayout(2026, 6, [workshop]);
  assert.equal(layout.segments.length, 2);
  const [seg1, seg2] = layout.segments;
  assert.equal(seg1.weekIndex, 1);
  assert.equal(seg1.startCol, 3);
  assert.equal(seg1.endCol, 4);
  assert.equal(seg2.weekIndex, 2);
  assert.equal(seg2.startCol, 0);
  assert.equal(seg2.endCol, 0);
});

test('a keyDate activity marks its day cell keyDate:true and leaves other cells false', () => {
  const keyMeeting = act({ id: 'act_key', name: 'Steering Review', dateStart: '2026-07-09', dateEnd: '2026-07-09', keyDate: true });
  const layout = computeCalendarLayout(2026, 6, [keyMeeting]);
  assert.equal(layout.weeks[1].days[3].keyDate, true);
  assert.equal(layout.weeks[1].days[4].keyDate, false);
  assert.equal(layout.weeks[0].days[2].keyDate, false);
});

test('two activities on the same day are assigned separate stacked lanes', () => {
  const a = act({ id: 'act_a', name: 'Steering Committee Update', dateStart: '2026-07-06', dateEnd: '2026-07-06' });
  const b = act({ id: 'act_b', name: 'Team Sync', dateStart: '2026-07-06', dateEnd: '2026-07-06' });
  const layout = computeCalendarLayout(2026, 6, [a, b]);
  assert.equal(layout.segments.length, 2);
  const segA = layout.segments.find(s => s.activity.id === 'act_a');
  const segB = layout.segments.find(s => s.activity.id === 'act_b');
  assert.equal(segA.weekIndex, 1);
  assert.equal(segA.startCol, 0);
  assert.equal(segA.lane, 0);
  assert.equal(segB.weekIndex, 1);
  assert.equal(segB.startCol, 0);
  assert.equal(segB.lane, 1);
});

test('an activity date range is clipped to the target month at a cross-month boundary', () => {
  const crossMonth = act({ id: 'act_clip', name: 'Cross-month', dateStart: '2026-06-29', dateEnd: '2026-07-01' });
  const layout = computeCalendarLayout(2026, 6, [crossMonth]);
  assert.equal(layout.segments.length, 1);
  const seg = layout.segments[0];
  assert.equal(seg.weekIndex, 0);
  assert.equal(seg.startCol, 2);
  assert.equal(seg.endCol, 2);
});

test('an activity entirely outside the target month produces zero segments', () => {
  const outside = act({ id: 'act_out', name: 'Nope', dateStart: '2026-08-05', dateEnd: '2026-08-05' });
  const layout = computeCalendarLayout(2026, 6, [outside]);
  assert.equal(layout.segments.length, 0);
});

test('an activity with a missing dateStart or dateEnd is skipped without crashing', () => {
  const noStart = act({ id: 'act_nostart', name: 'Bad', dateStart: null, dateEnd: '2026-07-09' });
  const noEnd = act({ id: 'act_noend', name: 'Bad2', dateStart: '2026-07-09', dateEnd: null });
  const layout = computeCalendarLayout(2026, 6, [noStart, noEnd]);
  assert.equal(layout.segments.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `Cannot find module '../src/js/calendar.js'`, since the file doesn't exist yet.

- [ ] **Step 3: Implement `calendar.js`**

Create `project-planner/src/js/calendar.js`:

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

  const schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : globalThis.PP;
  const { parseISO, toISO } = schedule;

  const DAY_MS = 86400000;

  function mondayOnOrBefore(ms) {
    const dow = new Date(ms).getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    return ms - daysSinceMonday * DAY_MS;
  }

  function colOf(ms) {
    return new Date(ms).getUTCDay() - 1;
  }

  function computeCalendarLayout(year, month, activities) {
    const firstOfMonthMs = Date.UTC(year, month, 1);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lastOfMonthMs = Date.UTC(year, month, daysInMonth);

    const firstRowMondayMs = mondayOnOrBefore(firstOfMonthMs);
    const lastRowMondayMs = mondayOnOrBefore(lastOfMonthMs);
    const rawWeekCount = Math.round((lastRowMondayMs - firstRowMondayMs) / (7 * DAY_MS)) + 1;

    function rawWeekIndexOf(ms) {
      return Math.round((mondayOnOrBefore(ms) - firstRowMondayMs) / (7 * DAY_MS));
    }

    const rawWeeks = [];
    for (let w = 0; w < rawWeekCount; w++) rawWeeks.push({ days: [null, null, null, null, null] });

    for (let d = 1; d <= daysInMonth; d++) {
      const ms = Date.UTC(year, month, d);
      const dow = new Date(ms).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const w = rawWeekIndexOf(ms);
      const col = colOf(ms);
      rawWeeks[w].days[col] = { date: toISO(ms), dayOfMonth: d, keyDate: false };
    }

    let firstUsed = 0;
    while (firstUsed < rawWeeks.length && rawWeeks[firstUsed].days.every(c => c === null)) firstUsed++;
    let lastUsed = rawWeeks.length - 1;
    while (lastUsed >= firstUsed && rawWeeks[lastUsed].days.every(c => c === null)) lastUsed--;

    const weeks = rawWeeks.slice(firstUsed, lastUsed + 1);
    function trimmedWeekIndex(rawIndex) { return rawIndex - firstUsed; }

    const segments = [];
    const sortedActivities = activities.slice().sort((a, b) => {
      if (a.dateStart !== b.dateStart) return a.dateStart < b.dateStart ? -1 : 1;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    sortedActivities.forEach(function (activity) {
      if (!activity.dateStart || !activity.dateEnd) return;
      const startMs = Math.max(parseISO(activity.dateStart), firstOfMonthMs);
      const endMs = Math.min(parseISO(activity.dateEnd), lastOfMonthMs);
      if (startMs > endMs) return;

      let runStart = null, runWeek = null, runStartCol = null, prevCol = null;
      function flush(endCol) {
        segments.push({ activity, weekIndex: trimmedWeekIndex(runWeek), startCol: runStartCol, endCol });
      }

      for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
        const dow = new Date(ms).getUTCDay();
        if (dow === 0 || dow === 6) {
          if (runStart !== null) { flush(prevCol); runStart = null; }
          continue;
        }
        const w = rawWeekIndexOf(ms);
        const col = colOf(ms);
        if (activity.keyDate) {
          const cell = weeks[trimmedWeekIndex(w)].days[col];
          if (cell) cell.keyDate = true;
        }
        if (runStart === null) {
          runStart = ms; runWeek = w; runStartCol = col; prevCol = col;
        } else if (w !== runWeek) {
          flush(prevCol);
          runStart = ms; runWeek = w; runStartCol = col; prevCol = col;
        } else {
          prevCol = col;
        }
      }
      if (runStart !== null) flush(prevCol);
    });

    weeks.forEach(function (_, wIndex) {
      const rowSegments = segments
        .filter(s => s.weekIndex === wIndex)
        .sort((a, b) => a.startCol - b.startCol);
      const laneEndCols = [];
      rowSegments.forEach(function (seg) {
        let lane = laneEndCols.findIndex(endCol => endCol < seg.startCol);
        if (lane === -1) {
          lane = laneEndCols.length;
          laneEndCols.push(seg.endCol);
        } else {
          laneEndCols[lane] = seg.endCol;
        }
        seg.lane = lane;
      });
    });

    return { year, month, weeks, segments };
  }

  return { computeCalendarLayout };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 183/183 total (174 baseline + 9 new tests in this task).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/calendar.js tests/calendar.test.js
git commit -m "Add computeCalendarLayout: pure month/activities-to-grid layout engine"
```

---

### Task 2: `activityGroups` + `activities` data model (`store.js`)

**Files:**
- Modify: `project-planner/src/js/store.js`
- Modify: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new (uses existing `generateId()`, `_pushUndo()`).
- Produces, all newly added to the `Project` class:
  - `addActivityGroup({ name, color })` → creates and returns `{ id, name, color }`, pushed onto `project.activityGroups`. Defaults: `name=''`, `color='#0b1f6b'`.
  - `updateActivityGroup(id, patch)` → patches an existing group in place, returns it. Throws if `id` not found.
  - `deleteActivityGroup(id)` → removes the group and strips its id out of every activity's `groupIds`. Throws if `id` not found.
  - `addActivity({ type, name, dateStart, dateEnd, timeStart, timeEnd, groupIds, keyDate, remarks })` → creates and returns an activity shaped exactly like Task 1's contract: `{ id, type, name, dateStart, dateEnd, timeStart, timeEnd, groupIds, keyDate, remarks }`. `dateEnd` defaults to `dateStart` when omitted/falsy (single-day activity). `timeStart`/`timeEnd` default to `null`. `groupIds` defaults to `[]` (copied, not the same array reference). `keyDate` coerced to boolean, default `false`.
  - `updateActivity(id, patch)` → patches an existing activity in place, returns it. Throws if `id` not found.
  - `deleteActivity(id)` → removes the activity. Throws if `id` not found.
  - All six methods call `this._pushUndo()` before mutating, so they participate in the existing undo/redo stack exactly like `addTask`/`updateTask`/`deleteTask`. None of them call `this._audit(...)` — activities have no per-field audit trail concept in this app (same as `holidays`/`picList`).
  - `project.activityGroups` and `project.activities` are new top-level arrays on `Project`, included in `toJSON()`/`_applyState()`, defaulted to `[]` in the constructor for legacy projects that predate this plan, and present (as `[]`) in `Project.empty()`.
- Task 3 depends on these exact method names/signatures and on the exact activity/group field names.

- [ ] **Step 1: Write the failing tests**

Add to `project-planner/tests/store.test.js` (append; the existing top-of-file import line does not need to change since no new export is added — `Project`'s new methods are consumed via instances):

```js
test('Project constructor defaults activityGroups/activities to empty arrays for legacy projects without them', () => {
  const p = new Project({
    meta: { id: 'x', name: 'Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [], holidays: [], picList: [], snapshots: [], auditLog: [], settings: {},
  });
  assert.deepEqual(p.activityGroups, []);
  assert.deepEqual(p.activities, []);
});

test('addActivityGroup creates a group with generated id, defaults color if omitted', () => {
  const p = Project.empty('Test');
  const g = p.addActivityGroup({ name: 'Steering Committee', color: '#0b1f6b' });
  assert.equal(p.activityGroups.length, 1);
  assert.equal(g.name, 'Steering Committee');
  assert.equal(g.color, '#0b1f6b');
  assert.match(g.id, /^t_/);
});

test('addActivityGroup undo removes the created group', () => {
  const p = Project.empty('Test');
  p.addActivityGroup({ name: 'A', color: '#111111' });
  assert.equal(p.activityGroups.length, 1);
  p.undo();
  assert.equal(p.activityGroups.length, 0);
});

test('updateActivityGroup patches name/color', () => {
  const p = Project.empty('Test');
  const g = p.addActivityGroup({ name: 'A', color: '#111111' });
  p.updateActivityGroup(g.id, { name: 'Renamed', color: '#222222' });
  const found = p.activityGroups.find(x => x.id === g.id);
  assert.equal(found.name, 'Renamed');
  assert.equal(found.color, '#222222');
});

test('updateActivityGroup throws for an unknown id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateActivityGroup('missing', { name: 'X' }));
});

test('deleteActivityGroup removes the group and strips it from any activity groupIds', () => {
  const p = Project.empty('Test');
  const g1 = p.addActivityGroup({ name: 'A', color: '#111111' });
  const g2 = p.addActivityGroup({ name: 'B', color: '#222222' });
  const act = p.addActivity({ type: 'Meeting', name: 'Kickoff', dateStart: '2026-07-06', groupIds: [g1.id, g2.id] });
  p.deleteActivityGroup(g1.id);
  assert.equal(p.activityGroups.length, 1);
  assert.deepEqual(p.activities.find(a => a.id === act.id).groupIds, [g2.id]);
});

test('deleteActivityGroup throws for an unknown id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.deleteActivityGroup('missing'));
});

test('addActivity defaults dateEnd to dateStart when omitted, and normalizes optional fields', () => {
  const p = Project.empty('Test');
  const a = p.addActivity({ type: 'Meeting', name: 'Internal Sync', dateStart: '2026-07-06' });
  assert.equal(a.dateEnd, '2026-07-06');
  assert.equal(a.timeStart, null);
  assert.equal(a.timeEnd, null);
  assert.deepEqual(a.groupIds, []);
  assert.equal(a.keyDate, false);
  assert.match(a.id, /^t_/);
});

test('addActivity keeps an explicit dateEnd for multi-day activities', () => {
  const p = Project.empty('Test');
  const a = p.addActivity({ type: 'Workshop', name: 'Discovery Workshop', dateStart: '2026-07-09', dateEnd: '2026-07-13' });
  assert.equal(a.dateStart, '2026-07-09');
  assert.equal(a.dateEnd, '2026-07-13');
});

test('updateActivity patches fields', () => {
  const p = Project.empty('Test');
  const a = p.addActivity({ type: 'Meeting', name: 'Sync', dateStart: '2026-07-06' });
  p.updateActivity(a.id, { name: 'Renamed Sync', keyDate: true });
  const found = p.activities.find(x => x.id === a.id);
  assert.equal(found.name, 'Renamed Sync');
  assert.equal(found.keyDate, true);
});

test('updateActivity throws for an unknown id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateActivity('missing', { name: 'X' }));
});

test('deleteActivity removes the activity', () => {
  const p = Project.empty('Test');
  const a = p.addActivity({ type: 'Meeting', name: 'Sync', dateStart: '2026-07-06' });
  p.deleteActivity(a.id);
  assert.equal(p.activities.length, 0);
});

test('deleteActivity throws for an unknown id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.deleteActivity('missing'));
});

test('addActivity/addActivityGroup participate in the undo stack like addTask', () => {
  const p = Project.empty('Test');
  const undoStackBefore = p._undoStack.length;
  p.addActivityGroup({ name: 'A', color: '#111111' });
  p.addActivity({ type: 'Meeting', name: 'Sync', dateStart: '2026-07-06' });
  assert.equal(p._undoStack.length, undoStackBefore + 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `p.addActivityGroup is not a function` (and similar) for every new test above; the legacy-defaults test also fails since `activityGroups`/`activities` don't exist on `Project` yet.

- [ ] **Step 3: Implement the data model and CRUD methods**

In `project-planner/src/js/store.js`, change the constructor from:

```js
    constructor(data) {
      this.meta = data.meta;
      this.tasks = data.tasks;
      this.holidays = data.holidays;
      this.picList = data.picList;
      this.snapshots = data.snapshots;
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this._undoStack = [];
      this._redoStack = [];
```

to:

```js
    constructor(data) {
      this.meta = data.meta;
      this.tasks = data.tasks;
      this.holidays = data.holidays;
      this.picList = data.picList;
      this.snapshots = data.snapshots;
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this.activityGroups = data.activityGroups || [];
      this.activities = data.activities || [];
      this._undoStack = [];
      this._redoStack = [];
```

Change `static empty(name)` from:

```js
        tasks: [],
        holidays: [],
        picList: [],
        snapshots: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
      });
    }
```

to:

```js
        tasks: [],
        holidays: [],
        picList: [],
        snapshots: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
        activityGroups: [],
        activities: [],
      });
    }
```

Change `toJSON()` from:

```js
        snapshots: this.snapshots,
        auditLog: this.auditLog,
        settings: this.settings,
      };
    }
```

to:

```js
        snapshots: this.snapshots,
        auditLog: this.auditLog,
        settings: this.settings,
        activityGroups: this.activityGroups,
        activities: this.activities,
      };
    }
```

Change `_applyState(state)` from:

```js
      this.snapshots = state.snapshots;
      this.auditLog = state.auditLog;
      this.settings = state.settings;
    }
```

to:

```js
      this.snapshots = state.snapshots;
      this.auditLog = state.auditLog;
      this.settings = state.settings;
      this.activityGroups = state.activityGroups;
      this.activities = state.activities;
    }
```

Finally, add the six new CRUD methods right after `toggleCollapse`, changing:

```js
    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }
  }
```

to:

```js
    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }

    addActivityGroup({ name = '', color = '#0b1f6b' } = {}) {
      this._pushUndo();
      const group = { id: generateId(), name, color };
      this.activityGroups.push(group);
      return group;
    }

    updateActivityGroup(id, patch) {
      const group = this.activityGroups.find(g => g.id === id);
      if (!group) throw new Error(`Activity group not found: ${id}`);
      this._pushUndo();
      Object.assign(group, patch);
      return group;
    }

    deleteActivityGroup(id) {
      if (!this.activityGroups.some(g => g.id === id)) throw new Error(`Activity group not found: ${id}`);
      this._pushUndo();
      this.activityGroups = this.activityGroups.filter(g => g.id !== id);
      this.activities.forEach(a => {
        a.groupIds = a.groupIds.filter(gid => gid !== id);
      });
    }

    addActivity({ type = 'Meeting', name = '', dateStart = null, dateEnd = null, timeStart = null, timeEnd = null, groupIds = [], keyDate = false, remarks = '' } = {}) {
      this._pushUndo();
      const activity = {
        id: generateId(), type, name,
        dateStart, dateEnd: dateEnd || dateStart,
        timeStart: timeStart || null, timeEnd: timeEnd || null,
        groupIds: groupIds.slice(), keyDate: !!keyDate, remarks,
      };
      this.activities.push(activity);
      return activity;
    }

    updateActivity(id, patch) {
      const activity = this.activities.find(a => a.id === id);
      if (!activity) throw new Error(`Activity not found: ${id}`);
      this._pushUndo();
      Object.assign(activity, patch);
      return activity;
    }

    deleteActivity(id) {
      if (!this.activities.some(a => a.id === id)) throw new Error(`Activity not found: ${id}`);
      this._pushUndo();
      this.activities = this.activities.filter(a => a.id !== id);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 197/197 total (183 from Task 1 + 14 new tests in this task).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/store.js tests/store.test.js
git commit -m "Add activityGroups/activities data model and CRUD methods to Project"
```

---

### Task 3: Activities tab UI

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/build.py`
- Modify: `project-planner/src/css/layout.css`
- Create: `project-planner/src/js/ui/activities.js`

**Interfaces:**
- Consumes: `PP.computeCalendarLayout(year, month, activities)` (Task 1), `state.project.activityGroups`/`.activities` and `state.project.addActivity(...)`/`deleteActivity(...)`/`addActivityGroup(...)`/`updateActivityGroup(...)`/`deleteActivityGroup(...)` (Task 2 — this UI does not expose per-activity editing, only add/remove for activities and full add/rename/recolor/remove for groups, so `updateActivity` is left unused here but stays available in `store.js` for future UI or the Reports overhaul), the existing global `#scurve-tooltip` element and its `hidden`/`style.left`/`style.top`/`textContent` hover pattern (already used by `scurve.js`, reused here verbatim — no new tooltip mechanism is introduced).
- Produces: `PP.renderActivities(state)` and `PP.wireActivities(state, onChanged)`, following the exact same shape as `PP.renderHolidays(state)`/`PP.wireHolidays(state, onChanged)`. New `state` fields `activitiesViewYear`/`activitiesViewMonth` (nullable, default to the project's status date when unset — same pattern as `state.holidaysViewYear`).
- No automated tests (UI file, no jsdom in this repo) — verified via Task 4's controller-run Playwright checks.

- [ ] **Step 1: Add the tab button and view container to `index.html`**

In `project-planner/src/index.html`, change:

```html
    <button class="view-tab" data-view="holidays">Holidays</button>
    <button class="view-tab" data-view="reports">Reports</button>
  </div>
```

to:

```html
    <button class="view-tab" data-view="holidays">Holidays</button>
    <button class="view-tab" data-view="activities">Activities</button>
    <button class="view-tab" data-view="reports">Reports</button>
  </div>
```

Then change:

```html
    <div id="holidays-calendar"></div>
    <div id="holidays-table"></div>
  </div>
  <div id="reports-view" hidden>
```

to:

```html
    <div id="holidays-calendar"></div>
    <div id="holidays-table"></div>
  </div>
  <div id="activities-view" hidden>
    <div id="activities-toolbar">
      <select id="new-activity-type">
        <option value="Meeting">Meeting</option>
        <option value="Workshop">Workshop</option>
      </select>
      <input id="new-activity-name" type="text" placeholder="Activity name">
      <label>Start <input id="new-activity-date-start" type="date"></label>
      <label>End <input id="new-activity-date-end" type="date"></label>
      <input id="new-activity-time-start" type="text" placeholder="Time start (e.g. 9:30)">
      <input id="new-activity-time-end" type="text" placeholder="Time end (e.g. 10:30)">
      <div id="new-activity-groups"></div>
      <label><input type="checkbox" id="new-activity-keydate"> Key date</label>
      <input id="new-activity-remarks" type="text" placeholder="Remarks">
      <button id="add-activity-button">Add Activity</button>
    </div>
    <div class="settings-section">
      <h3>Participant Groups</h3>
      <div id="activity-groups-editor"></div>
      <input id="new-activity-group-name" type="text" placeholder="Group name">
      <input id="new-activity-group-color" type="color" value="#0b1f6b">
      <button id="add-activity-group-button">Add Group</button>
    </div>
    <div id="activities-month-nav">
      <button id="activities-month-prev">&lsaquo; Prev Month</button>
      <span id="activities-month-label"></span>
      <button id="activities-month-next">Next Month &rsaquo;</button>
    </div>
    <div id="activities-legend"></div>
    <div id="activities-calendar"></div>
    <div id="activities-table"></div>
  </div>
  <div id="reports-view" hidden>
```

Then change the embedded seed project data from:

```html
<script type="application/json" id="project-data">{"meta":{"id":"seed","name":"New Project","statusDate":"2026-01-01","revision":0,"savedBy":null,"savedAt":null,"createdAt":"2026-01-01T00:00:00.000Z","schemaVersion":1},"tasks":[],"holidays":[],"picList":[],"snapshots":[],"auditLog":[],"settings":{"theme":"kpmg-light","ganttZoom":"week"}}</script>
```

to:

```html
<script type="application/json" id="project-data">{"meta":{"id":"seed","name":"New Project","statusDate":"2026-01-01","revision":0,"savedBy":null,"savedAt":null,"createdAt":"2026-01-01T00:00:00.000Z","schemaVersion":1},"tasks":[],"holidays":[],"picList":[],"snapshots":[],"auditLog":[],"settings":{"theme":"kpmg-light","ganttZoom":"week"},"activityGroups":[],"activities":[]}</script>
```

- [ ] **Step 2: Register the new engine and UI file in `build.py`**

In `project-planner/build.py`, change:

```python
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "csv.js",
    "criticalpath.js",
    "workload.js",
    "ui/imagecopy.js",
    "ui/predecessor-picker.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/scurve.js",
    "ui/dashboard.js",
    "ui/snapshots.js",
    "ui/settings.js",
    "ui/holidays.js",
    "ui/reports.js",
    "ui/resources.js",
    "ui/billing.js",
    "ui/app.js",
]
```

to:

```python
JS_ORDER = [
    "schedule.js",
    "calendar.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "csv.js",
    "criticalpath.js",
    "workload.js",
    "ui/imagecopy.js",
    "ui/predecessor-picker.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/scurve.js",
    "ui/dashboard.js",
    "ui/snapshots.js",
    "ui/settings.js",
    "ui/holidays.js",
    "ui/activities.js",
    "ui/reports.js",
    "ui/resources.js",
    "ui/billing.js",
    "ui/app.js",
]
```

`calendar.js` only depends on `schedule.js` (for `parseISO`/`toISO`), so it is placed directly after it, ahead of every other engine — consistent with `calc.js`'s own dependency on `schedule.js`.

- [ ] **Step 3: Add CSS**

In `project-planner/src/css/layout.css`, change:

```css
.holiday-remove-btn { background: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); transition: background 150ms ease, border-color 150ms ease; }
.holiday-remove-btn:hover { background: var(--surface-sunken); border-color: var(--border); }
#reports-view { flex: 1; overflow: auto; padding: 12px 20px; }
```

to:

```css
.holiday-remove-btn { background: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); transition: background 150ms ease, border-color 150ms ease; }
.holiday-remove-btn:hover { background: var(--surface-sunken); border-color: var(--border); }

#activities-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 20px; }
#activities-toolbar input[type="text"], #activities-toolbar select { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; }
#add-activity-button, #add-activity-group-button { background: var(--kpmg-blue); color: #fff; border: none; border-radius: var(--radius-sm); padding: 7px 14px; cursor: pointer; font-size: 13px; transition: background 150ms ease; }
#add-activity-button:hover, #add-activity-group-button:hover { background: var(--kpmg-blue-mid); }

.activity-group-checkbox-label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; margin-right: 10px; }
.activity-group-swatch, .calendar-chip-group-swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }

.activity-group-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.activity-group-name-input { padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; }
.activity-group-remove-btn { background: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); transition: background 150ms ease, border-color 150ms ease; }
.activity-group-remove-btn:hover { background: var(--surface-sunken); border-color: var(--border); }

#activities-month-nav { display: flex; align-items: center; gap: 12px; padding: 12px 20px; }
#activities-month-nav button { background: none; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 14px; font-size: 13px; cursor: pointer; }
#activities-month-label { font-weight: 600; font-size: 14px; color: var(--kpmg-blue); }

.calendar-legend-row { display: flex; gap: 14px; flex-wrap: wrap; padding: 4px 20px; font-size: 12px; }
.calendar-legend-item { display: flex; align-items: center; gap: 5px; }
.calendar-legend-swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.calendar-legend-swatch.calendar-chip-Meeting { background: rgba(0, 145, 218, 0.35); border: 1px solid var(--kpmg-blue-light); }
.calendar-legend-swatch.calendar-chip-Workshop { background: rgba(124, 77, 255, 0.35); border: 1px solid #7c4dff; }

#activities-calendar { padding: 0 20px 20px; }
.calendar-day-header { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin-bottom: 4px; }
.calendar-week { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: minmax(22px, auto); gap: 3px; background: var(--surface-alt); border-radius: var(--radius-sm); padding: 4px; margin-bottom: 4px; }
[data-theme="dark"] .calendar-week { border: 1px solid var(--border); }
.calendar-daynum { font-size: 11px; color: var(--text-tertiary); padding: 2px 4px; }
.calendar-daynum-empty { visibility: hidden; }
.calendar-keydate-star { color: #d4af37; margin-left: 3px; font-size: 10px; }

.calendar-chip { border-radius: var(--radius-sm); padding: 2px 6px; font-size: 11px; overflow: hidden; cursor: default; display: flex; align-items: center; gap: 4px; }
.calendar-chip-Meeting { background: rgba(0, 145, 218, 0.18); border: 1px solid var(--kpmg-blue-light); }
.calendar-chip-Workshop { background: rgba(124, 77, 255, 0.18); border: 1px solid #7c4dff; }
.calendar-chip-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.calendar-chip-time { color: var(--text-secondary); flex-shrink: 0; }

#reports-view { flex: 1; overflow: auto; padding: 12px 20px; }
```

- [ ] **Step 4: Create `activities.js`**

Create `project-planner/src/js/ui/activities.js`:

```js
(function () {
  'use strict';

  var MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function currentActivitiesYear(state) {
    return state.activitiesViewYear || Number(state.project.meta.statusDate.slice(0, 4));
  }

  function currentActivitiesMonth(state) {
    return state.activitiesViewMonth != null ? state.activitiesViewMonth : Number(state.project.meta.statusDate.slice(5, 7)) - 1;
  }

  function renderActivityGroupsEditor(state) {
    var editor = document.getElementById('activity-groups-editor');
    editor.innerHTML = '';
    state.project.activityGroups.forEach(function (group) {
      var row = document.createElement('div');
      row.className = 'activity-group-row';

      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = group.color;
      colorInput.dataset.groupId = group.id;
      colorInput.className = 'activity-group-color-input';

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = group.name;
      nameInput.dataset.groupId = group.id;
      nameInput.className = 'activity-group-name-input';

      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'activity-group-remove-btn';
      removeBtn.dataset.groupId = group.id;

      row.appendChild(colorInput);
      row.appendChild(nameInput);
      row.appendChild(removeBtn);
      editor.appendChild(row);
    });
  }

  function renderNewActivityGroupCheckboxes(state) {
    var wrap = document.getElementById('new-activity-groups');
    var checked = new Set(Array.from(wrap.querySelectorAll('input:checked')).map(function (el) { return el.value; }));
    wrap.innerHTML = '';
    state.project.activityGroups.forEach(function (group) {
      var label = document.createElement('label');
      label.className = 'activity-group-checkbox-label';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = group.id;
      checkbox.checked = checked.has(group.id);
      var swatch = document.createElement('span');
      swatch.className = 'activity-group-swatch';
      swatch.style.background = group.color;
      label.appendChild(checkbox);
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(group.name));
      wrap.appendChild(label);
    });
  }

  function renderActivitiesLegend(state) {
    var container = document.getElementById('activities-legend');
    container.innerHTML = '';

    var typeRow = document.createElement('div');
    typeRow.className = 'calendar-legend-row';
    [['Meeting', 'calendar-chip-Meeting'], ['Workshop', 'calendar-chip-Workshop']].forEach(function (pair) {
      var item = document.createElement('span');
      item.className = 'calendar-legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'calendar-legend-swatch ' + pair[1];
      var label = document.createElement('span');
      label.textContent = pair[0];
      item.appendChild(swatch);
      item.appendChild(label);
      typeRow.appendChild(item);
    });
    container.appendChild(typeRow);

    var groupRow = document.createElement('div');
    groupRow.className = 'calendar-legend-row';
    state.project.activityGroups.forEach(function (group) {
      var item = document.createElement('span');
      item.className = 'calendar-legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'calendar-legend-swatch';
      swatch.style.background = group.color;
      var label = document.createElement('span');
      label.textContent = group.name;
      item.appendChild(swatch);
      item.appendChild(label);
      groupRow.appendChild(item);
    });
    container.appendChild(groupRow);
  }

  function renderActivitiesCalendar(state) {
    var year = currentActivitiesYear(state);
    var month = currentActivitiesMonth(state);
    document.getElementById('activities-month-label').textContent = MONTH_NAMES_FULL[month] + ' ' + year;

    var layout = PP.computeCalendarLayout(year, month, state.project.activities);
    var groupById = new Map(state.project.activityGroups.map(function (g) { return [g.id, g]; }));
    var tooltip = document.getElementById('scurve-tooltip');

    var container = document.getElementById('activities-calendar');
    container.innerHTML = '';

    var dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day-header';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach(function (label) {
      var span = document.createElement('span');
      span.textContent = label;
      dayHeader.appendChild(span);
    });
    container.appendChild(dayHeader);

    layout.weeks.forEach(function (week, weekIndex) {
      var weekEl = document.createElement('div');
      weekEl.className = 'calendar-week';

      week.days.forEach(function (day, col) {
        var cell = document.createElement('div');
        cell.className = 'calendar-daynum' + (day ? '' : ' calendar-daynum-empty');
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = '1';
        if (day) {
          cell.textContent = String(day.dayOfMonth);
          if (day.keyDate) {
            var star = document.createElement('span');
            star.className = 'calendar-keydate-star';
            star.textContent = '★';
            star.title = 'Key date';
            cell.appendChild(star);
          }
        }
        weekEl.appendChild(cell);
      });

      var rowSegments = layout.segments.filter(function (s) { return s.weekIndex === weekIndex; });
      rowSegments.forEach(function (seg) {
        var chip = document.createElement('div');
        chip.className = 'calendar-chip calendar-chip-' + seg.activity.type;
        chip.style.gridColumn = (seg.startCol + 1) + ' / ' + (seg.endCol + 2);
        chip.style.gridRow = String(seg.lane + 2);
        chip.dataset.activityId = seg.activity.id;

        var nameSpan = document.createElement('span');
        nameSpan.className = 'calendar-chip-name';
        nameSpan.textContent = seg.activity.name;
        chip.appendChild(nameSpan);

        if (seg.activity.timeStart || seg.activity.timeEnd) {
          var timeSpan = document.createElement('span');
          timeSpan.className = 'calendar-chip-time';
          timeSpan.textContent = (seg.activity.timeStart || '') + '–' + (seg.activity.timeEnd || '');
          chip.appendChild(timeSpan);
        }

        (seg.activity.groupIds || []).forEach(function (gid) {
          var g = groupById.get(gid);
          if (!g) return;
          var swatch = document.createElement('span');
          swatch.className = 'calendar-chip-group-swatch';
          swatch.style.background = g.color;
          chip.appendChild(swatch);
        });

        chip.addEventListener('mouseenter', function (e) {
          var groupNames = (seg.activity.groupIds || []).map(function (gid) {
            var g = groupById.get(gid);
            return g ? g.name : null;
          }).filter(Boolean).join(', ');
          var timeText = (seg.activity.timeStart || seg.activity.timeEnd)
            ? (seg.activity.timeStart || '') + '–' + (seg.activity.timeEnd || '')
            : 'All day';
          var lines = [
            seg.activity.type + ': ' + seg.activity.name,
            seg.activity.dateStart + (seg.activity.dateEnd !== seg.activity.dateStart ? ' to ' + seg.activity.dateEnd : ''),
            timeText,
          ];
          if (groupNames) lines.push('Groups: ' + groupNames);
          if (seg.activity.remarks) lines.push(seg.activity.remarks);
          tooltip.hidden = false;
          tooltip.style.left = (e.clientX + 12) + 'px';
          tooltip.style.top = (e.clientY + 12) + 'px';
          tooltip.textContent = lines.join(' — ');
        });
        chip.addEventListener('mouseleave', function () { tooltip.hidden = true; });

        weekEl.appendChild(chip);
      });

      container.appendChild(weekEl);
    });
  }

  function renderActivitiesList(state) {
    var container = document.getElementById('activities-table');
    container.innerHTML = '';
    var sorted = state.project.activities.slice().sort(function (a, b) { return a.dateStart < b.dateStart ? -1 : 1; });
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['Type', 'Name', 'Start', 'End', 'Key date', ''].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    sorted.forEach(function (a) {
      var tr = document.createElement('tr');
      [a.type, a.name, a.dateStart, a.dateEnd, a.keyDate ? 'Yes' : ''].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      var actionTd = document.createElement('td');
      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'activity-remove-btn';
      removeBtn.dataset.activityId = a.id;
      actionTd.appendChild(removeBtn);
      tr.appendChild(actionTd);
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  function renderActivities(state) {
    renderActivityGroupsEditor(state);
    renderNewActivityGroupCheckboxes(state);
    renderActivitiesLegend(state);
    renderActivitiesCalendar(state);
    renderActivitiesList(state);
  }

  function wireActivities(state, onChanged) {
    document.getElementById('add-activity-group-button').addEventListener('click', function () {
      var nameInput = document.getElementById('new-activity-group-name');
      var colorInput = document.getElementById('new-activity-group-color');
      var name = nameInput.value.trim();
      if (!name) return;
      state.project.addActivityGroup({ name: name, color: colorInput.value });
      nameInput.value = '';
      onChanged();
    });

    document.getElementById('activity-groups-editor').addEventListener('input', function (e) {
      var groupId = e.target.dataset.groupId;
      if (!groupId) return;
      if (e.target.classList.contains('activity-group-name-input')) {
        state.project.updateActivityGroup(groupId, { name: e.target.value });
        onChanged();
      } else if (e.target.classList.contains('activity-group-color-input')) {
        state.project.updateActivityGroup(groupId, { color: e.target.value });
        onChanged();
      }
    });

    document.getElementById('activity-groups-editor').addEventListener('click', function (e) {
      var btn = e.target.closest('.activity-group-remove-btn');
      if (!btn) return;
      state.project.deleteActivityGroup(btn.dataset.groupId);
      onChanged();
    });

    document.getElementById('add-activity-button').addEventListener('click', function () {
      var type = document.getElementById('new-activity-type').value;
      var name = document.getElementById('new-activity-name').value.trim();
      var dateStart = document.getElementById('new-activity-date-start').value;
      var dateEnd = document.getElementById('new-activity-date-end').value || dateStart;
      var timeStart = document.getElementById('new-activity-time-start').value.trim() || null;
      var timeEnd = document.getElementById('new-activity-time-end').value.trim() || null;
      var keyDate = document.getElementById('new-activity-keydate').checked;
      var remarks = document.getElementById('new-activity-remarks').value.trim();
      var groupIds = Array.from(document.querySelectorAll('#new-activity-groups input:checked')).map(function (el) { return el.value; });
      if (!name || !dateStart) {
        window.alert('Name and start date are required.');
        return;
      }
      state.project.addActivity({
        type: type, name: name, dateStart: dateStart, dateEnd: dateEnd,
        timeStart: timeStart, timeEnd: timeEnd, groupIds: groupIds, keyDate: keyDate, remarks: remarks,
      });
      document.getElementById('new-activity-name').value = '';
      document.getElementById('new-activity-date-start').value = '';
      document.getElementById('new-activity-date-end').value = '';
      document.getElementById('new-activity-time-start').value = '';
      document.getElementById('new-activity-time-end').value = '';
      document.getElementById('new-activity-keydate').checked = false;
      document.getElementById('new-activity-remarks').value = '';
      onChanged();
    });

    document.getElementById('activities-table').addEventListener('click', function (e) {
      var btn = e.target.closest('.activity-remove-btn');
      if (!btn) return;
      state.project.deleteActivity(btn.dataset.activityId);
      onChanged();
    });

    document.getElementById('activities-month-prev').addEventListener('click', function () {
      var year = currentActivitiesYear(state);
      var month = currentActivitiesMonth(state) - 1;
      if (month < 0) { month = 11; year -= 1; }
      state.activitiesViewYear = year;
      state.activitiesViewMonth = month;
      renderActivitiesCalendar(state);
    });
    document.getElementById('activities-month-next').addEventListener('click', function () {
      var year = currentActivitiesYear(state);
      var month = currentActivitiesMonth(state) + 1;
      if (month > 11) { month = 0; year += 1; }
      state.activitiesViewYear = year;
      state.activitiesViewMonth = month;
      renderActivitiesCalendar(state);
    });
  }

  window.PP = window.PP || {};
  window.PP.renderActivities = renderActivities;
  window.PP.wireActivities = wireActivities;
})();
```

- [ ] **Step 5: Wire the tab into `app.js`**

In `project-planner/src/js/ui/app.js`, change:

```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'resources-view', 'billing-view', 'settings-view', 'holidays-view', 'reports-view'];
```

to:

```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'resources-view', 'billing-view', 'settings-view', 'holidays-view', 'activities-view', 'reports-view'];
```

Change `refresh(state, markDirty)` from:

```js
    PP.renderHolidays(state);
    PP.renderReport(state);
```

to:

```js
    PP.renderHolidays(state);
    PP.renderActivities(state);
    PP.renderReport(state);
```

Change `showApp(state)` from:

```js
    PP.wireHolidays(state, function () { refresh(state, true); });
    PP.wireReports(state, function () { PP.renderReport(state); });
```

to:

```js
    PP.wireHolidays(state, function () { refresh(state, true); });
    PP.wireActivities(state, function () { refresh(state, true); });
    PP.wireReports(state, function () { PP.renderReport(state); });
```

Change `boot()`'s initial `state` object from:

```js
      scurveOverlaySnapshotId: null,
      snapshotCompareA: null,
      snapshotCompareB: null,
      holidaysViewYear: null,
    };
```

to:

```js
      scurveOverlaySnapshotId: null,
      snapshotCompareA: null,
      snapshotCompareB: null,
      holidaysViewYear: null,
      activitiesViewYear: null,
      activitiesViewMonth: null,
    };
```

Change `handleLoadProject(state, file)` from:

```js
      state.scurveOverlaySnapshotId = null;
      state.snapshotCompareA = null;
      state.snapshotCompareB = null;
      state.holidaysViewYear = null;
      document.getElementById('dirty-indicator').textContent = '';
```

to:

```js
      state.scurveOverlaySnapshotId = null;
      state.snapshotCompareA = null;
      state.snapshotCompareB = null;
      state.holidaysViewYear = null;
      state.activitiesViewYear = null;
      state.activitiesViewMonth = null;
      document.getElementById('dirty-indicator').textContent = '';
```

- [ ] **Step 6: Build and confirm no regressions**

```bash
cd project-planner
node --check src/js/calendar.js
node --check src/js/ui/activities.js
node --check src/js/ui/app.js
python3 build.py
node --test
```

Expected: all `node --check` calls print nothing (syntax clean); build succeeds with no error about missing markers; 197/197 tests pass (this task touches no engine/logic files in a way that changes test-observable behavior — the count from Task 2 must be unchanged, since UI files have no automated coverage).

- [ ] **Step 7: Commit**

```bash
cd project-planner
git add src/index.html src/js/ui/app.js src/js/ui/activities.js src/css/layout.css build.py
git commit -m "Add Activities tab: add-activity form, participant-group manager, month calendar grid"
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

Expected: 197/197 tests pass (the exact final count established in Task 2 — confirm it matches, don't assume).

- [ ] **Step 2: Serve the built app and set up a fresh project**

```bash
cd project-planner/dist
python3 -m http.server <port>
```

Navigate to it with the Playwright browser tools (`file://` URLs are blocked by the sandbox — must use the http server). Complete the name picker, then go to Settings and confirm a blank starter project (or seed one with a status date in July 2026 for date-friendly test data, e.g. via "New Project (blank)" then setting the status date input to `2026-07-01`).

- [ ] **Step 3: Add participant groups**

Click the "Activities" tab. Confirm the tab renders (not blank — this is the exact gotcha this repo has hit twice before: verify the calendar container, add-activity form, and participant-group editor are all visible, not an empty pane). Add two participant groups via the "Add Group" control: name "Steering Committee" with a distinct color, and name "Working Team" with a different distinct color. Confirm both appear in the group editor list and as checkboxes in the Add Activity form.

- [ ] **Step 4: Add a single-day Meeting and confirm it renders in the correct cell**

Navigate (via Prev/Next Month) to July 2026 if not already there. Add an activity: type Meeting, name "Internal Meeting", date start `2026-07-09`, date end left blank, time start `14:30`, time end `15:30`, check the "Steering Committee" group, check "Key date", remarks "Discuss scope". Click "Add Activity". Confirm:
- A chip labeled "Internal Meeting" with "14:30–15:30" appears in the day cell for July 9, 2026 (a Thursday) — not any other cell.
- The chip has the Meeting-type background color and a small colored swatch matching "Steering Committee"'s color.
- A gold star (★) badge appears on the day-9 number in that same cell.
- The activity appears in the activities list table below the calendar with a Remove button.

- [ ] **Step 5: Add a multi-day Workshop spanning a weekend gap and confirm the banner splits correctly**

Add another activity: type Workshop, name "Discovery Workshop", date start `2026-07-09`, date end `2026-07-13`, no times, check "Working Team". Click "Add Activity". Confirm:
- A banner labeled "Discovery Workshop" spans the Thursday (9) and Friday (10) cells of that week row as one continuous bar.
- A second, separate banner segment for the same activity appears in the Monday (13) cell of the *next* week row — confirming the weekend gap (July 11–12) correctly breaks the banner into two segments rather than rendering through the missing weekend columns.
- Both segments share the Workshop-type background color.
- Since "Internal Meeting" also occupies part of the July 9 cell, confirm the two chips/banners stack into separate visual rows within that cell (lane stacking) rather than overlapping illegibly.

- [ ] **Step 6: Confirm month navigation**

Click "Next Month ›". Confirm the label updates to "August 2026" and the grid re-renders with August's day numbers (no leftover July activities visible, since they're outside August). Click "‹ Prev Month" twice. Confirm the label reads "June 2026" and no activities render (both seeded activities are in July). Click "Next Month ›" once to return to July 2026 and confirm both activities from Steps 4–5 still render correctly.

- [ ] **Step 7: Confirm a participant-group color edit reflects on existing chips**

In the Participant Groups editor, change "Steering Committee"'s color swatch to a new distinct color (via the color input). Confirm, without needing to click anything else, that after the change takes effect (the `input` event triggers `onChanged()` → `refresh()` → `renderActivities()`), the small color swatch on the existing "Internal Meeting" chip updates to the new color. Also rename "Working Team" to "Working Team (Core)" and confirm the legend and the Add Activity form's checkbox label both update to the new name.

- [ ] **Step 8: Confirm the hover tooltip**

Hover over the "Internal Meeting" chip. Confirm the shared `#scurve-tooltip` element becomes visible near the cursor and its text includes: the type and name ("Meeting: Internal Meeting"), the date, the time range ("14:30–15:30"), the participant group name ("Steering Committee"), and the remarks ("Discuss scope"). Move the mouse off the chip and confirm the tooltip hides. Hover over one segment of the "Discovery Workshop" banner and confirm its tooltip shows the full `2026-07-09 to 2026-07-13` date range (not just the single day that segment visually covers) and the "Working Team" (or renamed) group.

- [ ] **Step 9: Verify zero regression to existing functionality**

Switch through every other view tab (Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Billing, Settings, Holidays, Reports) and confirm each still renders as before. Confirm Save (JSON) still works and the saved file's JSON includes non-empty `activityGroups` and `activities` arrays matching what was entered. Load that saved file back in (via "Load Project") and confirm both activities and both groups are restored correctly and the calendar re-renders them.

- [ ] **Step 10: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected). Then run:

```bash
cd project-planner
node --test
```

Confirm the same count from Step 1 still passes.

- [ ] **Step 11: Record the result**

If every check in Steps 1–10 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1–3: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: a new, independently-built "Activities" tab lets a project team log Meetings and Workshops with date ranges, optional times, linked configurable participant groups, and key-date flags, and see them rendered on a Mon–Fri monthly calendar grid with type-colored chips, multi-day banners that correctly split across weekend gaps, gold-star key-date badges, stacked same-day lanes, and a hover tooltip reusing the app's existing tooltip mechanism. The underlying `computeCalendarLayout(year, month, activities)` function in `src/js/calendar.js` is a pure, Node-tested engine function ready for the future Reports overhaul plan to reuse without modification.
