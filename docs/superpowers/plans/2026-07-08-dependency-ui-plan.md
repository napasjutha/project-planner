# Dependency UI + Critical Path (V2 Sub-Project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A predecessor picklist in the Plan tree (new 18th column, searchable multi-select popover, cycle-safe) and a planned-dates-based critical-path tiering (Critical/Near-Critical/Watch/Healthy) rendered as Gantt bar outlines and red critical arrows.

**Architecture:** One new pure engine (`src/js/criticalpath.js` — float per leaf from actual planned dates, tier classification, critical-edge set), one new UI module (`src/js/ui/predecessor-picker.js` — popover, reusing the context-menu positioning pattern), a new Plan-tree column in `tree.js`/`layout.css`/`index.html`, and tier-driven stroke logic in `gantt.js`. Final task is controller-run browser verification.

**Tech Stack:** Vanilla JS, SVG attributes, `node:test`. No new dependencies.

## Global Constraints

- Zero external dependencies; no code comments except where genuinely non-obvious.
- Critical path is computed from the **actual planned dates** (user-as-scheduler), never a hypothetical earliest-start CPM. Locked float formula, successor edges: `float = networkdays(task.plannedFinish, successor.plannedStart, holidayDates) - 2`, clamped ≥ 0. Confirmed fencepost: predecessor finishes Monday, successor starts the very next workday (Tuesday) → float **0**.
- Task float = **minimum** across its successor edges. Tasks with no successors: `float = networkdays(task.plannedFinish, overall.plannedFinish, holidayDates) - 1`, clamped ≥ 0.
- Tiers: `critical` = 0, `near-critical` = 1–2, `watch` = 3–5, `healthy` = >5 workdays float. Tier name strings are defined once in `criticalpath.js` and consumed by name elsewhere.
- Leaf tasks only; cancelled excluded; parents never participate.
- The picker never offers a candidate that would create a cycle (`PP.wouldCreateCycle`) — excluded from the list entirely, and the task itself is likewise never a candidate for itself.
- Closing the picker commits only if the selection actually changed (no spurious undo checkpoints/audit entries).
- Gantt: bar `stroke` per tier — critical → `var(--status-delayed)` width 2, near-critical → `var(--tier-near-critical)` width 2, watch → `var(--tier-watch)` width 2, healthy → unchanged (`var(--kpmg-blue)` width 1). Zero-float **edges** (from `criticalEdges`) draw their arrow path/head in `var(--status-delayed)` width 2; other arrows unchanged.
- New tokens in `theme.css`: `--tier-near-critical: #ff9500`, `--tier-watch: #ffcc00` (theme-invariant, defined in `:root` only, like the status colors).
- Engines Node-tested (TDD); UI verified in the final controller-run browser task. Bare `node --test` only. Build: `python3 build.py`; new JS files must be registered in `build.py`'s `JS_ORDER` (`js/criticalpath.js` with the engines, `js/ui/predecessor-picker.js` with the ui files, before `ui/tree.js` so `PP.openPredecessorPicker` exists when `tree.js` wires it — order within the bundle only matters at call time, but keep it tidy).
- Suite count entering this plan: 129 (if the CSV Import plan ran first; if not, adjust expected totals by the delta — the assertions below assume 129).

---

### Task 1: `criticalpath.js` engine

**Files:**
- Create: `project-planner/src/js/criticalpath.js`
- Create: `project-planner/tests/criticalpath.test.js`
- Modify: `project-planner/build.py` (add `'js/criticalpath.js'` to `JS_ORDER`, engine group)

**Interfaces:**
- Consumes: `networkdays` from `schedule.js` (same UMD-lite require/global pattern `deps.js` already uses).
- Produces: `computeCriticalPath(tasks, computed, overall, holidayDates) -> { taskFloat: Map<taskId, {float, tier}>, criticalEdges: Set<'predId->succId'> }` plus `TIERS = { CRITICAL: 'critical', NEAR_CRITICAL: 'near-critical', WATCH: 'watch', HEALTHY: 'healthy' }`.

- [ ] **Step 1: Write the failing tests**

