# Milestone → Deliverable Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the existing `task.milestone` boolean flag to `task.deliverable` everywhere in the codebase — same concept, same ♦ diamond marker, same behavior, new name — with a `Project` constructor migration so every existing saved project (including the two UAT deliverables) keeps working unmodified.

**Architecture:** Task 1 renames the field at its source (`store.js`) and adds the backward-compatibility migration. Task 2 renames the derived computed fields in `calc.js` (per-task `isMilestone`, project KPIs `milestonesTotal`/`milestonesComplete`). Task 3 renames the filter key (`filters.js`) and the CSV column/parsing (`csv.js`) — the last two engine-layer files. Task 4 is a mechanical, no-automated-test UI sweep (`tree.js`, `gantt.js`, `billing.js`, `dashboard.js`, `reports.js`, `app.js`, `index.html`, `layout.css`). Task 5 is controller-run Playwright verification, including loading a real UAT file's legacy `milestone: true` data through the new migration.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- Same concept, renamed — one boolean flag; no new field, no coexistence with a separate "milestone" concept (spec Decisions Log).
- Full rename: `task.milestone` → `task.deliverable` everywhere (data field, computed fields, filter keys, CSV header, CSS class), not just display text (spec Decisions Log).
- Visual marker (♦ diamond) unchanged — same glyph in the tree row and same diamond shape on the Gantt bar. Only the tooltip/label text changes from "Milestone" to "Deliverable" (spec Decisions Log).
- Backward compatibility with saved files is required — existing saved JSON projects and the two UAT deliverable files (`ProjectPlanner_UAT.html`, `TCEBPlanner.html`) have tasks with `milestone: true` baked into their seed data and must keep working unmodified after this ships (spec Decisions Log).
- This is a rename, not new behavior — no new test *cases* beyond the one migration test; regression means total test count changes by exactly +1 and every existing test keeps passing under its renamed assertions (spec §5).
- Out of scope (do not touch): the Deliverable/Billing tab's data-model rework, the Issues/Risks + Key Decisions tab, the Activities/calendar tab, the Reports-tab overhaul (all separate future specs); any change to the marker's glyph, color, or shape; rebuilding the two UAT HTML files (a separate post-merge step, not part of this plan — Task 5 only *reads* one of them for verification, never overwrites it) (spec §6).
- UI files (`src/js/ui/*.js`, `src/index.html`, `src/css/layout.css`) have no automated test coverage by this project's standing convention (no jsdom) — verified only via real-browser Playwright checks, never `node --test`.
- Baseline confirmed by running `node --test` before writing this plan: **174/174 passing** (0 failing).
- This plan has no dependencies on other pending plans and should be built/merged first — the Deliverable/Billing rework plan depends on the `task.deliverable` field this plan produces.

## Pre-implementation note: a real field-name collision found while reading the current code

The spec's §3 does not mention this — it was only visible by reading `store.js` directly, which is exactly why this plan's research step reads every touched file's current content rather than assuming the spec's prose is complete.

**The collision:** every task object already has a separate, pre-existing string field literally named `deliverable` (`store.js:159` and `:185`: `deliverable: '', jira: '', remarks: '',`), apparently scaffolded ahead of the future Deliverable/Billing rework. It defaults to `''` on every task, is never rendered as a tree column, never edited by any input, never read by `csv.js`/`filters.js`/`calc.js`/`gantt.js`/`billing.js`/`dashboard.js`/`reports.js` — the only place it's ever touched again is `tree.js:161`, where the "Duplicate" context-menu action copies it onto the new copy (`deliverable: task.deliverable`). Confirmed empty in real data: all 222 tasks in `UAT/ProjectPlanner_UAT.html` have `"deliverable": ""` today.

Renaming the *boolean* `task.milestone` to the *same* key `task.deliverable` collides with this dead field:
- `store.js`'s `addTask`/`addTasks` object literals would declare the key `deliverable` **twice** in the same literal (once as the old empty string, once as the renamed boolean) — legal JS (last property wins) but a duplicate-key smell no reviewer should wave through.
- `tree.js`'s Duplicate action currently copies the old (always-empty) `deliverable` string but does **not** copy `milestone` today. Leaving that line untouched after the rename would silently start propagating the deliverable/milestone flag onto duplicated tasks — an unrequested behavior change.

**Resolution used throughout this plan:** wherever the dead `deliverable: ''` / `task.deliverable` reference coexists with a `milestone` reference in the same object literal or patch, the dead reference is deleted outright (not renamed) — its neighbors `jira`/`remarks` are untouched. This preserves every current behavior exactly (Duplicate still does not propagate the flag; no duplicate object keys anywhere) while still landing on the single boolean `task.deliverable` field the spec calls for. Touched by: Task 1 (`store.js:159,185`; `store.test.js:346,375,385`), Task 2 (`fixtures/vision-phase.js:4,13`), Task 4 (`tree.js:161`).

**A second, related correction to the spec's literal text:** spec §3's inline example for `store.js`'s `addTasks` shows the rename target as `deliverable: !!spec.milestone` — i.e., renaming only the object *key*, not the source expression. Taken literally, `spec.milestone` would forever read the CSV-import spec's *old* field name, even after Task 3 renames `csv.js`'s `validateCsvRows` to emit `spec.deliverable` instead of `spec.milestone`. Since `app.js:322-327` wires `PP.validateCsvRows(rows)` straight into `state.project.addTasks(result.tasks, ...)`, implementing the spec's example literally would permanently and silently break CSV-import of the deliverable flag the instant Task 3 ships — directly contradicting §5's own CSV round-trip requirement and this plan's Task 5 verification. **This plan implements the clearly-intended full rename instead: `deliverable: !!spec.deliverable`.** Between Task 1 (store.js changed) and Task 3 (csv.js changed), the production CSV-import pipeline transiently cannot read the flag from an imported file — this is invisible to `node --test` (grep confirms no test in this repo pipes `validateCsvRows` output into `addTasks`) and is fully resolved before Task 5's browser verification, the only point in this plan that exercises that pipeline end-to-end.

**Not part of the rename:** `store.test.js:266` — `p.addTask({ parentId: null, name: 'Milestone' })` — is an unrelated task *named* "Milestone" inside a billing-defaults test (`addTask defaults billingAmount and billingStatus to null`). A blind grep for "milestone" will surface it; it is intentionally left untouched since it has nothing to do with the flag being renamed.

---

### Task 1: `store.js` field rename + legacy migration

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `task.deliverable` (boolean) replacing `task.milestone` on every task object created by `addTask`/`addTasks`; a `Project` constructor migration that upgrades any raw data still containing `milestone` into `deliverable` and deletes the old key. Tasks 2–4 depend on every task object exposing `deliverable`, not `milestone`, from this point forward.

- [ ] **Step 1: Update `store.test.js`**

Five existing tests reference the old field name and must be updated to the new one (renamed test bodies shown complete below); one brand-new test is added for the migration itself.

