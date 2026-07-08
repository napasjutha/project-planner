# Resources — Capacity & Workload (V2 Sub-Project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new consolidated "Resources" view tab containing the PIC list (moved out of Settings), a per-week FTE capacity table (W1…Wn, each week independent, default 1.0), and a manday/FTE workload grid flagging overload — detect-and-visualize only, never auto-reschedule.

**Architecture:** One new pure engine (`src/js/workload.js`: week bucketing, per-week FTE resolution, demand/available/overload per PIC-week) plus one new UI module (`src/js/ui/resources.js`: PIC list wiring relocated verbatim from `settings.js`, editable capacity grid, tinted workload grid with drill-down). New 9th tab wired in all three required places. Final task is controller-run browser verification.

**Tech Stack:** Vanilla JS, CSS grid/tables, `node:test`. No new dependencies.

## Global Constraints

- Zero external dependencies; no code comments except where genuinely non-obvious.
- **Never auto-reschedule.** This plan only detects and visualizes.
- Capacity model: `settings.picFte` = `{ picName: { weekMondayISO: fte } }`. Any absent (PIC, week) = **1.0**. Writing exactly `1` deletes the override key. Weeks are **independent** — an edit affects only its own week.
- Demand: every workday a non-cancelled leaf task (with both planned dates and a non-blank PIC) is active = 1 manday demanded from that PIC. Available per week = (holiday-aware workdays in that week) × that week's FTE. Overloaded = `demand > available`.
- Locked worked example (asserted literally in tests): Alice overridden to 0.5 for one week with 5 workdays → available 2.5; 4 demanded task-workdays → ratio 1.6, overloaded; adjacent weeks unaffected at 1.0.
- Weeks are Monday-based, spanning min leaf planned start → max leaf planned finish, labeled W1…Wn.
- PIC rows = union of `picList` and every `task.pic`, sorted — demand can never vanish because a PIC isn't in the list.
- The PIC List editor moves **out of Settings entirely** (markup + wiring) into the Resources tab, keeping the same element ids (`#pic-list-editor`, `#new-pic-input`, `#add-pic-button`). Removing a PIC also deletes its `picFte` entry.
- New tab = THREE places or it silently breaks (documented gotcha, bitten twice): `.view-tab[data-view="resources"]` button, `<div id="resources-view" hidden>` container, and `'resources-view'` in `app.js`'s `VIEW_IDS`.
- Engines Node-tested (TDD); UI verified in the final controller-run browser task. Bare `node --test` only. `python3 build.py`; register `js/workload.js` (engine group) and `js/ui/resources.js` (ui group) in `build.py`'s `JS_ORDER`.
- All user-controlled strings (PIC names, task names) reaching the DOM go through `textContent` — never concatenated into `innerHTML`.
- Suite count entering this plan: 137 (after CSV Import + Dependency plans; adjust totals by delta if run out of order).
- `--tier-watch` (yellow tint token) is added by the Dependency plan's Task 2; if this plan runs first, add `--tier-watch: #ffcc00;` to `theme.css`'s `:root` in this plan's Task 2 instead.

---

### Task 1: `workload.js` engine

**Files:**
- Create: `project-planner/src/js/workload.js`
- Create: `project-planner/tests/workload.test.js`
- Modify: `project-planner/build.py` (add `'js/workload.js'`, engine group)

**Interfaces:**
- Consumes: `parseISO`, `toISO`, `isWeekend` from `schedule.js` (UMD-lite require/global pattern, same as `deps.js`).
- Produces: `weekFteFor(picFte, picName, weekMondayISO) -> number` and `computeWorkload(project, computed) -> { weeks: [{index, mondayISO}], pics: string[], cells: Map<'pic|mondayISO', {demand, available, overloaded, taskIds}> }`.

- [ ] **Step 1: Write the failing tests**

