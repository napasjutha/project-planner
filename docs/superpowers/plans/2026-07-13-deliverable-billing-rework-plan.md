# Deliverable/Billing Tab Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Billing tab (per-task `billingAmount`/`billingStatus` on deliverable-flagged tasks) with a many-to-one **Billing Milestone** entity (`project.billingMilestones`) that deliverable tasks link to via a new `task.billingMilestoneId` field, including a migration for existing per-task billing data and a searchable-checklist picker UI for assigning deliverables to a billing milestone.

**Architecture:** Task 1 rewrites `store.js`'s data model: adds `project.billingMilestones`, `task.billingMilestoneId`, a third constructor migration block, and four new `Project` methods (`addBillingMilestone`, `updateBillingMilestone`, `deleteBillingMilestone`, `assignDeliverablesToBillingMilestone`) — all Node-tested. Task 2 shrinks `csv.js`'s import template from 12 to 10 columns, dropping the now-obsolete Billing Amount/Billing Status columns — also Node-tested. Task 3 rewrites the Billing tab UI (`billing.js`): a Billing Milestones list with inline-editable name/amount/status and an "Assign Deliverables" button per row, an Unassigned Deliverables list, a new `deliverable-picker.js` file (a searchable checklist modeled directly on the existing `predecessor-picker.js`), plus a small cleanup of `dashboard.js`'s now-broken per-task Billing Summary section — all UI files, unverified by `node --test` per this repo's convention. Task 4 is controller-run Playwright verification of the full assign/reassign/delete/migration flow.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- New top-level collection on `Project`, alongside `holidays`/`picList`/`snapshots`: `project.billingMilestones = [{ id, name, amount, status }]`.
- `task.billingMilestoneId` (nullable string) replaces the old `task.billingAmount`/`task.billingStatus` fields — meaningful only when `task.deliverable === true`, pointing at one entry in `project.billingMilestones`. A billing milestone can have zero, one, or many deliverable tasks pointing at it (many-to-one); a deliverable task points at at most one billing milestone (or none, if unassigned).
- `billingStatus` values stay the same set already in use today (`'Not Billed'`, `'Invoiced'`, `'Paid'`) — this rework changes *where* status/amount live, not the status vocabulary.
- Migration (Project constructor, third migration block alongside owner/pic and milestone/deliverable): for every task where `billingAmount != null || billingStatus != null`, create one new `billingMilestones` entry (`name` = the task's own name, `amount`/`status` copied across), set that task's `billingMilestoneId` to the new entry's id, then delete the task's `billingAmount`/`billingStatus` fields. This is 1:1 today (each previously-flagged task becomes its own billing milestone with itself as the sole linked deliverable). No existing billing data is lost.
- Assigning deliverables: a picker (same UI pattern as `predecessor-picker.js` — a searchable checklist) lists every task where `deliverable === true`. Checking a deliverable elsewhere unlinks it from any other milestone it was previously assigned to (a deliverable belongs to at most one billing milestone).
- Unassigned deliverables (tasks with `deliverable === true` and no `billingMilestoneId`) are always visible in their own section so nothing accidentally falls through the cracks.
- Deleting a billing milestone clears `billingMilestoneId` on every task that pointed to it (they become unassigned again, not deleted).
- Out of scope (per spec §6): any change to how a task becomes `deliverable`; billing totals/rollups feeding the Dashboard or S-Curve. This plan removes the Dashboard's now-broken per-task Billing Summary section (its source fields are deleted by the migration) but does not build a replacement rollup — that is explicitly not requested.
- UI files (`src/js/ui/*.js`) have no automated test coverage by this project's standing convention — verified only via controller-run Playwright checks, not `node --test`.
- This plan depends on the Milestone-to-Deliverable rename plan being merged to main first (needs `task.deliverable`/`isDeliverable`). It has no dependency on the Issues/Risks/Decisions or Activities/Calendar plans, which can be built in parallel on separate branches.
- Baseline: confirm via `node --test` at execution start — expected to be the Milestone-to-Deliverable rename plan's final count once that plan has merged to main (do not assume a specific number; verify). This plan's own tasks add exactly 13 new tests on top of that verified baseline (all in Task 1; Task 2 modifies existing CSV coverage without adding new test cases; Tasks 3-4 touch no Node-tested files).

---

### Task 1: Data model — `billingMilestones`, `billingMilestoneId`, migration, and CRUD methods (`store.js`)

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: `task.deliverable` (boolean, from the already-merged Milestone→Deliverable rename plan) and its constructor migration block, assumed already present as the second block inside `Project`'s constructor `this.tasks.forEach(...)` (the first being the pre-existing owner/pic migration). This task adds a third block to that same `forEach`, after it.
- Produces: `project.billingMilestones` (array of `{ id, name, amount, status }`), `task.billingMilestoneId` (nullable string, defaulted by `addTask`/`addTasks`), `generateBillingMilestoneId()` (internal helper, ids prefixed `bm_`), `Project#addBillingMilestone()`, `Project#updateBillingMilestone(id, patch, who)`, `Project#deleteBillingMilestone(id, who)`, `Project#assignDeliverablesToBillingMilestone(billingMilestoneId, taskIds, who)`. Tasks 2 and 3 depend on these exact names and signatures.

- [ ] **Step 1: Confirm the baseline**

Run: `cd "project-planner" && node --test`
Expected: all tests pass. Record the exact count `N` printed (`ℹ pass N`) — this is the verified baseline from the merged Milestone→Deliverable rename plan. Do not assume a specific number.

- [ ] **Step 2: Write the failing tests**

In `project-planner/tests/store.test.js`, replace this existing test:

```js
test('addTask defaults billingAmount and billingStatus to null', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Milestone' });
  assert.equal(t.billingAmount, null);
  assert.equal(t.billingStatus, null);
});
```

with:

```js
test('addTask defaults billingMilestoneId to null', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Deliverable' });
  assert.equal(t.billingMilestoneId, null);
});
```

In the existing test `'addTasks fills the full task shape with defaults'`, replace only its last two assertion lines:

```js
  assert.equal(t.billingAmount, 500);
  assert.equal(t.billingStatus, 'Paid');
});
```

with:

```js
  assert.equal(t.billingMilestoneId, null);
});
```

Then add these new tests anywhere in the file (e.g. after the edited `'addTasks fills the full task shape with defaults'` test):

```js
test('Project.empty creates a project with an empty billingMilestones array', () => {
  const p = Project.empty('Test');
  assert.deepEqual(p.billingMilestones, []);
});

test('addBillingMilestone creates a blank entry and pushes an undo checkpoint', () => {
  const p = Project.empty('Test');
  const undoStackBefore = p._undoStack.length;
  const bm = p.addBillingMilestone();
  assert.equal(p.billingMilestones.length, 1);
  assert.equal(bm.name, 'New Billing Milestone');
  assert.equal(bm.amount, null);
  assert.equal(bm.status, 'Not Billed');
  assert.match(bm.id, /^bm_/);
  assert.equal(p._undoStack.length, undoStackBefore + 1);
});

test('updateBillingMilestone updates name/amount/status and records audit entries', () => {
  const p = Project.empty('Test');
  const bm = p.addBillingMilestone();
  p.updateBillingMilestone(bm.id, { name: 'Phase 1 Sign-off', amount: 500000, status: 'Invoiced' }, 'Alice');
  const updated = p.billingMilestones.find(b => b.id === bm.id);
  assert.equal(updated.name, 'Phase 1 Sign-off');
  assert.equal(updated.amount, 500000);
  assert.equal(updated.status, 'Invoiced');
  assert.equal(p.auditLog.length, 3);
  assert.equal(p.auditLog[0].who, 'Alice');
  assert.equal(p.auditLog[0].taskId, bm.id);
});

test('updateBillingMilestone throws for an unknown id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateBillingMilestone('missing', { name: 'X' }, 'Alice'));
});

test('deleteBillingMilestone removes the entry and unassigns (not deletes) its linked tasks', () => {
  const p = Project.empty('Test');
  const bm = p.addBillingMilestone();
  const t1 = p.addTask({ parentId: null, name: 'Deliverable A' });
  const t2 = p.addTask({ parentId: null, name: 'Deliverable B' });
  p.assignDeliverablesToBillingMilestone(bm.id, [t1.id, t2.id], 'Alice');
  p.deleteBillingMilestone(bm.id, 'Alice');
  assert.equal(p.billingMilestones.length, 0);
  assert.equal(p.tasks.length, 2);
  assert.equal(p.tasks.find(t => t.id === t1.id).billingMilestoneId, null);
  assert.equal(p.tasks.find(t => t.id === t2.id).billingMilestoneId, null);
});

test('deleteBillingMilestone throws for an unknown id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.deleteBillingMilestone('missing', 'Alice'));
});

test('assignDeliverablesToBillingMilestone links the given tasks and unlinks any previously-linked task left out of a later call to the same milestone', () => {
  const p = Project.empty('Test');
  const bmA = p.addBillingMilestone();
  const t1 = p.addTask({ parentId: null, name: 'Deliverable A' });
  const t2 = p.addTask({ parentId: null, name: 'Deliverable B' });
  const t3 = p.addTask({ parentId: null, name: 'Deliverable C' });
  p.assignDeliverablesToBillingMilestone(bmA.id, [t1.id, t2.id, t3.id], 'Alice');
  assert.equal(p.tasks.find(t => t.id === t1.id).billingMilestoneId, bmA.id);
  assert.equal(p.tasks.find(t => t.id === t2.id).billingMilestoneId, bmA.id);
  assert.equal(p.tasks.find(t => t.id === t3.id).billingMilestoneId, bmA.id);

  p.assignDeliverablesToBillingMilestone(bmA.id, [t1.id, t3.id], 'Alice');
  assert.equal(p.tasks.find(t => t.id === t1.id).billingMilestoneId, bmA.id);
  assert.equal(p.tasks.find(t => t.id === t2.id).billingMilestoneId, null);
  assert.equal(p.tasks.find(t => t.id === t3.id).billingMilestoneId, bmA.id);
});

test('assignDeliverablesToBillingMilestone moves a deliverable from one milestone to another without duplicating it', () => {
  const p = Project.empty('Test');
  const bmA = p.addBillingMilestone();
  const bmB = p.addBillingMilestone();
  const t1 = p.addTask({ parentId: null, name: 'Deliverable A' });
  p.assignDeliverablesToBillingMilestone(bmA.id, [t1.id], 'Alice');
  assert.equal(p.tasks.find(t => t.id === t1.id).billingMilestoneId, bmA.id);

  p.assignDeliverablesToBillingMilestone(bmB.id, [t1.id], 'Alice');
  assert.equal(p.tasks.find(t => t.id === t1.id).billingMilestoneId, bmB.id);
  const linkedToA = p.tasks.filter(t => t.billingMilestoneId === bmA.id);
  assert.equal(linkedToA.length, 0);
});

test('assignDeliverablesToBillingMilestone applies as a single undo checkpoint', () => {
  const p = Project.empty('Test');
  const bm = p.addBillingMilestone();
  const t1 = p.addTask({ parentId: null, name: 'Deliverable A' });
  const t2 = p.addTask({ parentId: null, name: 'Deliverable B' });
  const undoStackBefore = p._undoStack.length;
  p.assignDeliverablesToBillingMilestone(bm.id, [t1.id, t2.id], 'Alice');
  assert.equal(p._undoStack.length, undoStackBefore + 1);
  p.undo();
  assert.equal(p.tasks.find(t => t.id === t1.id).billingMilestoneId, null);
  assert.equal(p.tasks.find(t => t.id === t2.id).billingMilestoneId, null);
});

test('undo restores a deleted billing milestone (billingMilestones survives undo/redo snapshots)', () => {
  const p = Project.empty('Test');
  const bm = p.addBillingMilestone();
  p.updateBillingMilestone(bm.id, { name: 'Phase 1 Sign-off' }, 'Alice');
  p.deleteBillingMilestone(bm.id, 'Alice');
  assert.equal(p.billingMilestones.length, 0);
  p.undo();
  assert.equal(p.billingMilestones.length, 1);
  assert.equal(p.billingMilestones[0].name, 'Phase 1 Sign-off');
  p.redo();
  assert.equal(p.billingMilestones.length, 0);
});
```

Then add these migration tests near the existing `'Project migrates a legacy task...'` / `'Project does not re-migrate...'` tests:

```js
test('Project migration converts a legacy task with billingAmount/billingStatus into a new billing milestone', () => {
  const p = new Project({
    meta: { id: 'legacy-billing', name: 'Legacy Billing', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{
      id: 't1', parentId: null, order: 0, name: 'Phase 1 Sign-off', owner: 'KPMG', pic: '',
      deliverable: true, jira: '', remarks: '', plannedStart: null, plannedFinish: null,
      actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null,
      statusOverride: null, predecessors: [], collapsed: false,
      billingAmount: 500000, billingStatus: 'Invoiced',
    }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.billingMilestones.length, 1);
  const bm = p.billingMilestones[0];
  assert.equal(bm.name, 'Phase 1 Sign-off');
  assert.equal(bm.amount, 500000);
  assert.equal(bm.status, 'Invoiced');
  assert.equal(p.tasks[0].billingMilestoneId, bm.id);
  assert.equal('billingAmount' in p.tasks[0], false);
  assert.equal('billingStatus' in p.tasks[0], false);
});

test('Project migration defaults billingMilestoneId to null for a task with no legacy billing fields', () => {
  const p = new Project({
    meta: { id: 'no-billing', name: 'No Billing', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{
      id: 't1', parentId: null, order: 0, name: 'Plain Task', owner: 'KPMG', pic: '',
      deliverable: false, jira: '', remarks: '', plannedStart: null, plannedFinish: null,
      actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null,
      statusOverride: null, predecessors: [], collapsed: false,
      billingAmount: null, billingStatus: null,
    }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.billingMilestones.length, 0);
  assert.equal(p.tasks[0].billingMilestoneId, null);
});

test('Project migration creates one billing milestone per previously-flagged task (1:1), not a shared one', () => {
  const p = new Project({
    meta: { id: 'two-legacy', name: 'Two Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [
      {
        id: 't1', parentId: null, order: 0, name: 'Deliverable A', owner: 'KPMG', pic: '',
        deliverable: true, jira: '', remarks: '', plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null,
        statusOverride: null, predecessors: [], collapsed: false,
        billingAmount: 100000, billingStatus: 'Not Billed',
      },
      {
        id: 't2', parentId: null, order: 1, name: 'Deliverable B', owner: 'KPMG', pic: '',
        deliverable: true, jira: '', remarks: '', plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null,
        statusOverride: null, predecessors: [], collapsed: false,
        billingAmount: 200000, billingStatus: 'Paid',
      },
    ],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.billingMilestones.length, 2);
  const bmForT1 = p.billingMilestones.find(b => b.id === p.tasks[0].billingMilestoneId);
  const bmForT2 = p.billingMilestones.find(b => b.id === p.tasks[1].billingMilestoneId);
  assert.notEqual(bmForT1.id, bmForT2.id);
  assert.equal(bmForT1.name, 'Deliverable A');
  assert.equal(bmForT1.amount, 100000);
  assert.equal(bmForT2.name, 'Deliverable B');
  assert.equal(bmForT2.amount, 200000);
});
```

Note: existing fixtures in `'addTasks builds hierarchy from _level...'`, `'addTasks appends after existing root tasks...'`, `'Project migrates a legacy task...'`, and `'Project does not re-migrate...'` still contain leftover `billingAmount: null, billingStatus: null` keys in their input literals. Leave them untouched — `addTasks` will no longer read `spec.billingAmount`/`spec.billingStatus` after Step 4 below, and the migration's `!= null` check treats two `null` values as "nothing to migrate," so these extra keys are harmless and require no edit.

- [ ] **Step 3: Run tests to verify the new/changed ones fail**

Run: `cd "project-planner" && node --test`
Expected: FAILs on `p.addBillingMilestone is not a function`, `p.updateBillingMilestone is not a function`, `p.deleteBillingMilestone is not a function`, `p.assignDeliverablesToBillingMilestone is not a function`, and `t.billingMilestoneId` being `undefined` instead of `null`. All previously-passing tests still pass.

- [ ] **Step 4: Implement the data model changes**

In `project-planner/src/js/store.js`, add a new id generator right after `generateId()`:

```js
  function generateId() {
    return 't_' + Math.random().toString(36).slice(2, 10);
  }

  function generateBillingMilestoneId() {
    return 'bm_' + Math.random().toString(36).slice(2, 10);
  }
```

Change the constructor to add `billingMilestones` and a third migration block. Change:

```js
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this._undoStack = [];
      this._redoStack = [];
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
    }
```

to:

```js
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this.billingMilestones = data.billingMilestones || [];
      this._undoStack = [];
      this._redoStack = [];
      this.tasks.forEach(t => {
        if (t.owner === undefined) {
          t.owner = t.pic || '';
          t.pic = '';
        }
        if (t.milestone !== undefined) {
          t.deliverable = !!t.milestone;
          delete t.milestone;
        }
        if (t.billingAmount != null || t.billingStatus != null) {
          const bm = {
            id: generateBillingMilestoneId(), name: t.name,
            amount: t.billingAmount != null ? t.billingAmount : null,
            status: t.billingStatus || 'Not Billed',
          };
          this.billingMilestones.push(bm);
          t.billingMilestoneId = bm.id;
        } else if (t.billingMilestoneId === undefined) {
          t.billingMilestoneId = null;
        }
        delete t.billingAmount;
        delete t.billingStatus;
      });
    }
```

(If the rename plan's exact constructor text differs slightly from the block shown above, apply the same three additions to whatever is actually there: the `this.billingMilestones = data.billingMilestones || [];` field assignment, and the `if (t.billingAmount != null || t.billingStatus != null) {...} else if (t.billingMilestoneId === undefined) {...}` block plus the two trailing `delete` calls, inserted as the last block inside the existing `this.tasks.forEach(t => { ... })`.)

Update `Project.empty()` to include the new array explicitly. Change:

```js
        snapshots: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
      });
    }
```

to:

```js
        snapshots: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
        billingMilestones: [],
      });
    }
```

Update `toJSON()`. Change:

```js
    toJSON() {
      return {
        meta: this.meta,
        tasks: this.tasks,
        holidays: this.holidays,
        picList: this.picList,
        snapshots: this.snapshots,
        auditLog: this.auditLog,
        settings: this.settings,
      };
    }
```

to:

```js
    toJSON() {
      return {
        meta: this.meta,
        tasks: this.tasks,
        holidays: this.holidays,
        picList: this.picList,
        snapshots: this.snapshots,
        auditLog: this.auditLog,
        settings: this.settings,
        billingMilestones: this.billingMilestones,
      };
    }
```

Update `_applyState()` (critical for undo/redo to restore `billingMilestones` correctly). Change:

```js
    _applyState(state) {
      this.meta = state.meta;
      this.tasks = state.tasks;
      this.holidays = state.holidays;
      this.picList = state.picList;
      this.snapshots = state.snapshots;
      this.auditLog = state.auditLog;
      this.settings = state.settings;
    }
```

to:

```js
    _applyState(state) {
      this.meta = state.meta;
      this.tasks = state.tasks;
      this.holidays = state.holidays;
      this.picList = state.picList;
      this.snapshots = state.snapshots;
      this.auditLog = state.auditLog;
      this.settings = state.settings;
      this.billingMilestones = state.billingMilestones;
    }
```

Update `addTask` to drop the old billing fields in favor of `billingMilestoneId`. Change:

```js
        statusOverride: null, predecessors: [], collapsed: false,
        billingAmount: null, billingStatus: null,
      };
      this.tasks.push(task);
      return task;
    }
```

to:

```js
        statusOverride: null, predecessors: [], collapsed: false,
        billingMilestoneId: null,
      };
      this.tasks.push(task);
      return task;
    }
```

Update `addTasks` the same way. Change:

```js
          collapsed: false,
          billingAmount: spec.billingAmount != null ? spec.billingAmount : null,
          billingStatus: spec.billingStatus || null,
        };
        this.tasks.push(task);
        created.push(task);
```

to:

```js
          collapsed: false,
          billingMilestoneId: null,
        };
        this.tasks.push(task);
        created.push(task);
```

Add the four new `Project` methods right after `toggleCollapse`, before the closing `}` of the `Project` class:

```js
    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }

    addBillingMilestone() {
      this._pushUndo();
      const bm = { id: generateBillingMilestoneId(), name: 'New Billing Milestone', amount: null, status: 'Not Billed' };
      this.billingMilestones.push(bm);
      return bm;
    }

    updateBillingMilestone(id, patch, who) {
      const bm = this.billingMilestones.find(b => b.id === id);
      if (!bm) throw new Error(`Billing milestone not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = bm[field];
        bm[field] = value;
        this._audit(who, id, field, old, value);
      }
      return bm;
    }

    deleteBillingMilestone(id, who) {
      if (!this.billingMilestones.some(b => b.id === id)) throw new Error(`Billing milestone not found: ${id}`);
      this._pushUndo();
      this.billingMilestones = this.billingMilestones.filter(b => b.id !== id);
      this.tasks.forEach(t => {
        if (t.billingMilestoneId === id) t.billingMilestoneId = null;
      });
      this._audit(who, id, 'deleted', null, true);
    }

    assignDeliverablesToBillingMilestone(billingMilestoneId, taskIds, who) {
      this._pushUndo();
      const idSet = new Set(taskIds);
      this.tasks.forEach(t => {
        if (idSet.has(t.id)) {
          if (t.billingMilestoneId !== billingMilestoneId) {
            this._audit(who, t.id, 'billingMilestoneId', t.billingMilestoneId, billingMilestoneId);
            t.billingMilestoneId = billingMilestoneId;
          }
        } else if (t.billingMilestoneId === billingMilestoneId) {
          this._audit(who, t.id, 'billingMilestoneId', t.billingMilestoneId, null);
          t.billingMilestoneId = null;
        }
      });
    }
  }
