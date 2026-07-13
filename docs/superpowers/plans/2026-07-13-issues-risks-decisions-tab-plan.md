# Issues, Risks & Decisions Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new, fully independent "Issues, Risks & Decisions" tab holding three separate, independently-structured record lists — Issues, Risks, and Key Decisions Needed — each with its own "+ Add" button and CRUD table, matching the reference report's two parallel sections (ประเด็นปัญหาและความเสี่ยง / Issues & Risks, and ประเด็นเพื่อหารือ / Discussion & Decisions). No linking to tasks, no cross-collection sharing.

**Architecture:** Task 1 adds three new plain-array collections (`project.issues`, `project.risks`, `project.decisions`) plus add/update/delete methods for each to the `store.js` engine (Node-tested, no DOM), following `addTask`/`updateTask`/`deleteTask`'s exact shape. Task 2 scaffolds the new tab (button, view container, `VIEW_IDS`, `build.py` entry) and a minimal read-only `src/js/ui/issues.js`. Task 3 completes `issues.js` with full inline-cell editing (double-click/Enter/Escape, reusing `tree.js`'s exact pattern), status/likelihood/impact dropdowns (reusing `billing.js`'s always-visible-`<select>` pattern), conditional cells for `dateResolved`/`decisionMade`, and delete buttons. Task 4 is controller-run browser verification.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies.

## Data Model (copied verbatim from the design spec)

```js
project.issues = [
  { id, title, description, owner, status /* 'Open' | 'Resolved' */, dateRaised, dateResolved }
]
project.risks = [
  { id, title, description, likelihood /* 'Low'|'Medium'|'High' */, impact /* 'Low'|'Medium'|'High' */,
    mitigation, owner, status /* 'Open'|'Mitigated'|'Closed' */, dateRaised }
]
project.decisions = [
  { id, title, description, decisionNeededBy /* date */, owner,
    status /* 'Pending'|'Decided' */, decisionMade /* text, filled once Decided */, dateDecided }
]
```

Each collection is independent — no shared "type" field, no cross-linking to tasks. `owner` is a free-text field, same as `task.owner` (not a strict picklist like `task.pic`).

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- **Data model exactly as above.** Each of the three collections is a plain array on `Project`, fully independent — no shared "type" field, no cross-linking to tasks, no notification/reminder mechanism for approaching `decisionNeededBy` dates, no wiring into the Reports overhaul (separate spec, out of scope here — this plan only defines the data and the tab's own CRUD UI).
- **UI shape:** one tab, three stacked sections on the same scrollable page — **not** sub-tabs. Each section has its own "+ Add" button and its own table. Issues table columns: Title, Description, Owner, Status, Date Raised, Date Resolved. Risks table columns: Title, Description, Likelihood, Impact, Mitigation, Owner, Status, Date Raised. Key Decisions Needed table columns: Title, Description, Decision Needed By, Owner, Status, Decision Made. Note `decisions.dateDecided` is a data-model field but **not** a displayed column per the spec's own column list — it exists for a future Reports-overhaul consumer, not edited from this tab's UI.
- Status (issues, risks), Likelihood and Impact (risks) are dropdowns (`<select>`, always visible, wired via delegated `change`, matching `billing.js`'s `billingStatus` pattern) — not double-click text edits.
- Date Resolved (issues) is only editable once Status = 'Resolved'; Decision Made (decisions) is only editable once Status = 'Decided'. When inactive, render a plain non-editable placeholder cell (mirroring `tree.js`'s `dateCell` hasChildren-vs-editable pattern), not a disabled input.
- All other fields (Title, Description, Owner, Mitigation, Date Raised, Decision Needed By, and the conditionally-active Date Resolved / Decision Made) use `tree.js`'s exact existing inline-cell-edit pattern: double-click a cell to edit, Enter commits, Escape cancels, blur commits. Do not introduce a new editing paradigm.
- New view tab = **three** required registration points or it silently breaks (documented gotcha, bitten twice in this repo): `.view-tab[data-view="issues"]` button, `<div id="issues-view" hidden>` container, and `'issues-view'` in `app.js`'s `VIEW_IDS` array.
- Any user-controlled string (title, description, owner, mitigation, decisionMade, etc.) reaching the DOM must be escaped or built via `.textContent`/`createTextNode` — never concatenated raw into `innerHTML`.
- **Documented CSS gotcha** (this exact repo has shipped this bug before — see the "Fix Export CSV button rendering unstyled" commit): any new plain secondary button (the three "+ Add" buttons) must be added to the shared secondary-button selector list in `layout.css` (`.theme-btn, #new-project-button, #add-pic-button, ...`), and the new `#issues-view` container must join the shared `#settings-view, #resources-view, #billing-view { flex: 1; overflow: auto; padding: 16px 24px; }` selector group — otherwise the tab renders unstyled/unscrollable even though it's functionally wired.
- `store.js`'s `addIssue`/`addRisk`/`addDecision` follow `addTask`'s exact shape: no `who` parameter, no `_audit()` call (creation is not audited, matching `addTask`). `updateIssue`/`updateRisk`/`updateDecision` and `deleteIssue`/`deleteRisk`/`deleteDecision` follow `updateTask`/`deleteTask`'s exact shape: `(id, patch, who)` / `(id, who)`, each calling `_pushUndo()` and `_audit()`. `_audit()`'s `taskId` parameter is reused loosely as "the id of the record this entry is about" (already true for the existing `csvImport` entries, which pass `taskId: null`) — the Settings tab's audit log will show the raw issue/risk/decision id in its "Task" column when it doesn't match any task id, which is expected/benign, matching existing behavior, not a bug to fix in this plan.
- `describeChange()` (in `store.js`, added by the Undo/Redo plan) is **not** modified by this plan — it only inspects `tasks`/`holidays`/`picList`/`snapshots`/`settings`, so an undo/redo tooltip for an issue/risk/decision-only change will fall through to the generic `'Change'` label. This is an accepted, intentional limitation (out of scope per the design spec), not a regression.
- `_applyState()` **must** be extended to include `issues`/`risks`/`decisions`, or undo/redo of any issue/risk/decision CRUD would silently no-op (the collections would never be reverted/reapplied). This is a necessary, in-scope change to the existing undo/redo plumbing, not a violation of any other plan's "don't touch undo/redo" constraint (that constraint belonged to the now-completed Undo/Redo UI plan and does not bind this plan).
- Engines (`store.js`) are Node-tested via TDD; the new `src/js/ui/issues.js` is a plain IIFE with no automated test coverage (no jsdom, by design) — verified only in Task 4's controller-run browser check.
- `python3 build.py`; register `ui/issues.js` in `build.py`'s `JS_ORDER`, in the `ui/*` group, immediately before `ui/app.js` (which must stay last).
- **This plan has no dependency on any other pending plan and can be built on an independent branch/worktree in parallel with the Activities calendar tab plan. It must merge before the Reports overhaul plan, which consumes `project.issues`/`risks`/`decisions`.**
- Baseline: **verify the current test count via `node --test` at execution start — do not hardcode blindly.** As of the writing of this plan, `node --test` was run and confirmed **174/174** passing; all step-by-step counts below are computed relative to that verified anchor. If the true baseline has drifted by execution time (this plan is independent and may run out of order relative to other pending plans), adjust every subsequent count by the same delta.

---

### Task 1: `store.js` data model — Issues, Risks, Decisions collections + CRUD

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new (extends the existing `Project` class).
- Produces: `project.issues`, `project.risks`, `project.decisions` arrays (present on every `Project` instance, defaulting to `[]` for legacy data missing them), plus `Project.prototype.addIssue/updateIssue/deleteIssue`, `addRisk/updateRisk/deleteRisk`, `addDecision/updateDecision/deleteDecision`. Tasks 2–3 depend on these exact method names/signatures and field names.

- [ ] **Step 1: Write the failing tests**

Append the following to the end of `project-planner/tests/store.test.js` (after the last existing test, `'describeChange: identical snapshots fall back to a generic label'`):

```js
test('Project.empty starts with empty issues, risks, and decisions collections', () => {
  const p = Project.empty('Test');
  assert.deepEqual(p.issues, []);
  assert.deepEqual(p.risks, []);
  assert.deepEqual(p.decisions, []);
});

test('Project defaults issues, risks, and decisions to empty arrays for legacy data missing those fields', () => {
  const p = new Project({
    meta: { id: 'legacy', name: 'Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [], holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.deepEqual(p.issues, []);
  assert.deepEqual(p.risks, []);
  assert.deepEqual(p.decisions, []);
});

test('addIssue appends an issue with default fields', () => {
  const p = Project.empty('Test');
  const issue = p.addIssue({ title: 'Server outage', owner: 'Somchai' });
  assert.equal(p.issues.length, 1);
  assert.equal(issue.title, 'Server outage');
  assert.equal(issue.owner, 'Somchai');
  assert.equal(issue.description, '');
  assert.equal(issue.status, 'Open');
  assert.equal(issue.dateRaised, null);
  assert.equal(issue.dateResolved, null);
  assert.match(issue.id, /^t_/);
});

test('addIssue accepts custom status and dates', () => {
  const p = Project.empty('Test');
  const issue = p.addIssue({ title: 'Data mismatch', description: 'Numbers do not reconcile', owner: 'Alice', status: 'Resolved', dateRaised: '2026-07-01', dateResolved: '2026-07-05' });
  assert.equal(issue.status, 'Resolved');
  assert.equal(issue.dateRaised, '2026-07-01');
  assert.equal(issue.dateResolved, '2026-07-05');
});

test('updateIssue changes a field and records an audit entry', () => {
  const p = Project.empty('Test');
  const issue = p.addIssue({ title: 'Server outage' });
  p.updateIssue(issue.id, { status: 'Resolved', dateResolved: '2026-07-10' }, 'Alice');
  const updated = p.issues.find(i => i.id === issue.id);
  assert.equal(updated.status, 'Resolved');
  assert.equal(updated.dateResolved, '2026-07-10');
  assert.equal(p.auditLog.length, 2);
  assert.equal(p.auditLog[0].who, 'Alice');
  assert.equal(p.auditLog[0].taskId, issue.id);
});

test('updateIssue throws for an unknown issue id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateIssue('missing', { status: 'Resolved' }, 'Alice'));
});

test('deleteIssue removes the issue', () => {
  const p = Project.empty('Test');
  const issue = p.addIssue({ title: 'Server outage' });
  p.deleteIssue(issue.id, 'Alice');
  assert.equal(p.issues.length, 0);
});

test('deleteIssue throws for an unknown issue id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.deleteIssue('missing', 'Alice'));
});

test('addRisk appends a risk with default fields', () => {
  const p = Project.empty('Test');
  const risk = p.addRisk({ title: 'Vendor delay', owner: 'Bob' });
  assert.equal(p.risks.length, 1);
  assert.equal(risk.title, 'Vendor delay');
  assert.equal(risk.owner, 'Bob');
  assert.equal(risk.description, '');
  assert.equal(risk.likelihood, 'Low');
  assert.equal(risk.impact, 'Low');
  assert.equal(risk.mitigation, '');
  assert.equal(risk.status, 'Open');
  assert.equal(risk.dateRaised, null);
  assert.match(risk.id, /^t_/);
});

test('addRisk accepts custom likelihood, impact, and mitigation', () => {
  const p = Project.empty('Test');
  const risk = p.addRisk({ title: 'Key staff attrition', likelihood: 'High', impact: 'High', mitigation: 'Cross-train backup staff', owner: 'Somchai', dateRaised: '2026-07-01' });
  assert.equal(risk.likelihood, 'High');
  assert.equal(risk.impact, 'High');
  assert.equal(risk.mitigation, 'Cross-train backup staff');
  assert.equal(risk.dateRaised, '2026-07-01');
});

test('updateRisk changes a field and records an audit entry', () => {
  const p = Project.empty('Test');
  const risk = p.addRisk({ title: 'Vendor delay' });
  p.updateRisk(risk.id, { status: 'Mitigated', mitigation: 'Added a second vendor' }, 'Alice');
  const updated = p.risks.find(r => r.id === risk.id);
  assert.equal(updated.status, 'Mitigated');
  assert.equal(updated.mitigation, 'Added a second vendor');
  assert.equal(p.auditLog.length, 2);
  assert.equal(p.auditLog[0].taskId, risk.id);
});

test('updateRisk throws for an unknown risk id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateRisk('missing', { status: 'Closed' }, 'Alice'));
});

test('deleteRisk removes the risk', () => {
  const p = Project.empty('Test');
  const risk = p.addRisk({ title: 'Vendor delay' });
  p.deleteRisk(risk.id, 'Alice');
  assert.equal(p.risks.length, 0);
});

test('deleteRisk throws for an unknown risk id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.deleteRisk('missing', 'Alice'));
});

test('addDecision appends a decision with default fields', () => {
  const p = Project.empty('Test');
  const decision = p.addDecision({ title: 'Choose cloud provider', owner: 'Bob' });
  assert.equal(p.decisions.length, 1);
  assert.equal(decision.title, 'Choose cloud provider');
  assert.equal(decision.owner, 'Bob');
  assert.equal(decision.description, '');
  assert.equal(decision.decisionNeededBy, null);
  assert.equal(decision.status, 'Pending');
  assert.equal(decision.decisionMade, '');
  assert.equal(decision.dateDecided, null);
  assert.match(decision.id, /^t_/);
});

test('addDecision accepts a custom decisionNeededBy date', () => {
  const p = Project.empty('Test');
  const decision = p.addDecision({ title: 'Approve budget increase', decisionNeededBy: '2026-08-01', owner: 'Alice' });
  assert.equal(decision.decisionNeededBy, '2026-08-01');
});

test('updateDecision changes a field and records an audit entry', () => {
  const p = Project.empty('Test');
  const decision = p.addDecision({ title: 'Choose cloud provider' });
  p.updateDecision(decision.id, { status: 'Decided', decisionMade: 'Selected Vendor A', dateDecided: '2026-07-11' }, 'Alice');
  const updated = p.decisions.find(d => d.id === decision.id);
  assert.equal(updated.status, 'Decided');
  assert.equal(updated.decisionMade, 'Selected Vendor A');
  assert.equal(updated.dateDecided, '2026-07-11');
  assert.equal(p.auditLog.length, 3);
  assert.equal(p.auditLog[0].taskId, decision.id);
});

test('updateDecision throws for an unknown decision id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateDecision('missing', { status: 'Decided' }, 'Alice'));
});

test('deleteDecision removes the decision', () => {
  const p = Project.empty('Test');
  const decision = p.addDecision({ title: 'Choose cloud provider' });
  p.deleteDecision(decision.id, 'Alice');
  assert.equal(p.decisions.length, 0);
});

test('deleteDecision throws for an unknown decision id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.deleteDecision('missing', 'Alice'));
});

test('undo reverts an addIssue and redo reapplies it', () => {
  const p = Project.empty('Test');
  p.addIssue({ title: 'Server outage' });
  assert.equal(p.issues.length, 1);
  assert.equal(p.undo(), true);
  assert.equal(p.issues.length, 0);
  assert.equal(p.redo(), true);
  assert.equal(p.issues.length, 1);
});

test('undo reverts an addRisk and redo reapplies it', () => {
  const p = Project.empty('Test');
  p.addRisk({ title: 'Vendor delay' });
  assert.equal(p.risks.length, 1);
  assert.equal(p.undo(), true);
  assert.equal(p.risks.length, 0);
  assert.equal(p.redo(), true);
  assert.equal(p.risks.length, 1);
});

test('undo reverts an addDecision and redo reapplies it', () => {
  const p = Project.empty('Test');
  p.addDecision({ title: 'Choose cloud provider' });
  assert.equal(p.decisions.length, 1);
  assert.equal(p.undo(), true);
  assert.equal(p.decisions.length, 0);
  assert.equal(p.redo(), true);
  assert.equal(p.decisions.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `p.addIssue is not a function` (and similarly for `addRisk`/`addDecision`), since none of these exist in `store.js` yet.

- [ ] **Step 3: Extend the `Project` constructor, `empty()`, `toJSON()`, and `_applyState()`**

In `project-planner/src/js/store.js`, change the constructor from:
```js
    constructor(data) {
      this.meta = data.meta;
      this.tasks = data.tasks;
      this.holidays = data.holidays;
      this.picList = data.picList;
      this.snapshots = data.snapshots;
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this._undoStack = [];
      this._redoStack = [];
```
to:
```js
    constructor(data) {
      this.meta = data.meta;
      this.tasks = data.tasks;
      this.holidays = data.holidays;
      this.picList = data.picList;
      this.snapshots = data.snapshots;
      this.issues = data.issues || [];
      this.risks = data.risks || [];
      this.decisions = data.decisions || [];
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this._undoStack = [];
      this._redoStack = [];
```

Change `static empty(name)` from:
```js
        tasks: [],
        holidays: [],
        picList: [],
        snapshots: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
      });
    }
```
to:
```js
        tasks: [],
        holidays: [],
        picList: [],
        snapshots: [],
        issues: [],
        risks: [],
        decisions: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
      });
    }
