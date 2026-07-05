# Plan View UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real screen of ProjectPlanner: a WBS tree grid with inline editing, collapse/expand, a right-click context menu, search/filters, a KPI header, and the self-saving download/localStorage-autosave cycle — all wired to the Foundation engines (`calc.js`, `store.js`, `snapshot.js` are untouched; `store.js` gets one small addition).

**Architecture:** Two new DOM-facing modules (`src/js/ui/tree.js`, `src/js/ui/app.js`) plus one new pure engine (`src/js/filters.js`, Node-testable like the Foundation engines) and a small addition to `store.js`. No framework, no virtual DOM: every state change does a full `recalc()` + full re-render of the visible rows (simplest correct approach; project sizes in scope are a few hundred to low thousands of rows, and a full rebuild of that many DOM nodes is fast in any modern browser — no diffing complexity needed). State lives in one plain object (`state`) owned by `app.js` and passed into `tree.js`'s render/wire functions; `tree.js` never reads `document` state app.js doesn't give it. `app.js`/`tree.js` cannot be unit-tested under Node (no DOM, and adding a DOM-testing library like jsdom would violate the zero-dependency constraint) — they are verified by loading the real built artifact in a real browser (Playwright) at the end of this plan, not per-task red/green.

**Tech Stack:** Vanilla ES5-compatible JavaScript (no build-time transpilation, so no arrow functions/`let`/`const`-in-loops assumptions beyond what plain browsers already support — matching the style already used in `src/js/store.js` etc.), CSS (KPMG palette), Playwright (dev-time-only browser verification, not shipped).

## Global Constraints

- Zero external dependencies, runtime or dev, for anything shipped in `dist/ProjectPlanner.html`. `src/js/filters.js` uses the same Node `node:test`-testable pure-function style as the Foundation engines. Playwright is used only for manual verification of this plan's final task — it is never referenced by shipped code or `build.py`.
- `src/js/filters.js` follows the same UMD wrapper as `src/js/schedule.js` (plain form: `module.exports` for Node, `Object.assign(root.PP, factory())` for browser) — it has no dependency on other engine files.
- `src/js/ui/tree.js` and `src/js/ui/app.js` are plain IIFEs (`(function () { ... })();`) that read/write `window.PP` directly — they are never `require`'d by tests, so they don't need the UMD wrapper; they run only in the browser.
- Dates are ISO `"YYYY-MM-DD"` strings everywhere — `<input type="date">`'s native value format already matches this exactly, so no conversion is needed at the DOM boundary.
- No code comments except where genuinely non-obvious.
- File paths are exact — every task states `Create:`/`Modify:` paths relative to `project-planner/`.
- This is a reusable planning tool for any project type/scale — nothing in this plan's code hardcodes phase names, task counts, or company names. The KPMG blue color values in `theme.css` are a deliberate, spec-mandated visual theme choice (not a data/content hardcode) and are fine.
- Every mutation to `project.tasks` must go through `store.js`'s `Project` methods (`addTask`/`updateTask`/`deleteTask`/`moveTask`/`indent`/`outdent`/`toggleCollapse`) — never mutate a task object directly from UI code, so undo/redo and the audit log stay correct.
- Locked interfaces from the already-shipped Foundation engines (do not redefine these — consume them exactly as they exist in `main`):
  - `PP.recalc(project)` → `{ computed: Map<id, TaskComputed>, order: id[], children: Map<parentId|null, id[]>, wbs: Map<id,string>, overall, kpis, scurve }` (`src/js/calc.js`)
  - `TaskComputed = { id, wbs, depth, isLeaf, plannedStart, plannedFinish, actualStart, actualFinish, duration, weight, plannedPctToDate, actualPct, status, isMilestone }`
  - `KpiSummary = { actualPct, plannedPct, variance, delayedCount, completeCount, totalCount, milestonesTotal, milestonesComplete, remainingWorkdays }`
  - `PP.Project` class (`src/js/store.js`): `constructor(data)`, `static empty(name)`, `static fromJSON(json)`, `toJSON()`, `serialize()`, `addTask({parentId,name,pic})`, `updateTask(id,patch,who)`, `deleteTask(id,who)`, `moveTask(id,newParentId,newOrder,who)`, `indent(id,who)`, `outdent(id,who)`, `undo()`, `redo()`
  - Task shape (raw, editable fields): `{ id, parentId, order, name, pic, deliverable, jira, remarks, plannedStart, plannedFinish, actualStart, actualFinish, actualPct, weightOverride, milestone, statusOverride, predecessors, collapsed }`
  - `build.py`'s `JS_ORDER`/`CSS_ORDER` lists control concatenation order and silently skip files that don't yet exist.

