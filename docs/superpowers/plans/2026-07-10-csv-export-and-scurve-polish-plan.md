# CSV Export + S-Curve Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a report-style CSV export, add Copy-as-Image to the S-Curve tab (via a shared helper extracted from Reports), and fix the S-Curve Actual line to stop at the status date instead of flat-lining across future dates.

**Architecture:** Task 1 adds a pure-function CSV serializer to the `csv.js` engine (Node-tested). Task 2 wires it into the UI via a new Settings button, following the exact download-trigger pattern `handleSave`/`handleDownloadCsvTemplate` already use. Task 3 extracts Reports' existing canvas-rasterize-to-clipboard logic into a new shared `imagecopy.js` file and gives S-Curve the same capability. Task 4 fixes the S-Curve Actual line's date range, independent of the other three. Task 5 is controller-run browser verification of all of it together.

**Tech Stack:** Same as the rest of the project — hand-written JS/CSS, `node:test`, zero external dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- Any user-controlled string going into `innerHTML` must be escaped via `escapeHtml()` or use `.textContent`/`createTextNode`. The CSV export path uses `Blob`/`createElement('a')`/text concatenation only — never `innerHTML` — so this constraint mainly binds Task 3/4's DOM-building code, which must follow the same `.textContent`/`createElement` pattern the rest of the codebase already uses (no new `innerHTML` string-building).
- All CSV work (reading, writing, generating, or fixing) in this project must use UTF-8, since real project data is heavily Thai — this is a persisted, standing rule, not new to this plan. The CSV export specifically must include a UTF-8 BOM (`﻿`) so Excel auto-detects UTF-8 on double-click open rather than guessing the system codepage.
- CSV export column order is fixed: `WBS, Task, Owner, PIC, P-Start, P-Finish, A-Start, A-Finish, Duration, Weight, %Plan, %Actual, Status, Updated By, Updated At, Remarks, Predecessors` — exactly 17 columns, no Milestone or Billing columns.
- CSV export line endings are `\r\n` (CRLF), matching RFC4180/Excel expectations — not `\n`.
- CSV export is a full-project snapshot — it must ignore any active Plan-tab filters (`state.filters`) and iterate every task via `state.calc.order`, matching how the existing JSON `handleSave` already behaves.
- The S-Curve Actual line's date-range fix must not change the Planned line's range or `calc.js`'s `computeScurve`/`endBound` logic at all — only which points the Actual line and its hover dots are drawn through.
- Current baseline: 159/159 Node tests passing. UI files (`src/js/ui/*.js`) have no automated test coverage by design (no jsdom) — verified via real-browser Playwright checks, not `node --test`.

---

### Task 1: `csv.js` — CSV export serializer

**Files:**
- Modify: `project-planner/src/js/csv.js`
- Test: `project-planner/tests/csv.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `escapeCsvField(value) -> string` and `buildExportCsv(project, calc, lastUpdated) -> string`, both newly exported from `csv.js`. `project` is a plain object with a `tasks` array (each task having `id`, `name`, `owner`, `pic`, `plannedStart`, `plannedFinish`, `actualStart`, `actualFinish`, `remarks`, `predecessors`). `calc` has `order` (array of task ids in display order) and `computed` (a `Map` from task id to `{ wbs, duration, weight, plannedPctToDate, actualPct, status }`). `lastUpdated` is a `Map` from task id to `{ who, when }` or absent. Task 2 depends on `buildExportCsv` existing with this exact name and 3-argument signature.

- [ ] **Step 1: Write the failing tests**

Add to `project-planner/tests/csv.test.js` (the file already imports from `../src/js/csv.js` at the top — change that import line to also pull `escapeCsvField` and `buildExportCsv`):

```js
const { stripBom, parseCsvText, csvTemplateText, validateCsvRows, escapeCsvField, buildExportCsv } = require('../src/js/csv.js');
```

Then add these tests anywhere in the file:

```js
test('escapeCsvField leaves plain values untouched and normalizes null/undefined to empty string', () => {
  assert.equal(escapeCsvField('Alice'), 'Alice');
  assert.equal(escapeCsvField(''), '');
  assert.equal(escapeCsvField(null), '');
  assert.equal(escapeCsvField(undefined), '');
  assert.equal(escapeCsvField(42), '42');
});

