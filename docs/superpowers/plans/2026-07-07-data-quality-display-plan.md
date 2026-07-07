# Data Quality & Display (Part II) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce planned dates on every leaf task before Save, show who/when last touched each task, visually distinguish parent/phase rows, add Actual Start/Actual Finish/Remarks columns to the Plan tree, replace the free-typed `% Actual` field with a fully computed, date-derived value, and add optional Billing fields to milestone tasks with a Dashboard rollup.

**Architecture:** Two pure/Node-testable engine changes (`calc.js` gets the locked `actualPctToDate` ramp formula and wires it into leaf/status/S-curve math; `store.js` gets `findIncompleteTasks`/`computeLastUpdated` plus two new `Task` fields) followed by UI-layer changes with no Node coverage (`index.html`/`layout.css` grow the Plan tree from 10 to 17 columns with horizontal scroll; `app.js` wires validation into Save and last-updated into refresh; `tree.js` renders/edits the new columns and a parent-row style class; `dashboard.js` adds a Billing Summary section). Final task is controller-run real-browser verification, same pattern as every prior plan.

**Tech Stack:** Same as the rest of the project — vanilla JS, CSS Grid, `node:test`. No new dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev.
- No code comments except where genuinely non-obvious.
- Required-field validation (block Save if `plannedStart`/`plannedFinish` missing) applies **only to leaf tasks** (no children). Parent/phase tasks are always computed rollups — never required, never raw-entered. (Spec §9/§10, already partially shipped in `calc.js`/`tree.js` commit `231ae65` for the rollup itself; this plan adds the *validation* and the *display columns* on top of that.)
- `% Actual` becomes **fully computed** from `actualStart`/`actualFinish` — no more free-typed entry anywhere in the Plan tree, leaf or parent. Locked formula (exact code in Task 1):
  ```js
  function actualPctToDate(actualStart, actualFinish, statusDate, plannedDuration, holidayDates) {
    if (!actualStart) return null;
    if (actualFinish && statusDate >= actualFinish) return 1;
    if (plannedDuration <= 0) return actualFinish ? 1 : null;
    const elapsed = networkdays(actualStart, statusDate, holidayDates);
    return Math.max(0, Math.min(0.99, elapsed / plannedDuration));
  }
  ```
  (Ramp caps at `0.99`, deliberately never `1`, when no `actualFinish` is set — the final whole-branch review flagged that capping at exactly `1` let an overdue-but-unfinished task auto-flip to `deriveStatus`'s `"Complete"` with nobody ever recording a finish date. Confirmed with the user: a task can only read Complete once a real `actualFinish` is entered.)
- Billing fields (`billingAmount`, `billingStatus`) are optional on every task, only meaningful when `task.milestone === true`, harmless/unenforced otherwise.
- Deliverable and Jira columns are explicitly **out of scope** — still not shipped, not part of this plan.
- Engines (`calc.js`, `store.js`): pure logic, no DOM, UMD-lite wrapper (`module.exports` / `globalThis.PP`), TDD via `node:test`.
- UI files (`app.js`, `tree.js`, `dashboard.js`, `index.html`, CSS): plain IIFEs / markup, no Node test coverage possible (zero-dependency blocks jsdom) — verified once, at this plan's final task, via a real-browser controller-run Playwright session.
- Any user-controlled string reaching `innerHTML` must go through `escapeHtml()` — this includes `billingAmount` (numeric but user-entered) and `remarks`.
- Test command: bare `node --test` from `project-planner/` (`node --test tests/` throws `MODULE_NOT_FOUND` on this Node version).
- Build command: `python3 build.py` from `project-planner/`, run after every `src/` change before browser verification.

---

### Task 1: `calc.js` — locked `% Actual` formula and its integration

**Files:**
- Modify: `project-planner/src/js/calc.js`
- Test: `project-planner/tests/calc.test.js`

**Interfaces:**
- Consumes: `networkdays(startISO, endISO, holidayDates)` (already shipped in `schedule.js`, unchanged).
- Produces: `actualPctToDate(actualStart, actualFinish, statusDate, plannedDuration, holidayDates)` — new pure function, exported from `calc.js`. Later tasks do not call it directly (it's consumed internally by `recalc`), but it must be exported for the tests in this task.

- [ ] **Step 1: Write failing tests for `actualPctToDate` in isolation**

Add to `project-planner/tests/calc.test.js`, near the top alongside the other `planPctToDate` tests (after the `planPctToDate is 0 before the planned start` test):
```js
test('actualPctToDate is null before any actual start', () => {
  assert.equal(actualPctToDate(null, null, '2024-01-10', 10, []), null);
});

test('actualPctToDate is 1 once the status date reaches actual finish', () => {
  assert.equal(actualPctToDate('2024-01-01', '2024-01-10', '2024-01-10', 8, []), 1);
  assert.equal(actualPctToDate('2024-01-01', '2024-01-10', '2024-02-01', 8, []), 1);
});

test('actualPctToDate ramps by elapsed workdays since actual start divided by planned duration', () => {
  const elapsed = networkdays('2024-01-01', '2024-01-10', []);
  const plannedDuration = 15;
  const expected = elapsed / plannedDuration;
  assert.ok(Math.abs(actualPctToDate('2024-01-01', null, '2024-01-10', plannedDuration, []) - expected) < 1e-9);
});

test('actualPctToDate caps the ramp at 0.99 (never 1) when elapsed exceeds planned duration and actual finish is not set', () => {
  assert.equal(actualPctToDate('2024-01-01', null, '2024-06-01', 5, []), 0.99);
});

test('actualPctToDate with plannedDuration <= 0 is 1 once actual finish is set, else null', () => {
  assert.equal(actualPctToDate('2024-01-01', '2024-01-01', '2024-01-01', 0, []), 1);
  assert.equal(actualPctToDate('2024-01-01', null, '2024-01-01', 0, []), null);
});
```
Update this test file's require line at the top from:
```js
const { recalc, buildTree, planPctToDate } = require('../src/js/calc.js');
```
to:
```js
const { recalc, buildTree, planPctToDate, actualPctToDate } = require('../src/js/calc.js');
const { networkdays } = require('../src/js/schedule.js');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: FAIL — `actualPctToDate` is not exported yet (`TypeError: actualPctToDate is not a function`).

- [ ] **Step 3: Add `actualPctToDate` to `src/js/calc.js`**

Add this function right after `planPctToDate` (which ends around line 61):
```js
function actualPctToDate(actualStart, actualFinish, statusDate, plannedDuration, holidayDates) {
  if (!actualStart) return null;
  if (actualFinish && statusDate >= actualFinish) return 1;
  if (plannedDuration <= 0) return actualFinish ? 1 : null;
  const elapsed = networkdays(actualStart, statusDate, holidayDates);
  return Math.max(0, Math.min(0.99, elapsed / plannedDuration));
}
```

- [ ] **Step 4: Export it and run tests to verify they pass**

Change the file's final return statement from:
```js
  return { recalc, buildTree, planPctToDate, actualPctAt, computeScurve };
```
to:
```js
  return { recalc, buildTree, planPctToDate, actualPctAt, computeScurve, actualPctToDate };
```
Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: PASS (all 5 new tests, plus every pre-existing test in this file still passing — `actualPctToDate` is not wired into `recalc` yet at this point, so nothing else should change).

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/calc.js tests/calc.test.js
git commit -m "Add locked actualPctToDate formula to calc.js (not yet wired into recalc)"
```

- [ ] **Step 6: Write failing tests for the leaf-integration behavior**

Add to `project-planner/tests/calc.test.js`, after the existing `recalc: a parent with no children carrying an actualStart/actualFinish rolls up to null` test:
```js
test('recalc: leaf actualPct is derived from actualStart/actualFinish dates, ignoring a stale raw actualPct field', () => {
  const customTasks = [{
    id: 'x-1', parentId: null, order: 0, name: 'X', pic: '',
    plannedStart: '2024-01-01', plannedFinish: '2024-01-31',
    actualStart: null, actualFinish: null, actualPct: 0.9,
    weightOverride: null, milestone: false, statusOverride: null, predecessors: [],
  }];
  const { computed } = recalc({ meta: { statusDate: '2024-01-15' }, tasks: customTasks, holidays: [] });
  assert.equal(computed.get('x-1').actualPct, 0);
  assert.notEqual(computed.get('x-1').status, 'Complete');
});

test('recalc: a leaf only reaches Complete once actualFinish is genuinely reached, not from a stale raw actualPct alone', () => {
  const customTasks = [{
    id: 'x-1', parentId: null, order: 0, name: 'X', pic: '',
    plannedStart: '2024-01-01', plannedFinish: '2024-01-31',
    actualStart: '2024-01-01', actualFinish: null, actualPct: 1,
    weightOverride: null, milestone: false, statusOverride: null, predecessors: [],
  }];
  const { computed } = recalc({ meta: { statusDate: '2024-01-05' }, tasks: customTasks, holidays: [] });
  assert.ok(computed.get('x-1').actualPct < 1);
  assert.notEqual(computed.get('x-1').status, 'Complete');
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: FAIL — `computed.get('x-1').actualPct` is currently `0.9`/`1` (the stale raw field), not the derived value.

- [ ] **Step 8: Wire `actualPctToDate` into `recalc`'s leaf loop**

In `src/js/calc.js`, change the first leaf loop from:
```js
    for (const id of leafIds) {
      const t = byId.get(id);
      const duration = (t.plannedStart && t.plannedFinish)
        ? networkdays(t.plannedStart, t.plannedFinish, holidayDates)
        : 0;
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: true,
        plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        actualStart: t.actualStart, actualFinish: t.actualFinish,
        duration, weight: 0, plannedPctToDate: 0, actualPct: t.actualPct,
        status: null, isMilestone: !!t.milestone,
      });
    }
