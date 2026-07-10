# Undo/Redo UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Undo/Redo buttons and a keyboard shortcut to the app header, wired to `store.js`'s already-working but never-exposed `Project.undo()`/`Project.redo()`, with descriptive hover tooltips showing what each action would do.

**Architecture:** Task 1 adds one new pure function, `describeChange`, to the `store.js` engine (Node-tested, no DOM). Task 2 wires everything into the UI: two new header buttons, a `refresh()`-driven enable/disable + tooltip update, and a global keydown handler that's inert while a text field has focus. Task 3 is controller-run browser verification.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- No changes to `store.js`'s existing `undo()`/`redo()`/`_pushUndo()`/`_applyState()` logic — this plan only adds one new pure function alongside them.
- The keyboard shortcut (`Ctrl+Z`/`Cmd+Z` for undo, `+Shift` for redo) must be a no-op whenever `document.activeElement` is an `INPUT`, `TEXTAREA`, or `SELECT` — this lets the browser's native in-field undo work normally while editing a Plan-tree cell or any other text input, instead of colliding with app-level undo.
- No persistence of undo/redo history across page reloads — session-only, matching every other app's behavior. Not a gap to fix.
- Current baseline: 165/165 Node tests passing. UI files (`src/js/ui/*.js`) have no automated test coverage by design (no jsdom) — verified via real-browser Playwright checks, not `node --test`.

---

### Task 1: `describeChange` (`store.js`)

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `describeChange(before, after) -> string`, newly exported from `store.js`. Both arguments are full project snapshots shaped like `Project.prototype.toJSON()`'s output (`{ meta, tasks, holidays, picList, snapshots, auditLog, settings }`). Task 2 depends on this exact name and signature.

- [ ] **Step 1: Write the failing tests**

Add to `project-planner/tests/store.test.js` (the file already imports from `../src/js/store.js` at the top — change that import line to also pull `describeChange`):

```js
const { Project, generateId, findIncompleteTasks, findTasksMissingOwner, describeChange, computeLastUpdated } = require('../src/js/store.js');
```

Then add these tests anywhere in the file:

```js
function snap(overrides) {
  return Object.assign({ tasks: [], holidays: [], picList: [], snapshots: [], settings: {} }, overrides);
}

test('describeChange: a single added task', () => {
  const before = snap({});
  const after = snap({ tasks: [{ id: 't1', name: 'New Task' }] });
  assert.equal(describeChange(before, after), "Add 'New Task'");
});

test('describeChange: multiple added tasks', () => {
  const before = snap({});
  const after = snap({ tasks: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] });
  assert.equal(describeChange(before, after), 'Add 2 tasks');
});

test('describeChange: a single deleted task', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'Gone' }] });
  const after = snap({});
  assert.equal(describeChange(before, after), "Delete 'Gone'");
});

test('describeChange: multiple deleted tasks', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] });
  const after = snap({});
  assert.equal(describeChange(before, after), 'Delete 2 tasks');
});

test('describeChange: a single field changed on one task', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-01' }] });
  const after = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-05' }] });
  assert.equal(describeChange(before, after), "Change plannedStart on 'Design'");
});

test('describeChange: multiple fields changed on one task', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-01', plannedFinish: '2026-01-02' }] });
  const after = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-05', plannedFinish: '2026-01-06' }] });
  assert.equal(describeChange(before, after), "Change 2 fields on 'Design'");
});

test('describeChange: fields changed on multiple tasks (e.g. a cascading successor shift)', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'A', plannedStart: '2026-01-01' }, { id: 't2', name: 'B', plannedStart: '2026-01-01' }] });
  const after = snap({ tasks: [{ id: 't1', name: 'A', plannedStart: '2026-01-05' }, { id: 't2', name: 'B', plannedStart: '2026-01-06' }] });
  assert.equal(describeChange(before, after), 'Change 2 tasks');
});

test('describeChange: falls through to holidays/picList/snapshots/settings when no task differs', () => {
  const before = snap({});
  assert.equal(describeChange(before, snap({ holidays: [{ date: '2026-01-01', label: 'New Year' }] })), 'Change holidays');
  assert.equal(describeChange(before, snap({ picList: ['Alice'] })), 'Change PIC list');
  assert.equal(describeChange(before, snap({ snapshots: [{ id: 's1' }] })), 'Take snapshot');
  assert.equal(describeChange(before, snap({ settings: { theme: 'kpmg-dark' } })), 'Change settings');
});

test('describeChange: identical snapshots fall back to a generic label', () => {
  assert.equal(describeChange(snap({}), snap({})), 'Change');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `describeChange is not a function`, since it doesn't exist in `store.js` yet.

- [ ] **Step 3: Implement `describeChange`**

In `project-planner/src/js/store.js`, add this function right before the final `return { ... }` statement:

```js
  function describeChange(before, after) {
    const beforeById = new Map(before.tasks.map(t => [t.id, t]));
    const afterById = new Map(after.tasks.map(t => [t.id, t]));

    const added = after.tasks.filter(t => !beforeById.has(t.id));
    const removed = before.tasks.filter(t => !afterById.has(t.id));

    if (added.length === 1 && removed.length === 0) return `Add '${added[0].name}'`;
    if (added.length > 1 && removed.length === 0) return `Add ${added.length} tasks`;
    if (removed.length === 1 && added.length === 0) return `Delete '${removed[0].name}'`;
    if (removed.length > 1 && added.length === 0) return `Delete ${removed.length} tasks`;

    const changedTasks = [];
    for (const [id, afterTask] of afterById) {
      const beforeTask = beforeById.get(id);
      if (!beforeTask) continue;
      const fields = Object.keys(afterTask).filter(k => JSON.stringify(afterTask[k]) !== JSON.stringify(beforeTask[k]));
      if (fields.length) changedTasks.push({ task: afterTask, fields });
    }

    if (changedTasks.length === 1 && changedTasks[0].fields.length === 1) {
      return `Change ${changedTasks[0].fields[0]} on '${changedTasks[0].task.name}'`;
    }
    if (changedTasks.length === 1) {
      return `Change ${changedTasks[0].fields.length} fields on '${changedTasks[0].task.name}'`;
    }
    if (changedTasks.length > 1) {
      return `Change ${changedTasks.length} tasks`;
    }

    if (JSON.stringify(before.holidays) !== JSON.stringify(after.holidays)) return 'Change holidays';
    if (JSON.stringify(before.picList) !== JSON.stringify(after.picList)) return 'Change PIC list';
    if (JSON.stringify(before.snapshots) !== JSON.stringify(after.snapshots)) return 'Take snapshot';
    if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) return 'Change settings';

    return 'Change';
  }