Replace the test `addTasks builds hierarchy from _level and appends in order under one undo checkpoint`:
```js
test('addTasks builds hierarchy from _level and appends in order under one undo checkpoint', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Phase A', pic: '', plannedStart: null, plannedFinish: null, remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 2, _level: 1, name: 'Design', pic: 'Alice', plannedStart: '2026-07-01', plannedFinish: '2026-07-10', remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 3, _level: 1, name: 'Build', pic: 'Bob', plannedStart: null, plannedFinish: null, remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 4, _level: 0, name: 'Phase B', pic: '', plannedStart: null, plannedFinish: null, remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created.length, 4);
  assert.equal(created[0].parentId, null);
  assert.equal(created[1].parentId, created[0].id);
  assert.equal(created[2].parentId, created[0].id);
  assert.equal(created[3].parentId, null);
  assert.equal(created[1].order, 0);
  assert.equal(created[2].order, 1);
  assert.ok(p.undo());
  assert.equal(p.tasks.length, 0);
});
```
with:
```js
test('addTasks builds hierarchy from _level and appends in order under one undo checkpoint', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Phase A', pic: '', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 2, _level: 1, name: 'Design', pic: 'Alice', plannedStart: '2026-07-01', plannedFinish: '2026-07-10', remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 3, _level: 1, name: 'Build', pic: 'Bob', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 4, _level: 0, name: 'Phase B', pic: '', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created.length, 4);
  assert.equal(created[0].parentId, null);
  assert.equal(created[1].parentId, created[0].id);
  assert.equal(created[2].parentId, created[0].id);
  assert.equal(created[3].parentId, null);
  assert.equal(created[1].order, 0);
  assert.equal(created[2].order, 1);
  assert.ok(p.undo());
  assert.equal(p.tasks.length, 0);
});
```

Replace the test `addTasks appends after existing root tasks with contiguous order`:
```js
test('addTasks appends after existing root tasks with contiguous order', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'Existing' });
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Imported', pic: '', plannedStart: null, plannedFinish: null, remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created[0].order, 1);
});
```
with:
```js
test('addTasks appends after existing root tasks with contiguous order', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'Existing' });
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Imported', pic: '', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created[0].order, 1);
});
```

Replace the test `addTasks fills the full task shape with defaults` (this one also drops the now-obsolete assertion on the dead string field, per the collision note above):
```js
test('addTasks fills the full task shape with defaults', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'A', pic: '', plannedStart: null, plannedFinish: null, remarks: 'note', milestone: true, billingAmount: 500, billingStatus: 'Paid', predecessors: [] },
  ], 'importer');
  const t = created[0];
  assert.equal(t.actualPct, 0);
  assert.equal(t.weightOverride, null);
  assert.equal(t.statusOverride, null);
  assert.equal(t.collapsed, false);
  assert.equal(t.deliverable, '');
  assert.equal(t.milestone, true);
  assert.equal(t.billingAmount, 500);
  assert.equal(t.billingStatus, 'Paid');
});
```
with:
```js
test('addTasks fills the full task shape with defaults', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'A', pic: '', plannedStart: null, plannedFinish: null, remarks: 'note', deliverable: true, billingAmount: 500, billingStatus: 'Paid', predecessors: [] },
  ], 'importer');
  const t = created[0];
  assert.equal(t.actualPct, 0);
  assert.equal(t.weightOverride, null);
  assert.equal(t.statusOverride, null);
  assert.equal(t.collapsed, false);
  assert.equal(t.deliverable, true);
  assert.equal(t.billingAmount, 500);
  assert.equal(t.billingStatus, 'Paid');
});
```