```
to:
```js
    for (const id of leafIds) {
      const t = byId.get(id);
      const duration = (t.plannedStart && t.plannedFinish)
        ? networkdays(t.plannedStart, t.plannedFinish, holidayDates)
        : 0;
      const actualPct = actualPctToDate(t.actualStart, t.actualFinish, statusDate, duration, holidayDates) || 0;
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: true,
        plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        actualStart: t.actualStart, actualFinish: t.actualFinish,
        duration, weight: 0, plannedPctToDate: 0, actualPct,
        status: null, isMilestone: !!t.milestone,
      });
    }
```
Then change the second leaf loop (a few lines below, computing `plannedPctToDate`/`status`) from:
```js
    for (const id of leafIds) {
      const t = byId.get(id);
      const c = computed.get(id);
      c.plannedPctToDate = planPctToDate(t.plannedStart, t.plannedFinish, statusDate, c.duration, holidayDates);
      c.status = deriveStatus({
        actualPct: t.actualPct, plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        statusDate, statusOverride: t.statusOverride,
      });
    }
```
to:
```js
    for (const id of leafIds) {
      const t = byId.get(id);
      const c = computed.get(id);
      c.plannedPctToDate = planPctToDate(t.plannedStart, t.plannedFinish, statusDate, c.duration, holidayDates);
      c.status = deriveStatus({
        actualPct: c.actualPct, plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        statusDate, statusOverride: t.statusOverride,
      });
    }
