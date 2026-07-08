# CSV Import (V2 Sub-Project D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Download CSV Template" button and an "Import CSV" flow that bulk-creates tasks (with Level-based hierarchy and Row-number-based predecessor links) from a hand-written, UTF-8/BOM-safe CSV parser — appending to the current project, all-or-nothing validation.

**Architecture:** One new pure engine file (`src/js/csv.js`: BOM strip, RFC4180-style parser, template text, full row validation) plus one new `store.js` method (`Project.addTasks` — batch insert under a single undo checkpoint, resolving Level→parentId). UI is two buttons in Settings wired in `app.js`, mirroring `handleSave`/`handleLoadProject`'s existing download/file-picker patterns. Final task is controller-run real-browser verification including a Thai-text round trip.

**Tech Stack:** Vanilla JS, `FileReader`, `Blob`, `node:test`. No new dependencies, no CSV library.

## Global Constraints

- Zero external dependencies, runtime or dev. No CSV parsing library — hand-written parser only.
- No code comments except where genuinely non-obvious.
- Import **appends** to the current project; it never wipes or replaces existing tasks.
- All-or-nothing validation: if any row has any error, nothing is added and every error is listed.
- Template columns, exact order: `Row,Level,Task Name,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors` (11 columns).
- Predecessors cell uses **semicolons** between Row #s (e.g. `2;3`), never commas.
- Encoding: `FileReader.readAsText(file, 'UTF-8')` and strip a leading BOM (`﻿`) — the fix for Excel "CSV UTF-8" exports garbling Thai text.
- Engines (`csv.js`, `store.js`): pure logic, no DOM, UMD-lite wrapper, TDD via `node:test`. UI (`app.js`, `index.html`): no Node coverage, verified in the final controller-run browser task.
- Test command: bare `node --test` from `project-planner/` (`node --test tests/` throws `MODULE_NOT_FOUND` on this Node version). Current suite: 108 tests; this plan adds more.
- Build command: `python3 build.py` from `project-planner/`. `build.py` inlines every file listed in its `JS_ORDER`; the new `src/js/csv.js` must be added to that list (engine group, before the `ui/` files) in the task that creates it.

---

### Task 1: `csv.js` — BOM strip, CSV parser, template text

**Files:**
- Create: `project-planner/src/js/csv.js`
- Create: `project-planner/tests/csv.test.js`
- Modify: `project-planner/build.py` (add `'js/csv.js'` to `JS_ORDER`, immediately after the other engine files and before the first `ui/` entry — open the file to find the list; entries are ordered engine-first already)

**Interfaces:**
- Consumes: nothing.
- Produces: `stripBom(text) -> string`, `parseCsvText(text) -> string[][]`, `csvTemplateText() -> string` — exported from `csv.js` (Task 2 adds `validateCsvRows` to the same file; Task 4's UI consumes all of them via `PP.*`).

- [ ] **Step 1: Write the failing tests**

Create `project-planner/tests/csv.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripBom, parseCsvText, csvTemplateText } = require('../src/js/csv.js');

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

test('csvTemplateText is the exact 11-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors\n'
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/csv.test.js`
Expected: FAIL — `Cannot find module '../src/js/csv.js'`.

- [ ] **Step 3: Create `src/js/csv.js` with the three functions**

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

  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Milestone', 'Billing Amount', 'Billing Status', 'Predecessors'];

  function stripBom(text) {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  function csvTemplateText() {
    return CSV_HEADERS.join(',') + '\n';
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            inQuotes = false;
            i += 1;
          }
        } else {
          cell += ch;
          i += 1;
        }
      } else if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
        i += 1;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 2;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 1;
      } else {
        cell += ch;
        i += 1;
      }
    }
    if (cell !== '' || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
  }

  return { stripBom, parseCsvText, csvTemplateText, CSV_HEADERS };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "project-planner" && node --test tests/csv.test.js`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Register `csv.js` in `build.py`, build, run full suite**

Open `project-planner/build.py`, find the `JS_ORDER` list, and add `'js/csv.js'` after the last non-`ui/` engine entry (keep engine files grouped before `ui/` files). Then:
```bash
cd "project-planner"
python3 build.py
grep -c "function parseCsvText" dist/ProjectPlanner.html
node --test
```
Expected: build succeeds; grep prints `1`; full suite passes (108 pre-existing + 8 new = 116).

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/js/csv.js tests/csv.test.js build.py
git commit -m "Add csv.js engine: BOM strip, hand-written CSV parser, template text"
```

---

### Task 2: `csv.js` — `validateCsvRows`

**Files:**
- Modify: `project-planner/src/js/csv.js`
- Modify: `project-planner/tests/csv.test.js`

