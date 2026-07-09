# Owner / PIC Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the overloaded `pic` field into two: `owner` (team/committee, required, inherits today's `pic` values on load) and `pic` (individual person, optional, starts blank) — across the data model, CSV import/template, Plan tree, toolbar filters, Save validation, and Reports.

**Architecture:** Three engine files change first, each with its own Node-tested behavior (`store.js`: task shape + migration + required-owner check; `filters.js`: owner filter; `csv.js`: header/column-index shift + owner-required rule), then two UI tasks wire those engines into the DOM (Plan tree column + editing + duplicate; toolbar filter + Save gate + Reports column), then a final controller-run browser verification exercises the whole feature together, including migrating a realistic pre-existing project.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- Any user-controlled string going into `innerHTML` must be escaped via the existing `escapeHtml()` helper in `tree.js`, or use `.textContent`. Never concatenate raw strings into `innerHTML`.
- UI files (`src/js/ui/*.js`, `src/css/*.css`) have no automated test coverage by design (no jsdom) — verified via real-browser Playwright checks, not `node --test`. Engine files (`src/js/store.js`, `src/js/filters.js`, `src/js/csv.js`) are UMD-lite modules tested by `node --test`.
- Current baseline: 147/147 Node tests passing. Every task's test step must show the new total (baseline + this task's new tests) passing, with zero prior tests broken.
- `owner` is a display-text field, same as `pic`/`remarks`/`name` — never a lookup key or identifier. No code in this plan branches on a specific owner string value.
- `owner` required-ness checks (both the Save gate and CSV import) treat a whitespace-only value as missing: `!value || !value.trim()`. The *stored* value itself is never force-trimmed — only the required-ness check accounts for whitespace, matching this codebase's existing convention of not auto-trimming other free-text fields.
- Owner and PIC filter/matching is exact-string, case-sensitial — no case-normalization is introduced for either field, matching the existing PIC filter's behavior today.
- Owner filter dropdown values are sorted alphabetically (`Array.from(set).sort()`), matching the existing PIC filter's own sort.
- Resources view, `workload.js`, `resources.js`, and the "Only mine" filter are explicitly **out of scope** — none of them change in this plan.
- No `meta.schemaVersion` bump — not used for branching anywhere in this codebase; the per-task `owner === undefined` check is the migration gate.

---

### Task 1: `store.js` — task shape, migration, and Owner-required check

**Files:**
- Modify: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Project.addTask({ parentId, name, pic, owner })` now accepts and sets `owner` (default `''`). `Project.addTasks(taskSpecs, who)` reads `spec.owner || ''`. `new Project(data)` auto-migrates any task missing `owner`. `findTasksMissingOwner(project)` — new exported function, returns array of tasks (leaf and parent alike) whose `owner` is blank/whitespace-only. All of Task 4 and Task 5 depend on `findTasksMissingOwner` existing with this exact name and signature.

- [ ] **Step 1: Write the failing tests**

Add to `project-planner/tests/store.test.js` (the file already imports `Project`, `generateId`, `findIncompleteTasks`, `computeLastUpdated` from `../src/js/store.js` — change that import line to also pull `findTasksMissingOwner`):

```js
const { Project, generateId, findIncompleteTasks, findTasksMissingOwner, computeLastUpdated } = require('../src/js/store.js');
```

Then add these tests anywhere in the file (grouping near the existing `addTask`/migration-related tests is fine):

```js
test('addTask sets owner alongside pic, both defaulting to empty string', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Task A' });
  assert.equal(t.owner, '');
  assert.equal(t.pic, '');
  const t2 = p.addTask({ parentId: null, name: 'Task B', owner: 'KPMG', pic: 'Alice' });
  assert.equal(t2.owner, 'KPMG');
  assert.equal(t2.pic, 'Alice');
});

test('addTasks reads owner from specs, defaulting to empty string', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Phase A', owner: 'KPMG', pic: '' },
    { _row: 2, _level: 0, name: 'Phase B' },
  ], 'Alice');
  assert.equal(created[0].owner, 'KPMG');
  assert.equal(created[1].owner, '');
});