```

(Note: the original file has a single closing `}` right after `toggleCollapse`'s body that ends the `Project` class — the code above shows the four new methods inserted before that same closing `}`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "project-planner" && node --test`
Expected: PASS — `N + 13` total (where `N` is the baseline recorded in Step 1).

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/js/store.js tests/store.test.js
git commit -m "Add billingMilestones data model, migration, and CRUD/assignment methods"
```

---

### Task 2: CSV import — drop the Billing Amount/Billing Status columns (`csv.js`)

**Files:**
- Modify: `project-planner/src/js/csv.js`
- Test: `project-planner/tests/csv.test.js`

**Interfaces:**
- Consumes: nothing new from Task 1 (this task only shrinks the CSV column set; imported tasks get `billingMilestoneId: null` automatically via Task 1's `addTasks` change).
- Produces: `CSV_HEADERS` with 10 columns instead of 12 (`Billing Amount`/`Billing Status` removed, `Predecessors` moves from index 11 to index 9); `validateCsvRows` no longer returns `billingAmount`/`billingStatus` on parsed specs.

- [ ] **Step 1: Write the failing tests**

In `project-planner/tests/csv.test.js`, replace the entire block from the `'csvTemplateText is the exact 12-column header row'` test through the `'validateCsvRows parses milestone variants case-insensitively'` test (i.e. everything from the `csvTemplateText` test down to, and including, the last `validateCsvRows` test before `escapeCsvField`) with:

```js
test('csvTemplateText is the exact 10-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Predecessors\n'
  );
});