Replace the test `Project migrates a legacy task (owner undefined) by moving pic into owner and blanking pic` (drops the dead `deliverable: ''` key per the collision note, renames `milestone: false` to `deliverable: false` — this test's own subject is the unrelated owner/pic migration, so the exact boolean value here is incidental):
```js
test('Project migrates a legacy task (owner undefined) by moving pic into owner and blanking pic', () => {
  const p = new Project({
    meta: { id: 'legacy', name: 'Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'Old Task', pic: 'KPMG/Central Team', deliverable: '', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, milestone: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, 'KPMG/Central Team');
  assert.equal(p.tasks[0].pic, '');
});
```
with:
```js
test('Project migrates a legacy task (owner undefined) by moving pic into owner and blanking pic', () => {
  const p = new Project({
    meta: { id: 'legacy', name: 'Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'Old Task', pic: 'KPMG/Central Team', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, deliverable: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, 'KPMG/Central Team');
  assert.equal(p.tasks[0].pic, '');
});
```

Replace the test `Project does not re-migrate a task that already has owner, even if owner is blank` (same treatment):
```js
test('Project does not re-migrate a task that already has owner, even if owner is blank', () => {
  const p = new Project({
    meta: { id: 'migrated', name: 'Migrated', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'New-Style Task', owner: '', pic: 'Somchai', deliverable: '', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, milestone: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, '');
  assert.equal(p.tasks[0].pic, 'Somchai');
});
```
with:
```js
test('Project does not re-migrate a task that already has owner, even if owner is blank', () => {
  const p = new Project({
    meta: { id: 'migrated', name: 'Migrated', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'New-Style Task', owner: '', pic: 'Somchai', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, deliverable: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, '');
  assert.equal(p.tasks[0].pic, 'Somchai');
});
```

Then add this brand-new test directly after the "does not re-migrate" test above (this is the +1 test from spec §5, and it deliberately models the real-world collision shape — both the dead `deliverable: ''` stub and `milestone: true` present together, exactly like every task in `UAT/ProjectPlanner_UAT.html` today):
```js
test('Project migrates a legacy task with milestone:true to deliverable:true and removes the milestone key', () => {
  const p = new Project({
    meta: { id: 'legacy-deliverable', name: 'Legacy Deliverable', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'Old Milestone Task', owner: 'KPMG', pic: '', deliverable: '', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, milestone: true, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].deliverable, true);
  assert.equal('milestone' in p.tasks[0], false);
});
```

- [ ] **Step 2: Run tests to confirm the expected failures**

Run: `cd project-planner && node --test`

Expected: **FAIL — exactly 2 failing tests** (173 passing, 2 failing, 175 total — the new migration test written in Step 1 already counts toward the total even though it's red; store.js hasn't changed yet):
- `addTasks fills the full task shape with defaults` — fails at `assert.equal(t.deliverable, true)` (actual is still `''`, since `store.js` still writes the dead stub and reads `spec.milestone`, which is now `undefined` because the test input was renamed to `deliverable: true`).
- `Project migrates a legacy task with milestone:true to deliverable:true and removes the milestone key` — fails at `assert.equal(p.tasks[0].deliverable, true)` (actual is still `''`; the migration doesn't exist yet).

(The other 3 renamed tests above don't assert on the deliverable/milestone value at all, so they pass throughout regardless of the field rename — this is expected, not a gap.)

- [ ] **Step 3: Implement the rename and migration in `store.js`**

In the `Project` constructor, change:
```js
      this.tasks.forEach(t => {
        if (t.owner === undefined) {
          t.owner = t.pic || '';
          t.pic = '';
        }
      });
```
to:
```js
      this.tasks.forEach(t => {
        if (t.owner === undefined) {
          t.owner = t.pic || '';
          t.pic = '';
        }
        if (t.milestone !== undefined) {
          t.deliverable = !!t.milestone;
          delete t.milestone;
        }
      });
```

In `addTask`, change:
```js
    addTask({ parentId = null, name = 'New Task', owner = '', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, owner, pic,
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
to:
```js
    addTask({ parentId = null, name = 'New Task', owner = '', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, owner, pic,
        jira: '', remarks: '',
        plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, deliverable: false,
        statusOverride: null, predecessors: [], collapsed: false,
        billingAmount: null, billingStatus: null,
      };
      this.tasks.push(task);
      return task;
    }
```

In `addTasks`, change:
```js
    addTasks(taskSpecs, who) {
      this._pushUndo();
      const created = [];
      taskSpecs.forEach(spec => {
        let parentId = null;
        for (let i = created.length - 1; i >= 0; i--) {
          if (taskSpecs[i]._level < spec._level) {
            parentId = created[i].id;
            break;
          }
        }
        const siblings = this.tasks.filter(t => t.parentId === parentId);
        const task = {
          id: generateId(), parentId, order: siblings.length,
          name: spec.name, owner: spec.owner || '', pic: spec.pic || '',
          deliverable: '', jira: '', remarks: spec.remarks || '',
          plannedStart: spec.plannedStart || null, plannedFinish: spec.plannedFinish || null,
          actualStart: null, actualFinish: null,
          actualPct: 0, weightOverride: null, milestone: !!spec.milestone,
          statusOverride: null, predecessors: spec.predecessors ? spec.predecessors.slice() : [],
          collapsed: false,
          billingAmount: spec.billingAmount != null ? spec.billingAmount : null,
          billingStatus: spec.billingStatus || null,
        };
        this.tasks.push(task);
        created.push(task);
      });
      this._audit(who, null, 'csvImport', null, created.length + ' task(s) imported');
      return created;
    }
```
to (per the correction in the pre-implementation note above — the source expression reads `spec.deliverable`, not `spec.milestone`):
```js
    addTasks(taskSpecs, who) {
      this._pushUndo();
      const created = [];
      taskSpecs.forEach(spec => {
        let parentId = null;
        for (let i = created.length - 1; i >= 0; i--) {
          if (taskSpecs[i]._level < spec._level) {
            parentId = created[i].id;
            break;
          }
        }
        const siblings = this.tasks.filter(t => t.parentId === parentId);
        const task = {
          id: generateId(), parentId, order: siblings.length,
          name: spec.name, owner: spec.owner || '', pic: spec.pic || '',
          jira: '', remarks: spec.remarks || '',
          plannedStart: spec.plannedStart || null, plannedFinish: spec.plannedFinish || null,
          actualStart: null, actualFinish: null,
          actualPct: 0, weightOverride: null, deliverable: !!spec.deliverable,
          statusOverride: null, predecessors: spec.predecessors ? spec.predecessors.slice() : [],
          collapsed: false,
          billingAmount: spec.billingAmount != null ? spec.billingAmount : null,
          billingStatus: spec.billingStatus || null,
        };
        this.tasks.push(task);
        created.push(task);
      });
      this._audit(who, null, 'csvImport', null, created.length + ' task(s) imported');
      return created;
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd project-planner && node --test`
Expected: **PASS — 175/175** (174 baseline + 1 new migration test).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/store.js tests/store.test.js
git commit -m "Rename task.milestone to task.deliverable in store.js, with a migration for legacy saved files"
```

---

### Task 2: `calc.js` computed-field rename

**Files:**
- Modify: `project-planner/src/js/calc.js`
- Test: `project-planner/tests/calc.test.js`
- Test fixture: `project-planner/tests/fixtures/vision-phase.js`

**Interfaces:**
- Consumes: `task.deliverable` (Task 1).
- Produces: per-leaf computed field `isDeliverable` (was `isMilestone`); project-level KPI fields `deliverablesTotal`/`deliverablesComplete` (was `milestonesTotal`/`milestonesComplete`). Task 4 (`gantt.js`, `reports.js`, `app.js`) depends on these exact names.

- [ ] **Step 1: Update the fixture and the failing test**

`tests/fixtures/vision-phase.js` is shared by `calc.test.js` and `integration.test.js`; it has the same dead-`deliverable`-field collision described in the pre-implementation note. `integration.test.js` never asserts on milestone/deliverable fields (confirmed by grep), so only its two object shapes need the same collision fix as Task 1.

Replace the whole file:
```js
function leaf(id, name, pic, plannedStart, plannedFinish, actualPct) {
  return {
    id, parentId: 'phase-1', order: Number(id.split('-')[1]),
    name, pic, deliverable: '', jira: '', remarks: '',
    plannedStart, plannedFinish, actualStart: plannedStart, actualFinish: plannedFinish,
    actualPct, weightOverride: null, milestone: false, statusOverride: null,
    predecessors: [], collapsed: false,
  };
}

const phase = {
  id: 'phase-1', parentId: null, order: 0,
  name: 'Vision & Validate', pic: '', deliverable: '', jira: '', remarks: '',
  plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
  actualPct: 0, weightOverride: null, milestone: false, statusOverride: null,
  predecessors: [], collapsed: false,
};
```
with:
```js
function leaf(id, name, pic, plannedStart, plannedFinish, actualPct) {
  return {
    id, parentId: 'phase-1', order: Number(id.split('-')[1]),
    name, pic, jira: '', remarks: '',
    plannedStart, plannedFinish, actualStart: plannedStart, actualFinish: plannedFinish,
    actualPct, weightOverride: null, deliverable: false, statusOverride: null,
    predecessors: [], collapsed: false,
  };
}

const phase = {
  id: 'phase-1', parentId: null, order: 0,
  name: 'Vision & Validate', pic: '', jira: '', remarks: '',
  plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
  actualPct: 0, weightOverride: null, deliverable: false, statusOverride: null,
  predecessors: [], collapsed: false,
};
```
(leave the rest of the file — `tasks`, `EXPECTED_DURATIONS`, `TOTAL_DURATION`, `module.exports` — unchanged.)

In `tests/calc.test.js`, replace the two leaf-shaped custom task tests (field-key rename only, no assertion changes — neither test reads `isMilestone`/`isDeliverable`):
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
with:
```js
test('recalc: leaf actualPct is derived from actualStart/actualFinish dates, ignoring a stale raw actualPct field', () => {
  const customTasks = [{
    id: 'x-1', parentId: null, order: 0, name: 'X', pic: '',
    plannedStart: '2024-01-01', plannedFinish: '2024-01-31',
    actualStart: null, actualFinish: null, actualPct: 0.9,
    weightOverride: null, deliverable: false, statusOverride: null, predecessors: [],
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
    weightOverride: null, deliverable: false, statusOverride: null, predecessors: [],
  }];
  const { computed } = recalc({ meta: { statusDate: '2024-01-05' }, tasks: customTasks, holidays: [] });
  assert.ok(computed.get('x-1').actualPct < 1);
  assert.notEqual(computed.get('x-1').status, 'Complete');
});
```

Replace the title-only test (no field assertions to rename, cosmetic consistency only):
```js
test('recalc: KPIs count complete/delayed leaves and milestones', () => {
```
with:
```js
test('recalc: KPIs count complete/delayed leaves and deliverables', () => {
```
(body unchanged.)

Replace the KPI-exclusion test — this is the one genuinely red test at Step 2:
```js
test('recalc: KPIs exclude a cancelled milestone from milestonesTotal, not just milestonesComplete', () => {
  const twoMilestones = [
    {
      id: 'm-1', parentId: null, order: 0, name: 'Cancelled Milestone', milestone: true,
      plannedStart: '2024-01-01', plannedFinish: '2024-01-01',
      actualStart: null, actualFinish: null, actualPct: 0,
      weightOverride: null, statusOverride: 'Cancelled', predecessors: [],
    },
    {
      id: 'm-2', parentId: null, order: 1, name: 'Complete Milestone', milestone: true,
      plannedStart: '2024-01-02', plannedFinish: '2024-01-02',
      actualStart: '2024-01-02', actualFinish: '2024-01-02', actualPct: 1,
      weightOverride: null, statusOverride: null, predecessors: [],
    },
  ];
  const { kpis } = recalc(project({ tasks: twoMilestones, meta: { statusDate: '2024-06-01' } }));
  assert.equal(kpis.milestonesTotal, 1);
  assert.equal(kpis.milestonesComplete, 1);
});
```
with:
```js
test('recalc: KPIs exclude a cancelled deliverable from deliverablesTotal, not just deliverablesComplete', () => {
  const twoDeliverables = [
    {
      id: 'm-1', parentId: null, order: 0, name: 'Cancelled Deliverable', deliverable: true,
      plannedStart: '2024-01-01', plannedFinish: '2024-01-01',
      actualStart: null, actualFinish: null, actualPct: 0,
      weightOverride: null, statusOverride: 'Cancelled', predecessors: [],
    },
    {
      id: 'm-2', parentId: null, order: 1, name: 'Complete Deliverable', deliverable: true,
      plannedStart: '2024-01-02', plannedFinish: '2024-01-02',
      actualStart: '2024-01-02', actualFinish: '2024-01-02', actualPct: 1,
      weightOverride: null, statusOverride: null, predecessors: [],
    },
  ];
  const { kpis } = recalc(project({ tasks: twoDeliverables, meta: { statusDate: '2024-06-01' } }));
  assert.equal(kpis.deliverablesTotal, 1);
  assert.equal(kpis.deliverablesComplete, 1);
});
```

- [ ] **Step 2: Run tests to confirm the expected failure**

Run: `cd project-planner && node --test`

Expected: **FAIL — exactly 1 failing test** (174 passing, 1 failing, 175 total):
- `recalc: KPIs exclude a cancelled deliverable from deliverablesTotal, not just deliverablesComplete` — fails at `assert.equal(kpis.deliverablesTotal, 1)` (actual `undefined`; `calc.js` still produces `milestonesTotal`/`milestonesComplete`, not `deliverablesTotal`/`deliverablesComplete`).

(Every other test above only renamed a field key or a title with no dependent assertion, so it passes throughout regardless of `calc.js`; `integration.test.js`, which also imports the fixture, has zero assertions on this field and is unaffected.)

- [ ] **Step 3: Implement the rename in `calc.js`**

Change the per-leaf computed object:
```js
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: true,
        plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        actualStart: t.actualStart, actualFinish: t.actualFinish,
        duration, weight: 0, plannedPctToDate: 0, actualPct,
        status: null, isMilestone: !!t.milestone,
      });
```
to:
```js
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: true,
        plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        actualStart: t.actualStart, actualFinish: t.actualFinish,
        duration, weight: 0, plannedPctToDate: 0, actualPct,
        status: null, isDeliverable: !!t.deliverable,
      });
```

Change the per-parent computed object:
```js
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: false,
        plannedStart, plannedFinish, actualStart, actualFinish,
        duration, weight, plannedPctToDate, actualPct, status, isMilestone: false,
      });
```
to:
```js
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: false,
        plannedStart, plannedFinish, actualStart, actualFinish,
        duration, weight, plannedPctToDate, actualPct, status, isDeliverable: false,
      });
```

Change the `kpis` object:
```js
    const kpis = {
      actualPct: overall.actualPct,
      plannedPct: overall.plannedPctToDate,
      variance: overall.actualPct - overall.plannedPctToDate,
      delayedCount: leafStatuses.filter(s => s === 'Delayed').length,
      completeCount: leafStatuses.filter(s => s === 'Complete').length,
      totalCount: leafStatuses.length,
      milestonesTotal: leafIds.filter(id => !isCancelled(id) && byId.get(id).milestone).length,
      milestonesComplete: leafIds.filter(id => byId.get(id).milestone && computed.get(id).status === 'Complete').length,
      remainingWorkdays: overall.plannedFinish ? remainingWorkdays(statusDate, overall.plannedFinish, holidayDates) : 0,
    };
```
to:
```js
    const kpis = {
      actualPct: overall.actualPct,
      plannedPct: overall.plannedPctToDate,
      variance: overall.actualPct - overall.plannedPctToDate,
      delayedCount: leafStatuses.filter(s => s === 'Delayed').length,
      completeCount: leafStatuses.filter(s => s === 'Complete').length,
      totalCount: leafStatuses.length,
      deliverablesTotal: leafIds.filter(id => !isCancelled(id) && byId.get(id).deliverable).length,
      deliverablesComplete: leafIds.filter(id => byId.get(id).deliverable && computed.get(id).status === 'Complete').length,
      remainingWorkdays: overall.plannedFinish ? remainingWorkdays(statusDate, overall.plannedFinish, holidayDates) : 0,
    };
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd project-planner && node --test`
Expected: **PASS — 175/175** (unchanged from Task 1 — this task adds no new tests).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/calc.js tests/calc.test.js tests/fixtures/vision-phase.js
git commit -m "Rename isMilestone/milestonesTotal/milestonesComplete to isDeliverable/deliverablesTotal/deliverablesComplete in calc.js"
```

---

### Task 3: `filters.js` + `csv.js` rename

**Files:**
- Modify: `project-planner/src/js/filters.js`
- Modify: `project-planner/src/js/csv.js`
- Test: `project-planner/tests/filters.test.js`
- Test: `project-planner/tests/csv.test.js`
- Test (mechanical sweep, no assertion changes): `project-planner/tests/criticalpath.test.js`, `project-planner/tests/workload.test.js`

**Interfaces:**
- Consumes: `task.deliverable` (Task 1).
- Produces: filter key `onlyDeliverable` (was `onlyMilestone`); CSV header column `'Deliverable'` (was `'Milestone'`, same 9th position); parsed CSV row field `deliverable` (was `milestone`) fed into `addTasks` specs (matches Task 1's `spec.deliverable` read). Task 4 (`index.html`, `app.js`) depends on the `onlyDeliverable` key name.

- [ ] **Step 1: Update `filters.test.js` and `csv.test.js`**

In `tests/filters.test.js`, replace:
```js
test('taskMatches: onlyMilestone requires milestone flag', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: '', pic: 'Alice', remarks: '', jira: '', milestone: true };
  const nonMilestone = { id: 't2', parentId: null, name: 'Task', owner: '', pic: 'Alice', remarks: '', jira: '', milestone: false };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyMilestone: true }), true);
  assert.equal(taskMatches(nonMilestone, { status: 'In Progress' }, { onlyMilestone: true }), false);
});
```
with:
```js
test('taskMatches: onlyDeliverable requires deliverable flag', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: '', pic: 'Alice', remarks: '', jira: '', deliverable: true };
  const nonDeliverable = { id: 't2', parentId: null, name: 'Task', owner: '', pic: 'Alice', remarks: '', jira: '', deliverable: false };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyDeliverable: true }), true);
  assert.equal(taskMatches(nonDeliverable, { status: 'In Progress' }, { onlyDeliverable: true }), false);
});
```

Replace:
```js
test('hasActiveFilter is true when only onlyMilestone is set', () => {
  assert.equal(hasActiveFilter({ onlyMilestone: false }), false);
  assert.equal(hasActiveFilter({ onlyMilestone: true }), true);
});
```
with:
```js
test('hasActiveFilter is true when only onlyDeliverable is set', () => {
  assert.equal(hasActiveFilter({ onlyDeliverable: false }), false);
  assert.equal(hasActiveFilter({ onlyDeliverable: true }), true);
});
```

In `tests/csv.test.js`, replace the template-text test:
```js
test('csvTemplateText is the exact 12-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors\n'
  );
});
```
with:
```js
test('csvTemplateText is the exact 12-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Billing Amount,Billing Status,Predecessors\n'
  );
});
```

Replace the shared `HEADER` constant (every other `validateCsvRows` test below references this same constant by name, so this single change is what puts most of them into the expected red state at Step 2 — their own bodies are not otherwise edited):
```js
const HEADER = 'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors';
```
with:
```js
const HEADER = 'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Billing Amount,Billing Status,Predecessors';
```

Replace the valid-file test's field assertions:
```js
test('validateCsvRows accepts a valid file and builds task specs in order', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Phase A,KPMG,,,,,,,,\n' +
    '2,1,Design,KPMG,Alice,2026-07-01,2026-07-10,first cut,,,,\n' +
    '3,1,Build,Client Team,Bob,2026-07-11,2026-07-20,,Y,25000,Invoiced,2\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], {
    _row: 1, _level: 0, name: 'Phase A', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null,
    remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [],
  });
  assert.equal(tasks[1].owner, 'KPMG');
  assert.equal(tasks[1].pic, 'Alice');
  assert.equal(tasks[2].owner, 'Client Team');
  assert.equal(tasks[2].milestone, true);
  assert.equal(tasks[2].billingAmount, 25000);
  assert.equal(tasks[2].billingStatus, 'Invoiced');
  assert.deepEqual(tasks[2].predecessors, [2]);
});
```
with:
```js
test('validateCsvRows accepts a valid file and builds task specs in order', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Phase A,KPMG,,,,,,,,\n' +
    '2,1,Design,KPMG,Alice,2026-07-01,2026-07-10,first cut,,,,\n' +
    '3,1,Build,Client Team,Bob,2026-07-11,2026-07-20,,Y,25000,Invoiced,2\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], {
    _row: 1, _level: 0, name: 'Phase A', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null,
    remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [],
  });
  assert.equal(tasks[1].owner, 'KPMG');
  assert.equal(tasks[1].pic, 'Alice');
  assert.equal(tasks[2].owner, 'Client Team');
  assert.equal(tasks[2].deliverable, true);
  assert.equal(tasks[2].billingAmount, 25000);
  assert.equal(tasks[2].billingStatus, 'Invoiced');
  assert.deepEqual(tasks[2].predecessors, [2]);
});
```

Replace the variants test:
```js
test('validateCsvRows parses milestone variants case-insensitively', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,yes,,,\n' +
    '2,0,B,KPMG,,,,,TRUE,,,\n' +
    '3,0,C,KPMG,,,,,n,,,\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].milestone, true);
  assert.equal(tasks[1].milestone, true);
  assert.equal(tasks[2].milestone, false);
});
```
with:
```js
test('validateCsvRows parses deliverable variants case-insensitively', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,yes,,,\n' +
    '2,0,B,KPMG,,,,,TRUE,,,\n' +
    '3,0,C,KPMG,,,,,n,,,\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].deliverable, true);
  assert.equal(tasks[1].deliverable, true);
  assert.equal(tasks[2].deliverable, false);
});
```

No other test body in `csv.test.js` is edited — the remaining `validateCsvRows` tests (wrong column count, duplicate/non-integer Row numbers, Level jump, empty Task Name/blank Owner/bad dates/bad Billing, whitespace-only Owner, PIC optional, predecessor references, forward predecessor references) reference `HEADER` by name only and go red as a side effect of the `HEADER` constant change above, with no textual change of their own.

- [ ] **Step 2: Run tests to confirm the expected failures**

Run: `cd project-planner && node --test`

Expected: **FAIL — exactly 13 failing tests** (162 passing, 13 failing, 175 total; `filters.js`/`csv.js` haven't changed yet):

`filters.test.js` (2):
- `taskMatches: onlyDeliverable requires deliverable flag` — the `nonDeliverable` assertion expects `false` but `filters.js` still checks the (now absent from the test) `filters.onlyMilestone` key, so the filter never engages and `taskMatches` returns `true`.
- `hasActiveFilter is true when only onlyDeliverable is set` — the `{ onlyDeliverable: true }` case expects `true` but `hasActiveFilter` still only checks `filters.onlyMilestone`.

`csv.test.js` (11) — the header-text test plus every `validateCsvRows` test using the shared `HEADER` constant, since `HEADER` now literally reads `Deliverable` while `CSV_HEADERS` (unchanged until Step 3) still reads `Milestone`, so `validateCsvRows` rejects the header outright on every one of them:
- `csvTemplateText is the exact 12-column header row`
- `validateCsvRows accepts a valid file and builds task specs in order`
- `validateCsvRows rejects wrong column count with the row number`
- `validateCsvRows rejects duplicate and non-integer Row numbers`
- `validateCsvRows rejects a Level jump greater than +1 and a first row above level 0`
- `validateCsvRows rejects empty Task Name, blank Owner, bad dates, bad Billing values`
- `validateCsvRows rejects a whitespace-only Owner the same as a blank one`
- `validateCsvRows leaves PIC optional when Owner is present`
- `validateCsvRows rejects predecessor references to missing rows and to self`
- `validateCsvRows allows forward predecessor references`
- `validateCsvRows parses deliverable variants case-insensitively`

(`validateCsvRows rejects a wrong header row` and `validateCsvRows returns no tasks when any error exists` do not use `HEADER` / only assert `errors.length > 0` regardless of message, so both keep passing throughout — confirmed by inspection, not guessed.)

- [ ] **Step 3: Implement the rename in `filters.js` and `csv.js`**

In `filters.js`, change:
```js
    if (filters.onlyDelayed && computed.status !== 'Delayed') return false;
    if (filters.onlyMilestone && !task.milestone) return false;
    return true;
  }

  function hasActiveFilter(filters) {
    return !!(filters.search || filters.owner || filters.pic || filters.status || filters.onlyDelayed || filters.onlyMilestone);
  }