Create `project-planner/tests/criticalpath.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCriticalPath, TIERS } = require('../src/js/criticalpath.js');

function leaf(id, plannedStart, plannedFinish, predecessors) {
  return {
    id, parentId: null, order: 0, name: id, pic: '',
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, milestone: false,
    statusOverride: null, predecessors: predecessors || [], collapsed: false,
  };
}

function computedFor(tasks) {
  const m = new Map();
  tasks.forEach(t => m.set(t.id, {
    isLeaf: true, plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
  }));
  return m;
}

// 2026-07-06 is a Monday. No holidays unless stated.

test('back-to-back successor gives float 0 (the locked fencepost)', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),          // finishes Mon
    leaf('b', '2026-07-07', '2026-07-10', ['a']),   // starts Tue, very next workday
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-10' }, []);
  assert.equal(taskFloat.get('a').float, 0);
  assert.equal(taskFloat.get('a').tier, TIERS.CRITICAL);
});

test('one idle workday between finish and successor start gives float 1', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),          // finishes Mon
    leaf('b', '2026-07-08', '2026-07-10', ['a']),   // starts Wed; Tue idle
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-10' }, []);
  assert.equal(taskFloat.get('a').float, 1);
  assert.equal(taskFloat.get('a').tier, TIERS.NEAR_CRITICAL);
});

test('a weekend between finish and successor start adds no float', () => {
  const tasks = [
    leaf('a', '2026-07-06', '2026-07-10'),          // finishes Fri
    leaf('b', '2026-07-13', '2026-07-17', ['a']),   // starts Mon
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-17' }, []);
  assert.equal(taskFloat.get('a').float, 0);
});

test('a holiday in the gap does not count as float', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    leaf('b', '2026-07-08', '2026-07-10', ['a']),   // Tue 07-07 is a holiday
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-10' }, ['2026-07-07']);
  assert.equal(taskFloat.get('a').float, 0);
});

test('multi-successor task takes the minimum edge float, and only zero-float edges are critical', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    leaf('b', '2026-07-07', '2026-07-10', ['a']),   // tight edge: float 0
    leaf('c', '2026-07-20', '2026-07-24', ['a']),   // slack edge
  ];
  const { taskFloat, criticalEdges } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-24' }, []);
  assert.equal(taskFloat.get('a').float, 0);
  assert.ok(criticalEdges.has('a->b'));
  assert.ok(!criticalEdges.has('a->c'));
});

test('a task with no successors floats against the overall project end', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    leaf('z', '2026-07-13', '2026-07-17'),
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-17' }, []);
  assert.equal(taskFloat.get('z').float, 0);   // its finish IS the project end
  assert.equal(taskFloat.get('a').float, networkdaysFloat('2026-07-06', '2026-07-17'));
});
function networkdaysFloat(f, e) {
  const { networkdays } = require('../src/js/schedule.js');
  return Math.max(0, networkdays(f, e, []) - 1);
}

test('tier boundaries land correctly', () => {
  // floats 0,1,2,3,5,6 via sink tasks against a fixed overall end 2026-07-17 (Fri)
  const cases = [
    ['2026-07-17', 0, TIERS.CRITICAL],
    ['2026-07-16', 1, TIERS.NEAR_CRITICAL],
    ['2026-07-15', 2, TIERS.NEAR_CRITICAL],
    ['2026-07-14', 3, TIERS.WATCH],
    ['2026-07-10', 5, TIERS.WATCH],
    ['2026-07-09', 6, TIERS.HEALTHY],
  ];
  cases.forEach(([finish, expectFloat, expectTier]) => {
    const tasks = [leaf('t', '2026-07-01', finish)];
    const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-17' }, []);
    assert.equal(taskFloat.get('t').float, expectFloat, finish);
    assert.equal(taskFloat.get('t').tier, expectTier, finish);
  });
});

test('cancelled tasks, parents, and dateless tasks are excluded; dangling predecessors ignored', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    Object.assign(leaf('x', '2026-07-07', '2026-07-10', ['a', 'ghost']), { statusOverride: 'Cancelled' }),
    leaf('nodates', null, null),
  ];
  const computed = computedFor(tasks);
  computed.set('parent1', { isLeaf: false, plannedStart: '2026-07-01', plannedFinish: '2026-07-10' });
  const { taskFloat } = computeCriticalPath(tasks, computed, { plannedFinish: '2026-07-10' }, []);
  assert.ok(!taskFloat.has('x'));
  assert.ok(!taskFloat.has('nodates'));
  assert.ok(!taskFloat.has('parent1'));
  assert.ok(taskFloat.has('a'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/criticalpath.test.js`