```

Change `toJSON()` from:
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
        issues: this.issues,
        risks: this.risks,
        decisions: this.decisions,
        auditLog: this.auditLog,
        settings: this.settings,
      };
    }
```

Change `_applyState(state)` from:
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
      this.issues = state.issues;
      this.risks = state.risks;
      this.decisions = state.decisions;
      this.auditLog = state.auditLog;
      this.settings = state.settings;
    }
```

- [ ] **Step 4: Add the nine CRUD methods**

In `project-planner/src/js/store.js`, change:
```js
    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }
  }
```
to:
```js
    toggleCollapse(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.collapsed = !task.collapsed;
    }

    addIssue({ title = 'New Issue', description = '', owner = '', status = 'Open', dateRaised = null, dateResolved = null } = {}) {
      this._pushUndo();
      const issue = { id: generateId(), title, description, owner, status, dateRaised, dateResolved };
      this.issues.push(issue);
      return issue;
    }

    updateIssue(id, patch, who) {
      const issue = this.issues.find(i => i.id === id);
      if (!issue) throw new Error(`Issue not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = issue[field];
        issue[field] = value;
        this._audit(who, id, field, old, value);
      }
      return issue;
    }

    deleteIssue(id, who) {
      if (!this.issues.some(i => i.id === id)) throw new Error(`Issue not found: ${id}`);
      this._pushUndo();
      this.issues = this.issues.filter(i => i.id !== id);
      this._audit(who, id, 'deleted', null, true);
    }

    addRisk({ title = 'New Risk', description = '', likelihood = 'Low', impact = 'Low', mitigation = '', owner = '', status = 'Open', dateRaised = null } = {}) {
      this._pushUndo();
      const risk = { id: generateId(), title, description, likelihood, impact, mitigation, owner, status, dateRaised };
      this.risks.push(risk);
      return risk;
    }

    updateRisk(id, patch, who) {
      const risk = this.risks.find(r => r.id === id);
      if (!risk) throw new Error(`Risk not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = risk[field];
        risk[field] = value;
        this._audit(who, id, field, old, value);
      }
      return risk;
    }

    deleteRisk(id, who) {
      if (!this.risks.some(r => r.id === id)) throw new Error(`Risk not found: ${id}`);
      this._pushUndo();
      this.risks = this.risks.filter(r => r.id !== id);
      this._audit(who, id, 'deleted', null, true);
    }

    addDecision({ title = 'New Decision', description = '', decisionNeededBy = null, owner = '', status = 'Pending', decisionMade = '', dateDecided = null } = {}) {
      this._pushUndo();
      const decision = { id: generateId(), title, description, decisionNeededBy, owner, status, decisionMade, dateDecided };
      this.decisions.push(decision);
      return decision;
    }

    updateDecision(id, patch, who) {
      const decision = this.decisions.find(d => d.id === id);
      if (!decision) throw new Error(`Decision not found: ${id}`);
      this._pushUndo();
      for (const [field, value] of Object.entries(patch)) {
        const old = decision[field];
        decision[field] = value;
        this._audit(who, id, field, old, value);
      }
      return decision;
    }

    deleteDecision(id, who) {
      if (!this.decisions.some(d => d.id === id)) throw new Error(`Decision not found: ${id}`);
      this._pushUndo();
      this.decisions = this.decisions.filter(d => d.id !== id);
      this._audit(who, id, 'deleted', null, true);
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 197/197 total (174 baseline + 23 new tests in this task).

- [ ] **Step 6: Commit**

```bash
cd project-planner
git add src/js/store.js tests/store.test.js
git commit -m "Add Issues/Risks/Decisions data model and CRUD methods to store.js"
```

---

### Task 2: Tab scaffold + read-only rendering

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/build.py`
- Modify: `project-planner/src/css/layout.css`
- Create: `project-planner/src/js/ui/issues.js`

**Interfaces:**
- Consumes: `state.project.issues`/`risks`/`decisions` and `state.project.addIssue`/`addRisk`/`addDecision` (Task 1).
- Produces: `PP.renderIssuesRisksDecisions(state)` and `PP.wireIssuesRisksDecisions(state, onChanged)`, called from `app.js`'s `refresh()` and `showApp()`. Task 3 replaces the internals of `issues.js` but keeps these exact two exported names.

- [ ] **Step 1: Add the tab button**

In `project-planner/src/index.html`, change:
```html
    <button class="view-tab" data-view="reports">Reports</button>
  </div>
```
to:
```html
    <button class="view-tab" data-view="reports">Reports</button>
    <button class="view-tab" data-view="issues">Issues, Risks & Decisions</button>
  </div>
```

- [ ] **Step 2: Add the view container**

In `project-planner/src/index.html`, change:
```html
  <div id="reports-view" hidden>
    <div id="reports-toolbar">
      <select id="report-template-select">
        <option value="weekly">Weekly Status Report</option>
        <option value="executive">Executive Dashboard</option>
        <option value="summary">Management Summary</option>
      </select>
      <button id="report-copy-image-button">Copy as Image</button>
      <button id="report-copy-table-button">Copy as Table</button>
    </div>
    <div id="report-panel-wrap">
      <div id="report-panel"></div>
    </div>
  </div>
</div>
```
to:
```html
  <div id="reports-view" hidden>
    <div id="reports-toolbar">
      <select id="report-template-select">
        <option value="weekly">Weekly Status Report</option>
        <option value="executive">Executive Dashboard</option>
        <option value="summary">Management Summary</option>
      </select>
      <button id="report-copy-image-button">Copy as Image</button>
      <button id="report-copy-table-button">Copy as Table</button>
    </div>
    <div id="report-panel-wrap">
      <div id="report-panel"></div>
    </div>
  </div>
  <div id="issues-view" hidden>
    <div class="settings-section settings-section-wide">
      <h3>Issues</h3>
      <button id="add-issue-button">+ Add Issue</button>
      <div id="issues-body"></div>
    </div>
    <div class="settings-section settings-section-wide">
      <h3>Risks</h3>
      <button id="add-risk-button">+ Add Risk</button>
      <div id="risks-body"></div>
    </div>
    <div class="settings-section settings-section-wide">
      <h3>Key Decisions Needed</h3>
      <button id="add-decision-button">+ Add Decision</button>
      <div id="decisions-body"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Register the view id in `app.js`**

In `project-planner/src/js/ui/app.js`, change:
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'resources-view', 'billing-view', 'settings-view', 'holidays-view', 'reports-view'];
```
to:
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'resources-view', 'billing-view', 'settings-view', 'holidays-view', 'reports-view', 'issues-view'];
```