---

### Task 1: `store.js` — add `toggleCollapse`

Collapse/expand is view state stored on the task (`task.collapsed`, per the data model), but it is not a business edit — it must not push an undo checkpoint or write an audit-log entry (a user hitting "undo" after collapsing a row should not have that undo consumed by the collapse).

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 3's `tree.js`): `Project.prototype.toggleCollapse(id)` → flips `task.collapsed`, throws `Error` if `id` not found, does **not** call `_pushUndo()` or `_audit()`.

- [ ] **Step 1: Write the failing test**

Add to `project-planner/tests/store.test.js` (append at the end of the file, before the final closing — it's a flat list of `test(...)` calls, so just add after the last one):

```js
test('toggleCollapse flips collapsed without pushing an undo checkpoint or audit entry', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  const undoStackBefore = p._undoStack.length;
  const auditLengthBefore = p.auditLog.length;

  p.toggleCollapse(t.id);
  assert.equal(p.tasks.find(x => x.id === t.id).collapsed, true);
  assert.equal(p._undoStack.length, undoStackBefore);
  assert.equal(p.auditLog.length, auditLengthBefore);

  p.toggleCollapse(t.id);
  assert.equal(p.tasks.find(x => x.id === t.id).collapsed, false);
});

test('toggleCollapse throws for an unknown task id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.toggleCollapse('missing'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: FAIL — `p.toggleCollapse is not a function`

- [ ] **Step 3: Add the method**

In `project-planner/src/js/store.js`, inside the `Project` class, add this method (a good place is right after `outdent`, before the closing `}` of the class):

```js
    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: PASS (21 tests — 19 existing + 2 new)

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `cd "project-planner" && node --test`
Expected: PASS, 74 tests total (72 existing + 2 new)

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/js/store.js tests/store.test.js
git commit -m "Add Project.toggleCollapse for view-state-only collapse toggling"
```

---

### Task 2: `filters.js` — pure search/filter engine

**Files:**
- Create: `project-planner/src/js/filters.js`
- Modify: `project-planner/build.py` (extend `JS_ORDER`)
- Test: `project-planner/tests/filters.test.js`

**Interfaces:**
- Consumes: nothing (pure functions over plain data).
- Produces (used by Task 3's `tree.js`):
  - `taskMatches(task, computed, filters, currentUser)` → boolean. `task` needs `{ name, pic, remarks, jira }`; `computed` needs `{ status }`; `filters` is `{ search, pic, status, onlyDelayed, onlyMine }` (all optional/falsy-default); `currentUser` is a string or `null`.
  - `visibleIds(project, computedMap, order, filters, currentUser)` → `Set<id>`. `project` needs `{ tasks: Task[] }`; `computedMap` is the `Map<id,TaskComputed>` from `recalc()`; `order` is the `order` array from `recalc()`. Returns every id in `order` if no filter is active; otherwise returns the set of matching tasks (leaf or parent) unioned with every one of their ancestors, so the tree can show matches in context.

- [ ] **Step 1: Write the failing test**

Create `project-planner/tests/filters.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taskMatches, visibleIds } = require('../src/js/filters.js');

function task(id, parentId, name, pic, remarks, jira) {
  return { id, parentId, name, pic: pic || '', remarks: remarks || '', jira: jira || '' };
}

test('taskMatches: search matches name case-insensitively', () => {
  const t = task('t1', null, 'Review As-Is Document', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'as-is' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'nomatch' }, null), false);
});

test('taskMatches: search also matches remarks and jira', () => {
  const t = task('t1', null, 'Task', 'Alice', 'blocked on vendor', 'SFDC-42');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'vendor' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'sfdc-42' }, null), true);
});

test('taskMatches: pic filter is an exact match', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { pic: 'Alice' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { pic: 'Bob' }, null), false);
});

test('taskMatches: status filter is an exact match against computed status', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { status: 'Delayed' }, null), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { status: 'Delayed' }, null), false);
});

test('taskMatches: onlyDelayed requires Delayed status', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { onlyDelayed: true }, null), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { onlyDelayed: true }, null), false);
});

test('taskMatches: onlyMine requires pic === currentUser', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyMine: true }, 'Alice'), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyMine: true }, 'Bob'), false);
});