```
(Note the second change: `actualPct: t.actualPct` → `actualPct: c.actualPct` — status must be derived from the newly-computed ramped value, not the raw stored field, or a task could show "Complete" from a stale raw `actualPct` typed under the old model without ever setting an `actualFinish`.)

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: PASS — all tests in this file, including the two new integration tests and every pre-existing test (the shipped fixture `tests/fixtures/vision-phase.js` sets `actualStart`/`actualFinish` equal to `plannedStart`/`plannedFinish` for every leaf, so the new date-derived formula evaluates to the same `1` that the old raw field held for every fully-complete-by-the-fixture's-statusDate case — no fixture-driven regressions expected).

- [ ] **Step 10: Commit**

```bash
cd "project-planner"
git add src/js/calc.js tests/calc.test.js
git commit -m "Derive leaf actualPct and status from actualStart/actualFinish instead of the raw actualPct field"
```

- [ ] **Step 11: Write a failing test for the S-curve's historical actual trace**

Add to `project-planner/tests/calc.test.js`, after the existing `computeScurve: last point always reaches 100%...` test:
```js
test('computeScurve: the actual line is a real historical ramp, not a flat snapshot of the current actualPct', () => {
  const { computeScurve } = require('../src/js/calc.js');
  const leaf = {
    plannedStart: '2024-01-01', plannedFinish: '2024-01-31',
    duration: 23, weight: 1,
    actualStart: '2024-01-01', actualFinish: null,
  };
  const overall = { plannedStart: '2024-01-01', plannedFinish: '2024-01-31' };
  const scurve = computeScurve([leaf], overall, '2024-01-31', []);
  assert.ok(scurve[0].actualCum < scurve[scurve.length - 1].actualCum);
  assert.ok(scurve[0].actualCum >= 0);
});
```
(This fixture leaf deliberately omits an `actualPct` field entirely — the old `actualPctAt` implementation read `task.actualPct` directly and would have returned `undefined` for every period once `atDate >= actualStart`, breaking the cumulative sum with `NaN`. The new implementation must derive every point from dates alone.)

- [ ] **Step 12: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: FAIL — `scurve[0].actualCum` is `NaN` (since `leaf.actualPct` is `undefined` and `NaN >= 0` is `false`), so the second assertion fails (and likely the first too, since `NaN < NaN` is `false`).

- [ ] **Step 13: Rewrite `actualPctAt` to derive from dates**

Change:
```js
  function actualPctAt(task, atDate) {
    if (!task.actualStart || atDate < task.actualStart) return 0;
    return task.actualPct;
  }
```
to:
```js
  function actualPctAt(task, atDate, holidayDates) {
    const pct = actualPctToDate(task.actualStart, task.actualFinish, atDate, task.duration, holidayDates);
    return pct == null ? 0 : pct;
  }
```
Then update both call sites inside `computeScurve` (this function is defined further down in the same file, and is the only caller of `actualPctAt`) from:
```js
        actualCum += leaf.weight * actualPctAt(leaf, periodISO);
```
to:
```js
        actualCum += leaf.weight * actualPctAt(leaf, periodISO, holidayDates);