Create `project-planner/tests/workload.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { weekFteFor, computeWorkload } = require('../src/js/workload.js');

function leaf(id, pic, plannedStart, plannedFinish) {
  return {
    id, parentId: null, order: 0, name: id, pic,
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, milestone: false,
    statusOverride: null, predecessors: [], collapsed: false,
  };
}

function project(tasks, picFte, holidays, picList) {
  return {
    tasks,
    holidays: (holidays || []).map(d => ({ date: d })),
    picList: picList || [],
    settings: { theme: 'kpmg-light', ganttZoom: 'week', picFte: picFte || {} },
  };
}

function computedFor(tasks) {
  const m = new Map();
  tasks.forEach(t => m.set(t.id, { isLeaf: true }));
  return m;
}

test('weekFteFor defaults to 1.0 for absent map, PIC, or week', () => {
  assert.equal(weekFteFor(undefined, 'Alice', '2026-07-06'), 1);
  assert.equal(weekFteFor({}, 'Alice', '2026-07-06'), 1);
  assert.equal(weekFteFor({ Alice: {} }, 'Alice', '2026-07-06'), 1);
});

test('weekFteFor returns the override and clamps malformed values', () => {
  assert.equal(weekFteFor({ Alice: { '2026-07-06': 0.5 } }, 'Alice', '2026-07-06'), 0.5);
  assert.equal(weekFteFor({ Alice: { '2026-07-06': -3 } }, 'Alice', '2026-07-06'), 0);
  assert.equal(weekFteFor({ Alice: { '2026-07-06': 'x' } }, 'Alice', '2026-07-06'), 1);
});

// 2026-07-06 is a Monday.

test('computeWorkload buckets Monday weeks W1..Wn across the leaf date span', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-08', '2026-07-21')]; // Wed W1 .. Tue W3
  const { weeks } = computeWorkload(project(tasks), computedFor(tasks));
  assert.deepEqual(weeks.map(w => w.mondayISO), ['2026-07-06', '2026-07-13', '2026-07-20']);
  assert.deepEqual(weeks.map(w => w.index), [1, 2, 3]);
});

test('demand splits across week boundaries and weekends are excluded', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-08', '2026-07-14')]; // Wed..next Tue
  const { cells } = computeWorkload(project(tasks), computedFor(tasks));
  assert.equal(cells.get('Alice|2026-07-06').demand, 3);  // Wed,Thu,Fri
  assert.equal(cells.get('Alice|2026-07-13').demand, 2);  // Mon,Tue
});

test('the locked worked example: 0.5 FTE week, 4 demanded workdays -> 1.6 overloaded, neighbors untouched', () => {
  const tasks = [
    leaf('t1', 'Alice', '2026-07-06', '2026-07-09'),  // Mon-Thu W1: 4 days
    leaf('t2', 'Alice', '2026-07-13', '2026-07-16'),  // Mon-Thu W2: 4 days
  ];
  const picFte = { Alice: { '2026-07-06': 0.5 } };
  const { cells } = computeWorkload(project(tasks, picFte), computedFor(tasks));
  const w1 = cells.get('Alice|2026-07-06');
  assert.equal(w1.demand, 4);
  assert.equal(w1.available, 2.5);
  assert.equal(w1.overloaded, true);
  const w2 = cells.get('Alice|2026-07-13');
  assert.equal(w2.available, 5);
  assert.equal(w2.overloaded, false);
});

test('holidays reduce both demand and available', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-06', '2026-07-10')];
  const { cells } = computeWorkload(project(tasks, {}, ['2026-07-08']), computedFor(tasks));
  const w1 = cells.get('Alice|2026-07-06');
  assert.equal(w1.demand, 4);
  assert.equal(w1.available, 4);
});

test('zero-FTE week with demand is overloaded', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-06', '2026-07-10')];
  const picFte = { Alice: { '2026-07-06': 0 } };
  const { cells } = computeWorkload(project(tasks, picFte), computedFor(tasks));
  const w1 = cells.get('Alice|2026-07-06');
  assert.equal(w1.available, 0);
  assert.equal(w1.overloaded, true);
});

test('cancelled, parent, blank-PIC and dateless tasks contribute no demand; pics = union sorted', () => {
  const tasks = [
    leaf('a', 'Alice', '2026-07-06', '2026-07-10'),
    Object.assign(leaf('x', 'Alice', '2026-07-06', '2026-07-10'), { statusOverride: 'Cancelled' }),
    leaf('noPic', '', '2026-07-06', '2026-07-10'),
    leaf('noDates', 'Bob', null, null),
  ];
  const computed = computedFor(tasks);
  const parentTask = leaf('parent1', 'Carol', '2026-07-06', '2026-07-10');
  tasks.push(parentTask);
  computed.set('parent1', { isLeaf: false });
  const { cells, pics } = computeWorkload(project(tasks, {}, [], ['Zed']), computed);
  assert.equal(cells.get('Alice|2026-07-06').demand, 5);
  assert.deepEqual(pics, ['Alice', 'Bob', 'Carol', 'Zed']);
  assert.equal(cells.get('Carol|2026-07-06').demand, 0);
});

test('a project with no dated leaf tasks returns empty weeks', () => {
  const tasks = [leaf('noDates', 'Bob', null, null)];
  const { weeks } = computeWorkload(project(tasks), computedFor(tasks));
  assert.deepEqual(weeks, []);
});

test('taskIds lists the active tasks per cell', () => {
  const tasks = [
    leaf('t1', 'Alice', '2026-07-06', '2026-07-07'),
    leaf('t2', 'Alice', '2026-07-09', '2026-07-10'),
  ];
  const { cells } = computeWorkload(project(tasks), computedFor(tasks));
  assert.deepEqual(cells.get('Alice|2026-07-06').taskIds.sort(), ['t1', 't2']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/workload.test.js`