const HEADER = 'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Predecessors';

function rowsOf(text) {
  return parseCsvText(text);
}

test('validateCsvRows accepts a valid file and builds task specs in order', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Phase A,KPMG,,,,,,\n' +
    '2,1,Design,KPMG,Alice,2026-07-01,2026-07-10,first cut,,\n' +
    '3,1,Build,Client Team,Bob,2026-07-11,2026-07-20,,Y,2\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], {
    _row: 1, _level: 0, name: 'Phase A', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null,
    remarks: '', deliverable: false, predecessors: [],
  });
  assert.equal(tasks[1].owner, 'KPMG');
  assert.equal(tasks[1].pic, 'Alice');
  assert.equal(tasks[2].owner, 'Client Team');
  assert.equal(tasks[2].deliverable, true);
  assert.deepEqual(tasks[2].predecessors, [2]);
});

test('validateCsvRows rejects a wrong header row', () => {
  const { errors, tasks } = validateCsvRows(rowsOf('Row,Level,Name\n1,0,A'));
  assert.equal(tasks.length, 0);
  assert.ok(errors.length >= 1);
  assert.match(errors[0], /header/i);
});

test('validateCsvRows rejects wrong column count with the row number', () => {
  const { errors } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A'));
  assert.ok(errors.some(e => /Row 1:.*10 columns/.test(e)));
});