**Interfaces:**
- Consumes: `CSV_HEADERS` (Task 1, same file).
- Produces: `validateCsvRows(rows) -> { errors: string[], tasks: object[] }`. When `errors` is empty, each `tasks[i]` is `{ _row: number, _level: number, name, pic, plannedStart, plannedFinish, remarks, milestone, billingAmount, billingStatus, predecessors: number[] }` in file order — `predecessors` holds **Row numbers** (not ids); `plannedStart`/`plannedFinish` are `'YYYY-MM-DD'` or `null`; `billingAmount` is a number or `null`; `billingStatus` is one of the three literals or `null`. Task 3's `Project.addTasks` consumes this shape; Task 4's `handleImportCsv` resolves Row numbers to real ids.

- [ ] **Step 1: Write the failing tests**

Append to `project-planner/tests/csv.test.js` (and add `validateCsvRows` to the require at the top of the file):
```js
const HEADER = 'Row,Level,Task Name,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors';

function rowsOf(text) {
  return parseCsvText(text);
}

test('validateCsvRows accepts a valid file and builds task specs in order', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Phase A,,,,,,,,\n' +
    '2,1,Design,Alice,2026-07-01,2026-07-10,first cut,,,,\n' +
    '3,1,Build,Bob,2026-07-11,2026-07-20,,Y,25000,Invoiced,2\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], {
    _row: 1, _level: 0, name: 'Phase A', pic: '', plannedStart: null, plannedFinish: null,
    remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [],
  });
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
  assert.ok(errors.some(e => /Row 1:.*11 columns/.test(e)));
});

test('validateCsvRows rejects duplicate and non-integer Row numbers', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,,,,\n' +
    '1,0,B,,,,,,,,\n' +
    'x,0,C,,,,,,,,\n'
  ));
  assert.ok(errors.some(e => /duplicate/i.test(e)));
  assert.ok(errors.some(e => /Row number 'x'/.test(e)));
});

test('validateCsvRows rejects a Level jump greater than +1 and a first row above level 0', () => {
  const jump = validateCsvRows(rowsOf(HEADER + '\n1,0,A,,,,,,,,\n2,2,B,,,,,,,,\n'));
  assert.ok(jump.errors.some(e => /Row 2:.*Level 2/.test(e)));
  const firstDeep = validateCsvRows(rowsOf(HEADER + '\n1,1,A,,,,,,,,\n'));
  assert.ok(firstDeep.errors.some(e => /Row 1:.*Level/.test(e)));
});

test('validateCsvRows rejects empty Task Name, bad dates, bad Billing values', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,,,next tuesday,2026-13-99,,maybe,lots,Sort Of,\n'
  ));
  assert.ok(errors.some(e => /Task Name/.test(e)));
  assert.ok(errors.some(e => /Planned Start/.test(e)));
  assert.ok(errors.some(e => /Billing Amount/.test(e)));
  assert.ok(errors.some(e => /Billing Status/.test(e)));
});

test('validateCsvRows rejects predecessor references to missing rows and to self', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,,,,99\n' +
    '2,0,B,,,,,,,,2\n'
  ));
  assert.ok(errors.some(e => /Row 1:.*99/.test(e)));
  assert.ok(errors.some(e => /Row 2:.*itself/i.test(e)));
});

test('validateCsvRows allows forward predecessor references', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,,,,2\n' +
    '2,0,B,,,,,,,,\n'
  ));
  assert.deepEqual(errors, []);
});

test('validateCsvRows returns no tasks when any error exists', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Good,,,,,,,,\n' +
    '2,0,,,,,,,,,\n'
  ));
  assert.ok(errors.length > 0);
  assert.deepEqual(tasks, []);
});

test('validateCsvRows parses milestone variants case-insensitively', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,yes,,,\n' +
    '2,0,B,,,,,TRUE,,,\n' +
    '3,0,C,,,,,n,,,\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].milestone, true);
  assert.equal(tasks[1].milestone, true);
  assert.equal(tasks[2].milestone, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/csv.test.js`
Expected: FAIL — `validateCsvRows is not a function`.

- [ ] **Step 3: Add `validateCsvRows` to `src/js/csv.js`**

