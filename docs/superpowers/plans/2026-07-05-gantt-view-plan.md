# Gantt View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second tab to ProjectPlanner — an SVG Gantt chart with zoom (day/week/month/quarter), drag-to-move and drag-to-resize bars, dependency arrows, and today/status-date markers — wired to the same `state` object and Foundation engines the Plan view already uses.

**Architecture:** A new `src/js/ui/gantt.js` (plain browser IIFE, same style as `tree.js`/`app.js`) renders a hand-built SVG timeline: no charting library, per the zero-dependency constraint. Rows mirror the Plan view's visible-row computation exactly — that logic is extracted out of `tree.js` into `filters.js` (`computeVisibleRows`) in Task 1 so both views share one source of truth instead of duplicating the collapse/filter suppression algorithm. A tab bar switches between `#plan-view` and `#gantt-view`; `refresh()` in `app.js` re-renders both on every state change regardless of which tab is visible (simplest correct approach — no stale-view bugs, and re-rendering an SVG for a few hundred rows is cheap). Dragging a bar or its resize handle computes new dates in whole calendar days, commits them through `store.js`'s `updateTask`, then calls `deps.js`'s `forwardPass` to shift any successors, then triggers the same full recalc+re-render path every other edit uses.

**Tech Stack:** Vanilla ES5-compatible JavaScript, raw SVG DOM APIs (`document.createElementNS`), CSS. No canvas, no SVG library, no drag library.

## Global Constraints