Expected: FAIL — `Cannot find module '../src/js/workload.js'`.

- [ ] **Step 3: Create `src/js/workload.js`**

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.PP);
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory(root.PP));
  }
})(globalThis, function (PP) {
  'use strict';

  const schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : PP;
  const { parseISO, toISO, isWeekend } = schedule;

  const DAY_MS = 86400000;

  function weekFteFor(picFte, picName, weekMondayISO) {
    if (!picFte || !picFte[picName]) return 1;
    const v = picFte[picName][weekMondayISO];
    if (v === undefined || v === null) return 1;
    const n = Number(v);
    if (!isFinite(n)) return 1;
    return n < 0 ? 0 : n;
  }

  function mondayOf(dateISO) {
    let ms = parseISO(dateISO);
    const dow = new Date(ms).getUTCDay();
    const back = dow === 0 ? 6 : dow - 1;
    return ms - back * DAY_MS;
  }

  function computeWorkload(project, computed) {
    const picFte = (project.settings && project.settings.picFte) || {};
    const holidaySet = new Set(project.holidays.map(h => h.date));

    const leaves = project.tasks.filter(t => {
      const c = computed.get(t.id);
      return c && c.isLeaf && t.statusOverride !== 'Cancelled';
    });
    const dated = leaves.filter(t => t.pic && t.plannedStart && t.plannedFinish);

    const picSet = new Set(project.picList || []);
    leaves.forEach(t => { if (t.pic) picSet.add(t.pic); });
    const pics = Array.from(picSet).sort();

    if (!dated.length) return { weeks: [], pics, cells: new Map() };

    let minStart = null;
    let maxFinish = null;
    dated.forEach(t => {
      if (minStart === null || t.plannedStart < minStart) minStart = t.plannedStart;
      if (maxFinish === null || t.plannedFinish > maxFinish) maxFinish = t.plannedFinish;
    });

    const weeks = [];
    const firstMonday = mondayOf(minStart);
    const endMs = parseISO(maxFinish);
    let index = 1;
    for (let ms = firstMonday; ms <= endMs; ms += 7 * DAY_MS) {
      weeks.push({ index: index++, mondayISO: toISO(ms) });
    }

    const cells = new Map();
    weeks.forEach(week => {
      const weekStartMs = parseISO(week.mondayISO);
      const workdayMs = [];
      for (let d = 0; d < 7; d++) {
        const ms = weekStartMs + d * DAY_MS;
        if (!isWeekend(ms) && !holidaySet.has(toISO(ms))) workdayMs.push(ms);
      }
      pics.forEach(pic => {
        const fte = weekFteFor(picFte, pic, week.mondayISO);
        let demand = 0;
        const taskIds = [];
        dated.forEach(t => {
          if (t.pic !== pic) return;
          const s = parseISO(t.plannedStart);
          const f = parseISO(t.plannedFinish);
          let active = 0;
          workdayMs.forEach(ms => { if (ms >= s && ms <= f) active++; });
          if (active > 0) {
            demand += active;
            taskIds.push(t.id);
          }
        });
        const available = workdayMs.length * fte;
        cells.set(pic + '|' + week.mondayISO, {
          demand,
          available,
          overloaded: demand > available,
          taskIds,
        });
      });
    });

    return { weeks, pics, cells };
  }

  return { weekFteFor, computeWorkload };
});
```

- [ ] **Step 4: Run tests; register in `build.py`; full suite**

Add `'js/workload.js'` to `build.py`'s `JS_ORDER` (engine group). Then:
```bash
cd "project-planner"
node --test tests/workload.test.js
python3 build.py
node --test
```
Expected: 10 new tests pass; build succeeds; full suite = 147 (137 + 10).

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/workload.js tests/workload.test.js build.py
git commit -m "Add workload.js: per-week FTE resolution and manday demand/capacity computation"
```