```
to:
```js
    if (filters.onlyDelayed && computed.status !== 'Delayed') return false;
    if (filters.onlyDeliverable && !task.deliverable) return false;
    return true;
  }

  function hasActiveFilter(filters) {
    return !!(filters.search || filters.owner || filters.pic || filters.status || filters.onlyDelayed || filters.onlyDeliverable);
  }
```

In `csv.js`, change:
```js
  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Milestone', 'Billing Amount', 'Billing Status', 'Predecessors'];
```
to:
```js
  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Deliverable', 'Billing Amount', 'Billing Status', 'Predecessors'];
```

Change:
```js
  const MILESTONE_TRUE = ['y', 'yes', 'true', '1'];
```
to:
```js
  const DELIVERABLE_TRUE = ['y', 'yes', 'true', '1'];
```

Change:
```js
      const milestone = MILESTONE_TRUE.indexOf(c[8].toLowerCase()) !== -1;
```
to:
```js
      const deliverable = DELIVERABLE_TRUE.indexOf(c[8].toLowerCase()) !== -1;
```

Change:
```js
      specs.push({
        _row: rowNum, _level: Number.isInteger(level) && level >= 0 ? level : 0,
        name: c[2], owner: c[3], pic: c[4],
        plannedStart: c[5] || null, plannedFinish: c[6] || null,
        remarks: c[7], milestone,
        billingAmount, billingStatus, predecessors,
      });