Expected: FAIL — `Cannot find module '../src/js/criticalpath.js'`.

- [ ] **Step 3: Create `src/js/criticalpath.js`**

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
  const { networkdays } = schedule;

  const TIERS = {
    CRITICAL: 'critical',
    NEAR_CRITICAL: 'near-critical',
    WATCH: 'watch',
    HEALTHY: 'healthy',
  };

  function tierFor(float) {
    if (float === 0) return TIERS.CRITICAL;
    if (float <= 2) return TIERS.NEAR_CRITICAL;
    if (float <= 5) return TIERS.WATCH;
    return TIERS.HEALTHY;
  }

  function computeCriticalPath(tasks, computed, overall, holidayDates) {
    const taskFloat = new Map();
    const criticalEdges = new Set();

    const eligible = tasks.filter(t => {
      const c = computed.get(t.id);
      return c && c.isLeaf && t.statusOverride !== 'Cancelled' && t.plannedStart && t.plannedFinish;
    });
    const eligibleIds = new Set(eligible.map(t => t.id));

    const successors = new Map();
    eligible.forEach(t => {
      (t.predecessors || []).forEach(predId => {
        if (!eligibleIds.has(predId)) return;
        if (!successors.has(predId)) successors.set(predId, []);
        successors.get(predId).push(t);
      });
    });

    eligible.forEach(t => {
      const succs = successors.get(t.id) || [];
      let float;
      if (succs.length) {
        float = Infinity;
        succs.forEach(s => {
          const edgeFloat = Math.max(0, networkdays(t.plannedFinish, s.plannedStart, holidayDates) - 2);
          if (edgeFloat === 0) criticalEdges.add(t.id + '->' + s.id);
          if (edgeFloat < float) float = edgeFloat;
        });
      } else if (overall && overall.plannedFinish) {
        float = Math.max(0, networkdays(t.plannedFinish, overall.plannedFinish, holidayDates) - 1);
      } else {
        float = 0;
      }
      taskFloat.set(t.id, { float, tier: tierFor(float) });
    });

    return { taskFloat, criticalEdges };
  }

  return { computeCriticalPath, TIERS };
});
```

- [ ] **Step 4: Run tests to verify they pass; register in `build.py`; full suite**

Add `'js/criticalpath.js'` to `build.py`'s `JS_ORDER` (engine group). Then:
```bash
cd "project-planner"
node --test tests/criticalpath.test.js
python3 build.py
node --test
```
Expected: 8 new tests pass; build succeeds; full suite = 137 (129 + 8).

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/criticalpath.js tests/criticalpath.test.js build.py
git commit -m "Add criticalpath.js: planned-dates-based float, 4-tier classification, critical edges"
```

---

### Task 2: Tokens, 18th column CSS, header markup

**Files:**
- Modify: `project-planner/src/css/theme.css`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/index.html`

**Interfaces:**
- Produces: `--tier-near-critical`/`--tier-watch` tokens (Task 4 consumes in Gantt; sub-project C's spec also references `--tier-watch`); the `.col-predecessors` grid track + header label (Task 3 renders into it); `.predecessor-picker` popover styles (Task 3 consumes).

- [ ] **Step 1: Add the tier tokens to `theme.css`**

In the `:root` block, after `--status-cancelled: #98989d;`, add:
```css
  --tier-near-critical: #ff9500;
  --tier-watch: #ffcc00;
```
(`:root` only — theme-invariant like the status colors; the dark block is untouched.)

- [ ] **Step 2: Grow the Plan tree grid to 18 columns**

In `layout.css`, change:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px;
  min-width: 1695px;
```
to:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px 140px;
  min-width: 1835px;
```

- [ ] **Step 3: Add picker popover styles**