---

### Task 2: Tab markup, PIC-list relocation, CSS

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/settings.js`
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Produces: `#resources-view` container (PIC list section + `#capacity-grid` + `#workload-grid` + `#workload-drilldown`), the `.view-tab[data-view="resources"]` button, and the grid CSS classes Task 3 renders into. Settings no longer owns the PIC list (markup or wiring).

- [ ] **Step 1: Add the tab button in `index.html`**

In `#view-tabs`, after the Snapshots button and before Settings, add:
```html
    <button class="view-tab" data-view="resources">Resources</button>
```

- [ ] **Step 2: Add the view container and move the PIC list markup**

Delete this block from the Settings view:
```html
    <div class="settings-section">
      <h3>PIC List</h3>
      <div id="pic-list-editor"></div>
      <input id="new-pic-input" type="text" placeholder="Add PIC name">
      <button id="add-pic-button">Add</button>
    </div>
```
Insert a new view container after `#snapshots-view`'s closing `</div>` and before `#settings-view`:
```html
  <div id="resources-view" hidden>
    <div class="settings-section">
      <h3>PIC List</h3>
      <div id="pic-list-editor"></div>
      <input id="new-pic-input" type="text" placeholder="Add PIC name">
      <button id="add-pic-button">Add</button>
    </div>
    <div class="settings-section settings-section-wide">
      <h3>Capacity (FTE per week)</h3>
      <div id="capacity-grid" class="resource-grid-wrap"></div>
    </div>
    <div class="settings-section settings-section-wide">
      <h3>Workload (demand / available)</h3>
      <div id="workload-grid" class="resource-grid-wrap"></div>
      <div id="workload-drilldown"></div>
    </div>
  </div>
```

- [ ] **Step 3: Remove the PIC wiring and rendering from `settings.js`**

In `renderSettings`, delete the whole `var picEditor = ...` block (from `var picEditor = document.getElementById('pic-list-editor');` through the `picEditor.appendChild(row); });` close). In `wireSettings`, delete the two listeners on `#add-pic-button` and `#pic-list-editor`. (They move verbatim into `resources.js` in Task 3 — same ids, same logic.)

- [ ] **Step 4: Add view + grid CSS to `layout.css`**