test('taskMatches: filters compose with AND', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { pic: 'Alice', onlyDelayed: true }, null), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { pic: 'Alice', onlyDelayed: true }, null), false);
});

test('visibleIds: no active filters returns every id in order', () => {
  const project = { tasks: [task('t1', null, 'A'), task('t2', 't1', 'B')] };
  const computedMap = new Map([['t1', { status: 'In Progress' }], ['t2', { status: 'In Progress' }]]);
  const result = visibleIds(project, computedMap, ['t1', 't2'], {}, null);
  assert.deepEqual([...result].sort(), ['t1', 't2']);
});

test('visibleIds: a matching leaf pulls in its full ancestor chain but not unrelated siblings', () => {
  const project = {
    tasks: [
      task('phase', null, 'Phase'),
      task('leaf', 'phase', 'Target Task', 'Alice'),
      task('other', 'phase', 'Other Task', 'Bob'),
    ],
  };
  const computedMap = new Map([
    ['phase', { status: 'In Progress' }],
    ['leaf', { status: 'In Progress' }],
    ['other', { status: 'In Progress' }],
  ]);
  const result = visibleIds(project, computedMap, ['phase', 'leaf', 'other'], { search: 'target' }, null);
  assert.deepEqual([...result].sort(), ['leaf', 'phase']);
});