test('validateCsvRows rejects duplicate and non-integer Row numbers', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,\n' +
    '1,0,B,KPMG,,,,,,\n' +
    'x,0,C,KPMG,,,,,,\n'
  ));
  assert.ok(errors.some(e => /duplicate/i.test(e)));
  assert.ok(errors.some(e => /Row number 'x'/.test(e)));
});

test('validateCsvRows rejects a Level jump greater than +1 and a first row above level 0', () => {
  const jump = validateCsvRows(rowsOf(HEADER + '\n1,0,A,KPMG,,,,,,\n2,2,B,KPMG,,,,,,\n'));
  assert.ok(jump.errors.some(e => /Row 2:.*Level 2/.test(e)));
  const firstDeep = validateCsvRows(rowsOf(HEADER + '\n1,1,A,KPMG,,,,,,\n'));
  assert.ok(firstDeep.errors.some(e => /Row 1:.*Level/.test(e)));
});

test('validateCsvRows rejects empty Task Name, blank Owner, and bad dates', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,,,,next tuesday,2026-13-99,,maybe,\n'
  ));
  assert.ok(errors.some(e => /Task Name/.test(e)));
  assert.ok(errors.some(e => /Owner is required/.test(e)));
  assert.ok(errors.some(e => /Planned Start/.test(e)));
});