Change the `#settings-view` sizing rule's sibling — add `#resources-view` alongside it. Change:
```css
#settings-view { flex: 1; overflow: auto; padding: 16px 24px; }
```
to:
```css
#settings-view, #resources-view { flex: 1; overflow: auto; padding: 16px 24px; }
```
Append grid styles after the settings-section rules:
```css
.resource-grid-wrap { overflow-x: auto; }
.resource-grid { border-collapse: collapse; font-size: 12px; }
.resource-grid th, .resource-grid td { padding: 4px 8px; border-bottom: 1px solid var(--border); text-align: right; white-space: nowrap; }
.resource-grid th { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); }
.resource-grid th:first-child, .resource-grid td:first-child { text-align: left; position: sticky; left: 0; background: var(--surface-alt); z-index: 1; }
.resource-grid .week-sub { display: block; font-size: 10px; color: var(--text-tertiary); text-transform: none; letter-spacing: 0; }
.resource-grid input[type="number"] { width: 56px; font-size: 12px; padding: 2px 4px; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: right; }
.workload-cell-over { background: rgba(255,59,48,0.12); color: var(--status-delayed); font-weight: 600; cursor: pointer; }
.workload-cell-full { background: rgba(255,204,0,0.18); cursor: pointer; }
.workload-cell-ok { cursor: pointer; }
[data-theme="dark"] .workload-cell-over { background: rgba(255,59,48,0.2); }
[data-theme="dark"] .workload-cell-full { background: rgba(255,204,0,0.24); }
#workload-drilldown { margin-top: 12px; font-size: 13px; }
```

- [ ] **Step 5: Build + suite + commit**

```bash
cd "project-planner"
node --check src/js/ui/settings.js
python3 build.py
node --test
git add src/index.html src/js/ui/settings.js src/css/layout.css
git commit -m "Add Resources view markup and grid styles; move PIC list out of Settings"
```
Expected: syntax clean; build succeeds; 147 tests pass. (The tab is still inert — `VIEW_IDS` and rendering land in Task 3; a click on it before then just blanks the view area, which is the exact gotcha Task 3 closes.)

---

### Task 3: `resources.js` UI + app wiring