- [ ] **Step 4: Wire the render call into `refresh()`**

In `project-planner/src/js/ui/app.js`, change:
```js
    PP.renderHolidays(state);
    PP.renderReport(state);
    if (markDirty) {
```
to:
```js
    PP.renderHolidays(state);
    PP.renderReport(state);
    PP.renderIssuesRisksDecisions(state);
    if (markDirty) {
```

- [ ] **Step 5: Wire the event listeners into `showApp()`**

In `project-planner/src/js/ui/app.js`, change:
```js
    PP.wireHolidays(state, function () { refresh(state, true); });
    PP.wireReports(state, function () { PP.renderReport(state); });
```
to:
```js
    PP.wireHolidays(state, function () { refresh(state, true); });
    PP.wireReports(state, function () { PP.renderReport(state); });
    PP.wireIssuesRisksDecisions(state, function () { refresh(state, true); });
```

- [ ] **Step 6: Register the new file in `build.py`'s `JS_ORDER`**

In `project-planner/build.py`, change:
```python
    "ui/billing.js",
    "ui/app.js",
]
```
to:
```python
    "ui/billing.js",
    "ui/issues.js",
    "ui/app.js",
]
```

- [ ] **Step 7: Join the two shared CSS selector groups**

In `project-planner/src/css/layout.css`, change:
```css
#settings-view, #resources-view, #billing-view { flex: 1; overflow: auto; padding: 16px 24px; }
```
to:
```css
#settings-view, #resources-view, #billing-view, #issues-view { flex: 1; overflow: auto; padding: 16px 24px; }
```