test('visibleIds: a matching parent is visible even if no child matches', () => {
  const project = {
    tasks: [
      task('phase', null, 'Special Phase'),
      task('leaf', 'phase', 'Ordinary Task', 'Alice'),
    ],
  };
  const computedMap = new Map([
    ['phase', { status: 'In Progress' }],
    ['leaf', { status: 'In Progress' }],
  ]);
  const result = visibleIds(project, computedMap, ['phase', 'leaf'], { search: 'special' }, null);
  assert.deepEqual([...result].sort(), ['phase']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/filters.test.js`
Expected: FAIL — `Cannot find module '../src/js/filters.js'`

- [ ] **Step 3: Write `filters.js`**

Create `project-planner/src/js/filters.js`:

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

  function taskMatches(task, computed, filters, currentUser) {
    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
      const haystack = `${task.name} ${task.remarks} ${task.jira}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.pic && task.pic !== filters.pic) return false;
    if (filters.status && computed.status !== filters.status) return false;
    if (filters.onlyDelayed && computed.status !== 'Delayed') return false;
    if (filters.onlyMine && task.pic !== currentUser) return false;
    return true;
  }

  function visibleIds(project, computedMap, order, filters, currentUser) {
    const hasActiveFilter = !!(filters.search || filters.pic || filters.status || filters.onlyDelayed || filters.onlyMine);
    if (!hasActiveFilter) return new Set(order);

    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const matched = new Set();
    for (const id of order) {
      const task = byId.get(id);
      const computed = computedMap.get(id);
      if (taskMatches(task, computed, filters, currentUser)) matched.add(id);
    }

    const visible = new Set();
    for (const id of matched) {
      let cur = id;
      while (cur != null && !visible.has(cur)) {
        visible.add(cur);
        const t = byId.get(cur);
        cur = t ? t.parentId : null;
      }
    }
    return visible;
  }

  return { taskMatches, visibleIds };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/filters.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Extend `build.py`'s `JS_ORDER` for the upcoming UI files**

Modify `project-planner/build.py` — change:

```python
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
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
    "ui/app.js",
]
```

`build.py` already skips any listed file that doesn't exist yet (`if (SRC / "js" / name).exists()`), so listing `ui/tree.js`/`ui/app.js` now — before Tasks 3–4 create them — is safe and keeps the build green throughout this plan.

- [ ] **Step 6: Confirm the build still succeeds**

Run: `cd "project-planner" && python3 build.py`
Expected: `Built .../dist/ProjectPlanner.html` with no errors (the two not-yet-created UI files are silently skipped).

- [ ] **Step 7: Run the full suite**

Run: `cd "project-planner" && node --test`
Expected: PASS, 84 tests total (74 from Task 1 + 10 new)

- [ ] **Step 8: Commit**

```bash
cd "project-planner"
git add src/js/filters.js tests/filters.test.js build.py
git commit -m "Add filters engine and extend build.py for upcoming UI files"
```

---

### Task 3: `src/js/ui/tree.js` — tree grid rendering, collapse, inline edit, context menu

This task and Task 4 are DOM-manipulating browser code with no unit-test framework available (adding `jsdom` would violate the zero-dependency constraint). Each step's "test" is a syntax/build check; real behavioral verification happens once, at Task 5, against the actual built artifact in a real browser.

**Files:**
- Create: `project-planner/src/js/ui/tree.js`

**Interfaces:**
- Consumes:
  - `PP.visibleIds` from `src/js/filters.js` (Task 2)
  - `state.project` (a `PP.Project` instance), `state.calc` (the object returned by `PP.recalc(state.project)`), `state.currentUser` (string), `state.filters` (the filter object Task 2's `visibleIds` expects) — all provided by `app.js` in Task 4. This task defines the shape it needs from `state`; Task 4 is responsible for keeping `state` populated with exactly these fields before calling into this file.
- Produces (used by Task 4's `app.js`):
  - `PP.renderTree(state)` → rebuilds `#tree-body`'s contents from `state.project`/`state.calc`/`state.filters`. Safe to call any time after `state.calc` has been set.
  - `PP.wireTree(state, onChanged)` → attaches all row-level event listeners (collapse toggle, inline edit, context menu) to `#tree-body` and `#context-menu`, once. `onChanged` is a zero-argument callback this file calls after any mutation that changed `state.project` (collapse toggle, a committed inline edit, or a context-menu action) — Task 4's `app.js` supplies an `onChanged` that recalculates and re-renders everything, including the header.

- [ ] **Step 1: Write `tree.js`**

Create `project-planner/src/js/ui/tree.js`:

```js
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtPct(x) {
    return Math.round(x * 100) + '%';
  }

  function renderTree(state) {
    var body = document.getElementById('tree-body');
    body.innerHTML = '';
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var children = state.calc.children;
    var visible = PP.visibleIds(state.project, state.calc.computed, state.calc.order, state.filters, state.currentUser);

    state.calc.order.forEach(function (id) {
      if (!visible.has(id)) return;
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
        '<span class="cell col-start" data-field="plannedStart">' + (task.plannedStart || '') + '</span>' +
        '<span class="cell col-finish" data-field="plannedFinish">' + (task.plannedFinish || '') + '</span>' +
        '<span class="col-duration">' + computed.duration + '</span>' +
        '<span class="col-weight">' + fmtPct(computed.weight) + '</span>' +
        '<span class="col-plan">' + fmtPct(computed.plannedPctToDate) + '</span>' +
        '<span class="cell col-actual" data-field="actualPct">' + fmtPct(computed.actualPct) + '</span>' +
        '<span class="col-status status-' + computed.status.replace(/\s+/g, '') + '">' + computed.status + '</span>';
      body.appendChild(row);
    });
  }

  function buildPatch(field, value) {
    var patch = {};
    patch[field] = value;
    return patch;
  }

  function beginEdit(state, cell, id, field, onCommitted) {
    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var raw = task[field];
    var input = document.createElement('input');
    input.className = 'cell-editor';

    if (field === 'plannedStart' || field === 'plannedFinish') {
      input.type = 'date';
      input.value = raw || '';
    } else if (field === 'actualPct') {
      input.type = 'number';
      input.min = '0';
      input.max = '100';
      input.value = Math.round((raw || 0) * 100);
    } else {
      input.type = 'text';
      input.value = raw || '';
    }

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    var settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      var value = input.value;
      if (field === 'actualPct') {
        value = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
      }
      state.project.updateTask(id, buildPatch(field, value), state.currentUser);
      onCommitted();
    }

    function cancel() {
      if (settled) return;
      settled = true;
      renderTree(state);
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
  }

  function showContextMenu(state, id, x, y, onChanged) {
    var menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.hidden = false;

    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var actions = [
      ['New Task', function () { state.project.addTask({ parentId: task.parentId, name: 'New Task' }); }],
      ['New Child', function () { state.project.addTask({ parentId: id, name: 'New Task' }); }],
      ['Duplicate', function () {
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          deliverable: task.deliverable, remarks: task.remarks,
        }, state.currentUser);
      }],
      ['Delete', function () { state.project.deleteTask(id, state.currentUser); }],
      ['Indent', function () { state.project.indent(id, state.currentUser); }],
      ['Outdent', function () { state.project.outdent(id, state.currentUser); }],
      ['Toggle Milestone', function () { state.project.updateTask(id, { milestone: !task.milestone }, state.currentUser); }],
    ];

    actions.forEach(function (a) {
      var item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = a[0];
      item.addEventListener('click', function () {
        a[1]();
        menu.hidden = true;
        onChanged();
      });
      menu.appendChild(item);
    });
  }

  function wireTree(state, onChanged) {
    var body = document.getElementById('tree-body');

    body.addEventListener('click', function (e) {
      var toggle = e.target.closest('.toggle');
      if (!toggle || !toggle.textContent) return;
      var row = e.target.closest('.tree-row');
      state.project.toggleCollapse(row.dataset.id);
      onChanged();
    });

    body.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var row = e.target.closest('.tree-row');
      beginEdit(state, cell, row.dataset.id, cell.dataset.field, onChanged);
    });

    body.addEventListener('contextmenu', function (e) {
      var row = e.target.closest('.tree-row');
      if (!row) return;
      e.preventDefault();
      showContextMenu(state, row.dataset.id, e.clientX, e.clientY, onChanged);
    });

    document.addEventListener('click', function (e) {
      var menu = document.getElementById('context-menu');
      if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('.tree-row')) menu.hidden = true;
    });
  }

  window.PP = window.PP || {};
  window.PP.renderTree = renderTree;
  window.PP.wireTree = wireTree;
})();
```

- [ ] **Step 2: Syntax-check the file**

Run: `cd "project-planner" && node --check src/js/ui/tree.js`
Expected: no output, exit code 0 (Node's `--check` parses the file without executing it — this catches typos/syntax errors only, since the file uses `window`/`document`, which don't exist under plain Node).

- [ ] **Step 3: Confirm the build still succeeds and inlines this file**

Run: `cd "project-planner" && python3 build.py && grep -c "function renderTree" dist/ProjectPlanner.html`
Expected: build succeeds; grep prints `1` (the function appears exactly once in the built file).

- [ ] **Step 4: Run the full suite (this task adds no Node tests, but confirms nothing regressed)**

Run: `cd "project-planner" && node --test`
Expected: PASS, 84 tests (unchanged from Task 2 — this task is DOM-only)

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/ui/tree.js
git commit -m "Add tree grid rendering, collapse, inline edit, and context menu"
```

---

### Task 4: Shell, theme, and `app.js` — boot, header/KPIs, toolbar, save/load cycle

**Files:**
- Modify: `project-planner/src/index.html`
- Create: `project-planner/src/css/theme.css`
- Create: `project-planner/src/css/layout.css`
- Create: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.Project` (`store.js`), `PP.recalc` (`calc.js`), `PP.renderTree`/`PP.wireTree` (Task 3's `tree.js`).
- Produces: the `state` object shape every future UI task must use: `{ project: PP.Project, calc: <recalc() result>, currentUser: string|null, dirty: boolean, filters: { search, pic, status, onlyDelayed, onlyMine } }`. Boots the app on `DOMContentLoaded`, no exports needed by later tasks in this plan.

- [ ] **Step 1: Replace `src/index.html`**

Replace the full contents of `project-planner/src/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ProjectPlanner</title>
<style>
/*__CSS__*/
</style>
</head>
<body>
<div id="name-picker" class="overlay" hidden>
  <div class="overlay-card">
    <h2>Who's working on this?</h2>
    <input id="name-picker-input" type="text" placeholder="Your name" autocomplete="off">
    <button id="name-picker-submit">Continue</button>
  </div>
</div>

<div id="app" hidden>
  <header id="app-header">
    <div id="header-top">
      <span id="project-name"></span>
      <label>Status date <input type="date" id="status-date-input"></label>
      <button id="save-button">Save</button>
      <span id="dirty-indicator"></span>
    </div>
    <div id="kpi-row"></div>
  </header>
  <div id="toolbar">
    <input id="search-input" type="text" placeholder="Search tasks...">
    <select id="pic-filter"><option value="">All PICs</option></select>
    <select id="status-filter">
      <option value="">All statuses</option>
      <option>Not Start</option>
      <option>In Progress</option>
      <option>Delayed</option>
      <option>Complete</option>
      <option>Blocked</option>
      <option>Cancelled</option>
    </select>
    <label><input type="checkbox" id="only-delayed-filter"> Only delayed</label>
    <label><input type="checkbox" id="only-mine-filter"> Only mine</label>
  </div>
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

<div id="context-menu" class="context-menu" hidden></div>

<script type="application/json" id="project-data">{"meta":{"id":"seed","name":"New Project","statusDate":"2026-01-01","revision":0,"savedBy":null,"savedAt":null,"createdAt":"2026-01-01T00:00:00.000Z"},"tasks":[],"holidays":[],"picList":[],"snapshots":[],"auditLog":[],"settings":{"theme":"kpmg-light","ganttZoom":"week"}}</script>
<script>
/*__JS__*/
</script>
</body>
</html>
```

- [ ] **Step 2: Create `theme.css`**

Create `project-planner/src/css/theme.css`:

```css
:root {
  --kpmg-blue: #00338D;
  --kpmg-blue-mid: #005EB8;
  --kpmg-blue-light: #0091DA;
  --surface: #ffffff;
  --surface-alt: #f5f6f7;
  --text: #1a1a1a;
  --text-muted: #5b6470;
  --border: #e1e4e8;
  --status-not-start: #9aa5b1;
  --status-in-progress: #0091DA;
  --status-delayed: #d64545;
  --status-complete: #1a8f5e;
  --status-blocked: #d64545;
  --status-cancelled: #9aa5b1;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
}

[data-theme="dark"] {
  --surface: #1c1e22;
  --surface-alt: #26292e;
  --text: #e7e9ec;
  --text-muted: #9aa5b1;
  --border: #33373d;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font);
  color: var(--text);
  background: var(--surface);
}
```

- [ ] **Step 3: Create `layout.css`**

Create `project-planner/src/css/layout.css`:

```css
#app { display: flex; flex-direction: column; height: 100vh; }

#app-header { border-bottom: 1px solid var(--border); padding: 12px 20px; }

#header-top { display: flex; align-items: center; gap: 16px; }

#project-name { font-weight: 600; font-size: 16px; color: var(--kpmg-blue); flex: 1; }

#save-button {
  background: var(--kpmg-blue);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
#save-button:hover { background: var(--kpmg-blue-mid); }

#dirty-indicator { color: var(--status-delayed); font-size: 12px; }

#kpi-row { display: flex; gap: 12px; margin-top: 12px; }

.kpi-card { background: var(--surface-alt); border-radius: 6px; padding: 8px 14px; min-width: 90px; }
.kpi-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; }
.kpi-value { font-size: 18px; font-weight: 600; color: var(--text); }

#toolbar { display: flex; gap: 10px; padding: 8px 20px; border-bottom: 1px solid var(--border); align-items: center; }
#toolbar input[type="text"], #toolbar select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; }

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

.toggle { cursor: pointer; display: inline-block; width: 14px; color: var(--text-muted); }
.cell { cursor: text; }
.cell-editor { width: 100%; font-size: 13px; padding: 2px 4px; }

.status-NotStart { color: var(--status-not-start); }
.status-InProgress { color: var(--status-in-progress); }
.status-Delayed { color: var(--status-delayed); font-weight: 600; }
.status-Complete { color: var(--status-complete); }
.status-Blocked { color: var(--status-blocked); font-weight: 600; }
.status-Cancelled { color: var(--status-cancelled); text-decoration: line-through; }

#tree-body { flex: 1; overflow-y: auto; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.overlay-card { background: var(--surface); padding: 24px; border-radius: 8px; min-width: 280px; }
.overlay-card h2 { margin-top: 0; font-size: 16px; }
.overlay-card input { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 4px; }
.overlay-card button { background: var(--kpmg-blue); color: #fff; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer; }

.context-menu {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 140px;
  z-index: 1000;
  padding: 4px 0;
}
.context-menu-item { padding: 6px 14px; font-size: 13px; cursor: pointer; }
.context-menu-item:hover { background: var(--surface-alt); }
```

- [ ] **Step 4: Create `app.js`**

Create `project-planner/src/js/ui/app.js`:

```js
(function () {
  'use strict';

  var STORAGE_PREFIX = 'pp:';

  function storageKey(projectId) {
    return STORAGE_PREFIX + projectId;
  }

  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
    PP.renderTree(state);
    if (markDirty) {
      state.dirty = true;
      document.getElementById('dirty-indicator').textContent = '● unsaved changes';
    }
    localStorage.setItem(storageKey(state.project.meta.id), JSON.stringify(state.project.toJSON()));
  }

  function renderHeader(state) {
    document.getElementById('project-name').textContent = state.project.meta.name;
    var dateInput = document.getElementById('status-date-input');
    if (document.activeElement !== dateInput) dateInput.value = state.project.meta.statusDate;

    var kpis = state.calc.kpis;
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var cards = [
      ['Actual', pct(kpis.actualPct)],
      ['Plan', pct(kpis.plannedPct)],
      ['Variance', pct(kpis.variance)],
      ['Delayed', String(kpis.delayedCount)],
      ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Milestones', kpis.milestonesComplete + '/' + kpis.milestonesTotal],
      ['Remaining days', String(kpis.remainingWorkdays)],
    ];
    var row = document.getElementById('kpi-row');
    row.innerHTML = '';
    cards.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'kpi-card';
      card.innerHTML = '<div class="kpi-label">' + c[0] + '</div><div class="kpi-value">' + c[1] + '</div>';
      row.appendChild(card);
    });
  }

  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
  }

  function wireToolbar(state) {
    function onFilterChange() {
      PP.renderTree(state);
    }
    document.getElementById('search-input').addEventListener('input', function (e) {
      state.filters.search = e.target.value;
      onFilterChange();
    });
    document.getElementById('status-filter').addEventListener('change', function (e) {
      state.filters.status = e.target.value;
      onFilterChange();
    });
    document.getElementById('only-delayed-filter').addEventListener('change', function (e) {
      state.filters.onlyDelayed = e.target.checked;
      onFilterChange();
    });
    document.getElementById('only-mine-filter').addEventListener('change', function (e) {
      state.filters.onlyMine = e.target.checked;
      onFilterChange();
    });
    document.getElementById('pic-filter').addEventListener('change', function (e) {
      state.filters.pic = e.target.value;
      onFilterChange();
    });
  }

  function handleSave(state) {
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();

    var clone = document.documentElement.cloneNode(true);
    var dataScript = clone.querySelector('#project-data');
    dataScript.textContent = json;
    var html = '<!doctype html>\n' + clone.outerHTML;

    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ProjectPlanner.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.dirty = false;
    document.getElementById('dirty-indicator').textContent = '';
    localStorage.setItem(storageKey(state.project.meta.id), json);
  }

  function showApp(state) {
    document.getElementById('name-picker').hidden = true;
    document.getElementById('app').hidden = false;
    refresh(state, false);
    wireHeader(state);
    wireToolbar(state);
    PP.wireTree(state, function () { refresh(state, true); });
    window.addEventListener('beforeunload', function (e) {
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function showNamePicker(state) {
    var overlay = document.getElementById('name-picker');
    var input = document.getElementById('name-picker-input');
    var button = document.getElementById('name-picker-submit');
    overlay.hidden = false;

    function submit() {
      var name = input.value.trim();
      if (!name) return;
      localStorage.setItem('pp:currentUser', name);
      state.currentUser = name;
      showApp(state);
    }

    button.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submit();
    });
  }

  function boot() {
    var embedded = JSON.parse(document.getElementById('project-data').textContent);
    var project = new PP.Project(embedded);

    var stored = localStorage.getItem(storageKey(project.meta.id));
    if (stored) {
      var storedData = JSON.parse(stored);
      if (storedData.meta.revision > project.meta.revision) {
        var restore = window.confirm(
          'Unsaved local changes found (local revision ' + storedData.meta.revision +
          ' vs opened file revision ' + project.meta.revision + '). Restore them?'
        );
        if (restore) project = new PP.Project(storedData);
      }
    }

    var state = {
      project: project,
      currentUser: localStorage.getItem('pp:currentUser'),
      dirty: false,
      calc: null,
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
    };

    if (state.currentUser) {
      showApp(state);
    } else {
      showNamePicker(state);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
```

- [ ] **Step 5: Syntax-check all new/modified JS**

Run: `cd "project-planner" && node --check src/js/ui/app.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Build and sanity-check the artifact**

Run:
```bash
cd "project-planner" && python3 build.py
grep -c "function boot" dist/ProjectPlanner.html
grep -c "kpmg-blue" dist/ProjectPlanner.html
```
Expected: build succeeds; both `grep -c` calls print a number ≥ 1 (confirms `app.js` and `theme.css` were actually inlined, not silently skipped due to a path typo).

- [ ] **Step 7: Run the full suite (still no new Node tests — DOM-only task)**

Run: `cd "project-planner" && node --test`
Expected: PASS, 84 tests (unchanged from Task 2)

- [ ] **Step 8: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/theme.css src/css/layout.css src/js/ui/app.js
git commit -m "Add app shell, KPMG theme, and boot/header/toolbar/save-load wiring"
```

---

### Task 5: End-to-end browser verification (controller-run, not a fresh subagent)

This task is **not** dispatched to a fresh implementer subagent. The controller (you, running this plan) executes it directly using the Playwright browser tools already available in this session, because it requires interactively driving a real browser against the freshly built artifact — the exact thing Tasks 3–4 could not verify on their own.

**Files:** none (verification only).

- [ ] **Step 1: Build the artifact**

Run: `cd "project-planner" && python3 build.py`

- [ ] **Step 2: Open it in a real browser and drive it**

Using the Playwright browser tools, navigate to the built file (`file://` path to `project-planner/dist/ProjectPlanner.html`) and verify, in order:
1. The name picker overlay appears; typing a name and clicking Continue reveals the app and hides the overlay.
2. The KPI row renders all seven cards with `0%`/`0`/`0/0` values (empty project).
3. Right-click in the empty tree body area is a no-op (no row to right-click yet) — instead, use the browser console (`page.evaluate`) to call `PP` functions directly if there's no visible row to right-click on an empty project: run `document.dispatchEvent` isn't necessary — simpler: verify the toolbar and header render with no console errors on an empty project first.
4. Take a snapshot/screenshot at this point.

- [ ] **Step 3: Add tasks and verify tree/KPI/rollup behavior live**

Via the browser console (`page.evaluate` with access to the page's `PP`/global `state` is not exposed by design — instead drive it through real UI actions): since there is no "add root task" button in this plan's UI (context menu requires right-clicking an *existing* row), use `page.evaluate` to call the boot-created `project` indirectly is not possible from outside — instead, verify by directly editing the embedded seed JSON before loading: create a temporary test HTML by running `python3 build.py`, then use `page.evaluate(() => { ... })` to invoke `PP.Project`, `PP.recalc`, add a couple of tasks via `new PP.Project(...)`-level calls is not representative of real usage.

Practical approach: since a brand-new project has zero tasks and this plan's UI has no explicit "add root-level task" button, do this verification against a project that already has tasks — before opening the browser, temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, not source) to include 3-4 tasks (a parent with two children, matching the `Task` shape from the Global Constraints section) with varying `plannedStart`/`plannedFinish`/`actualPct` so the KPI header, rollups, and status colors are all exercised. Reload the page pointing at this edited file and verify:
- The parent row shows a collapse arrow; clicking it hides/shows its children and the arrow glyph flips.
- Double-clicking a task's name cell turns it into a text input; typing and pressing Enter commits the new name and the row re-renders with it (not reverting).
- Double-clicking a task's `% Actual` cell, entering `50`, and pressing Enter updates that row's status/percentage and the parent/overall KPI row changes accordingly (proving `recalc()` is being re-run and re-rendered).
- Pressing Escape while editing a cell reverts to the original value (no `updateTask` call took effect) — verify by re-opening the same cell and confirming the value shown is unchanged.
- Right-clicking a row shows the context menu with all 7 actions; clicking "New Child" adds a row nested one level deeper under that task; clicking "Delete" on a task with children removes the whole subtree.
- Typing into the search box hides non-matching rows while keeping ancestors of matches visible; clearing the search restores the full list.
- Checking "Only delayed" filters to delayed tasks only (requires a task with `plannedFinish` in the past and `actualPct < 1` in the seed data used above).

- [ ] **Step 4: Verify the save/download cycle**

Click the Save button; confirm the browser triggers a file download named `ProjectPlanner.html` (Playwright's download event) rather than throwing a console error. Confirm the "unsaved changes" indicator (`#dirty-indicator`) was showing before Save and is cleared immediately after.

- [ ] **Step 5: Check for console errors throughout**

Confirm no uncaught JS errors were logged to the browser console during any of the above interactions (check via the browser tools' console-message capability).

- [ ] **Step 6: Record the result**

If every check in Steps 2–5 passes, this plan is complete — no commit needed for this task (verification only, no file changes). If any check fails, that is a real bug in Task 3 or Task 4's code: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from Step 2 before considering the plan done.

---

## Plan Complete

At the end of this plan: `ProjectPlanner.html` has a real, KPMG-styled, working Plan view — WBS tree with collapse/expand, inline editing of every editable field, a right-click context menu covering all the CRUD/reorder operations `store.js` already supports, search and four filter controls, a live KPI header, and the self-saving download + localStorage-autosave/restore cycle described in the spec (§3.3). The next plan (Gantt: SVG timeline, zoom, drag/resize, dependencies) builds on this same `state` object and the `PP.renderTree`/`PP.wireTree` pattern established here.

**Known deferred scope:** the spec's full filter list is "PIC, phase, status, date range, only delayed, only mine" (§6.2); this plan implements PIC/status/onlyDelayed/onlyMine only. Phase and date-range filters are deferred to the Reports & polish phase (§11 item 5), since `search` already surfaces phase names today and the gap doesn't block any other feature in this plan.
