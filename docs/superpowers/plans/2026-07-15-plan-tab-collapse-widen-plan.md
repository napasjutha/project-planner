# Plan Tab: Collapse/Expand All + Wider Task Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Collapse All / Expand All buttons to the Plan tab and widen the Task name column so long task names stop truncating.

**Architecture:** One new `Project` method (`setAllCollapsed`) in `store.js`, matching the existing no-undo convention of the per-row `toggleCollapse`. Two new toolbar buttons wired in `app.js`'s `wireToolbar`. One CSS width change in `layout.css`.

**Tech Stack:** Vanilla JS, `node:test`.

## Global Constraints

- Zero external dependencies. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`.
- Engines (`src/js/*.js`): UMD-lite, Node-tested, no DOM. `src/js/ui/*.js`: plain IIFEs, no Node coverage — verified only via the final controller-run Playwright task.
- Baseline: 253/253 Node tests passing as of this plan's start (re-verify via `node --test` before Task 1).
- This plan is **independent** of the other 3 plans written alongside it — different files, no merge-order dependency, safe on a parallel worktree.
- `setAllCollapsed` must **not** call `_pushUndo()` or `_audit()` — `Project#toggleCollapse` (`src/js/store.js:326-330`), the existing per-row equivalent, has neither. Collapse state is view-state that happens to live on the task record, not undo-tracked data. Do not add undo/audit here even though most other bulk `Project` methods do — consistency with the single-row method this generalizes matters more than symmetry with unrelated methods.
- Run `python3 build.py` after every `src/` change, before any manual/browser verification step.

---

### Task 1: `Project#setAllCollapsed`

**Files:**
- Modify: `src/js/store.js` (add the method directly after `toggleCollapse`, `store.js:326-330`)
- Test: `tests/store.test.js`

**Interfaces:**
- Produces: `Project#setAllCollapsed(collapsed)` — no return value, no undo step. Task 3 (UI) calls this directly.

- [ ] **Step 1: Write the failing tests**

Add to `tests/store.test.js`, directly after the existing `'toggleCollapse throws for an unknown task id'` test (ends at line 257) — this mirrors that block's exact fixture pattern (`Project.empty('Test')` + `addTask`) and its exact style of asserting no undo/audit entry was written:

```js
test('setAllCollapsed(true) collapses every task that has children, leaves leaf tasks untouched', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Parent' });
  const leaf = p.addTask({ parentId: parent.id, name: 'Leaf' });
  const undoStackBefore = p._undoStack.length;
  const auditLengthBefore = p.auditLog.length;

  p.setAllCollapsed(true);
  assert.equal(p.tasks.find(t => t.id === parent.id).collapsed, true);
  assert.equal(p.tasks.find(t => t.id === leaf.id).collapsed, false); // leaf never has children, so it's untouched
  assert.equal(p._undoStack.length, undoStackBefore);
  assert.equal(p.auditLog.length, auditLengthBefore);
});

test('setAllCollapsed(false) after setAllCollapsed(true) expands every parent back', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Parent' });
  p.addTask({ parentId: parent.id, name: 'Leaf' });

  p.setAllCollapsed(true);
  assert.equal(p.tasks.find(t => t.id === parent.id).collapsed, true);
  p.setAllCollapsed(false);
  assert.equal(p.tasks.find(t => t.id === parent.id).collapsed, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `project.setAllCollapsed is not a function`.

- [ ] **Step 3: Implement `setAllCollapsed`**

In `src/js/store.js`, add directly after `toggleCollapse` (ends at line 330):

```js

    setAllCollapsed(collapsed) {
      this.tasks.forEach(t => {
        if (this.tasks.some(c => c.parentId === t.id)) t.collapsed = collapsed;
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — total count is your verified baseline + 2.

- [ ] **Step 5: Commit**

```bash
git add src/js/store.js tests/store.test.js
git commit -m "feat: add Project#setAllCollapsed for bulk collapse/expand"
```

---

### Task 2: Toolbar buttons + wider Task column

**Files:**
- Modify: `src/index.html` (add two buttons to `#toolbar`, `index.html:33-49`)
- Modify: `src/js/ui/app.js` (wire the two buttons inside `wireToolbar`, `app.js:158-`)
- Modify: `src/css/layout.css:48` (widen the Task column)

**Interfaces:**
- Consumes: `Project#setAllCollapsed` (Task 1), `state.project`, `refresh(state, true)` (existing app.js function used by every other toolbar handler for a full re-render).

- [ ] **Step 1: Add the buttons to `index.html`**

In `src/index.html`, change:
```html
  <div id="toolbar">
    <button id="add-task-button">+ Add Task</button>
    <input id="search-input" type="text" placeholder="Search tasks...">
```
to:
```html
  <div id="toolbar">
    <button id="add-task-button">+ Add Task</button>
    <button id="collapse-all-button">Collapse All</button>
    <button id="expand-all-button">Expand All</button>
    <input id="search-input" type="text" placeholder="Search tasks...">
```

- [ ] **Step 2: Wire the buttons in `app.js`**

In `src/js/ui/app.js`, inside `wireToolbar` (starts at line 158), add directly after the existing `add-task-button` handler (ends at line 162):

```js
    document.getElementById('collapse-all-button').addEventListener('click', function () {
      state.project.setAllCollapsed(true);
      refresh(state, true);
    });
    document.getElementById('expand-all-button').addEventListener('click', function () {
      state.project.setAllCollapsed(false);
      refresh(state, true);
    });
```

- [ ] **Step 3: Widen the Task column**

In `src/css/layout.css`, line 48, change:
```css
  grid-template-columns: 40px 220px 90px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 140px;
```
to:
```css
  grid-template-columns: 40px 360px 90px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 140px;
```
(only the second value changes, 220px → 360px — every other column width is unchanged.)

- [ ] **Step 4: Build and confirm no regressions**

```bash
node --check src/js/ui/app.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 1's final count.

- [ ] **Step 5: Commit**

```bash
git add src/index.html src/js/ui/app.js src/css/layout.css
git commit -m "feat: Collapse All / Expand All buttons and a wider Task column on the Plan tab"
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
cd dist && python3 -m http.server 8795
```

Navigate to it with the Playwright browser tools. Complete the name-picker overlay if it appears. Load or build a project with at least 2 levels of parent/child nesting and at least one task with a long name (60+ characters).

- [ ] **Step 3: Confirm Collapse All / Expand All**

Click Collapse All, confirm every parent row shows ▸ and all child rows are hidden. Click Expand All, confirm every row is visible again with ▾ on parents.

- [ ] **Step 4: Confirm the wider Task column**

Confirm the long task name from Step 2 is visibly less truncated than before (compare against the old 220px width — the name should now show substantially more characters before ellipsis/cutoff).

- [ ] **Step 5: Verify zero regression to every other tab**

Click through Gantt, S-Curve, Dashboard, Snapshots, Resources, Deliverable/Billing, Settings, Holidays, Activities, Reports, Issues/Risks/Decisions. Confirm no console errors.

- [ ] **Step 6: Final test sweep**

```bash
node --test
```

Expected: same count as Step 1.

- [ ] **Step 7: Record the result**

If every check in Steps 1-6 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-2: fix it, re-run `python3 build.py`, and repeat this task's verification from the relevant step.