Change:
```css
.theme-btn, #new-project-button, #add-pic-button, #csv-template-button, #import-csv-button, #export-csv-button {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 7px 14px; font-size: 13px; cursor: pointer; margin-right: 6px;
  transition: background 150ms ease;
}
.theme-btn:hover, #new-project-button:hover, #add-pic-button:hover, #csv-template-button:hover, #import-csv-button:hover, #export-csv-button:hover { background: var(--surface-sunken); }
```
to:
```css
.theme-btn, #new-project-button, #add-pic-button, #csv-template-button, #import-csv-button, #export-csv-button, #add-issue-button, #add-risk-button, #add-decision-button {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 7px 14px; font-size: 13px; cursor: pointer; margin-right: 6px;
  transition: background 150ms ease;
}
.theme-btn:hover, #new-project-button:hover, #add-pic-button:hover, #csv-template-button:hover, #import-csv-button:hover, #export-csv-button:hover, #add-issue-button:hover, #add-risk-button:hover, #add-decision-button:hover { background: var(--surface-sunken); }
```

- [ ] **Step 8: Create the skeleton `src/js/ui/issues.js`**

Create `project-planner/src/js/ui/issues.js`:
```js
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderIssuesTable(issues) {
    var body = document.getElementById('issues-body');
    body.innerHTML = '';
    if (!issues.length) {
      body.textContent = 'No issues logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var headerRow = document.createElement('tr');
    ['Title', 'Description', 'Owner', 'Status', 'Date Raised', 'Date Resolved'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    issues.forEach(function (issue) {
      var tr = document.createElement('tr');
      tr.dataset.id = issue.id;
      tr.innerHTML =
        '<td>' + escapeHtml(issue.title) + '</td>' +
        '<td>' + escapeHtml(issue.description) + '</td>' +
        '<td>' + escapeHtml(issue.owner) + '</td>' +
        '<td>' + escapeHtml(issue.status) + '</td>' +
        '<td>' + escapeHtml(issue.dateRaised || '') + '</td>' +
        '<td>' + escapeHtml(issue.dateResolved || '') + '</td>';
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderRisksTable(risks) {
    var body = document.getElementById('risks-body');
    body.innerHTML = '';
    if (!risks.length) {
      body.textContent = 'No risks logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var headerRow = document.createElement('tr');
    ['Title', 'Description', 'Likelihood', 'Impact', 'Mitigation', 'Owner', 'Status', 'Date Raised'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    risks.forEach(function (risk) {
      var tr = document.createElement('tr');
      tr.dataset.id = risk.id;
      tr.innerHTML =
        '<td>' + escapeHtml(risk.title) + '</td>' +
        '<td>' + escapeHtml(risk.description) + '</td>' +
        '<td>' + escapeHtml(risk.likelihood) + '</td>' +
        '<td>' + escapeHtml(risk.impact) + '</td>' +
        '<td>' + escapeHtml(risk.mitigation) + '</td>' +
        '<td>' + escapeHtml(risk.owner) + '</td>' +
        '<td>' + escapeHtml(risk.status) + '</td>' +
        '<td>' + escapeHtml(risk.dateRaised || '') + '</td>';
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderDecisionsTable(decisions) {
    var body = document.getElementById('decisions-body');
    body.innerHTML = '';
    if (!decisions.length) {
      body.textContent = 'No decisions logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var headerRow = document.createElement('tr');
    ['Title', 'Description', 'Decision Needed By', 'Owner', 'Status', 'Decision Made'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    decisions.forEach(function (decision) {
      var tr = document.createElement('tr');
      tr.dataset.id = decision.id;
      tr.innerHTML =
        '<td>' + escapeHtml(decision.title) + '</td>' +
        '<td>' + escapeHtml(decision.description) + '</td>' +
        '<td>' + escapeHtml(decision.decisionNeededBy || '') + '</td>' +
        '<td>' + escapeHtml(decision.owner) + '</td>' +
        '<td>' + escapeHtml(decision.status) + '</td>' +
        '<td>' + escapeHtml(decision.decisionMade) + '</td>';
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderIssuesRisksDecisions(state) {
    renderIssuesTable(state.project.issues);
    renderRisksTable(state.project.risks);
    renderDecisionsTable(state.project.decisions);
  }

  function wireIssuesRisksDecisions(state, onChanged) {
    document.getElementById('add-issue-button').addEventListener('click', function () {
      state.project.addIssue({});
      onChanged();
    });
    document.getElementById('add-risk-button').addEventListener('click', function () {
      state.project.addRisk({});
      onChanged();
    });
    document.getElementById('add-decision-button').addEventListener('click', function () {
      state.project.addDecision({});
      onChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderIssuesRisksDecisions = renderIssuesRisksDecisions;
  window.PP.wireIssuesRisksDecisions = wireIssuesRisksDecisions;
})();
```