Add above the return statement, and add `validateCsvRows` to the returned object:
```js
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MILESTONE_TRUE = ['y', 'yes', 'true', '1'];
  const BILLING_STATUSES = ['Not Billed', 'Invoiced', 'Paid'];

  function validateCsvRows(rows) {
    const errors = [];
    if (!rows.length || rows[0].map(c => c.trim()).join(',') !== CSV_HEADERS.join(',')) {
      errors.push("Header row must be exactly: " + CSV_HEADERS.join(','));
      return { errors, tasks: [] };
    }
    const dataRows = rows.slice(1);
    const seenRowNums = new Set();
    const specs = [];

    dataRows.forEach((cells, idx) => {
      const label = 'Row ' + (cells[0] !== undefined ? cells[0].trim() || '#' + (idx + 1) : '#' + (idx + 1));
      if (cells.length !== CSV_HEADERS.length) {
        errors.push(label + ': expected ' + CSV_HEADERS.length + ' columns, found ' + cells.length);
        return;
      }
      const c = cells.map(v => v.trim());
      const rowNum = Number(c[0]);
      if (!Number.isInteger(rowNum) || rowNum < 1) {
        errors.push(label + ": Row number '" + c[0] + "' must be a positive integer");
        return;
      }
      if (seenRowNums.has(rowNum)) {
        errors.push('Row ' + rowNum + ': duplicate Row number');
        return;
      }
      seenRowNums.add(rowNum);

      const level = Number(c[1]);
      if (!Number.isInteger(level) || level < 0) {
        errors.push('Row ' + rowNum + ": Level '" + c[1] + "' must be a non-negative integer");
      } else {
        const prevLevel = specs.length ? specs[specs.length - 1]._level : -1;
        if (level > prevLevel + 1) {
          errors.push('Row ' + rowNum + ': Level ' + level + ' skips from the previous row\'s Level ' + (specs.length ? prevLevel : 'none') + ' — indent one level at a time');
        }
      }

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
    });

    const allRowNums = new Set(specs.map(s => s._row));
    specs.forEach(s => {
      s.predecessors.forEach(p => {
        if (!allRowNums.has(p)) {
          errors.push('Row ' + s._row + ': Predecessor ' + p + ' does not exist in this file');
        }
      });
    });

    return errors.length ? { errors, tasks: [] } : { errors: [], tasks: specs };
  }
```
Change the return to `return { stripBom, parseCsvText, csvTemplateText, validateCsvRows, CSV_HEADERS };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "project-planner" && node --test tests/csv.test.js`
Expected: PASS, all csv tests (8 from Task 1 + 10 new = 18).

- [ ] **Step 5: Full suite, build, commit**

```bash
cd "project-planner"
node --test
python3 build.py
git add src/js/csv.js tests/csv.test.js
git commit -m "Add validateCsvRows: all-or-nothing CSV row validation"
```
Expected: 126 tests pass (116 + 10); build succeeds.

---

### Task 3: `store.js` — `Project.addTasks`

**Files:**
- Modify: `project-planner/src/js/store.js`
- Modify: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: the spec shape Task 2 produces (`_level`, `name`, `pic`, `plannedStart`, `plannedFinish`, `remarks`, `milestone`, `billingAmount`, `billingStatus`; `predecessors` is copied through untouched — the caller resolves it afterwards).
- Produces: `Project.addTasks(taskSpecs, who) -> Task[]` — creates one full-shape task per spec in order, resolving `_level` to `parentId` (nearest preceding spec in the same call with a strictly lower `_level`; level-0 specs get `parentId: null`), assigning `order` as the sibling count at insertion, all under **one** `_pushUndo()` checkpoint, with **one** audit entry summarizing the batch. Returns the created tasks (same order as specs) so the caller can map `specs[i]._row -> created[i].id`.

- [ ] **Step 1: Write the failing tests**

Append to `project-planner/tests/store.test.js`:
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

test('addTasks appends after existing root tasks with contiguous order', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'Existing' });
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Imported', pic: '', plannedStart: null, plannedFinish: null, remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created[0].order, 1);
});

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: FAIL — `p.addTasks is not a function`.

- [ ] **Step 3: Add `addTasks` to `src/js/store.js`**

Insert after the existing `addTask` method:
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
          name: spec.name, pic: spec.pic || '',
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

- [ ] **Step 4: Run tests to verify they pass, then full suite + build**

```bash
cd "project-planner"
node --test tests/store.test.js
node --test
python3 build.py
```
Expected: store tests pass; full suite 129 (126 + 3); build succeeds.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/store.js tests/store.test.js
git commit -m "Add Project.addTasks: batched hierarchical insert under one undo checkpoint"
```

---

### Task 4: Buttons + `app.js` wiring

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.csvTemplateText`, `PP.stripBom`, `PP.parseCsvText`, `PP.validateCsvRows` (Tasks 1-2), `Project.addTasks` (Task 3), existing `refresh(state, markDirty)`.
- Produces: `handleDownloadCsvTemplate()`, `handleImportCsv(state, file)` in `app.js` — wired to the new Settings buttons inside `showApp`.

- [ ] **Step 1: Add the buttons to the Settings "Project" section in `src/index.html`**