- Zero external dependencies, runtime or dev. No SVG/drag/charting library.
- `src/js/ui/gantt.js` is a plain IIFE reading/writing `window.PP` directly — same style as `tree.js`/`app.js` — never `require`'d by tests, so no UMD wrapper needed.
- Dates are ISO `"YYYY-MM-DD"` strings everywhere. Gantt x-positions are computed from **calendar** days (not working days) between a date and the visible range's start, using `PP.parseISO`/`PP.toISO` (from `schedule.js`, already exposed on `window.PP`).
- No code comments except where genuinely non-obvious.
- File paths exact — every task states `Create:`/`Modify:` paths relative to `project-planner/`.
- Reusable planning tool for any project type/scale — nothing in this plan's code hardcodes phase names, task counts, or company names.
- Every mutation to `project.tasks` must go through `store.js`'s `Project` methods (`updateTask`) — Gantt drag/resize is no exception. Dependency propagation goes through `deps.js`'s `forwardPass`, never hand-rolled date math on other tasks.
- DOM-touching files (`gantt.js`, `app.js`, `index.html`, CSS) have no automated test framework available (adding jsdom would violate zero-dependency) — each such task's "test" step is `node --check` (syntax only) plus confirming the build succeeds and inlines the new code; real behavioral verification happens once, at this plan's final task, in a real browser (controller-run, not a fresh subagent — same pattern as the Plan View UI plan's Task 5).
- Locked interfaces already shipped on `main` that this plan consumes, unchanged:
  - `PP.recalc(project)` → `{ computed: Map<id,TaskComputed>, order, children, wbs, overall, kpis, scurve }` (`calc.js`). `TaskComputed` includes `{ isLeaf, isMilestone, plannedStart, plannedFinish, duration, weight, actualPct, status, depth, wbs }`.
  - `PP.Project` (`store.js`): `updateTask(id, patch, who)`, `toggleCollapse(id)`, etc. — unchanged.
  - `PP.forwardPass(tasks, movedTaskId, holidayDates)` → new array of shallow-cloned tasks with successors shifted (`deps.js`) — does not mutate its input.
  - `PP.visibleIds`, `PP.taskMatches`, `PP.hasActiveFilter` (`filters.js`).
  - `state` shape: `{ project, calc, currentUser, dirty, filters }` (`app.js`).
  - `PP.parseISO(dateISO)` → UTC millis; `PP.toISO(utcMillis)` → `"YYYY-MM-DD"` (`schedule.js`).

---

### Task 1: Extract `computeVisibleRows` — DRY the collapse/filter suppression logic

`tree.js`'s `renderTree` currently computes, inline, which rows are visible given the current filters and each task's `collapsed` state. The Gantt view needs the exact same computation (same rows, same order) so its bars line up with what the Plan view shows. Rather than duplicate that logic in `gantt.js`, extract it into `filters.js` once and have both views call it.

**Files:**
- Modify: `project-planner/src/js/filters.js`
- Modify: `project-planner/src/js/ui/tree.js`
- Modify: `project-planner/tests/filters.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by `tree.js` in this task, and by `gantt.js` in Task 2):
  - `computeVisibleRows(project, calc, filters, currentUser)` → `string[]`, the ordered list of task ids that should actually render as rows, given the current filters and each visible ancestor's `collapsed` state. `project` needs `{ tasks }`; `calc` needs `{ order, computed }` (the shape `recalc()` returns).

- [ ] **Step 1: Write the failing test**

Add to `project-planner/tests/filters.test.js`. First, update the top `require` line from:
```js
const { taskMatches, visibleIds, hasActiveFilter } = require('../src/js/filters.js');
```
to:
```js
const { taskMatches, visibleIds, hasActiveFilter, computeVisibleRows } = require('../src/js/filters.js');
```

Then append these tests at the end of the file:

```js
test('computeVisibleRows returns every id in order when nothing is collapsed and no filter is active', () => {
  const project = {
    tasks: [
      { id: 'phase', parentId: null, name: 'Phase', pic: '', remarks: '', jira: '', collapsed: false },
      { id: 'leaf1', parentId: 'phase', name: 'Leaf One', pic: 'Alice', remarks: '', jira: '', collapsed: false },
      { id: 'leaf2', parentId: 'phase', name: 'Leaf Two', pic: 'Bob', remarks: '', jira: '', collapsed: false },
    ],
  };
  const calc = {
    order: ['phase', 'leaf1', 'leaf2'],
    computed: new Map([
      ['phase', { status: 'In Progress' }],
      ['leaf1', { status: 'In Progress' }],
      ['leaf2', { status: 'In Progress' }],
    ]),
  };
  assert.deepEqual(computeVisibleRows(project, calc, {}, null), ['phase', 'leaf1', 'leaf2']);
});

test('computeVisibleRows hides descendants of a collapsed ancestor when no filter is active', () => {
  const project = {
    tasks: [
      { id: 'phase', parentId: null, name: 'Phase', pic: '', remarks: '', jira: '', collapsed: true },
      { id: 'leaf1', parentId: 'phase', name: 'Leaf One', pic: 'Alice', remarks: '', jira: '', collapsed: false },
    ],
  };
  const calc = {
    order: ['phase', 'leaf1'],
    computed: new Map([
      ['phase', { status: 'In Progress' }],
      ['leaf1', { status: 'In Progress' }],
    ]),
  };
  assert.deepEqual(computeVisibleRows(project, calc, {}, null), ['phase']);
});

test('computeVisibleRows reveals a matching descendant even under a collapsed ancestor when a filter is active', () => {
  const project = {
    tasks: [
      { id: 'phase', parentId: null, name: 'Phase', pic: '', remarks: '', jira: '', collapsed: true },
      { id: 'leaf1', parentId: 'phase', name: 'FindMe', pic: 'Alice', remarks: '', jira: '', collapsed: false },
    ],
  };
  const calc = {
    order: ['phase', 'leaf1'],
    computed: new Map([
      ['phase', { status: 'In Progress' }],
      ['leaf1', { status: 'In Progress' }],
    ]),
  };
  assert.deepEqual(computeVisibleRows(project, calc, { search: 'findme' }, null), ['phase', 'leaf1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/filters.test.js`
Expected: FAIL — `computeVisibleRows is not a function`

- [ ] **Step 3: Add `computeVisibleRows` to `filters.js`**

In `project-planner/src/js/filters.js`, add this function right after `visibleIds` (before the final `return` statement):

```js
  function computeVisibleRows(project, calc, filters, currentUser) {
    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const visible = visibleIds(project, calc.computed, calc.order, filters, currentUser);
    const filterActive = hasActiveFilter(filters);
    const suppressed = new Set();
    const rows = [];
    for (const id of calc.order) {
      const task = byId.get(id);
      const parentSuppressed = !filterActive && task.parentId != null && suppressed.has(task.parentId);
      if (parentSuppressed || !visible.has(id)) {
        if (!filterActive) suppressed.add(id);
        continue;
      }
      rows.push(id);
      if (!filterActive && task.collapsed) suppressed.add(id);
    }
    return rows;
  }
```

Then change the file's final line from:
```js
  return { taskMatches, visibleIds, hasActiveFilter };
```
to:
```js
  return { taskMatches, visibleIds, hasActiveFilter, computeVisibleRows };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/filters.test.js`
Expected: PASS (14 tests — 11 existing + 3 new)

- [ ] **Step 5: Refactor `tree.js`'s `renderTree` to use `computeVisibleRows`**

In `project-planner/src/js/ui/tree.js`, replace the entire `renderTree` function body with this (removes the duplicated suppression loop, delegates to the shared engine function):

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

      var row = document.createElement('div');
      row.className = 'tree-row';
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + escapeHtml(task.name) +
        '</span>' +
        '<span class="cell col-pic" data-field="pic">' + escapeHtml(task.pic || '') + '</span>' +
        '<span class="cell col-start" data-field="plannedStart">' + escapeHtml(task.plannedStart || '') + '</span>' +
        '<span class="cell col-finish" data-field="plannedFinish">' + escapeHtml(task.plannedFinish || '') + '</span>' +
        '<span class="col-duration">' + computed.duration + '</span>' +
        '<span class="col-weight">' + fmtPct(computed.weight) + '</span>' +
        '<span class="col-plan">' + fmtPct(computed.plannedPctToDate) + '</span>' +
        '<span class="cell col-actual" data-field="actualPct">' + fmtPct(computed.actualPct) + '</span>' +
        '<span class="col-status status-' + computed.status.replace(/\s+/g, '') + '">' + escapeHtml(computed.status) + '</span>';
      body.appendChild(row);
    });
  }
```

This produces byte-identical row markup to before — only the visibility computation changed (now delegated instead of inlined).

- [ ] **Step 6: Syntax-check and rebuild**

Run:
```bash
cd "project-planner"
node --check src/js/ui/tree.js
python3 build.py
node --test
```
Expected: syntax check clean; build succeeds; all 96 tests pass (85 existing + 3 new — Task 1 of this plan starts from the 85 tests already on `main`, per the ledger).

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add src/js/filters.js src/js/ui/tree.js tests/filters.test.js
git commit -m "Extract computeVisibleRows into filters.js so Plan and Gantt views share one visibility algorithm"
```

---

### Task 2: Tab bar + static Gantt render (no zoom, no drag yet)

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Create: `project-planner/src/js/ui/gantt.js`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/build.py`

**Interfaces:**
- Consumes: `PP.computeVisibleRows` (Task 1), `state.calc.overall`/`state.calc.computed` (`calc.js`), `PP.parseISO`/`PP.toISO` (`schedule.js`).
- Produces (used by Task 3 for zoom, Task 4 for drag): `PP.renderGantt(state)` — rebuilds `#gantt-labels` and `#gantt-body`'s SVG from current state. Hardcodes `'week'` zoom for this task; Task 3 makes the zoom level configurable via `state.project.settings.ganttZoom`.

- [ ] **Step 1: Add the tab bar and Gantt containers to `src/index.html`**

In `project-planner/src/index.html`, the current structure inside `#app` goes: `#app-header`, `#toolbar`, `#tree-header`, `#tree-body`. Replace the `#tree-header`/`#tree-body` block:

```html
  <div id="tree-header">
    <span></span>
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
```

with this (tab bar, then both views — `#plan-view` wraps the existing tree markup unchanged, `#gantt-view` is new and starts hidden):

```html
  <div id="view-tabs">
    <button class="view-tab active" data-view="plan">Plan</button>
    <button class="view-tab" data-view="gantt">Gantt</button>
  </div>
  <div id="plan-view">
    <div id="tree-header">
      <span></span>
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
  <div id="gantt-view" hidden>
    <div id="gantt-scroll">
      <div id="gantt-labels"></div>
      <div id="gantt-body"></div>
    </div>
  </div>
```

- [ ] **Step 2: Add tab/Gantt layout CSS to `src/css/layout.css`**

Append to `project-planner/src/css/layout.css`:

```css
#view-tabs { display: flex; gap: 4px; padding: 6px 20px; border-bottom: 1px solid var(--border); }
.view-tab {
  background: none; border: none; padding: 6px 14px; font-size: 13px; cursor: pointer;
  color: var(--text-muted); border-bottom: 2px solid transparent;
}
.view-tab.active { color: var(--kpmg-blue); border-bottom-color: var(--kpmg-blue); font-weight: 600; }

#plan-view, #gantt-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

#gantt-scroll { flex: 1; overflow: auto; display: flex; }
#gantt-labels {
  flex-shrink: 0; width: 200px; position: sticky; left: 0; z-index: 1;
  background: var(--surface); border-right: 1px solid var(--border);
}
.gantt-label-row {
  display: flex; align-items: center; font-size: 13px; padding-left: 8px;
  border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#gantt-body { flex-shrink: 0; }
```

- [ ] **Step 3: Create `src/js/ui/gantt.js`**

Create `project-planner/src/js/ui/gantt.js`:

```js
(function () {
  'use strict';

  var ZOOM_PX_PER_DAY = { day: 32, week: 10, month: 4, quarter: 1.6 };
  var ROW_HEIGHT = 28;
  var BAR_HEIGHT = 16;
  var HEADER_HEIGHT = 30;
  var DAY_MS = 86400000;

  function computeRange(overall) {
    var todayISO = new Date().toISOString().slice(0, 10);
    var start = overall.plannedStart || todayISO;
    var finish = overall.plannedFinish || todayISO;
    if (finish < start) finish = start;
    var startMs = PP.parseISO(start) - 7 * DAY_MS;
    var finishMs = PP.parseISO(finish) + 7 * DAY_MS;
    return { startISO: PP.toISO(startMs), finishISO: PP.toISO(finishMs), startMs: startMs, finishMs: finishMs };
  }

  function dateToX(dateISO, rangeStartMs, pxPerDay) {
    return (PP.parseISO(dateISO) - rangeStartMs) / DAY_MS * pxPerDay;
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function currentPxPerDay(state) {
    var zoom = state.project.settings.ganttZoom || 'week';
    return ZOOM_PX_PER_DAY[zoom] || ZOOM_PX_PER_DAY.week;
  }

  function renderGantt(state) {
    var body = document.getElementById('gantt-body');
    var labels = document.getElementById('gantt-labels');
    body.innerHTML = '';
    labels.innerHTML = '';

    var pxPerDay = currentPxPerDay(state);
    var range = computeRange(state.calc.overall);
    var totalDays = Math.round((range.finishMs - range.startMs) / DAY_MS);
    var width = Math.max(200, totalDays * pxPerDay);

    var rows = PP.computeVisibleRows(state.project, state.calc, state.filters, state.currentUser);
    var height = Math.max(60, HEADER_HEIGHT + rows.length * ROW_HEIGHT);

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var svg = svgEl('svg', { width: width, height: height, style: 'display:block' });

    var d;
    for (d = 0; d <= totalDays; d++) {
      var dayMs = range.startMs + d * DAY_MS;
      var dow = new Date(dayMs).getUTCDay();
      var dateISO = PP.toISO(dayMs);
      var isHoliday = state.project.holidays.some(function (h) { return h.date === dateISO; });
      if (dow === 0 || dow === 6 || isHoliday) {
        svg.appendChild(svgEl('rect', {
          x: d * pxPerDay, y: 0, width: pxPerDay, height: height,
          fill: isHoliday ? '#e8f2fb' : '#f5f6f7',
        }));
      }
    }

    var monthSeen = null;
    for (d = 0; d <= totalDays; d++) {
      var dayMs2 = range.startMs + d * DAY_MS;
      var dt = new Date(dayMs2);
      var monthKey = dt.getUTCFullYear() + '-' + dt.getUTCMonth();
      if (monthKey !== monthSeen && dt.getUTCDate() <= 7) {
        monthSeen = monthKey;
        var label = svgEl('text', { x: d * pxPerDay + 4, y: 14, 'font-size': 11, fill: '#5b6470' });
        label.textContent = dt.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        svg.appendChild(label);
        svg.appendChild(svgEl('line', {
          x1: d * pxPerDay, y1: 0, x2: d * pxPerDay, y2: height,
          stroke: '#e1e4e8', 'stroke-width': 1,
        }));
      }
    }

    rows.forEach(function (id, rowIndex) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
      if (!computed.plannedStart || !computed.plannedFinish) return;
      var x1 = dateToX(computed.plannedStart, range.startMs, pxPerDay);
      var x2 = dateToX(computed.plannedFinish, range.startMs, pxPerDay) + pxPerDay;
      var barWidth = Math.max(2, x2 - x1);

      if (computed.isMilestone) {
        var cx = x1 + barWidth / 2;
        var cy = y + BAR_HEIGHT / 2;
        var r = BAR_HEIGHT / 2;
        svg.appendChild(svgEl('polygon', {
          points: [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy].join(','),
          fill: 'var(--kpmg-blue)',
        }));
        return;
      }

      if (!computed.isLeaf) {
        var tickH = 6;
        var path = 'M ' + x1 + ' ' + (y + tickH) + ' L ' + x1 + ' ' + y + ' L ' + x2 + ' ' + y + ' L ' + x2 + ' ' + (y + tickH);
        svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
        return;
      }

      svg.appendChild(svgEl('rect', {
        x: x1, y: y, width: barWidth, height: BAR_HEIGHT, rx: 3,
        fill: '#dce6f5', stroke: 'var(--kpmg-blue)', 'stroke-width': 1,
        'data-id': id, class: 'gantt-bar',
      }));

      var fillWidth = barWidth * Math.max(0, Math.min(1, computed.actualPct));
      if (fillWidth > 0) {
        svg.appendChild(svgEl('rect', {
          x: x1, y: y, width: fillWidth, height: BAR_HEIGHT, rx: 3,
          fill: computed.status === 'Delayed' ? 'var(--status-delayed)' : 'var(--status-complete)',
          style: 'pointer-events:none',
        }));
      }

      svg.appendChild(svgEl('rect', {
        x: x2 - 6, y: y, width: 6, height: BAR_HEIGHT,
        fill: 'transparent', class: 'gantt-resize-handle', 'data-id': id, style: 'cursor:ew-resize',
      }));
    });

    rows.forEach(function (id, rowIndex) {
      var task = byId.get(id);
      if (!task.predecessors || !task.predecessors.length) return;
      var computed = state.calc.computed.get(id);
      if (!computed.plannedStart) return;
      var thisY = HEADER_HEIGHT + rowIndex * ROW_HEIGHT + BAR_HEIGHT / 2;
      var thisX = dateToX(computed.plannedStart, range.startMs, pxPerDay);

      task.predecessors.forEach(function (predId) {
        var predIndex = rows.indexOf(predId);
        if (predIndex === -1) return;
        var predComputed = state.calc.computed.get(predId);
        if (!predComputed || !predComputed.plannedFinish) return;
        var predY = HEADER_HEIGHT + predIndex * ROW_HEIGHT + BAR_HEIGHT / 2;
        var predX = dateToX(predComputed.plannedFinish, range.startMs, pxPerDay) + pxPerDay;
        var midX = predX + 8;
        var pathD = 'M ' + predX + ' ' + predY + ' L ' + midX + ' ' + predY + ' L ' + midX + ' ' + thisY + ' L ' + thisX + ' ' + thisY;
        svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 1 }));
        svg.appendChild(svgEl('polygon', {
          points: [thisX, thisY, thisX - 6, thisY - 3, thisX - 6, thisY + 3].join(','),
          fill: '#9aa5b1',
        }));
      });
    });

    var todayISO = new Date().toISOString().slice(0, 10);
    if (todayISO >= range.startISO && todayISO <= range.finishISO) {
      var tx = dateToX(todayISO, range.startMs, pxPerDay);
      svg.appendChild(svgEl('line', { x1: tx, y1: 0, x2: tx, y2: height, stroke: 'var(--kpmg-blue-light)', 'stroke-width': 2 }));
    }
    var statusISO = state.project.meta.statusDate;
    if (statusISO >= range.startISO && statusISO <= range.finishISO) {
      var sx = dateToX(statusISO, range.startMs, pxPerDay);
      svg.appendChild(svgEl('line', { x1: sx, y1: 0, x2: sx, y2: height, stroke: 'var(--status-delayed)', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
    }

    body.appendChild(svg);

    var spacer = document.createElement('div');
    spacer.style.height = HEADER_HEIGHT + 'px';
    labels.appendChild(spacer);
    rows.forEach(function (id) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var row = document.createElement('div');
      row.className = 'gantt-label-row';
      row.style.height = ROW_HEIGHT + 'px';
      row.style.paddingLeft = (computed.depth * 16) + 'px';
      row.textContent = task.name;
      labels.appendChild(row);
    });
  }

  window.PP = window.PP || {};
  window.PP.renderGantt = renderGantt;
})();
```

`row.textContent = task.name` (not `innerHTML`) is deliberate — task names are user-controlled free text, and assigning via `.textContent` is safe by construction, the same pattern already used for `#project-name` and the PIC filter dropdown in `app.js`.

- [ ] **Step 4: Wire the tab bar and always render both views in `app.js`**

In `project-planner/src/js/ui/app.js`, change the `refresh` function from:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
    renderPicFilter(state);
    PP.renderTree(state);
    if (markDirty) {
```
to:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
    renderPicFilter(state);
    PP.renderTree(state);
    PP.renderGantt(state);
    if (markDirty) {
```
(leave the rest of the function body unchanged).

Add a new function anywhere in the file (a good spot is right after `wireToolbar`):
```js
  function wireViewTabs(state) {
    var tabs = document.querySelectorAll('.view-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var view = tab.dataset.view;
        document.getElementById('plan-view').hidden = view !== 'plan';
        document.getElementById('gantt-view').hidden = view !== 'gantt';
      });
    });
  }
```

In `showApp(state)`, add a call to it alongside the other `wire*` calls — change:
```js
    wireHeader(state);
    wireToolbar(state);
    PP.wireTree(state, function () { refresh(state, true); });
```
to:
```js
    wireHeader(state);
    wireToolbar(state);
    wireViewTabs(state);
    PP.wireTree(state, function () { refresh(state, true); });
```

- [ ] **Step 5: Register `gantt.js` in `build.py`**

In `project-planner/build.py`, change `JS_ORDER` from:
```python
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "ui/tree.js",
    "ui/app.js",
]
```
to:
```python
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/app.js",
]
```

- [ ] **Step 6: Syntax-check, build, and confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/gantt.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderGantt" dist/ProjectPlanner.html
node --test
```
Expected: both syntax checks clean; build succeeds; grep prints `1`; all 96 tests still pass (this task adds no Node tests — pure DOM/SVG code).

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/js/ui/gantt.js src/js/ui/app.js build.py
git commit -m "Add Plan/Gantt tab bar and static SVG Gantt render"
```

---

### Task 3: Zoom controls (day/week/month/quarter)

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.renderGantt` (Task 2), `state.project.settings.ganttZoom` (already part of the locked data model, defaults `'week'`).
- Produces: nothing new for later tasks — this is a leaf feature.

- [ ] **Step 1: Add a zoom toolbar to `#gantt-view` in `src/index.html`**

Change:
```html
  <div id="gantt-view" hidden>
    <div id="gantt-scroll">
```
to:
```html
  <div id="gantt-view" hidden>
    <div id="gantt-toolbar">
      <button class="gantt-zoom-btn" data-zoom="day">Day</button>
      <button class="gantt-zoom-btn" data-zoom="week">Week</button>
      <button class="gantt-zoom-btn" data-zoom="month">Month</button>
      <button class="gantt-zoom-btn" data-zoom="quarter">Quarter</button>
    </div>
    <div id="gantt-scroll">
```

- [ ] **Step 2: Add zoom button CSS to `src/css/layout.css`**

Append:
```css
#gantt-toolbar { display: flex; gap: 4px; padding: 6px 20px; border-bottom: 1px solid var(--border); }
.gantt-zoom-btn {
  background: var(--surface-alt); border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--text-muted);
}
.gantt-zoom-btn.active { background: var(--kpmg-blue); border-color: var(--kpmg-blue); color: #fff; }
```

- [ ] **Step 3: Wire the zoom buttons in `app.js`**

Add a new function to `project-planner/src/js/ui/app.js` (a good spot is right after `wireViewTabs`):
```js
  function wireGanttZoom(state) {
    var buttons = document.querySelectorAll('.gantt-zoom-btn');
    function updateActive() {
      var zoom = state.project.settings.ganttZoom || 'week';
      buttons.forEach(function (b) { b.classList.toggle('active', b.dataset.zoom === zoom); });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        state.project.settings.ganttZoom = b.dataset.zoom;
        updateActive();
        refresh(state, true);
      });
    });
    updateActive();
  }
```

In `showApp(state)`, add a call to it alongside the other wiring — change:
```js
    wireHeader(state);
    wireToolbar(state);
    wireViewTabs(state);
    PP.wireTree(state, function () { refresh(state, true); });
```
to:
```js
    wireHeader(state);
    wireToolbar(state);
    wireViewTabs(state);
    wireGanttZoom(state);
    PP.wireTree(state, function () { refresh(state, true); });
```

- [ ] **Step 4: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; all 96 tests pass (no new Node tests — this is a UI-only feature verified in Task 5).

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/js/ui/app.js
git commit -m "Add Gantt zoom controls (day/week/month/quarter)"
```

---

### Task 4: Drag-to-move and drag-to-resize bars, with dependency forward-pass

**Files:**
- Modify: `project-planner/src/js/ui/gantt.js`
- Modify: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.forwardPass` (`deps.js`, already shipped on `main`), `PP.parseISO`/`PP.toISO` (`schedule.js`).
- Produces: `PP.wireGantt(state, onChanged)` — attaches drag/resize listeners to `#gantt-body`, mirroring `PP.wireTree`'s `onChanged` callback pattern from the Plan View UI plan.

- [ ] **Step 1: Add drag/resize + forward-pass logic to `gantt.js`**

In `project-planner/src/js/ui/gantt.js`, add these two functions right before the final `window.PP = window.PP || {};` block:

```js
  function applyForwardPass(state, movedTaskId) {
    var holidayDates = state.project.holidays.map(function (h) { return h.date; });
    var result = PP.forwardPass(state.project.tasks, movedTaskId, holidayDates);
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    result.forEach(function (updated) {
      if (updated.id === movedTaskId) return;
      var original = byId.get(updated.id);
      if (original.plannedStart !== updated.plannedStart || original.plannedFinish !== updated.plannedFinish) {
        state.project.updateTask(updated.id, {
          plannedStart: updated.plannedStart, plannedFinish: updated.plannedFinish,
        }, state.currentUser);
      }
    });
  }

  function wireGantt(state, onChanged) {
    var container = document.getElementById('gantt-body');
    var drag = null;

    container.addEventListener('mousedown', function (e) {
      var handle = e.target.closest('.gantt-resize-handle');
      var bar = e.target.closest('.gantt-bar');
      var pxPerDay = currentPxPerDay(state);
      if (handle) {
        drag = { mode: 'resize', id: handle.dataset.id, startClientX: e.clientX, pxPerDay: pxPerDay };
      } else if (bar) {
        drag = {
          mode: 'move', id: bar.dataset.id, startClientX: e.clientX, pxPerDay: pxPerDay,
          el: bar, origX: parseFloat(bar.getAttribute('x')),
        };
      } else {
        return;
      }
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      drag.deltaPx = e.clientX - drag.startClientX;
      if (drag.mode === 'move' && drag.el) {
        drag.el.setAttribute('x', drag.origX + drag.deltaPx);
      }
    });

    document.addEventListener('mouseup', function () {
      if (!drag) return;
      var deltaDays = Math.round((drag.deltaPx || 0) / drag.pxPerDay);
      if (deltaDays !== 0) {
        var task = state.project.tasks.find(function (t) { return t.id === drag.id; });
        if (task && task.plannedStart && task.plannedFinish) {
          if (drag.mode === 'move') {
            var newStart = PP.toISO(PP.parseISO(task.plannedStart) + deltaDays * DAY_MS);
            var newFinish = PP.toISO(PP.parseISO(task.plannedFinish) + deltaDays * DAY_MS);
            state.project.updateTask(drag.id, { plannedStart: newStart, plannedFinish: newFinish }, state.currentUser);
          } else {
            var candidateFinish = PP.toISO(PP.parseISO(task.plannedFinish) + deltaDays * DAY_MS);
            if (candidateFinish < task.plannedStart) candidateFinish = task.plannedStart;
            state.project.updateTask(drag.id, { plannedFinish: candidateFinish }, state.currentUser);
          }
          applyForwardPass(state, drag.id);
          onChanged();
        }
      }
      drag = null;
    });
  }

  window.PP.wireGantt = wireGantt;
```

Note this reads `DAY_MS`, `currentPxPerDay` — both already defined earlier in this same file (Task 2), so no new module-level declarations are needed.

- [ ] **Step 2: Wire it up in `app.js`**

In `project-planner/src/js/ui/app.js`, change:
```js
    wireGanttZoom(state);
    PP.wireTree(state, function () { refresh(state, true); });
```
to:
```js
    wireGanttZoom(state);
    PP.wireTree(state, function () { refresh(state, true); });
    PP.wireGantt(state, function () { refresh(state, true); });
```

- [ ] **Step 3: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/gantt.js
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; all 96 tests pass. Drag/resize behavior itself is verified in Task 5 (real browser, mouse events) — there is no Node-testable surface here since it's pure DOM interaction plus calls into already-tested engine functions.

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/js/ui/gantt.js src/js/ui/app.js
git commit -m "Add Gantt drag-to-move and drag-to-resize with dependency forward-pass"
```

---

### Task 5: End-to-end browser verification (controller-run, not a fresh subagent)

Same pattern as the Plan View UI plan's Task 5: the controller drives a real browser via the Playwright tools already available in this session, because SVG rendering and mouse-drag interactions cannot be verified any other way without violating the zero-dependency constraint.

**Files:** none (verification only).

- [ ] **Step 1: Build the artifact**

Run: `cd "project-planner" && python3 build.py`

- [ ] **Step 2: Seed a realistic multi-task project into the built artifact**

The default seed is a blank project (`tasks: []`), which won't exercise the Gantt timeline. Temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, never in `src/`) to include at least: one phase with two leaf children with different `plannedStart`/`plannedFinish`/`actualPct` (one on-time, one delayed), one milestone task (`milestone: true`, `plannedStart === plannedFinish`), and one task with a `predecessors` link to another, so every Gantt rendering path (bars, brackets, milestones, dependency arrows, weekend/holiday shading) gets exercised. Serve it via a local HTTP server (`file://` URLs are blocked by the Playwright sandbox used in this session) — e.g. `cd dist && python3 -m http.server 8745` — and navigate to `http://localhost:8745/ProjectPlanner.html`.

- [ ] **Step 3: Verify the tab bar and static render**

Complete the name-picker flow, then click the "Gantt" tab and confirm: the Plan view (`#plan-view`) hides and the Gantt view (`#gantt-view`) shows (check via `element.hidden`/`getComputedStyle(...).display`, not just the accessibility snapshot — this session has twice found real bugs where an element's DOM state looked right but the computed CSS said otherwise); the SVG renders one row per visible task, in the same order and respecting the same collapse/filter state as the Plan view; the milestone task renders as a diamond, not a bar; a parent task renders as a bracket shape, not a filled bar; weekend columns are shaded; the today line and status-date line both render somewhere in the visible range.

- [ ] **Step 4: Verify zoom**

Click each of the four zoom buttons in turn and confirm: the active button's styling updates, the SVG's total width changes (wider at `day`, narrower at `quarter`), and the bars remain positioned consistently with the (re-rendered) timeline at each zoom level — no console errors during any transition.

- [ ] **Step 5: Verify drag-to-move**

Dispatch a `mousedown` on a leaf task's bar (`.gantt-bar[data-id="..."]`), then `mousemove` events on `document` with an increasing `clientX` (simulating a drag to the right by roughly 3-5 days' worth of pixels at the current zoom's `pxPerDay`), then `mouseup`. Confirm: the task's `plannedStart` and `plannedFinish` both shifted by the same number of calendar days; the KPI header and Plan-view tree (switch tabs to check) reflect the recalculated dates/duration; if the dragged task has a successor (per the seed data's `predecessors` link), confirm the successor's dates also shifted via `forwardPass`.

- [ ] **Step 6: Verify drag-to-resize**

Dispatch a `mousedown` on a leaf task's `.gantt-resize-handle`, then `mousemove` with a `clientX` delta, then `mouseup`. Confirm: only `plannedFinish` changed (not `plannedStart`); the bar's rendered width changed accordingly after re-render; dragging the resize handle far enough left that the computed finish would precede the start instead clamps `plannedFinish` to equal `plannedStart` (does not produce an inverted date range).

- [ ] **Step 7: Check console errors and Node suite**

Confirm no uncaught JS errors were logged to the browser console during any of the above (check via the browser tools' console-message capability, across the whole session, not just since the last navigation). Then run `cd "project-planner" && node --test` one more time and confirm all 96 tests still pass.

- [ ] **Step 8: Record the result**

If every check in Steps 3–7 passes, this plan is complete — no commit needed for this task (verification only). If any check fails, that is a real bug in Task 2, 3, or 4's code: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from Step 3 before considering the plan done.

---

## Plan Complete

At the end of this plan: ProjectPlanner has a working SVG Gantt chart alongside the Plan view — zoomable, showing planned/actual progress bars, brackets for phase rows, diamonds for milestones, dependency arrows, weekend/holiday shading, today/status-date lines — with drag-to-move and drag-to-resize both correctly triggering the same recalc/re-render/dependency-propagation pipeline every other edit in the app already uses. The next plan (Analytics: S-curve, dashboard, snapshots + comparison) builds on the same `state` object and the `computeVisibleRows`/`renderX`/`wireX` pattern established across the Plan View UI and Gantt plans.

**Known deferred scope:** month-label text in the SVG scrolls out of view when scrolling down a tall project (no sticky vertical header for the time axis, only the row-label column is sticky horizontally) — deferred to the Reports & polish phase as a polish item, not a functional gap.