**Files:**
- Create: `project-planner/src/js/ui/resources.js`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/build.py` (add `'js/ui/resources.js'`, ui group)

**Interfaces:**
- Consumes: `PP.computeWorkload`, `PP.weekFteFor` (Task 1), the Task 2 markup/ids, `state.calc.computed`, `state.project.settings.picFte`.
- Produces: `PP.renderResources(state)`, `PP.wireResources(state, onChanged)`; `'resources-view'` added to `VIEW_IDS`; `refresh()` renders it; `showApp()` wires it.

- [ ] **Step 1: Create `src/js/ui/resources.js`**

```js
(function () {
  'use strict';

  function fmtRatio(cell) {
    if (cell.demand === 0 && cell.available === 0) return '–';
    if (cell.available === 0) return cell.demand + '/0';
    return (cell.demand / cell.available).toFixed(1);
  }

  function cellClass(cell) {
    if (cell.demand === 0 && cell.available === 0) return '';
    if (cell.overloaded) return 'workload-cell-over';
    if (cell.demand === cell.available && cell.demand > 0) return 'workload-cell-full';
    return 'workload-cell-ok';
  }

  function buildHeaderRow(weeks) {
    const tr = document.createElement('tr');
    const first = document.createElement('th');
    first.textContent = 'PIC';
    tr.appendChild(first);
    weeks.forEach(function (w) {
      const th = document.createElement('th');
      th.textContent = 'W' + w.index;
      const sub = document.createElement('span');
      sub.className = 'week-sub';
      sub.textContent = w.mondayISO.slice(5);
      th.appendChild(sub);
      tr.appendChild(th);
    });
    return tr;
  }

  function renderPicList(state) {
    const picEditor = document.getElementById('pic-list-editor');
    picEditor.innerHTML = '';
    (state.project.picList || []).forEach(function (pic) {
      const row = document.createElement('div');
      row.className = 'pic-editor-row';
      const label = document.createElement('span');
      label.textContent = pic;
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'pic-remove-btn';
      removeBtn.dataset.pic = pic;
      row.appendChild(label);
      row.appendChild(removeBtn);
      picEditor.appendChild(row);
    });
  }

  function renderResources(state) {
    renderPicList(state);

    const wl = PP.computeWorkload(state.project, state.calc.computed);
    state.workload = wl;
    const picFte = (state.project.settings.picFte = state.project.settings.picFte || {});

    const capWrap = document.getElementById('capacity-grid');
    capWrap.innerHTML = '';
    const wlWrap = document.getElementById('workload-grid');
    wlWrap.innerHTML = '';

    if (!wl.weeks.length) {
      capWrap.textContent = 'No dated tasks yet — the weekly grids appear once tasks have planned dates.';
      wlWrap.textContent = '';
      return;
    }

    const capTable = document.createElement('table');
    capTable.className = 'resource-grid';
    capTable.appendChild(buildHeaderRow(wl.weeks));
    wl.pics.forEach(function (pic) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = pic;
      tr.appendChild(name);
      wl.weeks.forEach(function (w) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.min = '0';
        input.value = PP.weekFteFor(picFte, pic, w.mondayISO);
        input.dataset.pic = pic;
        input.dataset.week = w.mondayISO;
        td.appendChild(input);
        tr.appendChild(td);
      });
      capTable.appendChild(tr);
    });
    capWrap.appendChild(capTable);

    const wlTable = document.createElement('table');
    wlTable.className = 'resource-grid';
    wlTable.appendChild(buildHeaderRow(wl.weeks));
    wl.pics.forEach(function (pic) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = pic;
      tr.appendChild(name);
      wl.weeks.forEach(function (w) {
        const td = document.createElement('td');
        const cell = wl.cells.get(pic + '|' + w.mondayISO);
        td.textContent = fmtRatio(cell);
        const cls = cellClass(cell);
        if (cls) td.className = cls;
        td.dataset.pic = pic;
        td.dataset.week = w.mondayISO;
        tr.appendChild(td);
      });
      wlTable.appendChild(tr);
    });
    wlWrap.appendChild(wlTable);
  }

  function renderDrilldown(state, pic, weekISO) {
    const box = document.getElementById('workload-drilldown');
    box.innerHTML = '';
    const cell = state.workload.cells.get(pic + '|' + weekISO);
    if (!cell || !cell.taskIds.length) return;
    const title = document.createElement('div');
    title.textContent = pic + ' — week of ' + weekISO + ' (' + cell.demand + ' manday(s) / ' + cell.available + ' available)';
    box.appendChild(title);
    const byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    const ul = document.createElement('ul');
    cell.taskIds.forEach(function (id) {
      const t = byId.get(id);
      const c = state.calc.computed.get(id);
      const li = document.createElement('li');
      li.textContent = (c ? c.wbs + ' ' : '') + t.name + ' (' + t.plannedStart + ' → ' + t.plannedFinish + ')';
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function wireResources(state, onChanged) {
    document.getElementById('add-pic-button').addEventListener('click', function () {
      const input = document.getElementById('new-pic-input');
      const name = input.value.trim();
      if (!name) return;
      state.project.picList = state.project.picList || [];
      if (state.project.picList.indexOf(name) === -1) state.project.picList.push(name);
      input.value = '';
      onChanged();
    });

    document.getElementById('pic-list-editor').addEventListener('click', function (e) {
      const btn = e.target.closest('.pic-remove-btn');
      if (!btn) return;
      state.project.picList = state.project.picList.filter(function (p) { return p !== btn.dataset.pic; });
      if (state.project.settings.picFte) delete state.project.settings.picFte[btn.dataset.pic];
      onChanged();
    });

    document.getElementById('capacity-grid').addEventListener('change', function (e) {
      const input = e.target.closest('input[type="number"]');
      if (!input) return;
      const pic = input.dataset.pic;
      const week = input.dataset.week;
      let v = Number(input.value);
      if (!isFinite(v) || v < 0) v = 1;
      const picFte = (state.project.settings.picFte = state.project.settings.picFte || {});
      if (v === 1) {
        if (picFte[pic]) {
          delete picFte[pic][week];
          if (!Object.keys(picFte[pic]).length) delete picFte[pic];
        }
      } else {
        picFte[pic] = picFte[pic] || {};
        picFte[pic][week] = v;
      }
      onChanged();
    });

    document.getElementById('workload-grid').addEventListener('click', function (e) {
      const td = e.target.closest('td[data-pic]');
      if (!td) return;
      renderDrilldown(state, td.dataset.pic, td.dataset.week);
    });
  }

  window.PP = window.PP || {};
  window.PP.renderResources = renderResources;
  window.PP.wireResources = wireResources;
})();
```

- [ ] **Step 2: Wire into `app.js` (all three integration points)**

1. `VIEW_IDS`: change
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'settings-view', 'holidays-view', 'reports-view'];
```
to:
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'resources-view', 'settings-view', 'holidays-view', 'reports-view'];
```
2. In `refresh(state, markDirty)`, after `PP.renderSnapshots(state);`, add:
```js
    PP.renderResources(state);