test('validateCsvRows rejects a whitespace-only Owner the same as a blank one', () => {
  const { errors } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A,   ,,,,,,\n'));
  assert.ok(errors.some(e => /Row 1:.*Owner is required/.test(e)));
});

test('validateCsvRows leaves PIC optional when Owner is present', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A,KPMG,,,,,,\n'));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].pic, '');
});

test('validateCsvRows rejects predecessor references to missing rows and to self', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,99\n' +
    '2,0,B,KPMG,,,,,,2\n'
  ));
  assert.ok(errors.some(e => /Row 1:.*99/.test(e)));
  assert.ok(errors.some(e => /Row 2:.*itself/i.test(e)));
});

test('validateCsvRows allows forward predecessor references', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,2\n' +
    '2,0,B,KPMG,,,,,,\n'
  ));
  assert.deepEqual(errors, []);
});

test('validateCsvRows returns no tasks when any error exists', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Good,KPMG,,,,,,\n' +
    '2,0,,KPMG,,,,,,\n'
  ));
  assert.ok(errors.length > 0);
  assert.deepEqual(tasks, []);
});

test('validateCsvRows parses deliverable variants case-insensitively', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,yes,\n' +
    '2,0,B,KPMG,,,,,TRUE,\n' +
    '3,0,C,KPMG,,,,,n,\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].deliverable, true);
  assert.equal(tasks[1].deliverable, true);
  assert.equal(tasks[2].deliverable, false);
});
```

(If the file's current test names/assertions differ slightly because the rename plan phrased its `milestone`→`deliverable` rename differently, apply the same column-count reduction — remove the `Billing Amount`/`Billing Status` field from every `HEADER` string and every data row, and delete every `billingAmount`/`billingStatus` assertion — to whatever the actual post-rename test bodies say.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test`
Expected: FAIL — `csvTemplateText()` still returns the 12-column header, and `validateCsvRows` still expects 12 columns per row (so the 10-column test rows above fail the column-count check).

- [ ] **Step 3: Implement the CSV changes**

In `project-planner/src/js/csv.js`, change:

```js
  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Deliverable', 'Billing Amount', 'Billing Status', 'Predecessors'];
```

to:

```js
  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Deliverable', 'Predecessors'];
```

Change:

```js
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DELIVERABLE_TRUE = ['y', 'yes', 'true', '1'];
  const BILLING_STATUSES = ['Not Billed', 'Invoiced', 'Paid'];
```

to:

```js
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DELIVERABLE_TRUE = ['y', 'yes', 'true', '1'];
```

Change the row-parsing body:

```js
      const deliverable = DELIVERABLE_TRUE.indexOf(c[8].toLowerCase()) !== -1;

      let billingAmount = null;
      if (c[9]) {
        billingAmount = Number(c[9]);
        if (!isFinite(billingAmount)) {
          errors.push('Row ' + rowNum + ": Billing Amount '" + c[9] + "' is not a number");
          billingAmount = null;
        }
      }

      let billingStatus = null;
      if (c[10]) {
        if (BILLING_STATUSES.indexOf(c[10]) === -1) {
          errors.push('Row ' + rowNum + ": Billing Status '" + c[10] + "' must be one of: " + BILLING_STATUSES.join(', '));
        } else {
          billingStatus = c[10];
        }
      }

      const predecessors = [];
      if (c[11]) {
        c[11].split(';').forEach(part => {
          const p = Number(part.trim());
          if (!Number.isInteger(p) || p < 1) {
            errors.push('Row ' + rowNum + ": Predecessor '" + part.trim() + "' must be a Row number");
          } else if (p === rowNum) {
            errors.push('Row ' + rowNum + ': a task cannot depend on itself');
          } else {
            predecessors.push(p);
          }
        });
      }

      specs.push({
        _row: rowNum, _level: Number.isInteger(level) && level >= 0 ? level : 0,
        name: c[2], owner: c[3], pic: c[4],
        plannedStart: c[5] || null, plannedFinish: c[6] || null,
        remarks: c[7], deliverable,
        billingAmount, billingStatus, predecessors,
      });
```

to:

```js
      const deliverable = DELIVERABLE_TRUE.indexOf(c[8].toLowerCase()) !== -1;

      const predecessors = [];
      if (c[9]) {
        c[9].split(';').forEach(part => {
          const p = Number(part.trim());
          if (!Number.isInteger(p) || p < 1) {
            errors.push('Row ' + rowNum + ": Predecessor '" + part.trim() + "' must be a Row number");
          } else if (p === rowNum) {
            errors.push('Row ' + rowNum + ': a task cannot depend on itself');
          } else {
            predecessors.push(p);
          }
        });
      }

      specs.push({
        _row: rowNum, _level: Number.isInteger(level) && level >= 0 ? level : 0,
        name: c[2], owner: c[3], pic: c[4],
        plannedStart: c[5] || null, plannedFinish: c[6] || null,
        remarks: c[7], deliverable, predecessors,
      });
```

