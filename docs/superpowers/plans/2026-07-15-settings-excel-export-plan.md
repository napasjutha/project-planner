# Settings: Ready-to-Use Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export Excel" button to the Settings tab that downloads a formatted, ready-to-open spreadsheet (colors, bold headers, indentation) — an HTML-table-as-`.xls` file, since the app is zero-dependency.

**Architecture:** New pure engine file `src/js/xlsExport.js` (`buildExportXlsHtml`), registered in `build.py`'s `JS_ORDER`. New button in `src/index.html`'s Settings view, wired in `src/js/ui/settings.js` following the exact pattern of the existing `handleExportCsv` in `app.js`.

**Tech Stack:** Vanilla JS, `node:test`.

## Global Constraints

- Zero external dependencies. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`.
- Engines (`src/js/*.js`): UMD-lite, Node-tested, no DOM. `src/js/ui/*.js`: plain IIFEs, no Node coverage — verified only via the final controller-run Playwright task.
- Baseline: 253/253 Node tests passing as of this plan's start (re-verify via `node --test` before Task 1).
- This plan is **independent** of the other 3 plans written alongside it — different files, no merge-order dependency, safe on a parallel worktree.
- Output is HTML served with an `.xls` extension and `application/vnd.ms-excel` MIME type, styled with **inline** `style=` attributes only (Excel's HTML importer doesn't reliably honor `<style>` blocks) — this is a well-established zero-dependency technique for producing an Excel-openable file without a real xlsx library.
- The output string must be prefixed with a UTF-8 BOM (`'﻿'`) when the Blob is built, so Thai task names render correctly instead of mojibake — this is a hard requirement of "ready to use," not optional polish.
- New top-level engine files must be registered in `build.py`'s `JS_ORDER` among the other top-level engines (not the `ui/*` group) — `build.py` silently omits any file not listed there.
- Run `python3 build.py` after every `src/` change, before any manual/browser verification step.

---

### Task 1: `buildExportXlsHtml`

**Files:**
- Create: `src/js/xlsExport.js`
- Modify: `build.py` (register the new file in `JS_ORDER`)
- Test: `tests/xlsExport.test.js`

**Interfaces:**
- Produces: `buildExportXlsHtml(project, calc)` → a full HTML document string (see Step 3 for exact shape). Task 2 (UI) consumes this directly to build the download Blob.

- [ ] **Step 1: Register the new file in `build.py`**

In `build.py`, change the `JS_ORDER` list (currently):
```python
JS_ORDER = [
    "schedule.js",
    "calendar.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "csv.js",
    "criticalpath.js",
    "workload.js",
    "reportsEngine.js",
    "ui/imagecopy.js",
    ...
```
to add `"xlsExport.js",` directly after `"csv.js",` (it depends conceptually on the same task-list data csv.js already exports from, keeping related engines adjacent):
```python
JS_ORDER = [
    "schedule.js",
    "calendar.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "csv.js",
    "xlsExport.js",
    "criticalpath.js",
    "workload.js",
    "reportsEngine.js",
    "ui/imagecopy.js",
    ...
```
(only the one new line is added; everything else in the list is unchanged.)

- [ ] **Step 2: Write the failing tests**

Create `tests/xlsExport.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const { buildExportXlsHtml } = require('../src/js/xlsExport.js');

function fixtureProject() {
  return {
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Phase 1', owner: 'KPMG', pic: '', plannedStart: '2026-06-01', plannedFinish: '2026-06-20', actualStart: null, actualFinish: null, remarks: '' },
      { id: 't2', parentId: 't1', order: 0, name: 'การประชุมเริ่มโครงการ', owner: 'KPMG', pic: 'Somchai', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', remarks: '' },
      { id: 't3', parentId: 't1', order: 1, name: 'Build <Module A> & "Test"', owner: 'KPMG', pic: '', plannedStart: '2026-06-01', plannedFinish: '2026-06-05', actualStart: null, actualFinish: null, remarks: '' },
    ],
    holidays: [],
  };
}

test('buildExportXlsHtml produces one <tr> per calc.order entry plus one header row', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  const trCount = (html.match(/<tr/g) || []).length;
  assert.equal(trCount, calc.order.length + 1);
});

test('buildExportXlsHtml header row contains the documented columns', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', 'A-Start', 'A-Finish', 'Duration', 'Weight', '% Plan', '% Actual', 'Status', 'Remarks'].forEach(col => {
    assert.ok(html.includes(col), 'missing column header: ' + col);
  });
});

test('buildExportXlsHtml renders a Thai task name unescaped (just present as UTF-8 text)', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  assert.ok(html.includes('การประชุมเริ่มโครงการ'));
});

test('buildExportXlsHtml HTML-escapes special characters in task names', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  assert.ok(html.includes('Build &lt;Module A&gt; &amp; &quot;Test&quot;'));
  assert.ok(!html.includes('Build <Module A> & "Test"'));
});

test('buildExportXlsHtml applies a status-tint style to a Delayed row', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  // t3: plannedFinish 2026-06-05 is before statusDate 2026-07-09, no actualFinish -> Delayed
  const delayedRowMatch = html.match(/<tr[^>]*>(?:(?!<\/tr>).)*Build[\s\S]*?<\/tr>/);
  assert.ok(delayedRowMatch, 'could not find the Delayed row in the output');
  assert.ok(/background:\s*#f/i.test(delayedRowMatch[0]) || /background-color/i.test(delayedRowMatch[0]), 'Delayed row should carry a background tint style');
});

test('buildExportXlsHtml wraps the table in a UTF-8-charset HTML document', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('<table'));
  assert.ok(html.includes('</table>'));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `Cannot find module '../src/js/xlsExport.js'`.

- [ ] **Step 4: Implement `xlsExport.js`**

Create `src/js/xlsExport.js`:

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

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var COLUMNS = ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', 'A-Start', 'A-Finish', 'Duration', 'Weight', '% Plan', '% Actual', 'Status', 'Remarks'];
  var COL_WIDTHS = [50, 320, 100, 100, 80, 80, 80, 80, 60, 60, 60, 60, 90, 220];

  var STATUS_TINTS = {
    'Delayed': '#fdeaea',
    'Blocked': '#fdf0e0',
    'Complete': '#e8f7ec',
    'Cancelled': '#f0f0f0',
  };

  function buildExportXlsHtml(project, calc) {
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var cols = COL_WIDTHS.map(function (w) { return '<col style="width:' + w + 'px">'; }).join('');

    var headerCells = COLUMNS.map(function (label) {
      return '<th style="background:#00338D;color:#ffffff;font-weight:bold;padding:6px 8px;text-align:left;">' + escapeHtml(label) + '</th>';
    }).join('');
    var headerRow = '<tr>' + headerCells + '</tr>';

    var bodyRows = calc.order.map(function (id) {
      var task = byId.get(id);
      var c = calc.computed.get(id);
      var hasChildren = (calc.children.get(id) || []).length > 0;
      var rowStyle = hasChildren ? 'background:#f7f7f8;font-weight:bold;' : (STATUS_TINTS[c.status] ? 'background:' + STATUS_TINTS[c.status] + ';' : '');
      var nameStyle = 'padding-left:' + (c.depth * 16 + 8) + 'px;';

      var values = [
        c.wbs, task.name, task.owner || '', task.pic || '',
        task.plannedStart || '', task.plannedFinish || '',
        task.actualStart || '', task.actualFinish || '',
        c.duration, Math.round(c.weight * 100) + '%',
        Math.round(c.plannedPctToDate * 100) + '%', Math.round(c.actualPct * 100) + '%',
        c.status, task.remarks || '',
      ];

      var cells = values.map(function (v, i) {
        var extraStyle = i === 1 ? nameStyle : '';
        return '<td style="padding:4px 8px;border-bottom:1px solid #e5e5ea;' + extraStyle + '">' + escapeHtml(v) + '</td>';
      }).join('');

      return '<tr style="' + rowStyle + '">' + cells + '</tr>';
    }).join('');

    return '<html><head><meta charset="utf-8"></head><body>' +
      '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">' +
      cols + headerRow + bodyRows +
      '</table></body></html>';
  }

  return { buildExportXlsHtml: buildExportXlsHtml };
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — total count is your verified baseline + 6.

- [ ] **Step 6: Commit**

```bash
git add src/js/xlsExport.js build.py tests/xlsExport.test.js
git commit -m "feat: buildExportXlsHtml for a ready-to-use Excel export"
```

---

### Task 2: Settings tab UI — Export Excel button

**Files:**
- Modify: `src/index.html` (add the button, `index.html:138-152`)
- Modify: `src/js/ui/app.js` (add `handleExportExcel`, mirroring `handleExportCsv` at `app.js:304-316`, and wire the button in `showApp`)

**Interfaces:**
- Consumes: `PP.buildExportXlsHtml` (Task 1), `state.project`, `state.calc`, the existing `slugifyProjectName` helper (`app.js:225-228`).

- [ ] **Step 1: Add the button to `index.html`**

In `src/index.html`, inside `#settings-view`'s "Project" section (`index.html:144-152`), change:
```html
    <div class="settings-section">
      <h3>Project</h3>
      <label>Name <input id="project-rename-input" type="text"></label>
      <button id="new-project-button">New Project (blank)</button>
      <button id="csv-template-button">Download CSV Template</button>
      <button id="import-csv-button">Import CSV</button>
      <button id="export-csv-button">Export CSV</button>
      <input type="file" id="import-csv-input" accept=".csv,text/csv" hidden>
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
      <button id="export-csv-button">Export CSV</button>
      <button id="export-excel-button">Export Excel</button>
      <input type="file" id="import-csv-input" accept=".csv,text/csv" hidden>
    </div>
```

- [ ] **Step 2: Add `handleExportExcel` and wire the button in `app.js`**

In `src/js/ui/app.js`, add directly after `handleExportCsv` (ends at line 316):

```js

  function handleExportExcel(state) {
    var html = PP.buildExportXlsHtml(state.project, state.calc);
    var blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var dateStr = new Date().toISOString().slice(0, 10);
    a.download = slugifyProjectName(state.project.meta.name) + '_export_' + dateStr + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
```

Then find the `export-csv-button` wiring inside `showApp` (`app.js:367-369`) and add directly after it:

```js
    document.getElementById('export-excel-button').addEventListener('click', function () {
      handleExportExcel(state);
    });
```

- [ ] **Step 3: Build and confirm no regressions**

```bash
node --check src/js/ui/app.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 1's final count.

- [ ] **Step 4: Commit**

```bash
git add src/index.html src/js/ui/app.js
git commit -m "feat: Export Excel button on the Settings tab"
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
cd dist && python3 -m http.server 8797
```

Navigate to it with the Playwright browser tools. Complete the name-picker overlay if it appears. Load a project with at least one Thai-named task and at least one Delayed task.

- [ ] **Step 3: Confirm the Export Excel download**

Open the Settings tab, click Export Excel. Confirm a `.xls` file downloads (check the download's filename via the Playwright download-tracking, or inspect `a.download` via `browser_evaluate` before the click).

- [ ] **Step 4: Confirm the file's content is correct**

Read the downloaded file's raw text (via the filesystem path Playwright saved it to, or by re-deriving the same HTML through `browser_evaluate` calling `PP.buildExportXlsHtml` directly against the live `state`). Confirm: header cells are present, the Thai task name appears correctly (not mojibake), a Delayed row's `<tr>` carries a background-color style, the document starts with the UTF-8 BOM byte.

- [ ] **Step 5: Verify zero regression to every other tab**

Click through Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Deliverable/Billing, Holidays, Activities, Reports, Issues/Risks/Decisions. Confirm no console errors, and confirm the existing Export CSV button still works unchanged.

- [ ] **Step 6: Final test sweep**

```bash
node --test
```

Expected: same count as Step 1.

- [ ] **Step 7: Record the result**

If every check in Steps 1-6 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-2: fix it, re-run `python3 build.py`, and repeat this task's verification from the relevant step.