Note: at the end of this task the tables are read-only (no double-click edit, no dropdowns, no delete button yet) — that is completed in Task 3, matching this repo's established convention of scaffolding markup/rendering in one task and completing interactivity in the next (see the Resources tab plan's Task 2/Task 3 split), with live verification deferred entirely to the final task.

- [ ] **Step 9: Build and verify no regressions**

```bash
cd project-planner
node --check src/js/ui/issues.js
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean on both files; build succeeds; 197/197 tests pass (this task touches no engine/logic files, so the count from Task 1 must be unchanged).

- [ ] **Step 10: Commit**

```bash
cd project-planner
git add src/index.html src/js/ui/app.js src/js/ui/issues.js build.py src/css/layout.css
git commit -m "Scaffold Issues/Risks/Decisions tab with read-only tables"
```

---

### Task 3: Full inline-edit CRUD wiring

**Files:**
- Modify: `project-planner/src/js/ui/issues.js` (full rewrite of the render/wire logic added in Task 2)
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `state.project.updateIssue`/`deleteIssue` (and the Risk/Decision equivalents) from Task 1.
- Produces: same two exported names as Task 2 (`PP.renderIssuesRisksDecisions`, `PP.wireIssuesRisksDecisions`), now with full double-click-to-edit, dropdown, conditional-cell, and delete support. Task 4 verifies this live.

- [ ] **Step 1: Replace the entire contents of `src/js/ui/issues.js`**

Replace the full contents of `project-planner/src/js/ui/issues.js` with:
```js
(function () {
  'use strict';

  var ISSUE_STATUSES = ['Open', 'Resolved'];
  var RISK_STATUSES = ['Open', 'Mitigated', 'Closed'];
  var RISK_LEVELS = ['Low', 'Medium', 'High'];
  var DECISION_STATUSES = ['Pending', 'Decided'];

  function headerRow(labels) {
    var tr = document.createElement('tr');
    labels.forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      tr.appendChild(th);
    });
    return tr;
  }

  function textCell(field, value) {
    var span = document.createElement('span');
    span.className = 'cell';
    span.dataset.field = field;
    span.textContent = value || '';
    var td = document.createElement('td');
    td.appendChild(span);
    return td;
  }

  function conditionalTextCell(active, field, value) {
    var td = document.createElement('td');
    if (active) {
      var span = document.createElement('span');
      span.className = 'cell';
      span.dataset.field = field;
      span.textContent = value || '';
      td.appendChild(span);
    } else {
      var placeholder = document.createElement('span');
      placeholder.className = 'cell-inactive';
      placeholder.textContent = value || '—';
      td.appendChild(placeholder);
    }
    return td;
  }

  function selectCell(field, options, current) {
    var td = document.createElement('td');
    var select = document.createElement('select');
    select.dataset.field = field;
    options.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (current === opt) option.selected = true;
      select.appendChild(option);
    });
    td.appendChild(select);
    return td;
  }

  function deleteCell() {
    var td = document.createElement('td');
    var btn = document.createElement('button');
    btn.className = 'row-delete-btn';
    btn.textContent = 'Delete';
    td.appendChild(btn);
    return td;
  }

  function renderIssuesTable(issues) {
    var body = document.getElementById('issues-body');
    body.innerHTML = '';
    if (!issues.length) {
      body.textContent = 'No issues logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    table.appendChild(headerRow(['Title', 'Description', 'Owner', 'Status', 'Date Raised', 'Date Resolved', '']));
    issues.forEach(function (issue) {
      var tr = document.createElement('tr');
      tr.dataset.id = issue.id;
      tr.appendChild(textCell('title', issue.title));
      tr.appendChild(textCell('description', issue.description));
      tr.appendChild(textCell('owner', issue.owner));
      tr.appendChild(selectCell('status', ISSUE_STATUSES, issue.status));
      tr.appendChild(textCell('dateRaised', issue.dateRaised));
      tr.appendChild(conditionalTextCell(issue.status === 'Resolved', 'dateResolved', issue.dateResolved));
      tr.appendChild(deleteCell());
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderRisksTable(risks) {
    var body = document.getElementById('risks-body');
    body.innerHTML = '';
    if (!risks.length) {
      body.textContent = 'No risks logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    table.appendChild(headerRow(['Title', 'Description', 'Likelihood', 'Impact', 'Mitigation', 'Owner', 'Status', 'Date Raised', '']));
    risks.forEach(function (risk) {
      var tr = document.createElement('tr');
      tr.dataset.id = risk.id;
      tr.appendChild(textCell('title', risk.title));
      tr.appendChild(textCell('description', risk.description));
      tr.appendChild(selectCell('likelihood', RISK_LEVELS, risk.likelihood));
      tr.appendChild(selectCell('impact', RISK_LEVELS, risk.impact));
      tr.appendChild(textCell('mitigation', risk.mitigation));
      tr.appendChild(textCell('owner', risk.owner));
      tr.appendChild(selectCell('status', RISK_STATUSES, risk.status));
      tr.appendChild(textCell('dateRaised', risk.dateRaised));
      tr.appendChild(deleteCell());
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderDecisionsTable(decisions) {
    var body = document.getElementById('decisions-body');
    body.innerHTML = '';
    if (!decisions.length) {
      body.textContent = 'No decisions logged yet.';
      return;
    }
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    table.appendChild(headerRow(['Title', 'Description', 'Decision Needed By', 'Owner', 'Status', 'Decision Made', '']));
    decisions.forEach(function (decision) {
      var tr = document.createElement('tr');
      tr.dataset.id = decision.id;
      tr.appendChild(textCell('title', decision.title));
      tr.appendChild(textCell('description', decision.description));
      tr.appendChild(textCell('decisionNeededBy', decision.decisionNeededBy));
      tr.appendChild(textCell('owner', decision.owner));
      tr.appendChild(selectCell('status', DECISION_STATUSES, decision.status));
      tr.appendChild(conditionalTextCell(decision.status === 'Decided', 'decisionMade', decision.decisionMade));
      tr.appendChild(deleteCell());
      table.appendChild(tr);
    });
    body.appendChild(table);
  }

  function renderIssuesRisksDecisions(state) {
    renderIssuesTable(state.project.issues);
    renderRisksTable(state.project.risks);
    renderDecisionsTable(state.project.decisions);
  }

  function fieldInputType(field) {
    return (field === 'dateRaised' || field === 'dateResolved' || field === 'decisionNeededBy') ? 'date' : 'text';
  }

  function beginEditCell(cell, currentValue, inputType, onCommit, onCancel) {
    var el = document.createElement('input');
    el.className = 'cell-editor';
    el.type = inputType;
    el.value = currentValue || '';
    cell.innerHTML = '';
    cell.appendChild(el);
    el.focus();
    if (el.select) el.select();

    var settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      var value = el.value;
      if (inputType === 'date' && value === '') value = null;
      onCommit(value);
    }

    function cancel() {
      if (settled) return;
      settled = true;
      onCancel();
    }

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    el.addEventListener('blur', commit);
  }

  function wireCrudTable(containerId, getRecord, updateFn, deleteFn, who, onChanged, rerender) {
    var body = document.getElementById(containerId);

    body.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var id = tr.dataset.id;
      var field = cell.dataset.field;
      var record = getRecord(id);
      beginEditCell(cell, record[field], fieldInputType(field), function (value) {
        var patch = {};
        patch[field] = value;
        updateFn(id, patch, who);
        onChanged();
      }, function () {
        rerender();
      });
    });

    body.addEventListener('change', function (e) {
      var field = e.target.dataset.field;
      if (!field) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      var patch = {};
      patch[field] = e.target.value;
      updateFn(tr.dataset.id, patch, who);
      onChanged();
    });

    body.addEventListener('click', function (e) {
      if (!e.target.classList.contains('row-delete-btn')) return;
      var tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      deleteFn(tr.dataset.id, who);
      onChanged();
    });
  }

  function wireIssuesRisksDecisions(state, onChanged) {
    document.getElementById('add-issue-button').addEventListener('click', function () {
      state.project.addIssue({});
      onChanged();
    });
    document.getElementById('add-risk-button').addEventListener('click', function () {
      state.project.addRisk({});
      onChanged();
    });
    document.getElementById('add-decision-button').addEventListener('click', function () {
      state.project.addDecision({});
      onChanged();
    });

    wireCrudTable(
      'issues-body',
      function (id) { return state.project.issues.find(function (i) { return i.id === id; }); },
      function (id, patch, who) { state.project.updateIssue(id, patch, who); },
      function (id, who) { state.project.deleteIssue(id, who); },
      state.currentUser,
      onChanged,
      function () { renderIssuesTable(state.project.issues); }
    );

    wireCrudTable(
      'risks-body',
      function (id) { return state.project.risks.find(function (r) { return r.id === id; }); },
      function (id, patch, who) { state.project.updateRisk(id, patch, who); },
      function (id, who) { state.project.deleteRisk(id, who); },
      state.currentUser,
      onChanged,
      function () { renderRisksTable(state.project.risks); }
    );

    wireCrudTable(
      'decisions-body',
      function (id) { return state.project.decisions.find(function (d) { return d.id === id; }); },
      function (id, patch, who) { state.project.updateDecision(id, patch, who); },
      function (id, who) { state.project.deleteDecision(id, who); },
      state.currentUser,
      onChanged,
      function () { renderDecisionsTable(state.project.decisions); }
    );
  }

  window.PP = window.PP || {};
  window.PP.renderIssuesRisksDecisions = renderIssuesRisksDecisions;
  window.PP.wireIssuesRisksDecisions = wireIssuesRisksDecisions;
})();
```

- [ ] **Step 2: Add the remaining CSS (select styling, inactive-cell styling, delete button)**

In `project-planner/src/css/layout.css`, append at the end of the file:
```css
.dashboard-table select { font-size: 13px; padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.cell-inactive { color: var(--text-tertiary); }
.row-delete-btn { background: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); transition: background 150ms ease, border-color 150ms ease; }
.row-delete-btn:hover { background: var(--surface-sunken); border-color: var(--border); }
```

- [ ] **Step 3: Build and verify no regressions**

```bash
cd project-planner
node --check src/js/ui/issues.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 197/197 tests pass (this task touches no engine/logic files, so the count from Task 1 must be unchanged).

- [ ] **Step 4: Commit**

```bash
cd project-planner
git add src/js/ui/issues.js src/css/layout.css
git commit -m "Add full inline-edit CRUD wiring to Issues/Risks/Decisions tab"
```

---

### Task 4: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd project-planner
python3 build.py
node --test
```
Expected: 197/197 tests pass (the exact final count established in Task 1 — confirm it matches, don't assume).

- [ ] **Step 2: Serve and open the app**

```bash
cd project-planner/dist && python3 -m http.server <port>
```
Navigate to it (per this repo's convention, `file://` URLs are blocked by the Playwright sandbox). Complete the name-picker overlay if it appears.

- [ ] **Step 3: Confirm the tab appears correctly and doesn't break other tabs**

Click through every existing tab (Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Billing, Settings, Holidays, Reports) confirming each still renders and the previously-active tab correctly hides. Then click the new "Issues, Risks & Decisions" tab: confirm it becomes active/highlighted, its container un-hides, and all other view containers hide. Confirm the three sections render their empty-state placeholders ("No issues logged yet.", "No risks logged yet.", "No decisions logged yet.") on a fresh project.

- [ ] **Step 4: Add one entry to each of the three lists**

Click "+ Add Issue" — confirm a row appears with default title "New Issue", status dropdown showing "Open" selected, blank Owner/Description, blank Date Raised, and a non-editable "—" placeholder in Date Resolved (since status isn't Resolved).
Click "+ Add Risk" — confirm a row appears with default title "New Risk", Likelihood and Impact dropdowns both showing "Low", status "Open".
Click "+ Add Decision" — confirm a row appears with default title "New Decision", status dropdown showing "Pending", and a non-editable "—" placeholder in Decision Made (since status isn't Decided).

- [ ] **Step 5: Edit a field inline on each table**

On the Issues row: double-click the Title cell, confirm a real `<input>` appears pre-filled with "New Issue", type a new title (e.g. "Server outage in Bangkok region"), press Enter, confirm it commits and the row re-renders with the new title. Double-click Description, edit, press Escape, confirm it reverts (no change). Change the Status dropdown to "Resolved" — confirm the Date Resolved cell switches from the "—" placeholder to a real editable cell; double-click it, pick a date, press Enter, confirm it commits.

On the Risks row: change Likelihood to "High" and Impact to "Medium" via their dropdowns, confirm both commit immediately (no double-click needed). Double-click Mitigation, type text, press Enter, confirm it commits.

On the Decisions row: double-click Decision Needed By, pick a date via the date input, press Enter, confirm it commits. Change Status to "Decided" — confirm Decision Made switches from "—" to editable; double-click it, type the decision text, press Enter, confirm it commits.

- [ ] **Step 6: Delete one entry from each table**

Click the "Delete" button on the Issues row — confirm it disappears and (since it was the only issue) the "No issues logged yet." placeholder reappears. Repeat for the Risks row and the Decisions row, confirming each table independently returns to its own empty state.

- [ ] **Step 7: Confirm nothing leaks across the three tables**

Add two issues, one risk, and one decision. Edit a field on one issue and confirm only that issue's row changes (the other issue, the risk, and the decision are untouched). Delete the risk and confirm both issues and the decision remain exactly as they were. Confirm the counts/row totals in each table match exactly what was added/removed in that table alone.

- [ ] **Step 8: Confirm undo/redo still works for the new collections**

With at least one issue present, click the header `#undo-button` — confirm the most recent issue/risk/decision change reverts (row count or field value rolls back) and `#redo-button` becomes enabled. Click `#redo-button` — confirm it reapplies. (The tooltip text on these buttons is expected to read the generic `"Change"` when the reverted action was issue/risk/decision-only — this is an accepted limitation per this plan's Global Constraints, not a bug.)

- [ ] **Step 9: Confirm zero regression to existing functionality**

Switch to the Plan tab, add a task via "+ Add Task", confirm it still works. Spot-check Billing and Holidays tabs still render and accept edits as before. Confirm no uncaught JS errors were logged to the browser console throughout the whole session (only the benign favicon 404 is expected).

- [ ] **Step 10: Final test sweep**

```bash
cd project-planner
node --test
```
Confirm the same 197/197 count from Step 1 still passes.

- [ ] **Step 11: Record the result**

If every check in Steps 1–10 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1–3: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: a new "Issues, Risks & Decisions" tab holds three independent, fully editable record lists (Issues, Risks, Key Decisions Needed), each addable/editable/deletable via the same inline-cell-edit pattern used everywhere else in the app, backed by three new `Project` collections and nine new CRUD methods in `store.js`, fully covered by undo/redo, with zero cross-collection leakage and zero regression to any existing tab.