Append to `layout.css`, after the `.context-menu-item:hover` rule:
```css
.predecessor-picker {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  min-width: 240px;
  max-height: 320px;
  z-index: 1000;
  padding: 8px;
  display: flex;
  flex-direction: column;
}
.predecessor-picker input[type="text"] { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 8px; }
.predecessor-picker-list { overflow-y: auto; flex: 1; }
.predecessor-picker-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 13px; cursor: pointer; border-radius: var(--radius-sm); }
.predecessor-picker-item:hover { background: var(--surface-sunken); }
```

- [ ] **Step 4: Add the header label in `index.html`**

In the `#tree-header` block, after `<span>Billing Status</span>`, add:
```html
      <span>Predecessors</span>
```

- [ ] **Step 5: Build + suite + commit**

```bash
cd "project-planner"
python3 build.py
node --test
git add src/css/theme.css src/css/layout.css src/index.html
git commit -m "Add tier tokens, 18th Predecessors column track, and predecessor-picker styles"
```
Expected: build succeeds; 137 tests pass. (The header temporarily has 18 labels while rows render 17 cells — resolved by Task 3; visually verified in Task 5, not before.)

---

### Task 3: Predecessor picker + tree column

**Files:**
- Create: `project-planner/src/js/ui/predecessor-picker.js`
- Modify: `project-planner/src/js/ui/tree.js`
- Modify: `project-planner/build.py` (add `'js/ui/predecessor-picker.js'` to `JS_ORDER` before `'js/ui/tree.js'`)

**Interfaces:**
- Consumes: `PP.wouldCreateCycle` (shipped, `deps.js`), `state.calc.computed` (for `wbs`/`isLeaf`), `state.project.updateTask`.
- Produces: `PP.openPredecessorPicker(state, taskId, anchorEl, onCommitted)`; `.col-predecessors` cell rendered per row in `tree.js`.

- [ ] **Step 1: Create `src/js/ui/predecessor-picker.js`**

```js
(function () {
  'use strict';

  function closePicker() {
    var existing = document.querySelector('.predecessor-picker');
    if (existing) existing.remove();
  }

  function openPredecessorPicker(state, taskId, anchorEl, onCommitted) {
    closePicker();

    var original = state.project.tasks.find(function (t) { return t.id === taskId; });
    var pending = new Set(original.predecessors || []);
    var initial = new Set(pending);

    var candidates = state.project.tasks.filter(function (t) {
      if (t.id === taskId) return false;
      var c = state.calc.computed.get(t.id);
      if (!c || !c.isLeaf) return false;
      return !PP.wouldCreateCycle(state.project.tasks, taskId, t.id);
    });

    var picker = document.createElement('div');
    picker.className = 'predecessor-picker';

    var search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search tasks...';
    picker.appendChild(search);

    var list = document.createElement('div');
    list.className = 'predecessor-picker-list';
    picker.appendChild(list);

    function renderList(filter) {
      list.innerHTML = '';
      var needle = (filter || '').toLowerCase();
      candidates.forEach(function (t) {
        var wbs = state.calc.computed.get(t.id).wbs;
        var labelText = wbs + ' ' + t.name;
        if (needle && labelText.toLowerCase().indexOf(needle) === -1) return;
        var item = document.createElement('label');
        item.className = 'predecessor-picker-item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = pending.has(t.id);
        cb.addEventListener('change', function () {
          if (cb.checked) pending.add(t.id); else pending.delete(t.id);
        });
        var span = document.createElement('span');
        span.textContent = labelText;
        item.appendChild(cb);
        item.appendChild(span);
        list.appendChild(item);
      });
    }
    renderList('');
    search.addEventListener('input', function () { renderList(search.value); });

    var rect = anchorEl.getBoundingClientRect();
    picker.style.left = rect.left + 'px';
    picker.style.top = rect.bottom + 4 + 'px';
    document.body.appendChild(picker);
    var prect = picker.getBoundingClientRect();
    picker.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - prect.width - 4)) + 'px';
    picker.style.top = Math.max(4, Math.min(rect.bottom + 4, window.innerHeight - prect.height - 4)) + 'px';
    search.focus();

    function commitAndClose() {
      document.removeEventListener('mousedown', onOutside, true);
      picker.remove();
      var changed = pending.size !== initial.size ||
        Array.from(pending).some(function (id) { return !initial.has(id); });
      if (changed) {
        state.project.updateTask(taskId, { predecessors: Array.from(pending) }, state.currentUser);
        onCommitted();
      }
    }

    function onOutside(e) {
      if (!picker.contains(e.target)) commitAndClose();
    }
    document.addEventListener('mousedown', onOutside, true);
  }

  window.PP = window.PP || {};
  window.PP.openPredecessorPicker = openPredecessorPicker;
})();
```