```
There are two occurrences of this exact line in `computeScurve` (the main loop and the final-point pin) — change both. `holidayDates` is already a parameter of `computeScurve`, in scope at both call sites.

- [ ] **Step 14: Run tests to verify they pass**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: PASS — all tests in the file, including the new S-curve test and the two pre-existing S-curve tests (`scurve planned and actual cumulative both reach 1...` and `scurve first bucket... has not started yet` — both still pass because the fixture's `actualStart`/`actualFinish` mirror `plannedStart`/`plannedFinish`, so the new date-derived ramp reaches `1` at the same point the old flat-snapshot read did).

- [ ] **Step 15: Commit**

```bash
cd "project-planner"
git add src/js/calc.js tests/calc.test.js
git commit -m "Derive the S-curve's historical actual trace from dates instead of a flat actualPct snapshot"
```

---

### Task 2: `store.js` — required-field validation, last-updated lookup, billing field defaults

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `findIncompleteTasks(project)` — returns an array of leaf `Task` objects missing `plannedStart` or `plannedFinish`. `computeLastUpdated(project)` — returns a `Map<taskId, {who, when}>` of each task's most recent audit entry across any field. Both exported from `store.js` alongside `Project`/`generateId`. `Task.billingAmount` (number|null) and `Task.billingStatus` (`"Not Billed"`|`"Invoiced"`|`"Paid"`|null) — two new fields on every task created via `addTask`.

- [ ] **Step 1: Write failing tests**

Add to `project-planner/tests/store.test.js`, after the last existing test (`Project.empty sets schemaVersion 1 on meta`):
```js
test('addTask defaults billingAmount and billingStatus to null', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Milestone' });
  assert.equal(t.billingAmount, null);
  assert.equal(t.billingStatus, null);
});

test('findIncompleteTasks returns leaf tasks missing plannedStart or plannedFinish', () => {
  const p = Project.empty('Test');
  const complete = p.addTask({ parentId: null, name: 'Complete' });
  p.updateTask(complete.id, { plannedStart: '2024-01-01', plannedFinish: '2024-01-05' }, 'user');
  const missingStart = p.addTask({ parentId: null, name: 'Missing Start' });
  p.updateTask(missingStart.id, { plannedFinish: '2024-01-05' }, 'user');
  const missingBoth = p.addTask({ parentId: null, name: 'Missing Both' });
  const incomplete = findIncompleteTasks(p);
  assert.equal(incomplete.length, 2);
  assert.deepEqual(incomplete.map(t => t.id).sort(), [missingBoth.id, missingStart.id].sort());
});

test('findIncompleteTasks excludes parent/phase tasks even when their raw dates are null', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Phase' });
  const child = p.addTask({ parentId: parent.id, name: 'Child' });
  p.updateTask(child.id, { plannedStart: '2024-01-01', plannedFinish: '2024-01-05' }, 'user');
  const incomplete = findIncompleteTasks(p);
  assert.equal(incomplete.length, 0);
});

test('computeLastUpdated returns the most recent audit entry per task across any field', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  p.updateTask(t.id, { pic: 'Alice' }, 'user1');
  p.updateTask(t.id, { name: 'A renamed' }, 'user2');
  const lastUpdated = computeLastUpdated(p);
  assert.equal(lastUpdated.get(t.id).who, 'user2');
});

test('computeLastUpdated has no entry for a task that was never updated', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  const lastUpdated = computeLastUpdated(p);
  assert.equal(lastUpdated.has(t.id), false);
});
```
Update this test file's require line at the top from:
```js
const { Project, generateId } = require('../src/js/store.js');
```
to:
```js
const { Project, generateId, findIncompleteTasks, computeLastUpdated } = require('../src/js/store.js');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: FAIL — `findIncompleteTasks`/`computeLastUpdated` are not exported yet; `t.billingAmount` is `undefined`, not `null`.

- [ ] **Step 3: Add `billingAmount`/`billingStatus` to `addTask`**

In `src/js/store.js`, change:
```js
    addTask({ parentId = null, name = 'New Task', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, pic,
        deliverable: '', jira: '', remarks: '',
        plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, milestone: false,
        statusOverride: null, predecessors: [], collapsed: false,
      };
      this.tasks.push(task);
      return task;
    }
```
to:
```js
    addTask({ parentId = null, name = 'New Task', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, pic,
        deliverable: '', jira: '', remarks: '',
        plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, milestone: false,
        statusOverride: null, predecessors: [], collapsed: false,
        billingAmount: null, billingStatus: null,
      };
      this.tasks.push(task);
      return task;
    }
```

- [ ] **Step 4: Add `findIncompleteTasks` and `computeLastUpdated`**

In `src/js/store.js`, add these two functions right after `generateId` and before `class Project`:
```js
  function findIncompleteTasks(project) {
    const parentIds = new Set(project.tasks.map(t => t.parentId).filter(Boolean));
    return project.tasks.filter(t => {
      if (parentIds.has(t.id)) return false;
      return !t.plannedStart || !t.plannedFinish;
    });
  }

  function computeLastUpdated(project) {
    const result = new Map();
    project.auditLog.forEach(entry => {
      result.set(entry.taskId, { who: entry.who, when: entry.when });
    });
    return result;
  }
```