```
to:
```js
      specs.push({
        _row: rowNum, _level: Number.isInteger(level) && level >= 0 ? level : 0,
        name: c[2], owner: c[3], pic: c[4],
        plannedStart: c[5] || null, plannedFinish: c[6] || null,
        remarks: c[7], deliverable,
        billingAmount, billingStatus, predecessors,
      });
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd project-planner && node --test`
Expected: **PASS — 175/175** (unchanged from Task 2).

- [ ] **Step 5: Mechanical sweep — `criticalpath.test.js` and `workload.test.js`**

Both files build a full-shaped leaf task object via a local `leaf()` helper that includes `milestone: false` purely for shape-completeness; `computeCriticalPath` and `computeWorkload` never read this field (confirmed: no "milestone" hits in `criticalpath.js`/`workload.js` source). This is a pure identifier sweep with no behavior or assertion change, per spec §3's closing bullet ("every test file currently referencing milestone... `criticalpath.test.js`, `workload.test.js`").

In `tests/criticalpath.test.js`, change:
```js
function leaf(id, plannedStart, plannedFinish, predecessors) {
  return {
    id, parentId: null, order: 0, name: id, pic: '',
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, milestone: false,
    statusOverride: null, predecessors: predecessors || [], collapsed: false,
  };
}
```
to:
```js
function leaf(id, plannedStart, plannedFinish, predecessors) {
  return {
    id, parentId: null, order: 0, name: id, pic: '',
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, deliverable: false,
    statusOverride: null, predecessors: predecessors || [], collapsed: false,
  };
}
```

In `tests/workload.test.js`, change:
```js
function leaf(id, pic, plannedStart, plannedFinish) {
  return {
    id, parentId: null, order: 0, name: id, pic,
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, milestone: false,
    statusOverride: null, predecessors: [], collapsed: false,
  };
}
```
to:
```js
function leaf(id, pic, plannedStart, plannedFinish) {
  return {
    id, parentId: null, order: 0, name: id, pic,
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, deliverable: false,
    statusOverride: null, predecessors: [], collapsed: false,
  };
}
```

Run: `cd project-planner && node --test`
Expected: **PASS — 175/175, unchanged** (this step never had a red state — the field is unread by the code under test in either file).

- [ ] **Step 6: Commit**

```bash
cd project-planner
git add src/js/filters.js src/js/csv.js tests/filters.test.js tests/csv.test.js tests/criticalpath.test.js tests/workload.test.js
git commit -m "Rename the onlyMilestone filter and the CSV Milestone column to Deliverable"
```

---

### Task 4: UI files — mechanical rename (no automated tests)

**Files:**
- Modify: `project-planner/src/js/ui/tree.js`
- Modify: `project-planner/src/js/ui/gantt.js`
- Modify: `project-planner/src/js/ui/billing.js`
- Modify: `project-planner/src/js/ui/dashboard.js`
- Modify: `project-planner/src/js/ui/reports.js`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `task.deliverable` (Task 1), `computed.isDeliverable` (Task 2), `kpis.deliverablesTotal`/`kpis.deliverablesComplete` (Task 2), `filters.onlyDeliverable` (Task 3).
- Produces: no new interfaces — this task only renames presentation-layer identifiers (CSS class `deliverable-marker`, DOM id `only-deliverable-filter`, labels/tooltips) to match. Task 5 verifies all of it live in a browser. UI files have no `node --test` coverage by convention — verification here is `node --check` (syntax only) plus the full suite to prove no engine file regressed.

- [ ] **Step 1: `tree.js` — marker, class, tooltip, context-menu label, and the Duplicate-handler collision fix**

Change the row-marker construction and its use in the row's inner HTML:
```js
      var milestoneMarker = task.milestone ? '<span class="milestone-marker" title="Milestone">&#9670;</span>' : '';
      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren ? ' is-parent' : '');
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + milestoneMarker + escapeHtml(task.name) +
        '</span>' +