```
3. In `showApp(state)`, after the `PP.wireSettings(...)` line, add:
```js
    PP.wireResources(state, function () { refresh(state, true); });
```

- [ ] **Step 3: Register, syntax-check, build, grep, suite**

Add `'js/ui/resources.js'` to `build.py`'s `JS_ORDER` (ui group, anywhere before `ui/app.js`). Then:
```bash
cd "project-planner"
node --check src/js/ui/resources.js
node --check src/js/ui/app.js
python3 build.py
grep -c "renderResources" dist/ProjectPlanner.html
node --test
```
Expected: syntax clean; grep ≥ 2; 147 tests pass.

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/js/ui/resources.js src/js/ui/app.js build.py
git commit -m "Add Resources view: relocated PIC list, per-week FTE capacity grid, workload grid with drill-down"
```

---

### Task 4: End-to-end browser verification (controller-run, not a fresh subagent)

**Files:** none (verification only).

- [ ] **Step 1: Build + seed** a project with 2-3 PICs, tasks engineering a known overload (e.g. Alice: two tasks fully overlapping one 5-workday week → demand 10 vs available 5 → `2.0` red) plus a holiday inside one week. Serve `dist/`.
- [ ] **Step 2: Tab renders** — click Resources: PIC list, capacity grid (all 1.0 defaults), workload grid all appear; **and Settings no longer shows the PIC list**. The VIEW_IDS check: every other tab still switches correctly too.
- [ ] **Step 3: Numbers match hand math** — verify the overloaded cell reads `2.0` with red tint (`getComputedStyle` background, not just class name), the holiday week's available drops accordingly, idle cells show `–`.
- [ ] **Step 4: Capacity editing** — set Alice's W2 FTE to 0.5: workload W2 ratio updates on refresh; W1/W3 unchanged (week-independence); setting back to 1 removes the override (confirm via Save → inspect JSON: no `picFte` key left for that week). Confirm the edit is undoable and round-trips through Save/Load.
- [ ] **Step 5: Drill-down** — click the overloaded cell: task list appears with correct WBS/names/dates.
- [ ] **Step 6: PIC add/remove from new home** — add a PIC (appears in capacity/workload grids and the Plan-tree PIC filter), remove one with an FTE override (its `picFte` entry disappears from saved JSON).
- [ ] **Step 7: Dark mode** — toggle: grids legible, tint backgrounds visible (computed-style check on over/full cells).
- [ ] **Step 8: Console sweep + suite** — only the benign favicon 404; `node --test` = 147 passing.
- [ ] **Step 9: Record result**; fix-in-owning-file + re-verify on any failure.

---

## Plan Complete

One Resources tab now owns people: the PIC list (out of Settings), week-by-week FTE capacity planning across W1…Wn, and a demand/available workload grid that flags overload for the user to fix — the app never moves a date on its own.
