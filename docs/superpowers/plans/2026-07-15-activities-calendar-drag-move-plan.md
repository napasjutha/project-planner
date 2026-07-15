# Activities Calendar Drag-to-Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag an activity chip on the Activities tab's calendar to a different day cell, moving that activity's `dateStart`/`dateEnd` together (duration unchanged). No resize.

**Architecture:** Task 1 adds a plain calendar-day arithmetic helper, `addCalendarDays`, to `src/js/schedule.js` (Node-tested, distinct from the existing workday-skipping `addWorkdays`). Task 2 wires a mousedown/mousemove/mouseup drag interaction into `src/js/ui/activities.js`, hit-testing day cells (each stamped with `data-date` during render) instead of doing continuous pixel math — this calendar's columns are discrete Mon-Fri cells, not a continuous timeline like the Gantt chart. Task 3 is controller-run end-to-end verification.

**Tech Stack:** Vanilla JS (no framework), Node's built-in `node:test`, raw DOM mouse events (`mousedown`/`mousemove`/`mouseup`, no HTML5 drag-and-drop API — matches this codebase's existing Gantt-chart drag pattern).

## Global Constraints

- Zero external dependencies — no npm packages, no CDN, no bundler. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`.
- Engines (`src/js/*.js`): UMD-lite wrapper, Node-tested, no DOM. `src/js/ui/*.js`: plain IIFEs, no UMD, no jsdom — verified only via controller-run Playwright checks, never by a fresh implementer subagent.
- Baseline: 246/246 Node tests passing as of this plan's start (verified via `node --test` immediately before Task 1 — if your local run differs, use your verified number instead and adjust later "Expected" counts accordingly).
- This plan is **independent** of `docs/superpowers/plans/2026-07-15-reports-progress-scurve-and-divider-plan.md` — different tabs, no shared files, no merge-order dependency. Safe to build on a parallel worktree.
- Move only — no resize. Dragging a chip's edge has no special behavior; only dragging the chip body (anywhere inside it) starts a move.
- Cross-month dragging is out of scope — dropping outside the currently rendered grid (including on the prev/next-month nav buttons) is a no-op; the activity keeps its original dates.
- `mousemove`/`mouseup` handlers bind on `document`, not the calendar container — matches `src/js/ui/gantt.js`'s existing pattern (`gantt.js:242` binds `document.addEventListener('mousemove', ...)`) so a drag that briefly leaves the grid still tracks correctly. Do **not** add Gantt's `e.buttons === 0` stale-drag guard (`gantt.js:244-250`) — that guard exists to abandon a cloned/repositioned SVG bar element if `mouseup` never fires; this drag has no cloned DOM element to leak, so the guard has nothing to clean up.
- `updateActivity` (`src/js/store.js:491-497`) already calls `this._pushUndo()` before mutating — no plan task needs to add undo/redo wiring, it is automatic.
- Run `python3 build.py` after every `src/` change, before any manual/browser verification step.

---

### Task 1: `addCalendarDays` in `schedule.js`

**Files:**
- Modify: `src/js/schedule.js:65-71` (return statement) and add a new function above it
- Test: `tests/schedule.test.js`

**Interfaces:**
- Produces: `PP.addCalendarDays(dateISO, n)` — pure function, returns the ISO date `n` calendar days after (or before, if `n` is negative) `dateISO`. Unlike `addWorkdays`, this does NOT skip weekends or holidays. Task 2 consumes this directly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/schedule.test.js` (after the existing `remainingWorkdays` tests, updating the import on line 3):

Change line 3 from:
```js
const { networkdays, addWorkdays, remainingWorkdays } = require('../src/js/schedule.js');
```
to:
```js
const { networkdays, addWorkdays, remainingWorkdays, addCalendarDays } = require('../src/js/schedule.js');
```

Then append at the end of the file:

```js

test('addCalendarDays: positive delta advances by plain calendar days, including weekends', () => {
  assert.equal(addCalendarDays('2026-07-15', 5), '2026-07-20');
});

test('addCalendarDays: negative delta moves backward', () => {
  assert.equal(addCalendarDays('2026-07-15', -5), '2026-07-10');
});

test('addCalendarDays: zero delta returns the same date', () => {
  assert.equal(addCalendarDays('2026-07-15', 0), '2026-07-15');
});

test('addCalendarDays: rolls over the month boundary', () => {
  assert.equal(addCalendarDays('2026-07-30', 3), '2026-08-02');
});

test('addCalendarDays: rolls over the year boundary', () => {
  assert.equal(addCalendarDays('2026-12-30', 3), '2027-01-02');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `addCalendarDays is not defined` / `TypeError: addCalendarDays is not a function` (not exported yet).

- [ ] **Step 3: Implement `addCalendarDays`**

In `src/js/schedule.js`, add the new function directly after `addWorkdays` (which ends at line 64) and before `remainingWorkdays` (which starts at line 66):

```js
  function addCalendarDays(dateISO, n) {
    return toISO(parseISO(dateISO) + n * DAY_MS);
  }

```

Then update the module's return statement (currently line 71):
```js
  return { networkdays, addWorkdays, remainingWorkdays, parseISO, toISO, isWeekend };
```
to:
```js
  return { networkdays, addWorkdays, remainingWorkdays, parseISO, toISO, isWeekend, addCalendarDays };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — total count is your verified baseline + 5.

- [ ] **Step 5: Commit**

```bash
git add src/js/schedule.js tests/schedule.test.js
git commit -m "feat: add addCalendarDays plain calendar-day arithmetic helper"
```

---

### Task 2: Drag-to-move on the Activities calendar

**Files:**
- Modify: `src/js/ui/activities.js:127-143` (day-cell rendering in `renderActivitiesCalendar`) and `src/js/ui/activities.js:314-329` (end of `wireActivities`, to add drag handlers)
- Modify: `src/css/layout.css:344` (`.calendar-chip` cursor) and insert new rules after line 348

**Interfaces:**
- Consumes: `PP.addCalendarDays`, `PP.parseISO` (Task 1 + pre-existing export), `state.project.updateActivity(id, patch)` (pre-existing, `store.js:491-497`), `state.project.activities` (each has `id`, `dateStart`, `dateEnd`), the existing `chip.dataset.activityId` and new `cell.dataset.date` (day cells).
- Produces: no new exports — this is UI wiring only, consumed by nothing else.

- [ ] **Step 1: Stamp each day cell with its date**

In `src/js/ui/activities.js`, inside `renderActivitiesCalendar`'s `week.days.forEach` loop (lines 127-143), change:

```js
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
```

to:

```js
      week.days.forEach(function (day, col) {
        var cell = document.createElement('div');
        cell.className = 'calendar-daynum' + (day ? '' : ' calendar-daynum-empty');
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = '1';
        if (day) {
          cell.dataset.date = day.date;
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
```

(`day.date` is an ISO string already produced by `PP.computeCalendarLayout` — see `src/js/calendar.js`'s day-object contract `{date, dayOfMonth, keyDate}`. Empty/padding cells get no `data-date`, so they can never be a valid drop target.)

- [ ] **Step 2: Add the drag handlers to `wireActivities`**

In `src/js/ui/activities.js`, insert the following directly before `wireActivities`'s closing `}` (after the `activities-month-next` listener block, which ends at line 329):

```js

    var calDrag = null;

    document.getElementById('activities-calendar').addEventListener('mousedown', function (e) {
      var chip = e.target.closest('.calendar-chip');
      if (!chip) return;
      var activity = state.project.activities.find(function (a) { return a.id === chip.dataset.activityId; });
      if (!activity) return;
      calDrag = { activityId: activity.id, origDateStart: activity.dateStart, origDateEnd: activity.dateEnd, targetCell: null };
      chip.classList.add('is-dragging');
    });

    document.addEventListener('mousemove', function (e) {
      if (!calDrag) return;
      if (calDrag.targetCell) calDrag.targetCell.classList.remove('calendar-daynum-drop-target');
      var hitEl = document.elementFromPoint(e.clientX, e.clientY);
      var cell = hitEl && hitEl.closest('.calendar-daynum[data-date]');
      calDrag.targetCell = cell || null;
      if (cell) cell.classList.add('calendar-daynum-drop-target');
    });

    document.addEventListener('mouseup', function () {
      if (!calDrag) return;
      var drag = calDrag;
      calDrag = null;
      document.querySelectorAll('.calendar-chip.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); });
      if (drag.targetCell) drag.targetCell.classList.remove('calendar-daynum-drop-target');
      if (!drag.targetCell) return;
      var targetDate = drag.targetCell.dataset.date;
      if (targetDate === drag.origDateStart) return;
      var deltaDays = Math.round((PP.parseISO(targetDate) - PP.parseISO(drag.origDateStart)) / 86400000);
      var newDateStart = PP.addCalendarDays(drag.origDateStart, deltaDays);
      var newDateEnd = PP.addCalendarDays(drag.origDateEnd, deltaDays);
      state.project.updateActivity(drag.activityId, { dateStart: newDateStart, dateEnd: newDateEnd });
      onChanged();
    });
```

- [ ] **Step 3: Add drag styling**

In `src/css/layout.css`, change line 344 from:
```css
.calendar-chip { border-radius: var(--radius-sm); padding: 2px 6px; font-size: 11px; overflow: hidden; cursor: default; display: flex; align-items: center; gap: 4px; }
```
to:
```css
.calendar-chip { border-radius: var(--radius-sm); padding: 2px 6px; font-size: 11px; overflow: hidden; cursor: grab; display: flex; align-items: center; gap: 4px; }
```

Then insert after line 348 (`.calendar-chip-time { ... }`), before the `#reports-view` block:

```css
.calendar-chip.is-dragging { opacity: 0.5; }
.calendar-daynum-drop-target { background: rgba(0,145,218,0.25); outline: 2px dashed var(--kpmg-blue-light); outline-offset: -2px; }
```

- [ ] **Step 4: Build and confirm no regressions**

```bash
node --check src/js/ui/activities.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 1's final count (this task touches no engine/logic file in a test-observable way — `activities.js` has no automated coverage, per this repo's UI-file convention).

- [ ] **Step 5: Commit**

```bash
git add src/js/ui/activities.js src/css/layout.css
git commit -m "feat: drag activity chips on the calendar to move their dates"
```

---

### Task 3: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as this repo's prior final-verification tasks: the controller drives a real browser via the Playwright tools already available in this session, not a dispatched subagent.

**Files:** none (verification only).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
python3 build.py
node --test
```

Expected: test count matches Task 1's final count exactly (Task 2 adds no tests).

- [ ] **Step 2: Serve the built app and seed a realistic project**

```bash
cd dist && python3 -m http.server 8792
```

Navigate to it with the Playwright browser tools (`file://` URLs are blocked by the sandbox). Complete the name-picker overlay if it appears. Open the Activities tab and add a single-day Meeting and a multi-day Workshop that spans a weekend, if none already exist.

- [ ] **Step 3: Drag a single-day chip within the same week row**

Use `mcp__plugin_playwright_playwright__browser_drag` (or manual `browser_evaluate`-driven mouse events, if the drag tool doesn't fire real `mousemove` events reliably against a hit-tested target) to drag the single-day Meeting chip to a different weekday cell in the same week row. Confirm: the chip re-renders in the new cell, and the Activities list table below the calendar shows the updated `dateStart`/`dateEnd`.

- [ ] **Step 4: Drag a multi-day chip across a week-row boundary**

Drag the multi-day Workshop banner to a day cell in a different week row. Confirm both `dateStart` and `dateEnd` shifted by the same number of days (duration preserved) — check the Activities list table's Start/End columns.

- [ ] **Step 5: Confirm no-op cases**

Mousedown and mouseup on the same cell without moving (no actual drag) — confirm no date change. Drag a chip and release outside the calendar grid entirely (e.g. over the page header) — confirm the activity keeps its original dates.

- [ ] **Step 6: Confirm undo**

After a successful drag-move (Step 3 or 4), click Undo. Confirm the activity's dates revert to their pre-drag values.

- [ ] **Step 7: Verify zero regression to every other tab**

Click through Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Deliverable/Billing, Settings, Holidays, Issues/Risks/Decisions, Reports. Confirm no console errors and each tab still renders its content. Specifically confirm the Reports tab's static calendar page (which reuses `computeCalendarLayout` but never wires drag handlers) still renders correctly and is not draggable.

- [ ] **Step 8: Final test sweep**

```bash
node --test
```

Expected: same count as Step 1 — nothing regressed.

- [ ] **Step 9: Record the result**

If every check in Steps 1-8 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-2: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.