- [ ] **Step 5: Export them and run tests to verify they pass**

Change the file's final return statement from:
```js
  return { Project, generateId };
```
to:
```js
  return { Project, generateId, findIncompleteTasks, computeLastUpdated };
```
Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: PASS, all tests in this file.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd "project-planner" && node --test`
Expected: PASS, every test across every file.

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add src/js/store.js tests/store.test.js
git commit -m "Add findIncompleteTasks, computeLastUpdated, and billing field defaults to store.js"
```

---

### Task 3: Plan tree markup and layout — new columns, horizontal scroll, parent-row styling

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: nothing (pure markup/CSS).
- Produces: the Plan tree's `#tree-header` grows from 10 to 17 `<span>` labels, in this exact order: WBS, Task, PIC, P-Start, P-Finish, A-Start, A-Finish, Duration, Weight, % Plan, % Actual, Status, Updated By, Updated At, Remarks, Billing Amt, Billing Status. `#tree-header`/`.tree-row`'s `grid-template-columns` grows to 17 tracks matching that order — Task 5 (`tree.js`) will emit exactly 17 `<span>` children per row, in the same order, relying on this template. A new `.tree-row.is-parent` CSS class is available for Task 5 to apply to parent/phase rows.

- [ ] **Step 1: Update the Plan tree header in `src/index.html`**

Change:
```html
  <div id="plan-view">
    <div id="tree-header">
      <span>WBS</span>
      <span>Task</span>
      <span>PIC</span>
      <span>P-Start</span>
      <span>P-Finish</span>
      <span>Duration</span>
      <span>Weight</span>
      <span>% Plan</span>
      <span>% Actual</span>
      <span>Status</span>
    </div>
    <div id="tree-body"></div>
  </div>
```
to:
```html
  <div id="plan-view">
    <div id="tree-header">
      <span>WBS</span>
      <span>Task</span>
      <span>PIC</span>
      <span>P-Start</span>
      <span>P-Finish</span>
      <span>A-Start</span>
      <span>A-Finish</span>
      <span>Duration</span>
      <span>Weight</span>
      <span>% Plan</span>
      <span>% Actual</span>
      <span>Status</span>
      <span>Updated By</span>
      <span>Updated At</span>
      <span>Remarks</span>
      <span>Billing Amt</span>
      <span>Billing Status</span>
    </div>
    <div id="tree-body"></div>
  </div>
```

- [ ] **Step 2: Update `grid-template-columns` and add horizontal scroll + parent-row styling in `src/css/layout.css`**