test('Project migrates a legacy task (owner undefined) by moving pic into owner and blanking pic', () => {
  const p = new Project({
    meta: { id: 'legacy', name: 'Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'Old Task', pic: 'KPMG/Central Team', deliverable: '', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, milestone: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, 'KPMG/Central Team');
  assert.equal(p.tasks[0].pic, '');
});

test('Project does not re-migrate a task that already has owner, even if owner is blank', () => {
  const p = new Project({
    meta: { id: 'migrated', name: 'Migrated', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'New-Style Task', owner: '', pic: 'Somchai', deliverable: '', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, milestone: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, '');
  assert.equal(p.tasks[0].pic, 'Somchai');
});

test('findTasksMissingOwner returns tasks with blank or whitespace-only owner, leaf and parent alike', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Phase', owner: '' });
  const leafOk = p.addTask({ parentId: parent.id, name: 'Leaf OK', owner: 'KPMG' });
  const leafBlank = p.addTask({ parentId: parent.id, name: 'Leaf Blank', owner: '' });
  const leafWhitespace = p.addTask({ parentId: parent.id, name: 'Leaf Whitespace', owner: '   ' });
  const missing = findTasksMissingOwner(p);
  const missingIds = missing.map(t => t.id).sort();
  assert.deepEqual(missingIds, [leafBlank.id, leafWhitespace.id, parent.id].sort());
  assert.ok(!missingIds.includes(leafOk.id));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `findTasksMissingOwner is not a function` (or `undefined`), and the `owner`-related assertions fail since `store.js` doesn't set or migrate `owner` yet.

- [ ] **Step 3: Implement the changes**

In `project-planner/src/js/store.js`, change the `Project` constructor:

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
    }
```
to:
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
      this.tasks.forEach(t => {
        if (t.owner === undefined) {
          t.owner = t.pic || '';
          t.pic = '';
        }
      });
    }
```

Change `addTask`:
```js
    addTask({ parentId = null, name = 'New Task', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, pic,
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

Change `addTasks`' per-spec task object:
```js
        const task = {
          id: generateId(), parentId, order: siblings.length,
          name: spec.name, pic: spec.pic || '',
          deliverable: '', jira: '', remarks: spec.remarks || '',
```
to:
```js
        const task = {
          id: generateId(), parentId, order: siblings.length,
          name: spec.name, owner: spec.owner || '', pic: spec.pic || '',
          deliverable: '', jira: '', remarks: spec.remarks || '',
```

Add `findTasksMissingOwner` next to `findIncompleteTasks`:
```js
  function findIncompleteTasks(project) {
    const parentIds = new Set(project.tasks.map(t => t.parentId).filter(Boolean));
    return project.tasks.filter(t => {
      if (parentIds.has(t.id)) return false;
      return !t.plannedStart || !t.plannedFinish;
    });
  }
```
to:
```js
  function findIncompleteTasks(project) {
    const parentIds = new Set(project.tasks.map(t => t.parentId).filter(Boolean));
    return project.tasks.filter(t => {
      if (parentIds.has(t.id)) return false;
      return !t.plannedStart || !t.plannedFinish;
    });
  }

  function findTasksMissingOwner(project) {
    return project.tasks.filter(t => !t.owner || !t.owner.trim());
  }
```

Add `findTasksMissingOwner` to the module's exports:
```js
  return { Project, generateId, findIncompleteTasks, computeLastUpdated };
```
to:
```js
  return { Project, generateId, findIncompleteTasks, findTasksMissingOwner, computeLastUpdated };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — all tests including the 5 new ones (152/152 total, since this task adds 5 new tests to the 147 baseline).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/store.js tests/store.test.js
git commit -m "Split pic into owner+pic: task shape, load migration, and findTasksMissingOwner"
```

---

### Task 2: `filters.js` — Owner filter

**Files:**
- Modify: `project-planner/src/js/filters.js`
- Test: `project-planner/tests/filters.test.js`

**Interfaces:**
- Consumes: nothing new from Task 1 (filters operate on plain task objects passed in by tests/callers, not `Project` instances).
- Produces: `taskMatches(task, computed, filters, currentUser)` now also checks `filters.owner` (exact match against `task.owner`). `hasActiveFilter(filters)` includes `filters.owner` in its OR-chain. Task 5 depends on both of these.

- [ ] **Step 1: Write the failing tests**

Add to `project-planner/tests/filters.test.js`:

```js
test('taskMatches: owner filter is an exact match', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: 'KPMG', pic: 'Alice', remarks: '', jira: '' };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'KPMG' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'Client Team' }, null), false);
});

test('taskMatches: owner and pic filters compose with AND', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: 'KPMG', pic: 'Alice', remarks: '', jira: '' };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'KPMG', pic: 'Alice' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'KPMG', pic: 'Bob' }, null), false);
});