```
to:
```js
      var deliverableMarker = task.deliverable ? '<span class="deliverable-marker" title="Deliverable">&#9670;</span>' : '';
      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren ? ' is-parent' : '');
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + deliverableMarker + escapeHtml(task.name) +
        '</span>' +
```

Change the context menu's action list — this also removes the dead `deliverable: task.deliverable` line from the Duplicate handler per the pre-implementation collision note (preserves today's behavior: Duplicate does not propagate the flag onto the copy):
```js
    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var actions = [
      ['New Task', function () { state.project.addTask({ parentId: task.parentId, name: 'New Task' }); }],
      ['New Child', function () { state.project.addTask({ parentId: id, name: 'New Task' }); }],
      ['Duplicate', function () {
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', owner: task.owner, pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          deliverable: task.deliverable, remarks: task.remarks,
        }, state.currentUser);
      }],
      ['Delete', function () { state.project.deleteTask(id, state.currentUser); }],
      ['Indent', function () { state.project.indent(id, state.currentUser); }],
      ['Outdent', function () { state.project.outdent(id, state.currentUser); }],
      [task.milestone ? '✓ Milestone (click to unset)' : 'Mark as Milestone', function () { state.project.updateTask(id, { milestone: !task.milestone }, state.currentUser); }],
    ];
```
to:
```js
    var task = state.project.tasks.find(function (t) { return t.id === id; });
    var actions = [
      ['New Task', function () { state.project.addTask({ parentId: task.parentId, name: 'New Task' }); }],
      ['New Child', function () { state.project.addTask({ parentId: id, name: 'New Task' }); }],
      ['Duplicate', function () {
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', owner: task.owner, pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          remarks: task.remarks,
        }, state.currentUser);
      }],
      ['Delete', function () { state.project.deleteTask(id, state.currentUser); }],
      ['Indent', function () { state.project.indent(id, state.currentUser); }],
      ['Outdent', function () { state.project.outdent(id, state.currentUser); }],
      [task.deliverable ? '✓ Deliverable (click to unset)' : 'Mark as Deliverable', function () { state.project.updateTask(id, { deliverable: !task.deliverable }, state.currentUser); }],
    ];
```

- [ ] **Step 2: `gantt.js` — the diamond-render condition**

Change:
```js
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
```
to:
```js
      if (computed.isDeliverable) {
        var cx = x1 + barWidth / 2;
        var cy = y + BAR_HEIGHT / 2;
        var r = BAR_HEIGHT / 2;
        svg.appendChild(svgEl('polygon', {
          points: [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy].join(','),
          fill: 'var(--kpmg-blue)',
        }));
        return;
      }
```

- [ ] **Step 3: `billing.js` — field, local variable names, and empty-state copy**

Change the whole `renderBilling` function:
```js
  function renderBilling(state) {
    var body = document.getElementById('billing-body');
    body.innerHTML = '';

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var milestones = state.project.tasks.filter(function (t) { return t.milestone; });

    if (!milestones.length) {
      body.textContent = 'No milestone tasks yet — billing only applies to tasks flagged as milestones.';
      return;
    }

    var table = document.createElement('table');
    table.className = 'billing-table';
    var headerRow = document.createElement('tr');
    ['WBS', 'Task', 'Owner', 'PIC', 'Billing Amount', 'Billing Status'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    milestones.forEach(function (task) {
      var computed = state.calc.computed.get(task.id);
      var tr = document.createElement('tr');
      tr.dataset.id = task.id;

      var wbsTd = document.createElement('td');
      wbsTd.textContent = computed ? computed.wbs : '';
      tr.appendChild(wbsTd);

      var nameTd = document.createElement('td');
      nameTd.textContent = task.name;
      tr.appendChild(nameTd);

      var ownerTd = document.createElement('td');
      ownerTd.textContent = task.owner || '';
      tr.appendChild(ownerTd);

      var picTd = document.createElement('td');
      picTd.textContent = task.pic || '';
      tr.appendChild(picTd);

      var amountTd = document.createElement('td');
      var amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.value = task.billingAmount != null ? task.billingAmount : '';
      amountInput.dataset.field = 'billingAmount';
      amountTd.appendChild(amountInput);
      tr.appendChild(amountTd);

      var statusTd = document.createElement('td');
      var statusSelect = document.createElement('select');
      statusSelect.dataset.field = 'billingStatus';
      BILLING_STATUSES.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (task.billingStatus === opt) option.selected = true;
        statusSelect.appendChild(option);
      });
      statusTd.appendChild(statusSelect);
      tr.appendChild(statusTd);

      table.appendChild(tr);
    });

    body.appendChild(table);
  }