test('escapeCsvField quotes and escapes values containing commas, quotes, or newlines', () => {
  assert.equal(escapeCsvField('a,b'), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
});

test('buildExportCsv on an empty project produces just the BOM-prefixed header row with a trailing CRLF', () => {
  const csv = buildExportCsv({ tasks: [] }, { order: [], computed: new Map() }, new Map());
  assert.equal(csv, '﻿WBS,Task,Owner,PIC,P-Start,P-Finish,A-Start,A-Finish,Duration,Weight,%Plan,%Actual,Status,Updated By,Updated At,Remarks,Predecessors\r\n');
});

test('buildExportCsv writes one row per task in calc.order with formatted values', () => {
  const project = { tasks: [
    { id: 't1', name: 'Design', owner: 'KPMG', pic: 'Alice', plannedStart: '2026-01-05', plannedFinish: '2026-01-10', actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
  ] };
  const calc = {
    order: ['t1'],
    computed: new Map([['t1', { wbs: '1.1', duration: 5, weight: 0.25, plannedPctToDate: 0.6, actualPct: 0.3, status: 'In Progress' }]]),
  };
  const lastUpdated = new Map([['t1', { who: 'Bob', when: '2026-01-08T10:30:00.000Z' }]]);
  const csv = buildExportCsv(project, calc, lastUpdated);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '1.1,Design,KPMG,Alice,2026-01-05,2026-01-10,,,5,25%,60%,30%,In Progress,Bob,2026-01-08 10:30,,');
});

test('buildExportCsv renders predecessors as comma-separated WBS references and blanks missing fields', () => {
  const project = { tasks: [
    { id: 'a', name: 'A', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
    { id: 'b', name: 'B', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: ['a'] },
  ] };
  const calc = {
    order: ['a', 'b'],
    computed: new Map([
      ['a', { wbs: '1', duration: 0, weight: 0.5, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }],
      ['b', { wbs: '2', duration: 0, weight: 0.5, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }],
    ]),
  };
  const csv = buildExportCsv(project, calc, new Map());
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '1,A,KPMG,,,,,,0,50%,0%,0%,Not Start,,,,');
  assert.equal(lines[2], '2,B,KPMG,,,,,,0,50%,0%,0%,Not Start,,,,1');
});

test('buildExportCsv escapes a task name containing a comma', () => {
  const project = { tasks: [
    { id: 't1', name: 'Design, Build & Test', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
  ] };
  const calc = { order: ['t1'], computed: new Map([['t1', { wbs: '1', duration: 0, weight: 1, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }]]) };
  const csv = buildExportCsv(project, calc, new Map());
  assert.ok(csv.includes('"Design, Build & Test"'));
});

test('buildExportCsv escapes Thai text with embedded newlines (Owner field) without corrupting it', () => {
  const project = { tasks: [
    { id: 't1', name: 'งานย่อยที่ 1', owner: 'KPMG/\nคณะทำงานกลาง', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
  ] };
  const calc = { order: ['t1'], computed: new Map([['t1', { wbs: '1', duration: 0, weight: 1, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }]]) };
  const csv = buildExportCsv(project, calc, new Map());
  assert.ok(csv.includes('"KPMG/\nคณะทำงานกลาง"'));
  assert.ok(csv.includes('งานย่อยที่ 1'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-planner && node --test`
Expected: FAIL — `escapeCsvField is not a function` / `buildExportCsv is not a function`, since neither exists in `csv.js` yet.

- [ ] **Step 3: Implement the changes**

In `project-planner/src/js/csv.js`, add these two functions right before the final `return { ... }` statement:

```js
  function escapeCsvField(value) {
    var s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  var EXPORT_HEADERS = ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', 'A-Start', 'A-Finish', 'Duration', 'Weight', '%Plan', '%Actual', 'Status', 'Updated By', 'Updated At', 'Remarks', 'Predecessors'];

  function buildExportCsv(project, calc, lastUpdated) {
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));
    var rows = [EXPORT_HEADERS.map(escapeCsvField).join(',')];
    calc.order.forEach(function (id) {
      var task = byId.get(id);
      var c = calc.computed.get(id);
      var lu = lastUpdated.get(id);
      var predText = (task.predecessors || [])
        .map(function (pid) { var pc = calc.computed.get(pid); return pc ? pc.wbs : null; })
        .filter(Boolean)
        .join(', ');
      var fields = [
        c.wbs, task.name, task.owner || '', task.pic || '',
        task.plannedStart || '', task.plannedFinish || '',
        task.actualStart || '', task.actualFinish || '',
        c.duration, Math.round(c.weight * 100) + '%',
        Math.round(c.plannedPctToDate * 100) + '%', Math.round(c.actualPct * 100) + '%',
        c.status, lu ? lu.who : '', lu ? lu.when.slice(0, 16).replace('T', ' ') : '',
        task.remarks || '', predText,
      ];
      rows.push(fields.map(escapeCsvField).join(','));
    });
    return '﻿' + rows.join('\r\n') + '\r\n';
  }
```

Change the module's final return statement from:
```js
  return { stripBom, parseCsvText, csvTemplateText, validateCsvRows, CSV_HEADERS };
```
to:
```js
  return { stripBom, parseCsvText, csvTemplateText, validateCsvRows, CSV_HEADERS, escapeCsvField, buildExportCsv, EXPORT_HEADERS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-planner && node --test`
Expected: PASS — 166/166 total (159 baseline + 7 new tests in this task).

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/csv.js tests/csv.test.js
git commit -m "Add CSV export serializer: escapeCsvField and buildExportCsv"
```

---

### Task 2: Export CSV button (Settings tab)

**Files:**
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/src/index.html`

**Interfaces:**
- Consumes: `PP.buildExportCsv(project, calc, lastUpdated)` (Task 1).
- Produces: a working "Export CSV" button in Settings. Task 5 verifies this live.

- [ ] **Step 1: Add the button to Settings**

In `project-planner/src/index.html`, change:
```html
      <button id="csv-template-button">Download CSV Template</button>
      <button id="import-csv-button">Import CSV</button>
      <input type="file" id="import-csv-input" accept=".csv,text/csv" hidden>
```
to:
```html
      <button id="csv-template-button">Download CSV Template</button>
      <button id="import-csv-button">Import CSV</button>
      <button id="export-csv-button">Export CSV</button>
      <input type="file" id="import-csv-input" accept=".csv,text/csv" hidden>
```

- [ ] **Step 2: Add the handler and wire it**

In `project-planner/src/js/ui/app.js`, add a new function right after `handleDownloadCsvTemplate`:
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
```
becomes:
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

  function handleExportCsv(state) {
    var csvText = PP.buildExportCsv(state.project, state.calc, state.lastUpdated);
    var blob = new Blob([csvText], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var dateStr = new Date().toISOString().slice(0, 10);
    a.download = slugifyProjectName(state.project.meta.name) + '_export_' + dateStr + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
```

Then, in `showApp(state)`, change:
```js
    document.getElementById('csv-template-button').addEventListener('click', handleDownloadCsvTemplate);
    document.getElementById('import-csv-button').addEventListener('click', function () {
```
to:
```js
    document.getElementById('csv-template-button').addEventListener('click', handleDownloadCsvTemplate);
    document.getElementById('export-csv-button').addEventListener('click', function () {
      handleExportCsv(state);
    });
    document.getElementById('import-csv-button').addEventListener('click', function () {
```

- [ ] **Step 3: Build**

```bash
cd project-planner
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 166/166 tests pass (this task touches no engine/logic files, so the count from Task 1 must be unchanged).

- [ ] **Step 4: Live-verify in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least 3 tasks including one with a comma in its name and one with Thai text and a predecessor link. Confirm via `browser_evaluate`/a real click:
- Settings tab shows "Export CSV" next to "Import CSV" and "Download CSV Template".
- Clicking it downloads a `.csv` file named `<slug>_export_<today's date>.csv`.
- Read the downloaded file's raw bytes: confirm it starts with the UTF-8 BOM (`0xEF 0xBB 0xBF`), the header row matches `WBS,Task,Owner,PIC,P-Start,P-Finish,A-Start,A-Finish,Duration,Weight,%Plan,%Actual,Status,Updated By,Updated At,Remarks,Predecessors` exactly, line endings are CRLF, the comma-containing task name is quoted, the Thai text is intact (not mojibake), and the predecessor task's row shows the other task's WBS string in its Predecessors column.

- [ ] **Step 5: Commit**

```bash
cd project-planner
git add src/js/ui/app.js src/index.html
git commit -m "Add Export CSV button to Settings"
```

---

### Task 3: S-Curve Copy-as-Image (shared helper extraction)

**Files:**
- Create: `project-planner/src/js/ui/imagecopy.js`
- Modify: `project-planner/src/js/ui/reports.js`
- Modify: `project-planner/src/js/ui/scurve.js`
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/build.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PP.copyElementAsImage(el)` — a new global function any UI file can call to copy a DOM element as a PNG image to the clipboard. Both `reports.js` and `scurve.js` consume it after this task.

- [ ] **Step 1: Create the shared helper**

Create `project-planner/src/js/ui/imagecopy.js`:
```js
(function () {
  'use strict';

  function collectAllStyles() {
    return Array.from(document.styleSheets).map(function (sheet) {
      try {
        return Array.from(sheet.cssRules).map(function (r) { return r.cssText; }).join('\n');
      } catch (e) {
        return '';
      }
    }).join('\n');
  }

  function elementToPngBlob(el) {
    return new Promise(function (resolve, reject) {
      var rect = el.getBoundingClientRect();
      var width = rect.width;
      var height = rect.height;
      var styleText = collectAllStyles();
      var xml = new XMLSerializer().serializeToString(el);
      var svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + styleText + '</style>' + xml + '</div>' +
        '</foreignObject></svg>';
      var dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        var ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      };
      img.onerror = function () {
        reject(new Error('failed to rasterize element'));
      };
      img.src = dataUri;
    });
  }

  function copyElementAsImage(el) {
    if (!el || !el.firstChild) return;
    elementToPngBlob(el).then(function (blob) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }).catch(function (err) {
      window.alert('Copy as Image failed: ' + err.message);
    });
  }

  window.PP = window.PP || {};
  window.PP.copyElementAsImage = copyElementAsImage;
})();
```

- [ ] **Step 2: Register it in the build order**

In `project-planner/build.py`, change:
```python
    "ui/predecessor-picker.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/scurve.js",
```
to:
```python
    "ui/imagecopy.js",
    "ui/predecessor-picker.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/scurve.js",
```
(`imagecopy.js` must load before both `reports.js` and `scurve.js`, since both will call `PP.copyElementAsImage`; placing it early in the `ui/*` group satisfies this for every later `ui/*` file.)

- [ ] **Step 3: Refactor `reports.js` to use the shared helper**

In `project-planner/src/js/ui/reports.js`, remove the `collectAllStyles` and `panelToPngBlob` functions entirely (delete these two function definitions):
```js
  function collectAllStyles() {
    return Array.from(document.styleSheets).map(function (sheet) {
      try {
        return Array.from(sheet.cssRules).map(function (r) { return r.cssText; }).join('\n');
      } catch (e) {
        return '';
      }
    }).join('\n');
  }

  function panelToPngBlob(panelEl) {
    return new Promise(function (resolve, reject) {
      var rect = panelEl.getBoundingClientRect();
      var width = rect.width;
      var height = rect.height;
      var styleText = collectAllStyles();
      var xml = new XMLSerializer().serializeToString(panelEl);
      var svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + styleText + '</style>' + xml + '</div>' +
        '</foreignObject></svg>';
      var dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        var ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      };
      img.onerror = function () {
        reject(new Error('failed to rasterize report panel'));
      };
      img.src = dataUri;
    });
  }
```

Then change `copyPanelAsImage`:
```js
  function copyPanelAsImage() {
    var panel = document.getElementById('report-panel');
    if (!panel.firstChild) return;
    panelToPngBlob(panel).then(function (blob) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }).catch(function (err) {
      window.alert('Copy as Image failed: ' + err.message);
    });
  }
```
to:
```js
  function copyPanelAsImage() {
    PP.copyElementAsImage(document.getElementById('report-panel'));
  }
```

- [ ] **Step 4: Add the S-Curve button and wire it**

In `project-planner/src/index.html`, change:
```html
  <div id="scurve-view" hidden>
    <div id="scurve-toolbar">
      <label>Overlay snapshot
        <select id="scurve-overlay-select"><option value="">None</option></select>
      </label>
    </div>
    <div id="scurve-body"></div>
  </div>
```
to:
```html
  <div id="scurve-view" hidden>
    <div id="scurve-toolbar">
      <label>Overlay snapshot
        <select id="scurve-overlay-select"><option value="">None</option></select>
      </label>
      <button id="scurve-copy-image-button">Copy as Image</button>
    </div>
    <div id="scurve-body"></div>
  </div>
```

In `project-planner/src/js/ui/scurve.js`, change `wireScurve`:
```js
  function wireScurve(state, onOverlayChanged) {
    document.getElementById('scurve-overlay-select').addEventListener('change', function (e) {
      state.scurveOverlaySnapshotId = e.target.value || null;
      onOverlayChanged();
    });
  }
```
to:
```js
  function wireScurve(state, onOverlayChanged) {
    document.getElementById('scurve-overlay-select').addEventListener('change', function (e) {
      state.scurveOverlaySnapshotId = e.target.value || null;
      onOverlayChanged();
    });
    document.getElementById('scurve-copy-image-button').addEventListener('click', function () {
      PP.copyElementAsImage(document.getElementById('scurve-body'));
    });
  }
```

- [ ] **Step 5: Build**

```bash
cd project-planner
node --check src/js/ui/imagecopy.js
node --check src/js/ui/reports.js
node --check src/js/ui/scurve.js
python3 build.py
node --test
```
Expected: syntax clean on all three files; build succeeds; 166/166 tests pass (this task touches no engine/logic files, so the count from Task 2 must be unchanged).

- [ ] **Step 6: Live-verify in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least 2 tasks with planned dates and some actual progress (so both the Plan and S-Curve tabs have real content to rasterize). Confirm via a real `browser_click` (not a JS-evaluated `.click()` — clipboard writes require a genuine user-gesture-equivalent event, per this project's own documented gotcha):
- Reports tab: select any template, click "Copy as Image" — confirm it still works exactly as before (no regression from the extraction). Read the clipboard's `image/png` entry and confirm it's non-empty.
- S-Curve tab: click the new "Copy as Image" button — confirm the clipboard receives a non-empty `image/png` entry.
- Confirm zero console errors during both operations.

- [ ] **Step 7: Commit**

```bash
cd project-planner
git add src/js/ui/imagecopy.js src/js/ui/reports.js src/js/ui/scurve.js src/index.html build.py
git commit -m "Add Copy-as-Image to S-Curve via a shared imagecopy.js helper extracted from Reports"
```

---

### Task 4: S-Curve Actual line stops at the status date

**Files:**
- Modify: `project-planner/src/js/ui/scurve.js`

**Interfaces:**
- Consumes: `state.project.meta.statusDate` (already exists on every project).
- Produces: nothing consumed by later tasks — this is the last code-change task.

- [ ] **Step 1: Add the cutoff helper and use it for the Actual line and its dots**

In `project-planner/src/js/ui/scurve.js`, in `renderScurve`, change:
```js
    function pathFor(key) {
      return points.map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + xAt(i) + ' ' + yAt(p[key]);
      }).join(' ');
    }

    svg.appendChild(svgEl('path', { d: pathFor('plannedCum'), fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
    svg.appendChild(svgEl('path', { d: pathFor('actualCum'), fill: 'none', stroke: 'var(--status-complete)', 'stroke-width': 2 }));
```
to:
```js
    function pathFor(key, pts) {
      return (pts || points).map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + xAt(i) + ' ' + yAt(p[key]);
      }).join(' ');
    }

    function actualCutoffIndex() {
      var statusDate = state.project.meta.statusDate;
      for (var i = 0; i < points.length; i++) {
        if (points[i].periodDate > statusDate) return Math.max(0, i - 1);
      }
      return points.length - 1;
    }

    var actualPoints = points.slice(0, actualCutoffIndex() + 1);

    svg.appendChild(svgEl('path', { d: pathFor('plannedCum'), fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
    svg.appendChild(svgEl('path', { d: pathFor('actualCum', actualPoints), fill: 'none', stroke: 'var(--status-complete)', 'stroke-width': 2 }));
```

Then change the dot-rendering loop:
```js
    points.forEach(function (p, i) {
      svg.appendChild(svgEl('circle', {
        cx: xAt(i), cy: yAt(p.actualCum), r: 3, fill: 'var(--status-complete)',
        'data-index': i, class: 'scurve-dot',
      }));
    });
```
to:
```js
    actualPoints.forEach(function (p, i) {
      svg.appendChild(svgEl('circle', {
        cx: xAt(i), cy: yAt(p.actualCum), r: 3, fill: 'var(--status-complete)',
        'data-index': i, class: 'scurve-dot',
      }));
    });
```
The dot tooltip handler further down reads `points[i]` by the dot's `data-index` — since `actualPoints` is a prefix slice of `points` starting at index 0, each dot's `i` still correctly indexes into the full `points` array (`points[i] === actualPoints[i]` for every `i` in range), so no change is needed there.

- [ ] **Step 2: Build**

```bash
cd project-planner
node --check src/js/ui/scurve.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 166/166 tests pass (this task touches no engine/logic files, so the count from Task 3 must be unchanged).

- [ ] **Step 3: Live-verify in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project whose `meta.statusDate` falls roughly in the middle of its planned timeline, with some leaf tasks having `actualStart`/`actualPct` set (progress recorded) and planned dates extending well past the status date. Confirm via `browser_evaluate`:
- The Planned line's SVG path (`pathFor('plannedCum')`, the first `<path>` in `#scurve-body svg`) has a `d` attribute whose rightmost `L` command's x-coordinate corresponds to the last point in `state.calc.scurve` (i.e., it still reaches the project's planned finish, unchanged).
- The Actual line's SVG path (the second `<path>`) has a `d` attribute whose rightmost `L` command's x-coordinate corresponds to a point at or before the status date — strictly less than the Planned line's rightmost x-coordinate, given the seeded status date is mid-timeline.
- The number of `.scurve-dot` circles equals `actualCutoffIndex() + 1`, not the full `state.calc.scurve.length` — confirm this count is smaller than the total point count for this seeded data.
- Hover over the last visible dot and confirm its tooltip still shows the correct `periodDate`/percentages (the index-alignment between `actualPoints` and `points` holds).

- [ ] **Step 4: Commit**

```bash
cd project-planner
git add src/js/ui/scurve.js
git commit -m "Fix S-Curve Actual line to stop at the status date instead of the full project timeline"
```

---

### Task 5: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
cd project-planner
python3 build.py
node --test
```
Expected: 166/166 tests pass (the exact final count established in Task 1 — confirm it matches, don't assume).

- [ ] **Step 2: Verify all three features together with realistic data**

Seed a project with: at least 8 tasks across 2 phases, Thai text in at least one task name and one Owner value (including one with an embedded newline, matching the multi-line committee-name pattern seen in real data this session), a comma in at least one remarks field, at least one predecessor link, a status date set roughly mid-timeline with some tasks having recorded actual progress and some not yet started. Serve it, navigate a Playwright browser to it, skip the name picker.

- [ ] **Step 3: Re-verify CSV export with this realistic data**

Export CSV, read the downloaded file's bytes directly (not just DOM state): confirm the UTF-8 BOM is present, the Thai text (including the embedded-newline Owner value) round-trips correctly when the file is re-read as UTF-8, the comma-containing remarks field is properly quoted, and the predecessor row shows the correct WBS reference.

- [ ] **Step 4: Re-verify S-Curve Copy-as-Image and the Actual-line cutoff together**

Open S-Curve, confirm the Actual line stops at the seeded status date (re-run the index/x-coordinate checks from Task 4 Step 3) and that clicking "Copy as Image" (a real `browser_click`) succeeds with a non-empty clipboard PNG. Then switch to Reports, confirm its own Copy-as-Image still works identically (regression check on the Task 3 extraction).

- [ ] **Step 5: Verify zero regression to existing functionality**

Exercise: switch every view tab, edit a Plan-tree cell, use the Owner/PIC/status/milestone filters, Save (JSON), Import CSV (a small valid file), Download CSV Template. Confirm every interaction still works exactly as it did before this plan.

- [ ] **Step 6: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected). Then run:
```bash
cd project-planner
node --test
```
Confirm the same count from Step 1 still passes.

- [ ] **Step 7: Record the result**

If every check in Steps 1-6 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-4: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: Settings has a working "Export CSV" button producing a UTF-8-BOM, CRLF, RFC4180-escaped report of every task; S-Curve has "Copy as Image" via a shared helper also used by Reports (removing duplicate rasterization code); and the S-Curve Actual line only ever shows progress through the current status date, no longer flat-lining across dates that haven't happened yet.