Change:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 0.5fr 2fr 0.8fr 0.9fr 0.9fr 0.5fr 0.5fr 0.5fr 0.5fr 0.8fr;
  align-items: center;
  padding: 6px 20px;
  gap: 8px;
  font-size: 13px;
}
#tree-header { font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.tree-row { border-bottom: 1px solid var(--border); }
.tree-row:hover { background: var(--surface-alt); }
```
to:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px;
  min-width: 1695px;
  align-items: center;
  padding: 6px 20px;
  gap: 8px;
  font-size: 13px;
}
#tree-header { font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.tree-row { border-bottom: 1px solid var(--border); }
.tree-row:hover { background: var(--surface-alt); }
.tree-row.is-parent { font-weight: 600; background: var(--surface-alt); }
.tree-row.is-parent:hover { background: var(--border); }
```
Then change the `#plan-view` rule (a separate rule, further down in the same file, currently shared with `#gantt-view`) from:
```css
#plan-view, #gantt-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
```
to two separate rules:
```css
#plan-view { flex: 1; display: flex; flex-direction: column; overflow-x: auto; overflow-y: hidden; min-height: 0; }
#gantt-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
```
Then change `#tree-body` from:
```css
#tree-body { flex: 1; overflow-y: auto; }
```
to:
```css
#tree-body { flex: 1; overflow-y: auto; overflow-x: visible; }
```
(`#plan-view` becomes the single horizontal-scroll container for both the header and the row list together, since they are siblings inside it; `#tree-body` keeps its own independent vertical scrollbar. `min-width: 1695px` on the header/rows forces them wider than most viewports, which is what makes `#plan-view`'s horizontal scrollbar appear — verified live in Task 7.)

- [ ] **Step 3: Build and syntax-check**

Run:
```bash
cd "project-planner"
python3 build.py
```
Expected: build succeeds (no Node test to run for this task — pure markup/CSS, verified live in Task 7).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css
git commit -m "Grow the Plan tree header to 17 columns with horizontal scroll and add parent-row styling"
```

---

### Task 4: `app.js` — wire required-field validation into Save, wire last-updated into refresh

**Files:**
- Modify: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.findIncompleteTasks(project)`, `PP.computeLastUpdated(project)` (both shipped in Task 2).
- Produces: `state.lastUpdated` — a `Map<taskId, {who, when}>`, set inside `refresh(state, markDirty)` on every call, consumed by Task 5 (`tree.js`)'s render.

- [ ] **Step 1: Wire `computeLastUpdated` into `refresh`**

In `src/js/ui/app.js`, change:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
```
to:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    state.lastUpdated = PP.computeLastUpdated(state.project);
    renderHeader(state);
```

- [ ] **Step 2: Wire `findIncompleteTasks` into `handleSave`**

Change:
```js
  function handleSave(state) {
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();
```
to:
```js
  function handleSave(state) {
    var incomplete = PP.findIncompleteTasks(state.project);
    if (incomplete.length) {
      window.alert('Cannot save — missing planned dates on: ' + incomplete.map(function (t) { return t.name; }).join(', '));
      return;
    }
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();
```

- [ ] **Step 3: Syntax-check, build, run the full suite**

Run:
```bash
cd "project-planner"
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; all tests pass (this task adds no new Node-testable surface — `handleSave`/`refresh` are DOM/UI code, verified live in Task 7).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/js/ui/app.js
git commit -m "Block Save when a leaf task is missing planned dates; compute last-updated-by on every refresh"
```

---

### Task 5: `tree.js` — render and edit the new columns, retire free-typed `% Actual`

**Files:**
- Modify: `project-planner/src/js/ui/tree.js`

**Interfaces:**
- Consumes: `state.calc.computed` (now carries `actualStart`/`actualFinish` on every row, leaf and parent — already shipped in commit `231ae65`), `state.lastUpdated` (shipped in Task 4), `task.remarks`/`task.billingAmount`/`task.billingStatus`/`task.milestone` (raw fields — `remarks` already existed; `billingAmount`/`billingStatus` shipped in Task 2).
- Produces: no new exports — `PP.renderTree`/`PP.wireTree` keep their existing signatures.

- [ ] **Step 1: Add a `dateCell` helper and rewrite `renderTree`**

In `src/js/ui/tree.js`, add this helper function right after `fmtPct`:
```js
  function dateCell(hasChildren, className, dataField, computedValue, rawValue) {
    return hasChildren
      ? '<span class="' + className + '">' + escapeHtml(computedValue || '') + '</span>'
      : '<span class="cell ' + className + '" data-field="' + dataField + '">' + escapeHtml(rawValue || '') + '</span>';
  }
```
Then replace the entire `renderTree` function body:
```js
  function renderTree(state) {
    var body = document.getElementById('tree-body');
    body.innerHTML = '';
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var children = state.calc.children;
    var rows = PP.computeVisibleRows(state.project, state.calc, state.filters, state.currentUser);

    rows.forEach(function (id) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var hasChildren = (children.get(id) || []).length > 0;
      var toggleChar = hasChildren ? (task.collapsed ? '▸' : '▾') : '';
      var lu = state.lastUpdated.get(id);

      var startCell = dateCell(hasChildren, 'col-start', 'plannedStart', computed.plannedStart, task.plannedStart);
      var finishCell = dateCell(hasChildren, 'col-finish', 'plannedFinish', computed.plannedFinish, task.plannedFinish);
      var actualStartCell = dateCell(hasChildren, 'col-astart', 'actualStart', computed.actualStart, task.actualStart);
      var actualFinishCell = dateCell(hasChildren, 'col-afinish', 'actualFinish', computed.actualFinish, task.actualFinish);
      var actualPctText = computed.actualStart ? fmtPct(computed.actualPct) : '';
      var billingAmountCell = task.milestone
        ? '<span class="cell col-billing-amount" data-field="billingAmount">' + (task.billingAmount != null ? escapeHtml(String(task.billingAmount)) : '') + '</span>'
        : '<span class="col-billing-amount"></span>';
      var billingStatusCell = task.milestone
        ? '<span class="cell col-billing-status" data-field="billingStatus">' + escapeHtml(task.billingStatus || '') + '</span>'
        : '<span class="col-billing-status"></span>';

      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren ? ' is-parent' : '');
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + escapeHtml(task.name) +
        '</span>' +
        '<span class="cell col-pic" data-field="pic">' + escapeHtml(task.pic || '') + '</span>' +
        startCell +
        finishCell +
        actualStartCell +
        actualFinishCell +
        '<span class="col-duration">' + computed.duration + '</span>' +
        '<span class="col-weight">' + fmtPct(computed.weight) + '</span>' +
        '<span class="col-plan">' + fmtPct(computed.plannedPctToDate) + '</span>' +
        '<span class="col-actual">' + actualPctText + '</span>' +
        '<span class="col-status status-' + computed.status.replace(/\s+/g, '') + '">' + escapeHtml(computed.status) + '</span>' +
        '<span class="col-updated-by">' + (lu ? escapeHtml(lu.who) : '') + '</span>' +
        '<span class="col-updated-at">' + (lu ? escapeHtml(lu.when.slice(0, 16).replace('T', ' ')) : '') + '</span>' +
        '<span class="cell col-remarks" data-field="remarks">' + escapeHtml(task.remarks || '') + '</span>' +
        billingAmountCell +
        billingStatusCell;
      body.appendChild(row);
    });
  }
```
Note the `% Actual` cell (`col-actual`) is now a plain `<span>` with no `class="cell"` and no `data-field` — it is never editable, on any row, leaf or parent (fully computed per the locked formula, matching the plan tree column order from Task 3: WBS, Task, PIC, P-Start, P-Finish, A-Start, A-Finish, Duration, Weight, % Plan, % Actual, Status, Updated By, Updated At, Remarks, Billing Amt, Billing Status — 17 spans total, matching Task 3's 17-column grid template).

- [ ] **Step 2: Rewrite `beginEdit` to support date/number/select field types and drop `actualPct`**

Replace the entire `beginEdit` function:
```js
  function beginEdit(state, cell, id, field, onCommitted) {
    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var raw = task[field];
    var el;

    if (field === 'billingStatus') {
      el = document.createElement('select');
      el.className = 'cell-editor';
      ['Not Billed', 'Invoiced', 'Paid'].forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (raw === opt) option.selected = true;
        el.appendChild(option);
      });
    } else {
      el = document.createElement('input');
      el.className = 'cell-editor';
      if (field === 'plannedStart' || field === 'plannedFinish' || field === 'actualStart' || field === 'actualFinish') {
        el.type = 'date';
        el.value = raw || '';
      } else if (field === 'billingAmount') {
        el.type = 'number';
        el.min = '0';
        el.value = raw != null ? raw : '';
      } else {
        el.type = 'text';
        el.value = raw || '';
      }
    }

    cell.innerHTML = '';
    cell.appendChild(el);
    el.focus();
    if (el.select) el.select();

    var settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      var value = el.value;
      if (field === 'billingAmount') {
        value = value === '' ? null : Number(value);
      } else if ((field === 'plannedStart' || field === 'plannedFinish' || field === 'actualStart' || field === 'actualFinish') && value === '') {
        value = null;
      }
      state.project.updateTask(id, buildPatch(field, value), state.currentUser);
      onCommitted();
    }

    function cancel() {
      if (settled) return;
      settled = true;
      renderTree(state);
    }

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    el.addEventListener('blur', commit);
  }
```
This drops the old `field === 'actualPct'` branch entirely (no longer reachable — no cell in `renderTree` sets `data-field="actualPct"` anymore) and adds `actualStart`/`actualFinish` to the date-input branch, plus `billingAmount` (number input) and `billingStatus` (a `<select>`, which has no `.select()` method — the `if (el.select)` guard on the line above prevents a `TypeError` when `el` is a `<select>`).

- [ ] **Step 3: Add the `is-parent` class is already handled in Step 1 — verify no other file references the removed `actualPct` cell**

Run: `grep -n "actualPct" project-planner/src/js/ui/tree.js`
Expected: no matches (the old editable `%Actual` cell and its `beginEdit` branch are both gone; `computed.actualPct` is still read via `fmtPct(computed.actualPct)` inside the `actualPctText` line in Step 1's `renderTree`, which greps as `actualPct` too — if this is the *only* match, that's correct and expected; if a stray `data-field="actualPct"` or `field === 'actualPct'` still appears anywhere, that's a leftover to remove).

- [ ] **Step 4: Syntax-check and build**

Run:
```bash
cd "project-planner"
node --check src/js/ui/tree.js
python3 build.py
```
Expected: syntax clean; build succeeds (no Node test for this task — pure DOM code, verified live in Task 7).

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/ui/tree.js
git commit -m "Render Actual Start/Finish, Remarks, Updated By/At, and Billing columns; retire free-typed % Actual"
```

---

### Task 6: `dashboard.js` — Billing Summary section

**Files:**
- Modify: `project-planner/src/js/ui/dashboard.js`

**Interfaces:**
- Consumes: `state.project.tasks` (raw `billingAmount`/`billingStatus`/`milestone` fields, shipped in Task 2).
- Produces: no new exports — `PP.renderDashboard` keeps its existing signature; appends one more `.dashboard-section` to `#dashboard-body`.

- [ ] **Step 1: Add the Billing Summary section**

In `src/js/ui/dashboard.js`, at the end of `renderDashboard` (right after the existing `delayedSection`/`container.appendChild(delayedSection);` block, before the function's closing brace), add:
```js
    var billingSection = document.createElement('div');
    billingSection.className = 'dashboard-section';
    var billingTitle = document.createElement('h3');
    billingTitle.textContent = 'Billing Summary';
    billingSection.appendChild(billingTitle);
    var billingTotals = { 'Not Billed': 0, 'Invoiced': 0, 'Paid': 0 };
    var grandTotal = 0;
    state.project.tasks.forEach(function (t) {
      if (!t.milestone || t.billingAmount == null) return;
      var key = t.billingStatus || 'Not Billed';
      billingTotals[key] = (billingTotals[key] || 0) + t.billingAmount;
      grandTotal += t.billingAmount;
    });
    var billingList = document.createElement('ul');
    billingList.className = 'dashboard-list';
    var totalLi = document.createElement('li');
    totalLi.textContent = 'Total: $' + grandTotal.toLocaleString();
    billingList.appendChild(totalLi);
    ['Not Billed', 'Invoiced', 'Paid'].forEach(function (key) {
      var li = document.createElement('li');
      li.textContent = key + ': $' + (billingTotals[key] || 0).toLocaleString();
      billingList.appendChild(li);
    });
    billingSection.appendChild(billingList);
    container.appendChild(billingSection);
```

- [ ] **Step 2: Syntax-check and build**

Run:
```bash
cd "project-planner"
node --check src/js/ui/dashboard.js
python3 build.py
```
Expected: syntax clean; build succeeds (no Node test — pure DOM code, verified live in Task 7).

- [ ] **Step 3: Commit**

```bash
cd "project-planner"
git add src/js/ui/dashboard.js
git commit -m "Add Billing Summary section to Dashboard"
```

---

### Task 7: End-to-end browser verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only).

- [ ] **Step 1: Build and seed**

Run `cd "project-planner" && python3 build.py`. Temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, never `src/`) to include: one parent/phase task with 2 leaf children (one with `plannedStart`/`plannedFinish` set, one deliberately missing `plannedFinish`), and one standalone milestone leaf task with `milestone: true`. Serve via `cd dist && python3 -m http.server <port>` and navigate to it.

- [ ] **Step 2: Verify required-field validation blocks Save**

With the seeded leaf task missing `plannedFinish`, click Save. Confirm an `alert` appears naming that task, and no file downloads. Fill in the missing `plannedFinish` on that task via the Plan tree, click Save again, confirm it now downloads a `.json` file (per the already-shipped Part I Save flow) with no alert.

- [ ] **Step 3: Verify parent-row styling and read-only computed cells**

Confirm the parent/phase row renders bold with a visibly different background via `getComputedStyle` (not just the `is-parent` class being present — this project has been bitten before by CSS rules not applying as expected). Confirm dblclick on the parent row's P-Start/P-Finish/A-Start/A-Finish/%Actual cells does not open an editor (read-only), while the same columns on a leaf row do.

- [ ] **Step 4: Verify Actual Start/Actual Finish and the computed `% Actual` ramp**

On a leaf task with `plannedStart`/`plannedFinish` already set, confirm `% Actual` renders blank (not `0%`) before any Actual Start is set. Edit Actual Start via the new column, confirm `% Actual` now shows a nonzero ramped percentage (not 100%). Edit Actual Finish to a date on/before the project's status date, confirm `% Actual` becomes exactly 100% and the task's Status becomes Complete.

- [ ] **Step 5: Verify Updated By / Updated At**

Edit any field on a task (e.g. PIC), confirm the same row's Updated By cell shows the current session's user name and Updated At shows a recent timestamp. Edit a *different* task, confirm only that task's Updated By/At change — the first task's values stay as they were.

- [ ] **Step 6: Verify Remarks column**

Dblclick the Remarks cell on both a leaf and a parent row, type text, confirm it commits and persists across a refresh (e.g. after editing another cell elsewhere, which triggers a re-render).

- [ ] **Step 7: Verify Billing fields**

On the seeded milestone task, confirm Billing Amount and Billing Status cells are editable (dblclick opens a number input / a 3-option select respectively). Enter an amount and pick a status. On a non-milestone task, confirm both cells render blank and dblclick does nothing. Navigate to Dashboard, confirm the new "Billing Summary" section shows the entered amount under the correct status bucket and in the total.

- [ ] **Step 8: Verify horizontal scroll**

Confirm the Plan tree's header and rows are wider than the viewport (17 columns) and that `#plan-view` shows a horizontal scrollbar; scrolling it moves the header and the rows together so columns stay aligned.

- [ ] **Step 9: Regression sweep**

Spot-check Gantt, S-Curve, and Reports views still render sensible data for the seeded project (no `NaN`/`undefined` visible anywhere, since `% Actual`'s underlying representation changed project-wide). Check the browser console for errors across the whole session (only the benign favicon 404 is expected).

- [ ] **Step 10: Final full-suite check**

Run `cd "project-planner" && node --test` one more time and confirm every test passes.

- [ ] **Step 11: Record the result**

If every check in Steps 2–10 passes, this plan is complete — no commit needed for this task (verification only). If any check fails, that is a real bug in one of Tasks 1–6: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: the Plan tree enforces planned dates on every leaf task before Save, shows who/when last touched each task, visually distinguishes parent/phase rows, and exposes Actual Start/Actual Finish/Remarks/Billing columns. `% Actual` is fully computed from actual dates everywhere (leaf, parent, S-curve), matching the locked formula. The Dashboard gains a Billing Summary section. Deliverable/Jira columns remain out of scope, unchanged from the spec.