test('hasActiveFilter is true when only owner is set', () => {
  assert.equal(hasActiveFilter({ search: '', owner: '', pic: '', status: '', onlyDelayed: false, onlyMine: false }), false);
  assert.equal(hasActiveFilter({ owner: 'KPMG' }), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — the owner-filter assertions fail since `filters.js` doesn't check `filters.owner` yet.

- [ ] **Step 3: Implement the changes**

In `project-planner/src/js/filters.js`, change:
```js
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

  function hasActiveFilter(filters) {
    return !!(filters.search || filters.pic || filters.status || filters.onlyDelayed || filters.onlyMine);
  }
```
to:
```js
  function taskMatches(task, computed, filters, currentUser) {
    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
      const haystack = `${task.name} ${task.remarks} ${task.jira}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.owner && task.owner !== filters.owner) return false;
    if (filters.pic && task.pic !== filters.pic) return false;
    if (filters.status && computed.status !== filters.status) return false;
    if (filters.onlyDelayed && computed.status !== 'Delayed') return false;
    if (filters.onlyMine && task.pic !== currentUser) return false;
    return true;
  }

  function hasActiveFilter(filters) {
    return !!(filters.search || filters.owner || filters.pic || filters.status || filters.onlyDelayed || filters.onlyMine);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 155/155 total (152 from Task 1 + 3 new).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/filters.js tests/filters.test.js
git commit -m "Add owner filter to filters.js"
```

---

### Task 3: `csv.js` — header/column-index shift and Owner-required rule

**Files:**
- Modify: `project-planner/src/js/csv.js`
- Test: `project-planner/tests/csv.test.js`

**Interfaces:**
- Consumes: nothing new from Tasks 1-2.
- Produces: `CSV_HEADERS` gains `'Owner'` as its 4th entry (index 3, before `'PIC'`). `validateCsvRows(rows)` returns task specs that include `owner`. Task 5's CSV round-trip verification depends on this new header order and the resulting `spec.owner` field (consumed by `store.js`'s `addTasks`, already wired in Task 1).

- [ ] **Step 1: Rewrite the CSV tests for the new column order**

This is a full rewrite of `project-planner/tests/csv.test.js`'s CSV-row-shaped content — every existing test row has one new blank/filled cell inserted at index 3, and the new Owner-required rule means every row that's expected to be *valid* must now have a non-blank Owner value (previously-blank test rows relied on every field but Task Name being optional). Replace the entire file with:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripBom, parseCsvText, csvTemplateText, validateCsvRows } = require('../src/js/csv.js');

test('stripBom removes a leading BOM and leaves clean text alone', () => {
  assert.equal(stripBom('﻿Row,Level'), 'Row,Level');
  assert.equal(stripBom('Row,Level'), 'Row,Level');
  assert.equal(stripBom(''), '');
});

test('parseCsvText splits simple rows and cells', () => {
  assert.deepEqual(parseCsvText('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parseCsvText handles CRLF line endings and skips a trailing empty line', () => {
  assert.deepEqual(parseCsvText('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('parseCsvText keeps commas inside quoted cells', () => {
  assert.deepEqual(parseCsvText('a,"b,c",d'), [['a', 'b,c', 'd']]);
});

test('parseCsvText unescapes doubled quotes inside quoted cells', () => {
  assert.deepEqual(parseCsvText('"say ""hi""",x'), [['say "hi"', 'x']]);
});

test('parseCsvText keeps newlines inside quoted cells', () => {
  assert.deepEqual(parseCsvText('"line1\nline2",x'), [['line1\nline2', 'x']]);
});

test('parseCsvText preserves non-ASCII text', () => {
  assert.deepEqual(parseCsvText('งานออกแบบ,สมชาย'), [['งานออกแบบ', 'สมชาย']]);
});

test('csvTemplateText is the exact 12-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors\n'
  );
});

const HEADER = 'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors';

function rowsOf(text) {
  return parseCsvText(text);
}

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

test('validateCsvRows rejects a wrong header row', () => {
  const { errors, tasks } = validateCsvRows(rowsOf('Row,Level,Name\n1,0,A'));
  assert.equal(tasks.length, 0);
  assert.ok(errors.length >= 1);
  assert.match(errors[0], /header/i);
});

test('validateCsvRows rejects wrong column count with the row number', () => {
  const { errors } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A'));
  assert.ok(errors.some(e => /Row 1:.*12 columns/.test(e)));
});

test('validateCsvRows rejects duplicate and non-integer Row numbers', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,,,\n' +
    '1,0,B,KPMG,,,,,,,,\n' +
    'x,0,C,KPMG,,,,,,,,\n'
  ));
  assert.ok(errors.some(e => /duplicate/i.test(e)));
  assert.ok(errors.some(e => /Row number 'x'/.test(e)));
});

test('validateCsvRows rejects a Level jump greater than +1 and a first row above level 0', () => {
  const jump = validateCsvRows(rowsOf(HEADER + '\n1,0,A,KPMG,,,,,,,,\n2,2,B,KPMG,,,,,,,,\n'));
  assert.ok(jump.errors.some(e => /Row 2:.*Level 2/.test(e)));
  const firstDeep = validateCsvRows(rowsOf(HEADER + '\n1,1,A,KPMG,,,,,,,,\n'));
  assert.ok(firstDeep.errors.some(e => /Row 1:.*Level/.test(e)));
});

test('validateCsvRows rejects empty Task Name, blank Owner, bad dates, bad Billing values', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,,,,next tuesday,2026-13-99,,maybe,lots,Sort Of,\n'
  ));
  assert.ok(errors.some(e => /Task Name/.test(e)));
  assert.ok(errors.some(e => /Owner is required/.test(e)));
  assert.ok(errors.some(e => /Planned Start/.test(e)));
  assert.ok(errors.some(e => /Billing Amount/.test(e)));
  assert.ok(errors.some(e => /Billing Status/.test(e)));
});

test('validateCsvRows rejects a whitespace-only Owner the same as a blank one', () => {
  const { errors } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A,   ,,,,,,,,\n'));
  assert.ok(errors.some(e => /Row 1:.*Owner is required/.test(e)));
});

test('validateCsvRows leaves PIC optional when Owner is present', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A,KPMG,,,,,,,,\n'));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].pic, '');
});

test('validateCsvRows rejects predecessor references to missing rows and to self', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,,,99\n' +
    '2,0,B,KPMG,,,,,,,,2\n'
  ));
  assert.ok(errors.some(e => /Row 1:.*99/.test(e)));
  assert.ok(errors.some(e => /Row 2:.*itself/i.test(e)));
});

test('validateCsvRows allows forward predecessor references', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,,,2\n' +
    '2,0,B,KPMG,,,,,,,,\n'
  ));
  assert.deepEqual(errors, []);
});

test('validateCsvRows returns no tasks when any error exists', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Good,KPMG,,,,,,,,\n' +
    '2,0,,KPMG,,,,,,,,\n'
  ));
  assert.ok(errors.length > 0);
  assert.deepEqual(tasks, []);
});

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — header/column-count/index-based assertions fail since `csv.js` still uses the 11-column layout with no Owner column or required-Owner rule.

- [ ] **Step 3: Implement the changes**

In `project-planner/src/js/csv.js`, change:
```js
  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Milestone', 'Billing Amount', 'Billing Status', 'Predecessors'];
```
to:
```js
  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Milestone', 'Billing Amount', 'Billing Status', 'Predecessors'];
```

Change the body of `validateCsvRows` (every index from the old `c[4]` onward shifts to `c[5]` onward; a new required-Owner check is added at the old-PIC's index 3):
```js
      if (!c[2]) errors.push('Row ' + rowNum + ': Task Name is required');
      if (c[4] && !DATE_RE.test(c[4])) errors.push('Row ' + rowNum + ": Planned Start '" + c[4] + "' is not a valid date (expected YYYY-MM-DD)");
      if (c[5] && !DATE_RE.test(c[5])) errors.push('Row ' + rowNum + ": Planned Finish '" + c[5] + "' is not a valid date (expected YYYY-MM-DD)");

      const milestone = MILESTONE_TRUE.indexOf(c[7].toLowerCase()) !== -1;

      let billingAmount = null;
      if (c[8]) {
        billingAmount = Number(c[8]);
        if (!isFinite(billingAmount)) {
          errors.push('Row ' + rowNum + ": Billing Amount '" + c[8] + "' is not a number");
          billingAmount = null;
        }
      }

      let billingStatus = null;
      if (c[9]) {
        if (BILLING_STATUSES.indexOf(c[9]) === -1) {
          errors.push('Row ' + rowNum + ": Billing Status '" + c[9] + "' must be one of: " + BILLING_STATUSES.join(', '));
        } else {
          billingStatus = c[9];
        }
      }

      const predecessors = [];
      if (c[10]) {
        c[10].split(';').forEach(part => {
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
        name: c[2], pic: c[3],
        plannedStart: c[4] || null, plannedFinish: c[5] || null,
        remarks: c[6], milestone,
        billingAmount, billingStatus, predecessors,
      });
```
to:
```js
      if (!c[2]) errors.push('Row ' + rowNum + ': Task Name is required');
      if (!c[3] || !c[3].trim()) errors.push('Row ' + rowNum + ': Owner is required');
      if (c[5] && !DATE_RE.test(c[5])) errors.push('Row ' + rowNum + ": Planned Start '" + c[5] + "' is not a valid date (expected YYYY-MM-DD)");
      if (c[6] && !DATE_RE.test(c[6])) errors.push('Row ' + rowNum + ": Planned Finish '" + c[6] + "' is not a valid date (expected YYYY-MM-DD)");

      const milestone = MILESTONE_TRUE.indexOf(c[8].toLowerCase()) !== -1;

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
        remarks: c[7], milestone,
        billingAmount, billingStatus, predecessors,
      });
```

Note: the column-count check earlier in the same function (`if (cells.length !== CSV_HEADERS.length) { errors.push(label + ': expected ' + CSV_HEADERS.length + ' columns, found ' + cells.length); return; }`) reads `CSV_HEADERS.length` directly, so it automatically becomes 12 (up from 11) once `CSV_HEADERS` grows in Step 3 above — no separate edit needed there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 157/157 total. The original `csv.test.js` had 18 tests; the rewritten version above has 20 (the same 18 behaviors, updated for the new column layout, plus 2 new ones — the whitespace-only-Owner rejection and the PIC-stays-optional-with-Owner-present case) — a net +2 over the original file, on top of the 155 from Task 2 (147 baseline + 5 from Task 1 + 3 from Task 2). Confirm this exact total from the actual test output, not by re-deriving the arithmetic.

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/csv.js tests/csv.test.js
git commit -m "Add Owner column to CSV import/template: required field, shifts PIC and later columns by one index"
```

---

### Task 4: Plan tree — Owner column, editing, and Duplicate

**Files:**
- Modify: `project-planner/src/js/ui/tree.js`
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `task.owner` (from Task 1's task shape).
- Produces: a 19th Plan-tree column, "Owner", immediately before "PIC". Task 5 and Task 6 rely on this column existing at this position.

- [ ] **Step 1: Add the Owner header cell**

In `project-planner/src/index.html`, change:
```html
    <div id="tree-header">
      <span>WBS</span>
      <span>Task</span>
      <span>PIC</span>
```
to:
```html
    <div id="tree-header">
      <span>WBS</span>
      <span>Task</span>
      <span>Owner</span>
      <span>PIC</span>
```

- [ ] **Step 2: Grow the grid to 19 columns**

In `project-planner/src/css/layout.css`, change:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px 140px;
  min-width: 1835px;
  align-items: center;
  padding: 8px 20px;
  gap: 8px;
  font-size: 13px;
}
```
to:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px 140px;
  min-width: 1925px;
  align-items: center;
  padding: 8px 20px;
  gap: 8px;
  font-size: 13px;
}
```
(A new `90px` column is inserted right after the existing `220px` Task column and before the pre-existing `90px` PIC column, matching PIC's own width; `min-width` grows from `1835px` to `1925px` — the sum of all 19 column widths.)

- [ ] **Step 3: Also update `#tree-body`'s matching `min-width`**

In the same file, change:
```css
#tree-body { flex: 1; overflow-y: auto; overflow-x: hidden; min-width: 1835px; }
```
to:
```css
#tree-body { flex: 1; overflow-y: auto; overflow-x: hidden; min-width: 1925px; }
```
(This rule must always match the `#tree-header, .tree-row` rule's own `min-width` literal exactly — see that rule's own comment-equivalent context from the prior UX-fixes plan; both values must move together.)

- [ ] **Step 4: Render the Owner cell and wire Duplicate**

In `project-planner/src/js/ui/tree.js`, in `renderTree()`, change:
```js
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + milestoneMarker + escapeHtml(task.name) +
        '</span>' +
        '<span class="cell col-pic" data-field="pic">' + escapeHtml(task.pic || '') + '</span>' +
```
to:
```js
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + milestoneMarker + escapeHtml(task.name) +
        '</span>' +
        '<span class="cell col-owner" data-field="owner">' + escapeHtml(task.owner || '') + '</span>' +
        '<span class="cell col-pic" data-field="pic">' + escapeHtml(task.pic || '') + '</span>' +
```

In the same file, in `showContextMenu()`, change the `Duplicate` action:
```js
      ['Duplicate', function () {
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          deliverable: task.deliverable, remarks: task.remarks,
        }, state.currentUser);
      }],
```
to:
```js
      ['Duplicate', function () {
        var copy = state.project.addTask({ parentId: task.parentId, name: task.name + ' (copy)', owner: task.owner, pic: task.pic });
        state.project.updateTask(copy.id, {
          plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
          deliverable: task.deliverable, remarks: task.remarks,
        }, state.currentUser);
      }],
```

No change is needed to `beginEdit()` — its generic text-input branch (the final `else` clause) already handles any `field` value it doesn't special-case, exactly as it already does for `pic` today, so `owner`'s dblclick-to-edit behavior works with zero additional code.

- [ ] **Step 5: Build**

```bash
cd project-planner
node --check src/js/ui/tree.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 157/157 tests pass (this task touches no engine/logic files, so the count from Task 3 must be unchanged — confirm the exact number from Task 3's own test run, not assumed).

- [ ] **Step 6: Live-verify in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least 2 tasks (one with `owner`/`pic` both set, one with only `owner` set). Confirm via `browser_evaluate`:
- The Plan tree renders 19 columns; the header's 3rd-from-left label is "Owner", 4th is "PIC".
- Each row's Owner cell shows the correct `task.owner` value.
- Dblclick the Owner cell → a text input appears, prefilled with the current value; type a new value, press Enter → the cell updates and `state.project.tasks` reflects the new `owner`.
- Right-click a task with both `owner` and `pic` set → click Duplicate → the new copy has the same `owner` and `pic` as the original.

- [ ] **Step 7: Commit**

```bash
cd project-planner
git add src/js/ui/tree.js src/index.html src/css/layout.css
git commit -m "Add Owner column to Plan tree: render, inline edit, and Duplicate"
```

---

### Task 5: Toolbar Owner filter, Save validation gate, and Reports Owner column

**Files:**
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/reports.js`

**Interfaces:**
- Consumes: `findTasksMissingOwner` (Task 1), `filters.owner`/`hasActiveFilter` (Task 2), the "Owner" Plan-tree column (Task 4, for cross-reference only — this task doesn't touch `tree.js`).
- Produces: a working `#owner-filter` toolbar dropdown, a Save gate that also blocks on missing Owner, and an Owner column in the Management Summary report. Task 6 verifies all of this live.

- [ ] **Step 1: Add the Owner filter select to the toolbar**

In `project-planner/src/index.html`, change:
```html
    <input id="search-input" type="text" placeholder="Search tasks...">
    <select id="pic-filter"><option value="">All PICs</option></select>
```
to:
```html
    <input id="search-input" type="text" placeholder="Search tasks...">
    <select id="owner-filter"><option value="">All Owners</option></select>
    <select id="pic-filter"><option value="">All PICs</option></select>
```

- [ ] **Step 2: Render and wire the Owner filter in `app.js`**

In `project-planner/src/js/ui/app.js`, change `renderPicFilter`:
```js
  function renderPicFilter(state) {
    var select = document.getElementById('pic-filter');
    var current = select.value;
    var picSet = new Set(state.project.picList || []);
    state.project.tasks.forEach(function (t) { if (t.pic) picSet.add(t.pic); });
    select.innerHTML = '';
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All PICs';
    select.appendChild(allOption);
    Array.from(picSet).sort().forEach(function (pic) {
      var option = document.createElement('option');
      option.value = pic;
      option.textContent = pic;
      select.appendChild(option);
    });
    select.value = current;
  }
```
to:
```js
  function renderPicFilter(state) {
    var select = document.getElementById('pic-filter');
    var current = select.value;
    var picSet = new Set(state.project.picList || []);
    state.project.tasks.forEach(function (t) { if (t.pic) picSet.add(t.pic); });
    select.innerHTML = '';
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All PICs';
    select.appendChild(allOption);
    Array.from(picSet).sort().forEach(function (pic) {
      var option = document.createElement('option');
      option.value = pic;
      option.textContent = pic;
      select.appendChild(option);
    });
    select.value = current;
  }

  function renderOwnerFilter(state) {
    var select = document.getElementById('owner-filter');
    var current = select.value;
    var ownerSet = new Set();
    state.project.tasks.forEach(function (t) { if (t.owner) ownerSet.add(t.owner); });
    select.innerHTML = '';
    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Owners';
    select.appendChild(allOption);
    Array.from(ownerSet).sort().forEach(function (owner) {
      var option = document.createElement('option');
      option.value = owner;
      option.textContent = owner;
      select.appendChild(option);
    });
    select.value = current;
  }
```

In `refresh()`, change:
```js
    renderHeader(state);
    renderPicFilter(state);
```
to:
```js
    renderHeader(state);
    renderPicFilter(state);
    renderOwnerFilter(state);
```

In `wireToolbar()`, change:
```js
    document.getElementById('pic-filter').addEventListener('change', function (e) {
      state.filters.pic = e.target.value;
      onFilterChange();
    });
```
to:
```js
    document.getElementById('owner-filter').addEventListener('change', function (e) {
      state.filters.owner = e.target.value;
      onFilterChange();
    });
    document.getElementById('pic-filter').addEventListener('change', function (e) {
      state.filters.pic = e.target.value;
      onFilterChange();
    });
```

In `boot()`, change the initial `state.filters` object:
```js
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
```
to:
```js
      filters: { search: '', owner: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
```

- [ ] **Step 3: Extend the Save gate to also block on missing Owner**

In `project-planner/src/js/ui/app.js`, change `handleSave`:
```js
  function handleSave(state) {
    var incomplete = PP.findIncompleteTasks(state.project);
    if (incomplete.length) {
      window.alert('Cannot save — missing planned dates on: ' + incomplete.map(function (t) { return t.name; }).join(', '));
      return;
    }
```
to:
```js
  function handleSave(state) {
    var missingDates = PP.findIncompleteTasks(state.project);
    var missingOwner = PP.findTasksMissingOwner(state.project);
    if (missingDates.length || missingOwner.length) {
      var msgs = [];
      if (missingDates.length) msgs.push('missing planned dates on: ' + missingDates.map(function (t) { return t.name; }).join(', '));
      if (missingOwner.length) msgs.push('missing Owner on: ' + missingOwner.map(function (t) { return t.name; }).join(', '));
      window.alert('Cannot save — ' + msgs.join('; '));
      return;
    }
```
(The rest of `handleSave`'s body, after this `if` block, is unchanged.)

- [ ] **Step 4: Add the Owner column to the Management Summary report**

In `project-planner/src/js/ui/reports.js`, in `renderSummaryReport`, change:
```js
    table.appendChild(el('tr', {}, ['WBS', 'Task', 'PIC', 'P-Start', 'P-Finish', '% Actual', 'Status'].map(function (h) { return el('th', {}, [h]); })));
    state.calc.order.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      table.appendChild(el('tr', {}, [
        el('td', {}, [c.wbs]), el('td', {}, [task.name]), el('td', {}, [task.pic || '']),
        el('td', {}, [c.plannedStart || '']), el('td', {}, [c.plannedFinish || '']),
        el('td', {}, [pct(c.actualPct)]), el('td', {}, [c.status]),
      ]));
    });
```
to:
```js
    table.appendChild(el('tr', {}, ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', '% Actual', 'Status'].map(function (h) { return el('th', {}, [h]); })));
    state.calc.order.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      table.appendChild(el('tr', {}, [
        el('td', {}, [c.wbs]), el('td', {}, [task.name]), el('td', {}, [task.owner || '']), el('td', {}, [task.pic || '']),
        el('td', {}, [c.plannedStart || '']), el('td', {}, [c.plannedFinish || '']),
        el('td', {}, [pct(c.actualPct)]), el('td', {}, [c.status]),
      ]));
    });
```
(`renderWeeklyReport` and `renderExecutiveReport` don't render a PIC column today — confirm this by reading both functions in full before starting — so neither needs an Owner column added; only `renderSummaryReport` is touched.)

- [ ] **Step 5: Build**

```bash
cd project-planner
node --check src/js/ui/app.js
node --check src/js/ui/reports.js
python3 build.py
node --test
```
Expected: syntax clean on both files; build succeeds; 157/157 tests pass (no engine files touched by this task).

- [ ] **Step 6: Live-verify in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least 3 tasks across 2 distinct `owner` values and a mix of tasks with/without planned dates and with/without `owner` set. Confirm via `browser_evaluate`/`browser_click`:
- The toolbar shows an "All Owners" dropdown listing the distinct owner values, alphabetically sorted, immediately before the PIC dropdown.
- Selecting an Owner value filters the Plan tree to only that owner's tasks (plus ancestors), matching the existing PIC-filter behavior.
- Clicking Save with at least one task missing `owner` and at least one task missing planned dates shows one alert containing both "missing planned dates on: ..." and "missing Owner on: ...", separated by `; `, and does not save.
- Fixing both issues and clicking Save again succeeds (no alert, `dirty-indicator` clears).
- Open the Reports tab, select "Management Summary" — confirm the table header includes "Owner" immediately before "PIC", and each row's Owner cell shows the correct value.

- [ ] **Step 7: Commit**

```bash
cd project-planner
git add src/js/ui/app.js src/index.html src/js/ui/reports.js
git commit -m "Add Owner toolbar filter, extend Save gate to require Owner, add Owner column to Management Summary report"
```

---

### Task 6: End-to-end verification, including migration of a realistic project (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd project-planner
python3 build.py
node --test
```
Expected: 157/157 tests pass (the exact final count established across Tasks 1-3 — confirm it matches, don't assume).

- [ ] **Step 2: Verify migration with a realistic pre-existing project**

Build a copy of `dist/ProjectPlanner.html` seeded with a project whose embedded `#project-data` JSON has tasks in the **old** shape — `pic` set to team/committee-style values (e.g. `"KPMG/คณะทำงานกลาง/คณะบริหารงานโครงการ"`), and **no `owner` key at all** on any task (simulating a real pre-existing save file, like the RAM UAT project, from before this feature existed). Serve it, navigate a Playwright browser to it, skip the name picker. Confirm via `browser_evaluate` reading `localStorage`'s saved project JSON (or `state.project.tasks` if exposed) that every task now has `owner` equal to its old `pic` value and `pic` reset to `''` — i.e., the migration in Task 1's `Project` constructor ran correctly against real-shaped legacy data, not just the unit-test fixtures.

- [ ] **Step 3: Verify the full feature end-to-end with fresh data**

Seed a new project (post-migration shape, `owner` and `pic` both present) with at least 8 tasks: a mix of parent/phase rows and leaves, at least 3 distinct `owner` values, at least 2 distinct `pic` values, at least one task with blank `owner` and one with blank `pic`, at least one milestone. Confirm:
- Plan tree shows Owner immediately before PIC, both editable via dblclick.
- Toolbar Owner filter and PIC filter both populate correctly and compose with AND (selecting both narrows to the intersection).
- Save is blocked when the blank-`owner` task exists, with the combined-alert message from Task 5; setting that task's Owner and saving again succeeds.
- CSV: download the template, confirm its header row is `Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors`; fill in a few rows (including one with Owner but blank PIC), import it, confirm the resulting tasks have the correct `owner`/`pic` split and that a row with blank Owner produces the "Owner is required" rejection with zero tasks imported.
- Reports → Management Summary shows both Owner and PIC columns with correct per-row values.
- Right-click Duplicate on a task with both fields set produces a copy with both fields intact.
- Resources view, workload/capacity grids, and the "Only mine" filter are visually and behaviorally unchanged from before this plan (still keyed on `pic` only) — spot-check by adding an `owner`-only task (blank `pic`) and confirming it contributes no workload demand, same as today's existing blank-PIC behavior.

- [ ] **Step 4: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole session (only the benign favicon 404 is expected). Then run:
```bash
cd project-planner
node --test
```
Confirm the same count from Step 1 still passes.

- [ ] **Step 5: Record the result**

If every check in Steps 1-4 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-5: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: every task has both an `owner` (team/committee, required) and a `pic` (individual person, optional) field; existing saved projects migrate automatically and silently on load; the Plan tree, toolbar filters, Save validation, CSV import/template, and Management Summary report all reflect both fields correctly; and Resources/workload/capacity/"Only mine" remain exactly as they were, still keyed on `pic` alone.