```
to:
```js
  function renderBilling(state) {
    var body = document.getElementById('billing-body');
    body.innerHTML = '';

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var deliverables = state.project.tasks.filter(function (t) { return t.deliverable; });

    if (!deliverables.length) {
      body.textContent = 'No deliverable tasks yet — billing only applies to tasks flagged as deliverables.';
      return;
    }

    var table = document.createElement('table');
    table.className = 'billing-table';
    var headerRow = document.createElement('tr');
    ['WBS', 'Task', 'Owner', 'PIC', 'Billing Amount', 'Billing Status'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    deliverables.forEach(function (task) {
      var computed = state.calc.computed.get(task.id);
      var tr = document.createElement('tr');
      tr.dataset.id = task.id;

      var wbsTd = document.createElement('td');
      wbsTd.textContent = computed ? computed.wbs : '';
      tr.appendChild(wbsTd);

      var nameTd = document.createElement('td');
      nameTd.textContent = task.name;
      tr.appendChild(nameTd);

      var ownerTd = document.createElement('td');
      ownerTd.textContent = task.owner || '';
      tr.appendChild(ownerTd);

      var picTd = document.createElement('td');
      picTd.textContent = task.pic || '';
      tr.appendChild(picTd);

      var amountTd = document.createElement('td');
      var amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.value = task.billingAmount != null ? task.billingAmount : '';
      amountInput.dataset.field = 'billingAmount';
      amountTd.appendChild(amountInput);
      tr.appendChild(amountTd);

      var statusTd = document.createElement('td');
      var statusSelect = document.createElement('select');
      statusSelect.dataset.field = 'billingStatus';
      BILLING_STATUSES.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (task.billingStatus === opt) option.selected = true;
        statusSelect.appendChild(option);
      });
      statusTd.appendChild(statusSelect);
      tr.appendChild(statusTd);

      table.appendChild(tr);
    });

    body.appendChild(table);
  }
```
(`wireBilling` is untouched — it never references milestone/deliverable.)

- [ ] **Step 4: `dashboard.js` — section heading, local variable names, and the two `task.milestone` checks**

Change the "Upcoming Milestones" section block:
```js
    var milestoneSection = document.createElement('div');
    milestoneSection.className = 'dashboard-section';
    var milestoneTitle = document.createElement('h3');
    milestoneTitle.textContent = 'Upcoming Milestones (14 days)';
    milestoneSection.appendChild(milestoneTitle);
    var statusDate = state.project.meta.statusDate;
    var horizonISO = PP.toISO(PP.parseISO(statusDate) + 14 * 86400000);
    var upcomingList = document.createElement('ul');
    upcomingList.className = 'dashboard-list';
    calc.order.forEach(function (id) {
      var task = byId.get(id);
      if (!task.milestone) return;
      var computed = calc.computed.get(id);
      if (!computed.plannedFinish) return;
      if (computed.plannedFinish >= statusDate && computed.plannedFinish <= horizonISO) {
        var li = document.createElement('li');
        li.textContent = computed.plannedFinish + ' — ' + task.name;
        upcomingList.appendChild(li);
      }
    });
    if (!upcomingList.children.length) {
      var none = document.createElement('li');
      none.textContent = 'None in range';
      upcomingList.appendChild(none);
    }
    milestoneSection.appendChild(upcomingList);
    container.appendChild(milestoneSection);
```
to:
```js
    var deliverableSection = document.createElement('div');
    deliverableSection.className = 'dashboard-section';
    var deliverableTitle = document.createElement('h3');
    deliverableTitle.textContent = 'Upcoming Deliverables (14 days)';
    deliverableSection.appendChild(deliverableTitle);
    var statusDate = state.project.meta.statusDate;
    var horizonISO = PP.toISO(PP.parseISO(statusDate) + 14 * 86400000);
    var upcomingList = document.createElement('ul');
    upcomingList.className = 'dashboard-list';
    calc.order.forEach(function (id) {
      var task = byId.get(id);
      if (!task.deliverable) return;
      var computed = calc.computed.get(id);
      if (!computed.plannedFinish) return;
      if (computed.plannedFinish >= statusDate && computed.plannedFinish <= horizonISO) {
        var li = document.createElement('li');
        li.textContent = computed.plannedFinish + ' — ' + task.name;
        upcomingList.appendChild(li);
      }
    });
    if (!upcomingList.children.length) {
      var none = document.createElement('li');
      none.textContent = 'None in range';
      upcomingList.appendChild(none);
    }
    deliverableSection.appendChild(upcomingList);
    container.appendChild(deliverableSection);
```

Change the billing-rollup check:
```js
    state.project.tasks.forEach(function (t) {
      if (!t.milestone || t.billingAmount == null) return;
      var key = t.billingStatus || 'Not Billed';
      billingTotals[key] = (billingTotals[key] || 0) + t.billingAmount;
      grandTotal += t.billingAmount;
    });
```
to:
```js
    state.project.tasks.forEach(function (t) {
      if (!t.deliverable || t.billingAmount == null) return;
      var key = t.billingStatus || 'Not Billed';
      billingTotals[key] = (billingTotals[key] || 0) + t.billingAmount;
      grandTotal += t.billingAmount;
    });
```

- [ ] **Step 5: `reports.js` — Executive Dashboard KPI row**

Change:
```js
    var kpis = state.calc.kpis;
    var kpiRow = el('div', { class: 'report-kpi-row' }, [
      ['Actual', pct(kpis.actualPct)], ['Plan', pct(kpis.plannedPct)],
      ['Delayed', String(kpis.delayedCount)], ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Milestones', kpis.milestonesComplete + '/' + kpis.milestonesTotal],
    ].map(function (pair) { return el('div', { class: 'report-kpi' }, [pair[0] + ': ' + pair[1]]); }));
```
to:
```js
    var kpis = state.calc.kpis;
    var kpiRow = el('div', { class: 'report-kpi-row' }, [
      ['Actual', pct(kpis.actualPct)], ['Plan', pct(kpis.plannedPct)],
      ['Delayed', String(kpis.delayedCount)], ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Deliverables', kpis.deliverablesComplete + '/' + kpis.deliverablesTotal],
    ].map(function (pair) { return el('div', { class: 'report-kpi' }, [pair[0] + ': ' + pair[1]]); }));
```

- [ ] **Step 6: `app.js` — header KPI card, filter listener, and default filter state**

Change the header KPI cards array:
```js
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
```
to:
```js
    var kpis = state.calc.kpis;
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var cards = [
      ['Actual', pct(kpis.actualPct)],
      ['Plan', pct(kpis.plannedPct)],
      ['Variance', pct(kpis.variance)],
      ['Delayed', String(kpis.delayedCount)],
      ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Deliverables', kpis.deliverablesComplete + '/' + kpis.deliverablesTotal],
      ['Remaining days', String(kpis.remainingWorkdays)],
    ];
```

Change the filter checkbox listener:
```js
    document.getElementById('only-milestone-filter').addEventListener('change', function (e) {
      state.filters.onlyMilestone = e.target.checked;
      onFilterChange();
    });