Change:
```html
    <div class="settings-section">
      <h3>Project</h3>
      <label>Name <input id="project-rename-input" type="text"></label>
      <button id="new-project-button">New Project (blank)</button>
    </div>
```
to:
```html
    <div class="settings-section">
      <h3>Project</h3>
      <label>Name <input id="project-rename-input" type="text"></label>
      <button id="new-project-button">New Project (blank)</button>
      <button id="csv-template-button">Download CSV Template</button>
      <button id="import-csv-button">Import CSV</button>
      <input type="file" id="import-csv-input" accept=".csv,text/csv" hidden>
    </div>
```
Also extend the secondary-button styling selector in `src/css/layout.css` — change:
```css
.theme-btn, #new-project-button, #add-pic-button {
```
to:
```css
.theme-btn, #new-project-button, #add-pic-button, #csv-template-button, #import-csv-button {
```
and the matching hover rule from:
```css
.theme-btn:hover, #new-project-button:hover, #add-pic-button:hover { background: var(--surface-sunken); }
```
to:
```css
.theme-btn:hover, #new-project-button:hover, #add-pic-button:hover, #csv-template-button:hover, #import-csv-button:hover { background: var(--surface-sunken); }
```

- [ ] **Step 2: Add the two handlers to `src/js/ui/app.js`**

Insert after `handleLoadProject`:
```js
  function handleDownloadCsvTemplate() {
    var blob = new Blob([PP.csvTemplateText()], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'project-planner-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportCsv(state, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var rows = PP.parseCsvText(PP.stripBom(reader.result));
      if (rows.length < 2) {
        window.alert('CSV has no data rows.');
        return;
      }
      var result = PP.validateCsvRows(rows);
      if (result.errors.length) {
        window.alert('Cannot import — ' + result.errors.length + ' error(s):\n' + result.errors.join('\n'));
        return;
      }
      var created = state.project.addTasks(result.tasks, state.currentUser);
      var rowToId = {};
      result.tasks.forEach(function (spec, i) { rowToId[spec._row] = created[i].id; });
      created.forEach(function (task) {
        task.predecessors = task.predecessors.map(function (rowNum) { return rowToId[rowNum]; });
      });
      window.alert('Imported ' + created.length + ' task(s).');
      refresh(state, true);
    };
    reader.onerror = function () {
      window.alert('Failed to read that file.');
    };
    reader.readAsText(file, 'UTF-8');
  }
```
In `showApp(state)`, after the existing `PP.wireReports(...)` line, add:
```js
    document.getElementById('csv-template-button').addEventListener('click', handleDownloadCsvTemplate);
    document.getElementById('import-csv-button').addEventListener('click', function () {
      document.getElementById('import-csv-input').click();
    });
    document.getElementById('import-csv-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) handleImportCsv(state, file);
      e.target.value = '';
    });
```

- [ ] **Step 3: Syntax-check, build, full suite**

```bash
cd "project-planner"
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 129 tests pass (no new Node tests — DOM/File code verified in Task 5).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/js/ui/app.js
git commit -m "Add Download CSV Template and Import CSV buttons wired to the csv engine"
```

---

### Task 5: End-to-end browser verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task.

**Files:** none (verification only).

- [ ] **Step 1: Build, seed a small project, serve** (`python3 build.py`, edit `dist/` seed only, `python3 -m http.server <port>`).
- [ ] **Step 2: Template download** — click "Download CSV Template" in Settings; read the downloaded file; confirm it is exactly the 11-column header line.
- [ ] **Step 3: Valid import round trip with Thai text** — write a small CSV (with a UTF-8 BOM prepended, mimicking Excel) containing a Phase A (level 0), two children (level 1, one named in Thai e.g. `งานออกแบบระบบ` with PIC `สมชาย`), a milestone with billing, and a Predecessors reference between the children. Import it. Confirm: tasks appear appended (existing seed tasks untouched), hierarchy/WBS correct, Thai text renders exactly (not mojibake — the BOM/UTF-8 check), milestone/billing fields landed, the predecessor link shows as a Gantt arrow, and a single Undo (if exposed) / the audit log records one import entry.
- [ ] **Step 4: Rejection path** — import a CSV with several deliberate errors (bad date, duplicate Row, level jump, unknown predecessor); confirm one alert listing all errors and zero tasks added. Import a header-only file; confirm the "no data rows" message.
- [ ] **Step 5: Console sweep + final suite** — no console errors beyond the benign favicon 404; `node --test` passes (129).
- [ ] **Step 6: Record result** — fix any failure in the owning file, rebuild, re-verify before the plan is done.

---

## Plan Complete

Save/Load untouched; Settings gains template-download and CSV-import; `csv.js` and `Project.addTasks` fully Node-tested; Thai text survives the round trip.