(If the current file names these locals `milestone`/`MILESTONE_TRUE` instead of `deliverable`/`DELIVERABLE_TRUE` because the rename plan hasn't been applied exactly as shown, apply the same edit — remove the `billingAmount`/`billingStatus` block and shift the predecessors column from index 11 to index 9 — against whatever the actual renamed variable names are.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "project-planner" && node --test`
Expected: PASS — same total as the end of Task 1 (`N + 13`); this task modifies existing coverage without adding new test cases.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/csv.js tests/csv.test.js
git commit -m "Drop Billing Amount/Billing Status columns from the CSV import template"
```

---

### Task 3: Billing tab UI rewrite (`billing.js`, new `deliverable-picker.js`, `dashboard.js` cleanup)

**Files:**
- Create: `project-planner/src/js/ui/deliverable-picker.js`
- Modify: `project-planner/src/js/ui/billing.js` (full rewrite)
- Modify: `project-planner/src/js/ui/dashboard.js`
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/build.py`

**Interfaces:**
- Consumes: `Project#addBillingMilestone()`, `#updateBillingMilestone(id, patch, who)`, `#deleteBillingMilestone(id, who)`, `#assignDeliverablesToBillingMilestone(billingMilestoneId, taskIds, who)` (Task 1); `task.deliverable`, `task.billingMilestoneId`, `project.billingMilestones`.
- Produces: `PP.renderBilling(state)` / `PP.wireBilling(state, onChanged)` (same names as before, rewritten bodies — `app.js`'s existing call sites need no changes). `PP.openDeliverablePicker(state, billingMilestoneId, anchorEl, onCommitted)` (new, mirrors `PP.openPredecessorPicker`). Task 4 verifies all of this live.
- Design note: the spec says "clicking a billing milestone row opens a picker." To avoid ambiguity with clicking into the row's own editable name/amount/status fields, this task implements that as a dedicated "Assign Deliverables" button within each row (class `billing-assign-button`), not a click-anywhere-on-the-row handler.
- No automated tests — UI files are verified only via Task 4's controller-run Playwright checks.

- [ ] **Step 1: Create the deliverable picker, modeled directly on `predecessor-picker.js`**

Create `project-planner/src/js/ui/deliverable-picker.js`:

```js
(function () {
  'use strict';

  function closePicker() {
    var existing = document.querySelector('.deliverable-picker');
    if (existing) existing.remove();
  }

  function openDeliverablePicker(state, billingMilestoneId, anchorEl, onCommitted) {
    closePicker();

    var candidates = state.project.tasks.filter(function (t) { return t.deliverable === true; });
    var pending = new Set(candidates
      .filter(function (t) { return t.billingMilestoneId === billingMilestoneId; })
      .map(function (t) { return t.id; }));
    var initial = new Set(pending);

    var picker = document.createElement('div');
    picker.className = 'deliverable-picker';

    var search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search deliverables...';
    picker.appendChild(search);

    var list = document.createElement('div');
    list.className = 'deliverable-picker-list';
    picker.appendChild(list);

    function renderList(filter) {
      list.innerHTML = '';
      var needle = (filter || '').toLowerCase();
      candidates.forEach(function (t) {
        var computed = state.calc.computed.get(t.id);
        var wbs = computed ? computed.wbs : '';
        var labelText = wbs + ' ' + t.name;
        if (needle && labelText.toLowerCase().indexOf(needle) === -1) return;
        var item = document.createElement('label');
        item.className = 'deliverable-picker-item';
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
        state.project.assignDeliverablesToBillingMilestone(billingMilestoneId, Array.from(pending), state.currentUser);
        onCommitted();
      }
    }

    function onOutside(e) {
      if (!picker.contains(e.target)) commitAndClose();
    }
    document.addEventListener('mousedown', onOutside, true);
  }

  window.PP = window.PP || {};
  window.PP.openDeliverablePicker = openDeliverablePicker;
})();
```

- [ ] **Step 2: Register the new file in the build order**

In `project-planner/build.py`, change:

```python
    "ui/imagecopy.js",
    "ui/predecessor-picker.js",
    "ui/tree.js",
```

to:

```python
    "ui/imagecopy.js",
    "ui/predecessor-picker.js",
    "ui/deliverable-picker.js",
    "ui/tree.js",
```

- [ ] **Step 3: Add CSS for the new picker and the rewritten Billing tab**

In `project-planner/src/css/layout.css`, change:

```css
.predecessor-picker-item:hover { background: var(--surface-sunken); }

#view-tabs { display: flex; gap: 4px; padding: 8px 24px; border-bottom: 1px solid var(--border); }
```

to:

```css
.predecessor-picker-item:hover { background: var(--surface-sunken); }

.deliverable-picker {
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
.deliverable-picker input[type="text"] { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; margin-bottom: 8px; }
.deliverable-picker-list { overflow-y: auto; flex: 1; }
.deliverable-picker-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 13px; cursor: pointer; border-radius: var(--radius-sm); }
.deliverable-picker-item:hover { background: var(--surface-sunken); }

#view-tabs { display: flex; gap: 4px; padding: 8px 24px; border-bottom: 1px solid var(--border); }
```

Then, in the same file, change:

```css
#settings-view, #resources-view, #billing-view { flex: 1; overflow: auto; padding: 16px 24px; }
.billing-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.billing-table th, .billing-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.billing-table th:last-child, .billing-table td:last-child,
.billing-table th:nth-last-child(2), .billing-table td:nth-last-child(2) { text-align: right; }
.billing-table input[type="number"] { width: 100px; font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: right; }
.billing-table select { font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
```

to:

```css
#settings-view, #resources-view, #billing-view { flex: 1; overflow: auto; padding: 16px 24px; }
.billing-section { margin-bottom: 24px; }
.billing-section h3 { margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.04em; color: var(--text-secondary); text-transform: uppercase; }
.billing-milestone-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.billing-milestone-row input[type="text"] { flex: 1 1 200px; font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.billing-milestone-row input[type="number"] { width: 100px; font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: right; }
.billing-milestone-row select { font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.billing-milestone-row .billing-linked-list { flex-basis: 100%; list-style: none; padding: 0; margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); }
.billing-unassigned-list { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.billing-unassigned-list li { padding: 6px 0; border-bottom: 1px solid var(--border); }
```

- [ ] **Step 4: Rewrite `billing.js`**

Replace the entire contents of `project-planner/src/js/ui/billing.js` with:

```js
(function () {
  'use strict';

  var BILLING_STATUSES = ['Not Billed', 'Invoiced', 'Paid'];

  function renderBilling(state) {
    var body = document.getElementById('billing-body');
    body.innerHTML = '';

    var deliverables = state.project.tasks.filter(function (t) { return t.deliverable === true; });
    var linkedByMilestone = new Map();
    deliverables.forEach(function (t) {
      if (!t.billingMilestoneId) return;
      if (!linkedByMilestone.has(t.billingMilestoneId)) linkedByMilestone.set(t.billingMilestoneId, []);
      linkedByMilestone.get(t.billingMilestoneId).push(t);
    });

    var milestonesSection = document.createElement('div');
    milestonesSection.className = 'billing-section';
    var milestonesTitle = document.createElement('h3');
    milestonesTitle.textContent = 'Billing Milestones';
    milestonesSection.appendChild(milestonesTitle);

    if (!state.project.billingMilestones.length) {
      var emptyMsg = document.createElement('p');
      emptyMsg.textContent = 'No billing milestones yet — click "+ Add Billing Milestone" below to create one.';
      milestonesSection.appendChild(emptyMsg);
    }

    state.project.billingMilestones.forEach(function (bm) {
      var row = document.createElement('div');
      row.className = 'billing-milestone-row';
      row.dataset.id = bm.id;

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = bm.name;
      nameInput.dataset.field = 'name';
      row.appendChild(nameInput);

      var amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.value = bm.amount != null ? bm.amount : '';
      amountInput.dataset.field = 'amount';
      row.appendChild(amountInput);

      var statusSelect = document.createElement('select');
      statusSelect.dataset.field = 'status';
      BILLING_STATUSES.forEach(function (opt) {
        var option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (bm.status === opt) option.selected = true;
        statusSelect.appendChild(option);
      });
      row.appendChild(statusSelect);

      var assignButton = document.createElement('button');
      assignButton.type = 'button';
      assignButton.className = 'billing-assign-button';
      assignButton.textContent = 'Assign Deliverables';
      row.appendChild(assignButton);

      var deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'billing-delete-button';
      deleteButton.textContent = 'Delete';
      row.appendChild(deleteButton);

      var linked = linkedByMilestone.get(bm.id) || [];
      var linkedList = document.createElement('ul');
      linkedList.className = 'billing-linked-list';
      if (!linked.length) {
        var noneLi = document.createElement('li');
        noneLi.textContent = 'No deliverables linked yet.';
        linkedList.appendChild(noneLi);
      } else {
        linked.forEach(function (t) {
          var li = document.createElement('li');
          li.textContent = t.name;
          linkedList.appendChild(li);
        });
      }
      row.appendChild(linkedList);

      milestonesSection.appendChild(row);
    });

    var addButton = document.createElement('button');
    addButton.id = 'add-billing-milestone-button';
    addButton.type = 'button';
    addButton.textContent = '+ Add Billing Milestone';
    milestonesSection.appendChild(addButton);

    body.appendChild(milestonesSection);

    var unassignedSection = document.createElement('div');
    unassignedSection.className = 'billing-section';
    var unassignedTitle = document.createElement('h3');
    unassignedTitle.textContent = 'Unassigned Deliverables';
    unassignedSection.appendChild(unassignedTitle);

    var unassigned = deliverables.filter(function (t) { return !t.billingMilestoneId; });
    if (!deliverables.length) {
      var noDeliverablesMsg = document.createElement('p');
      noDeliverablesMsg.textContent = 'No deliverable tasks yet — billing only applies to tasks flagged as deliverables.';
      unassignedSection.appendChild(noDeliverablesMsg);
    } else if (!unassigned.length) {
      var allAssignedMsg = document.createElement('p');
      allAssignedMsg.textContent = 'Every deliverable is linked to a billing milestone.';
      unassignedSection.appendChild(allAssignedMsg);
    } else {
      var unassignedList = document.createElement('ul');
      unassignedList.className = 'billing-unassigned-list';
      unassigned.forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t.name;
        unassignedList.appendChild(li);
      });
      unassignedSection.appendChild(unassignedList);
    }
    body.appendChild(unassignedSection);
  }

  function wireBilling(state, onChanged) {
    var body = document.getElementById('billing-body');

    body.addEventListener('click', function (e) {
      if (e.target.id === 'add-billing-milestone-button') {
        state.project.addBillingMilestone();
        onChanged();
        return;
      }
      var row = e.target.closest('.billing-milestone-row');
      if (!row) return;
      var id = row.dataset.id;
      if (e.target.classList.contains('billing-assign-button')) {
        PP.openDeliverablePicker(state, id, e.target, onChanged);
        return;
      }
      if (e.target.classList.contains('billing-delete-button')) {
        state.project.deleteBillingMilestone(id, state.currentUser);
        onChanged();
        return;
      }
    });

    body.addEventListener('change', function (e) {
      var field = e.target.dataset.field;
      if (!field) return;
      var row = e.target.closest('.billing-milestone-row');
      if (!row) return;
      var id = row.dataset.id;
      var value = e.target.value;
      if (field === 'amount') {
        value = value === '' ? null : Number(value);
      }
      var patch = {};
      patch[field] = value;
      state.project.updateBillingMilestone(id, patch, state.currentUser);
      onChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderBilling = renderBilling;
  window.PP.wireBilling = wireBilling;
})();
```

- [ ] **Step 5: Remove the Dashboard's now-broken per-task Billing Summary section**

The per-task `t.billingAmount`/`t.billingStatus` fields this section reads no longer exist after Task 1's migration (every task either has `billingMilestoneId` or nothing). Per spec §6, rebuilding a `billingMilestones`-based rollup on the Dashboard is out of scope — so this section is removed rather than reimplemented.

In `project-planner/src/js/ui/dashboard.js`, change:

```js
    delayedSection.appendChild(table);
    container.appendChild(delayedSection);

    var billingSection = document.createElement('div');
    billingSection.className = 'dashboard-section';
    var billingTitle = document.createElement('h3');
    billingTitle.textContent = 'Billing Summary';
    billingSection.appendChild(billingTitle);
    var billingTotals = { 'Not Billed': 0, 'Invoiced': 0, 'Paid': 0 };
    var grandTotal = 0;
    state.project.tasks.forEach(function (t) {
      if (!t.deliverable || t.billingAmount == null) return;
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
  }
```

to:

```js
    delayedSection.appendChild(table);
    container.appendChild(delayedSection);
  }
```

(If the rename plan phrased the `t.deliverable`/`t.billingAmount` check slightly differently, delete whatever the equivalent "Billing Summary" block reads as — from the `var billingSection = ...` line through its matching `container.appendChild(billingSection);` line — leaving the function's closing `}` in place.)

- [ ] **Step 6: Relabel the tab**

In `project-planner/src/index.html`, change:

```html
    <button class="view-tab" data-view="billing">Billing</button>
```

to:

```html
    <button class="view-tab" data-view="billing">Deliverable/Billing</button>
```

(Only the button's visible text changes — `data-view="billing"`, `id="billing-view"`, and `id="billing-body"` all stay exactly as they are, so `VIEW_IDS` in `app.js` needs no changes.)

- [ ] **Step 7: Build and smoke-check**

```bash
cd "project-planner"
node --check src/js/ui/deliverable-picker.js
node --check src/js/ui/billing.js
node --check src/js/ui/dashboard.js
python3 build.py
node --test
```

Expected: all `node --check` calls are silent (syntax OK); build succeeds; `node --test` still reports the same total as the end of Task 2 (`N + 13`) — this task touches no engine/logic files.

- [ ] **Step 8: Commit**

```bash
cd "project-planner"
git add src/js/ui/deliverable-picker.js src/js/ui/billing.js src/js/ui/dashboard.js src/index.html src/css/layout.css build.py
git commit -m "Rewrite Billing tab around billingMilestones with a deliverable-assignment picker"
```

---

### Task 4: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd "project-planner"
python3 build.py
node --test
```

Expected: `N + 13` tests pass (the exact final count established at the end of Task 2 — confirm it matches, don't assume).

- [ ] **Step 2: Verify migration of legacy per-task billing data**

Serve `dist/ProjectPlanner.html` (e.g. `cd dist && python3 -m http.server <port>`), open it in the browser, and use `browser_evaluate` to run:

```js
const legacy = new PP.Project({
  meta: { id: 'verify-migration', name: 'Verify Migration', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
  tasks: [{
    id: 't1', parentId: null, order: 0, name: 'Legacy Deliverable', owner: 'KPMG', pic: '',
    deliverable: true, jira: '', remarks: '', plannedStart: null, plannedFinish: null,
    actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null,
    statusOverride: null, predecessors: [], collapsed: false,
    billingAmount: 750000, billingStatus: 'Paid',
  }],
  holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
});
JSON.stringify({
  milestoneCount: legacy.billingMilestones.length,
  milestone: legacy.billingMilestones[0],
  taskBillingMilestoneId: legacy.tasks[0].billingMilestoneId,
  hasOldFields: 'billingAmount' in legacy.tasks[0] || 'billingStatus' in legacy.tasks[0],
});
```

Confirm: `milestoneCount` is `1`, `milestone.name` is `'Legacy Deliverable'`, `milestone.amount` is `750000`, `milestone.status` is `'Paid'`, `taskBillingMilestoneId` equals `milestone.id`, and `hasOldFields` is `false`.

- [ ] **Step 3: Verify the full assign/reassign/delete flow through the real UI**

In the running app: add 4 tasks and mark 3 of them as deliverables via the Plan tree's right-click "Mark as Deliverable" action (leave the 4th as a plain task). Switch to the "Deliverable/Billing" tab.

Confirm: all 3 deliverables appear under "Unassigned Deliverables"; the 4th (non-deliverable) task does not appear anywhere on this tab.

Click "+ Add Billing Milestone." Confirm a new row appears under "Billing Milestones" with a default name, blank amount, and "Not Billed" status. Edit its name (e.g. to "Phase 1 Sign-off") and set an amount (e.g. `500000`) — confirm both persist after `refresh()` (e.g. switch tabs away and back).

Click "Assign Deliverables" on that row. Confirm the picker opens (a searchable checklist, positioned near the button, matching the Predecessors picker's visual style). Check all 3 deliverables, then click outside the picker to commit.

Confirm: all 3 deliverables now appear in the milestone row's linked list, and "Unassigned Deliverables" shows "Every deliverable is linked to a billing milestone" (none of the 3 remain listed there).

- [ ] **Step 4: Verify reassignment moves, not duplicates**

Click "+ Add Billing Milestone" again to create a second milestone. Click its "Assign Deliverables" button, check exactly one of the 3 already-assigned deliverables, and commit.

Confirm: that one deliverable now appears under the second milestone's linked list and no longer appears under the first milestone's linked list (moved, not duplicated) — the other 2 deliverables remain linked to the first milestone, untouched.

- [ ] **Step 5: Verify deletion unassigns rather than deletes**

Click "Delete" on the first billing milestone (the one still holding 2 deliverables).

Confirm: the milestone row disappears from "Billing Milestones"; both of its previously-linked deliverables now reappear under "Unassigned Deliverables" (not removed from the Plan tree — verify by switching to the Plan tab and confirming all 3 original deliverable tasks still exist there).

- [ ] **Step 6: Verify zero regression to existing functionality**

Exercise: switch every view tab, Save (JSON), Import CSV using a freshly downloaded CSV template (confirm the template header row now reads exactly `Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Predecessors` with no Billing columns), Export CSV, undo/redo an add-billing-milestone action via the header buttons, add/remove a holiday, use the Owner/PIC/status/"Only deliverables" filters.

Confirm every interaction still works exactly as before this plan, and that the Dashboard tab renders without a Billing Summary section and without any console errors.

- [ ] **Step 7: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected). Then run:

```bash
cd "project-planner"
node --test
```

Confirm the same count from Step 1 still passes.

- [ ] **Step 8: Record the result**

If every check in Steps 1-7 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-3: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: the Billing tab is a "Deliverable/Billing" tab built around `project.billingMilestones`, each entry billable once but backed by any number of linked deliverable tasks via `task.billingMilestoneId`; existing saved projects with legacy per-task `billingAmount`/`billingStatus` are transparently upgraded on load into one billing milestone per previously-flagged task; and a searchable-checklist picker (matching the existing Predecessors picker's UX) lets the user freely reassign deliverables between milestones, with unassigned deliverables always visible so nothing is lost.