```

Change the module's final return statement from:
```js
  return { Project, generateId, findIncompleteTasks, findTasksMissingOwner, computeLastUpdated };
```
to:
```js
  return { Project, generateId, findIncompleteTasks, findTasksMissingOwner, describeChange, computeLastUpdated };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 174/174 total (165 baseline + 9 new tests in this task).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/store.js tests/store.test.js
git commit -m "Add describeChange: human-readable diff between two project snapshots"
```

---

### Task 2: Undo/Redo buttons and keyboard shortcut

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.describeChange(before, after)` (Task 1), `state.project._undoStack`/`_redoStack` (existing private-by-convention fields already read directly elsewhere in this codebase's own tests), `state.project.undo()`/`redo()` (existing, unchanged).
- Produces: working Undo/Redo buttons and a global keyboard shortcut. Task 3 verifies this live.

- [ ] **Step 1: Add the buttons to the header**

In `project-planner/src/index.html`, change:
```html
      <label>Status date <input type="date" id="status-date-input"></label>
      <button id="save-button">Save</button>
```
to:
```html
      <label>Status date <input type="date" id="status-date-input"></label>
      <button id="undo-button">Undo</button>
      <button id="redo-button">Redo</button>
      <button id="save-button">Save</button>
```

- [ ] **Step 2: Update button state on every refresh**

In `project-planner/src/js/ui/app.js`, add a new function right after `renderHeader` (which currently ends just before `renderPicFilter`):

```js
  function updateUndoRedoButtons(state) {
    var undoBtn = document.getElementById('undo-button');
    var redoBtn = document.getElementById('redo-button');
    var undoStack = state.project._undoStack;
    var redoStack = state.project._redoStack;

    undoBtn.disabled = undoStack.length === 0;
    undoBtn.title = undoStack.length
      ? 'Undo: ' + PP.describeChange(undoStack[undoStack.length - 1], state.project.toJSON())
      : '';

    redoBtn.disabled = redoStack.length === 0;
    redoBtn.title = redoStack.length
      ? 'Redo: ' + PP.describeChange(state.project.toJSON(), redoStack[redoStack.length - 1])
      : '';
  }
```

Then change `refresh(state, markDirty)`:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    state.lastUpdated = PP.computeLastUpdated(state.project);
    renderHeader(state);
    renderPicFilter(state);
```
to:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    state.lastUpdated = PP.computeLastUpdated(state.project);
    renderHeader(state);
    updateUndoRedoButtons(state);
    renderPicFilter(state);
```

- [ ] **Step 3: Wire the button clicks and the keyboard shortcut**

In `project-planner/src/js/ui/app.js`, change `wireHeader(state)`:
```js
  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
```
to:
```js
  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('undo-button').addEventListener('click', function () {
      if (state.project.undo()) refresh(state, true);
    });
    document.getElementById('redo-button').addEventListener('click', function () {
      if (state.project.redo()) refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
```

Add a new function anywhere below `wireHeader`:
```js
  function wireUndoRedoKeyboard(state) {
    document.addEventListener('keydown', function (e) {
      var active = document.activeElement;
      var tag = active ? active.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        if (state.project.redo()) refresh(state, true);
      } else {
        if (state.project.undo()) refresh(state, true);
      }
    });
  }
```

Finally, in `showApp(state)`, change:
```js
    refresh(state, false);
    wireHeader(state);
    wireToolbar(state);
```
to:
```js
    refresh(state, false);
    wireHeader(state);
    wireUndoRedoKeyboard(state);
    wireToolbar(state);
```

- [ ] **Step 4: Build**

```bash
cd project-planner
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 174/174 tests pass (this task touches no engine/logic files, so the count from Task 1 must be unchanged).

- [ ] **Step 5: Live-verify in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least 2 tasks. Confirm via `browser_evaluate`/real clicks/real keypresses:
- On load, both `#undo-button` and `#redo-button` are disabled (empty stacks), with empty `title`.
- Edit a Plan-tree cell (e.g. change a task's Remarks). Confirm `#undo-button` becomes enabled with a `title` matching the exact string `PP.describeChange` would produce for that edit (e.g. `"Undo: Change remarks on 'Design'"`), and `#redo-button` stays disabled.
- Click `#undo-button`. Confirm the edited field reverts to its prior value, `#undo-button` becomes disabled again (or shows the next-older change if there was one), and `#redo-button` becomes enabled with a `title` describing the re-do (e.g. `"Redo: Change remarks on 'Design'"`).
- Click `#redo-button`. Confirm the edit reapplies and button states flip back.
- Make a fresh edit after an undo (without redoing) — confirm the redo stack clears (`#redo-button` becomes disabled again), matching `store.js`'s existing `_pushUndo()` behavior.
- Focus the search input (`#search-input`), type something, then press `Ctrl+Z`/`Cmd+Z` — confirm this does NOT trigger app-level undo (no change to `#undo-button`'s disabled state or the Plan tree) — the keystroke should be left alone for the browser's native field-undo.
- Click elsewhere to remove focus from any input, then press `Ctrl+Z`/`Cmd+Z` — confirm this DOES trigger app-level undo. Press `Ctrl+Shift+Z`/`Cmd+Shift+Z` — confirm this triggers redo.

- [ ] **Step 6: Commit**

```bash
cd project-planner
git add src/index.html src/js/ui/app.js
git commit -m "Add Undo/Redo buttons and keyboard shortcut, wired to store.js's existing undo/redo"
```

---

### Task 3: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd project-planner
python3 build.py
node --test
```
Expected: 174/174 tests pass (the exact final count established in Task 1 — confirm it matches, don't assume).

- [ ] **Step 2: Verify a realistic multi-step undo/redo sequence**

Seed a project with at least 3 tasks, one with a predecessor link to another. Perform, in order: (a) edit a cell (e.g. Remarks) on task A, (b) drag task A's Gantt bar so its successor (task B, linked via predecessor) auto-shifts via `forwardPass`, (c) add a new task via "+ Add Task". After each step, confirm `#undo-button`'s title correctly describes that specific action (using the exact `describeChange` output format), then undo all three in reverse order one at a time, confirming after each undo that the correct prior state is restored and the tooltip on both buttons updates correctly, then redo all three back forward, confirming final state matches the post-step-(c) state exactly.

- [ ] **Step 3: Verify the keyboard-shortcut field-focus guard with the real Plan-tree cell editor**

Double-click a Plan-tree cell to open its inline text editor (per `tree.js`'s `beginEdit`), confirm it's a real `<input>` in the DOM, type a character, press `Ctrl+Z`/`Cmd+Z` — confirm the app-level undo did NOT fire (check `#undo-button`'s disabled/title state is unchanged from before the keypress). Press `Escape` to cancel the edit, then press `Ctrl+Z`/`Cmd+Z` again — confirm it now fires correctly (focus has left the input).

- [ ] **Step 4: Verify zero regression to existing functionality**

Exercise: switch every view tab, Save (JSON), Import CSV, Export CSV, add/remove a holiday, use the Owner/PIC/status/milestone filters. Confirm every interaction still works exactly as it did before this plan, and that none of them are themselves broken by an accidental stray undo/redo (e.g. confirm clicking a filter checkbox doesn't touch the undo stack).

- [ ] **Step 5: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected). Then run:
```bash
cd project-planner
node --test
```
Confirm the same count from Step 1 still passes.

- [ ] **Step 6: Record the result**

If every check in Steps 1-5 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-2: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: every task-affecting action (cell edits, drags, adds, deletes, CSV imports, holiday changes, etc.) can be undone and redone via header buttons or `Ctrl+Z`/`Ctrl+Shift+Z`, each showing a human-readable description of what it will do, without interfering with native browser undo while actually typing in a field.