```
to:
```js
    document.getElementById('only-deliverable-filter').addEventListener('change', function (e) {
      state.filters.onlyDeliverable = e.target.checked;
      onFilterChange();
    });
```

Change the initial filters state in `boot()`:
```js
      filters: { search: '', owner: '', pic: '', status: '', onlyDelayed: false, onlyMilestone: false },
```
to:
```js
      filters: { search: '', owner: '', pic: '', status: '', onlyDelayed: false, onlyDeliverable: false },
```

- [ ] **Step 7: `index.html` — filter checkbox id and label**

Change:
```html
    <label><input type="checkbox" id="only-milestone-filter"> Only milestones</label>
```
to:
```html
    <label><input type="checkbox" id="only-deliverable-filter"> Only deliverables</label>
```

- [ ] **Step 8: `layout.css` — marker class rename**

Change:
```css
.milestone-marker { color: var(--kpmg-blue); font-size: 10px; margin-right: 4px; }
```
to:
```css
.deliverable-marker { color: var(--kpmg-blue); font-size: 10px; margin-right: 4px; }
```

- [ ] **Step 9: Syntax-check, build, and run the full suite**

```bash
cd project-planner
node --check src/js/ui/tree.js
node --check src/js/ui/gantt.js
node --check src/js/ui/billing.js
node --check src/js/ui/dashboard.js
node --check src/js/ui/reports.js
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: every `node --check` prints nothing (clean); build succeeds; **175/175 pass** (this task touches no engine/logic file, so the count from Task 3 must be unchanged). Also confirm the sweep is complete: `grep -rniE "milestone" src/` should now return zero hits (the only remaining occurrence of the literal string "Milestone" anywhere in `src/` before this task was these UI files; after this task nothing should remain except the unrelated `store.test.js:266` task name, which lives in `tests/`, not `src/`).

- [ ] **Step 10: Commit**

```bash
cd project-planner
git add src/js/ui/tree.js src/js/ui/gantt.js src/js/ui/billing.js src/js/ui/dashboard.js src/js/ui/reports.js src/js/ui/app.js src/index.html src/css/layout.css
git commit -m "Rename Milestone to Deliverable across the UI (tree, gantt, billing, dashboard, reports, app, index.html, layout.css)"
```

---

### Task 5: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a bug is found — in which case fix it in the specific file identified, re-run `python3 build.py && node --test`, and repeat verification from the relevant step).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd project-planner
python3 build.py
node --test
```
Expected: **175/175 tests pass** (the exact final count established across Tasks 1–3 — confirm it matches, don't assume).

Also run `grep -rniE "milestone" src/ tests/` and confirm exactly one hit: `tests/store.test.js` — the unrelated `p.addTask({ parentId: null, name: 'Milestone' })` task name called out in the pre-implementation note. Any other hit means a step in Tasks 1–4 was missed.

- [ ] **Step 2: Serve and load the freshly built app**

```bash
cd project-planner/dist
python3 -m http.server 8934
```
Navigate to `http://localhost:8934/ProjectPlanner.html`. Confirm it boots to an empty seed project with no console errors.

- [ ] **Step 3: Diamond marker in the Plan tree**

Add a task ("+ Add Task"), right-click it, confirm the context menu shows "Mark as Deliverable" (not "Mark as Milestone"). Click it. Confirm:
- The menu, reopened, now shows "✓ Deliverable (click to unset)".
- The tree row now shows a ♦ diamond marker immediately before the task name, with a `<span class="deliverable-marker" title="Deliverable">` (verify via `browser_evaluate` reading `document.querySelector('.deliverable-marker').title === 'Deliverable'`) — same glyph/position as before this rename, only the class and tooltip text changed.

- [ ] **Step 4: Gantt diamond**

Give the flagged task a planned start/finish (so it has a date span), switch to the Gantt tab. Confirm the task renders as a diamond (SVG `<polygon>`) rather than a bar — same visual as before, driven now by `computed.isDeliverable`.

- [ ] **Step 5: "Only deliverables" filter**

Add a second, unflagged task. In the toolbar, check "Only deliverables" (`#only-deliverable-filter`). Confirm the tree narrows to just the flagged task (and its ancestors, per `computeVisibleRows`); the unflagged task disappears. Uncheck it — confirm both tasks reappear.

- [ ] **Step 6: CSV header and round-trip (including Thai text, per this project's standing UTF-8 requirement)**

Click "Export CSV" template/download and confirm the header row's 9th column reads `Deliverable` (not `Milestone`). Build a small CSV with a UTF-8 BOM containing one Thai-named task with the Deliverable column set to `Y`, e.g.:
```
Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Billing Amount,Billing Status,Predecessors
1,0,ส่งมอบเอกสาร,KPMG,,2026-08-01,2026-08-05,,Y,,,
```
Import it. Confirm the imported task renders with the ♦ diamond marker and the Thai task name displays correctly (not mojibake). Export CSV again and confirm the round-tripped row still has `Y`-equivalent content in the Deliverable column and the Thai text is intact.

- [ ] **Step 7: Real legacy-data migration check, using the actual UAT file**

Extract the embedded legacy project JSON (raw `milestone: true`/`false` data, no `deliverable` boolean yet) from the real UAT file without modifying it:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('/Users/peemmacmini/Documents/Work/KPMG Related/UAT/ProjectPlanner_UAT.html', 'utf8');
const m = html.match(/<script type=\"application\/json\" id=\"project-data\">([\s\S]*?)<\/script>/);
fs.writeFileSync('/tmp/uat-migration-check.json', m[1], 'utf8');
console.log('wrote', m[1].length, 'bytes');
"
```
This file has 222 tasks, 7 of which have `"milestone": true` (verified while researching this plan) and all 222 of which additionally have the dead `"deliverable": ""` stub described in the pre-implementation note — i.e., it exercises the exact real-world collision this plan resolves, not a synthetic simplification.

In the browser (still on the freshly built `dist/ProjectPlanner.html`), click "Load Project", use `browser_file_upload` to supply `/tmp/uat-migration-check.json`, confirm the "unsaved changes" prompt (if dirty from Steps 3–6) is handled, and the project loads. Then via `browser_evaluate`, confirm:
- Every task in `state.project.tasks` has `'milestone' in t === false` (the old key is gone from all 222).
- Exactly 7 tasks have `t.deliverable === true`, matching the 7 legacy `milestone: true` tasks.
- The Plan tree renders exactly 7 `.deliverable-marker` elements (`document.querySelectorAll('.deliverable-marker').length === 7`).

Confirm the original file at `UAT/ProjectPlanner_UAT.html` was only read, never overwritten (per spec §6 — rebuilding the UAT files is a separate, later step, not part of this plan).

- [ ] **Step 8: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected). Then run:
```bash
cd project-planner
node --test
```
Confirm the same 175/175 count from Step 1 still passes.

- [ ] **Step 9: Record the result**

If every check in Steps 1–8 passes, this plan is complete — **no commit needed for this task**. If any check fails, that is a real bug in one of Tasks 1–4: fix it in the corresponding file, re-run `python3 build.py && node --test`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: `task.milestone` no longer exists anywhere in the codebase — every task, computed field, filter key, CSS class, CSV column, and UI label uses `deliverable`/`Deliverable` instead, with the same ♦ diamond glyph and identical behavior throughout. Every existing saved project and both UAT files continue to load correctly via the `Project` constructor's migration. Final test count: **174 (baseline) → 175 (baseline + 1 new migration test in Task 1, added in no subsequent task)**, confirmed passing task-by-task and again in Task 5's final sweep.