- [ ] **Step 2: Render the 18th cell in `tree.js`**

In `renderTree`, before `var row = document.createElement('div');`, add:
```js
      var predText = (task.predecessors || [])
        .map(function (pid) { var pc = state.calc.computed.get(pid); return pc ? pc.wbs : null; })
        .filter(Boolean)
        .join(', ');
      var predecessorsCell = hasChildren
        ? '<span class="col-predecessors"></span>'
        : '<span class="cell col-predecessors" data-field="__predecessors">' + escapeHtml(predText) + '</span>';
```
And append to the row template string, after `billingStatusCell;` → change the end of the template concatenation from:
```js
        billingAmountCell +
        billingStatusCell;
```
to:
```js
        billingAmountCell +
        billingStatusCell +
        predecessorsCell;
```

- [ ] **Step 3: Route the dblclick to the picker in `wireTree`**

Change:
```js
    body.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var row = e.target.closest('.tree-row');
      beginEdit(state, cell, row.dataset.id, cell.dataset.field, onChanged);
    });
```
to:
```js
    body.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var row = e.target.closest('.tree-row');
      if (cell.dataset.field === '__predecessors') {
        PP.openPredecessorPicker(state, row.dataset.id, cell, onChanged);
        return;
      }
      beginEdit(state, cell, row.dataset.id, cell.dataset.field, onChanged);
    });
```
(The `__predecessors` sentinel keeps `beginEdit`'s generic text-editor path from ever touching this cell — it is not a `task[field]` scalar.)

- [ ] **Step 4: Register, syntax-check, build, suite, commit**

Add `'js/ui/predecessor-picker.js'` to `build.py`'s `JS_ORDER` before `'js/ui/tree.js'`. Then:
```bash
cd "project-planner"
node --check src/js/ui/predecessor-picker.js
node --check src/js/ui/tree.js
python3 build.py
grep -c "openPredecessorPicker" dist/ProjectPlanner.html
node --test
git add src/js/ui/predecessor-picker.js src/js/ui/tree.js build.py
git commit -m "Add predecessor picker popover and Predecessors column in the Plan tree"
```
Expected: syntax clean; grep ≥ 2 (definition + call); 137 tests pass.

---

### Task 4: Gantt critical-path visuals

**Files:**
- Modify: `project-planner/src/js/ui/gantt.js`

**Interfaces:**
- Consumes: `PP.computeCriticalPath`, `PP.TIERS` (Task 1), tier tokens (Task 2).
- Produces: no new exports; bar strokes and arrow colors now tier-driven.

- [ ] **Step 1: Compute tiers once per render**

In `renderGantt`, after `var byId = new Map(...)` and before the svg loop, add:
```js
    var holidayDates = state.project.holidays.map(function (h) { return h.date; });
    var cp = PP.computeCriticalPath(state.project.tasks, state.calc.computed, state.calc.overall, holidayDates);
    var TIER_STROKE = {};
    TIER_STROKE[PP.TIERS.CRITICAL] = { stroke: 'var(--status-delayed)', width: 2 };
    TIER_STROKE[PP.TIERS.NEAR_CRITICAL] = { stroke: 'var(--tier-near-critical)', width: 2 };
    TIER_STROKE[PP.TIERS.WATCH] = { stroke: 'var(--tier-watch)', width: 2 };
```

- [ ] **Step 2: Tier-stroke the leaf bars**

Change the bar-track rect creation from:
```js
      svg.appendChild(svgEl('rect', {
        x: x1, y: y, width: barWidth, height: BAR_HEIGHT, rx: 4,
        fill: 'var(--surface-sunken)', stroke: 'var(--kpmg-blue)', 'stroke-width': 1,
        'data-id': id, class: 'gantt-bar',
      }));
```
to:
```js
      var tf = cp.taskFloat.get(id);
      var tierStroke = tf ? TIER_STROKE[tf.tier] : null;
      svg.appendChild(svgEl('rect', {
        x: x1, y: y, width: barWidth, height: BAR_HEIGHT, rx: 4,
        fill: 'var(--surface-sunken)',
        stroke: tierStroke ? tierStroke.stroke : 'var(--kpmg-blue)',
        'stroke-width': tierStroke ? tierStroke.width : 1,
        'data-id': id, class: 'gantt-bar',
      }));
```
(`healthy` is deliberately absent from `TIER_STROKE`, so healthy bars — and any bar with no float entry — keep today's default stroke.)

- [ ] **Step 3: Red critical arrows**

In the dependency-arrow loop, change:
```js
        svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: 'var(--text-tertiary)', 'stroke-width': 1 }));
        svg.appendChild(svgEl('polygon', {
          points: [thisX, thisY, thisX - 6, thisY - 3, thisX - 6, thisY + 3].join(','),
          fill: 'var(--text-tertiary)',
        }));
```
to:
```js
        var isCriticalEdge = cp.criticalEdges.has(predId + '->' + id);
        svg.appendChild(svgEl('path', {
          d: pathD, fill: 'none',
          stroke: isCriticalEdge ? 'var(--status-delayed)' : 'var(--text-tertiary)',
          'stroke-width': isCriticalEdge ? 2 : 1,
        }));
        svg.appendChild(svgEl('polygon', {
          points: [thisX, thisY, thisX - 6, thisY - 3, thisX - 6, thisY + 3].join(','),
          fill: isCriticalEdge ? 'var(--status-delayed)' : 'var(--text-tertiary)',
        }));
```

- [ ] **Step 4: Syntax-check, build, suite, commit**

```bash
cd "project-planner"
node --check src/js/ui/gantt.js
python3 build.py
node --test
git add src/js/ui/gantt.js
git commit -m "Render critical-path tiers as Gantt bar outlines and red critical arrows"
```
Expected: syntax clean; build succeeds; 137 tests pass.

---

### Task 5: End-to-end browser verification (controller-run, not a fresh subagent)

**Files:** none (verification only).

- [ ] **Step 1: Build + seed** a project with a dependency chain of known gaps: A→B back-to-back (float 0), B→C with a 1-workday gap (near-critical), a task with a 4-workday gap to its successor (watch), an independent task ending well before project end (healthy), plus one parent phase wrapping some of them. Serve `dist/` and open.
- [ ] **Step 2: Picker behavior** — dblclick a leaf's Predecessors cell: popover opens with search + checkboxes; the task itself absent; verify a would-be-cycle candidate is absent (pick B's picker: A is checked, and a task downstream of B must not be offered); toggle a selection, click outside → cell text updates to WBS list, Gantt shows the new arrow, undo works as one step. Re-open and close without change → confirm via the audit log that **no** new entry was written.
- [ ] **Step 3: Parent rows** — dblclick a parent's Predecessors cell: nothing opens (blank non-cell span).
- [ ] **Step 4: Gantt tiers** — via `getComputedStyle`/attribute checks on the real SVG, confirm each seeded bar's stroke matches its hand-computed tier (red/orange/yellow/default) and the A→B arrow is red width-2 while slack arrows stay thin gray.
- [ ] **Step 5: Cross-check float math live** — change B's start date to open a 3-workday gap; confirm A's bar drops to watch (yellow) on refresh.
- [ ] **Step 6: Console sweep + suite** — only the benign favicon 404; `node --test` = 137 passing.
- [ ] **Step 7: Record result**; fix-in-owning-file + re-verify on any failure.

---

## Plan Complete

Predecessors are now settable in-app (cycle-safe picklist, 18th column), and the Gantt shows planned-dates-based schedule risk (4 tiers + red critical chain) with all float math Node-locked.
