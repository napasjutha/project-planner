# Activities Mass Upload (CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bulk-create Activities via CSV upload, with a downloadable template, mirroring the app's existing task-CSV-import validate-then-commit UX.

**Architecture:** `src/js/csv.js` gains `parseActivitiesCsv` (validation, pure). `src/js/store.js` gains `Project#addActivities` (bulk create, one undo step). `src/js/ui/activities.js` gains the upload/template UI, wired the same way the Plan tab's existing CSV import/template buttons are wired in `app.js`.

**Tech Stack:** Vanilla JS, `node:test`.

## Global Constraints

- Zero external dependencies. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`.
- Engines (`src/js/*.js`): UMD-lite, Node-tested, no DOM. `src/js/ui/*.js`: plain IIFEs, no Node coverage — verified only via the final controller-run Playwright task.
- Baseline: 253/253 Node tests passing as of this plan's start (re-verify via `node --test` before Task 1).
- This plan is **independent** of the other 3 plans written alongside it — different files, no merge-order dependency, safe on a parallel worktree.
- CSV format, exact column order: `type,name,dateStart,dateEnd,timeStart,timeEnd,groupIds,keyDate,remarks`. `groupIds` is semicolon-separated **group names**, resolved against `project.activityGroups`, not ids.
- Import is all-or-nothing: any validation error blocks the whole batch, with every error shown at once (same UX as the existing task CSV import's `validateCsvRows`).
- Run `python3 build.py` after every `src/` change, before any manual/browser verification step.

---

### Task 1: `parseActivitiesCsv`

**Files:**
- Modify: `src/js/csv.js` (add the function + export)
- Test: `tests/csv.test.js`

**Interfaces:**
- Produces: `parseActivitiesCsv(rows, activityGroups)` → `{ activities: [...], errors: [...] }`. `rows` is the output of the existing `parseCsvText` (array of arrays, header row included at index 0). `activityGroups` is `project.activityGroups` (`[{id, name, color}]`). Each item in `activities` on success: `{ type, name, dateStart, dateEnd, timeStart, timeEnd, groupIds, keyDate, remarks }` — `groupIds` already resolved to **ids**. Task 2 (`addActivities`) consumes this array directly.

- [ ] **Step 1: Write the failing tests**

Read `tests/csv.test.js` first to confirm its exact `require` line and the file's existing test style (it tests `parseCsvText`/`validateCsvRows`/`buildExportCsv` today), then add `parseActivitiesCsv` to the import and append these tests at the end of the file:

```js
const ACTIVITIES_HEADER = ['type', 'name', 'dateStart', 'dateEnd', 'timeStart', 'timeEnd', 'groupIds', 'keyDate', 'remarks'];
const SAMPLE_GROUPS = [{ id: 'g1', name: 'Steering Committee', color: '#0b1f6b' }, { id: 'g2', name: 'Working Team', color: '#7c4dff' }];

test('parseActivitiesCsv: valid multi-row parse resolves group names to ids', () => {
  const rows = [
    ACTIVITIES_HEADER,
    ['Meeting', 'Kickoff', '2026-07-20', '2026-07-20', '9:30', '10:30', 'Steering Committee', 'true', 'Opening session'],
    ['Workshop', 'Discovery', '2026-07-21', '2026-07-23', '', '', 'Steering Committee;Working Team', 'false', ''],
  ];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.deepEqual(result.errors, []);
  assert.equal(result.activities.length, 2);
  assert.deepEqual(result.activities[0], {
    type: 'Meeting', name: 'Kickoff', dateStart: '2026-07-20', dateEnd: '2026-07-20',
    timeStart: '9:30', timeEnd: '10:30', groupIds: ['g1'], keyDate: true, remarks: 'Opening session',
  });
  assert.deepEqual(result.activities[1].groupIds, ['g1', 'g2']);
});

test('parseActivitiesCsv: blank dateEnd defaults to dateStart, blank keyDate defaults false, blank groupIds defaults empty array', () => {
  const rows = [ACTIVITIES_HEADER, ['Meeting', 'Solo', '2026-07-20', '', '', '', '', '', '']];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.deepEqual(result.errors, []);
  assert.equal(result.activities[0].dateEnd, '2026-07-20');
  assert.equal(result.activities[0].keyDate, false);
  assert.deepEqual(result.activities[0].groupIds, []);
});

test('parseActivitiesCsv: keyDate accepts true/false/yes/no/1/0 case-insensitively', () => {
  ['true', 'TRUE', 'yes', 'Yes', '1'].forEach(v => {
    const rows = [ACTIVITIES_HEADER, ['Meeting', 'X', '2026-07-20', '2026-07-20', '', '', '', v, '']];
    assert.equal(parseActivitiesCsv(rows, SAMPLE_GROUPS).activities[0].keyDate, true, 'expected true for ' + v);
  });
  ['false', 'FALSE', 'no', 'No', '0', ''].forEach(v => {
    const rows = [ACTIVITIES_HEADER, ['Meeting', 'X', '2026-07-20', '2026-07-20', '', '', '', v, '']];
    assert.equal(parseActivitiesCsv(rows, SAMPLE_GROUPS).activities[0].keyDate, false, 'expected false for ' + v);
  });
});

test('parseActivitiesCsv: missing name is an error', () => {
  const rows = [ACTIVITIES_HEADER, ['Meeting', '', '2026-07-20', '2026-07-20', '', '', '', '', '']];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.equal(result.activities.length, 0);
  assert.ok(result.errors.some(e => /name/i.test(e)));
});

test('parseActivitiesCsv: missing or malformed dateStart is an error', () => {
  const missing = parseActivitiesCsv([ACTIVITIES_HEADER, ['Meeting', 'X', '', '', '', '', '', '', '']], SAMPLE_GROUPS);
  assert.ok(missing.errors.some(e => /dateStart|date start/i.test(e)));
  const malformed = parseActivitiesCsv([ACTIVITIES_HEADER, ['Meeting', 'X', '20-07-2026', '', '', '', '', '', '']], SAMPLE_GROUPS);
  assert.ok(malformed.errors.some(e => /dateStart|date start/i.test(e)));
});

test('parseActivitiesCsv: dateEnd before dateStart is an error', () => {
  const rows = [ACTIVITIES_HEADER, ['Meeting', 'X', '2026-07-20', '2026-07-18', '', '', '', '', '']];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.ok(result.errors.some(e => /end date/i.test(e)));
});

test('parseActivitiesCsv: invalid type is an error', () => {
  const rows = [ACTIVITIES_HEADER, ['Standup', 'X', '2026-07-20', '2026-07-20', '', '', '', '', '']];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.ok(result.errors.some(e => /type/i.test(e)));
});

test('parseActivitiesCsv: type is case-insensitive on input, normalized to canonical casing', () => {
  const rows = [ACTIVITIES_HEADER, ['meeting', 'X', '2026-07-20', '2026-07-20', '', '', '', '', ''], ['WORKSHOP', 'Y', '2026-07-20', '2026-07-20', '', '', '', '', '']];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.deepEqual(result.errors, []);
  assert.equal(result.activities[0].type, 'Meeting');
  assert.equal(result.activities[1].type, 'Workshop');
});

test('parseActivitiesCsv: unknown group name is an error, reported by name', () => {
  const rows = [ACTIVITIES_HEADER, ['Meeting', 'X', '2026-07-20', '2026-07-20', '', '', 'Nonexistent Group', '', '']];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.ok(result.errors.some(e => e.includes('Nonexistent Group')));
});

test('parseActivitiesCsv: multiple bad rows all get reported, not just the first', () => {
  const rows = [
    ACTIVITIES_HEADER,
    ['Meeting', '', '2026-07-20', '2026-07-20', '', '', '', '', ''],
    ['Standup', 'Y', '2026-07-20', '2026-07-20', '', '', '', '', ''],
  ];
  const result = parseActivitiesCsv(rows, SAMPLE_GROUPS);
  assert.equal(result.errors.length, 2);
  assert.equal(result.activities.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `parseActivitiesCsv is not defined`.

- [ ] **Step 3: Implement `parseActivitiesCsv`**

Add to `src/js/csv.js`, directly above the `return { ... }` statement at the bottom of the file (`csv.js:190`):

```js
  const ACTIVITIES_CSV_HEADERS = ['type', 'name', 'dateStart', 'dateEnd', 'timeStart', 'timeEnd', 'groupIds', 'keyDate', 'remarks'];
  const KEYDATE_TRUE = ['true', 'yes', '1'];
  const KEYDATE_FALSE = ['false', 'no', '0', ''];
  const ACTIVITY_TYPES = ['Meeting', 'Workshop'];

  function activitiesCsvTemplateText() {
    return ACTIVITIES_CSV_HEADERS.join(',') + '\n' +
      'Meeting,Steering Review,2026-08-03,2026-08-03,9:30,10:30,,true,Example meeting row\n' +
      'Workshop,Discovery Workshop,2026-08-10,2026-08-12,,,,, Example workshop row\n';
  }

  function parseActivitiesCsv(rows, activityGroups) {
    const errors = [];
    if (!rows.length || rows[0].map(c => c.trim()).join(',') !== ACTIVITIES_CSV_HEADERS.join(',')) {
      errors.push('Header row must be exactly: ' + ACTIVITIES_CSV_HEADERS.join(','));
      return { errors, activities: [] };
    }
    const groupByName = new Map(activityGroups.map(g => [g.name, g.id]));
    const dataRows = rows.slice(1);
    const activities = [];

    dataRows.forEach((cells, idx) => {
      const label = 'Row ' + (idx + 2); // +2: 1-indexed and header row already consumed
      if (cells.length !== ACTIVITIES_CSV_HEADERS.length) {
        errors.push(label + ': expected ' + ACTIVITIES_CSV_HEADERS.length + ' columns, found ' + cells.length);
        return;
      }
      const c = cells.map(v => v.trim());
      const [typeRaw, name, dateStart, dateEndRaw, timeStart, timeEnd, groupIdsRaw, keyDateRaw, remarks] = c;

      const typeNormalized = ACTIVITY_TYPES.find(t => t.toLowerCase() === typeRaw.toLowerCase());
      if (!typeNormalized) {
        errors.push(label + ": type '" + typeRaw + "' must be Meeting or Workshop");
      }
      if (!name) errors.push(label + ': name is required');
      if (!DATE_RE.test(dateStart)) errors.push(label + ": dateStart '" + dateStart + "' is not a valid date (expected YYYY-MM-DD)");
      const dateEnd = dateEndRaw || dateStart;
      if (dateEndRaw && !DATE_RE.test(dateEndRaw)) errors.push(label + ": dateEnd '" + dateEndRaw + "' is not a valid date (expected YYYY-MM-DD)");
      else if (DATE_RE.test(dateStart) && DATE_RE.test(dateEnd) && dateEnd < dateStart) errors.push(label + ': end date cannot be before start date');

      const groupIds = [];
      if (groupIdsRaw) {
        groupIdsRaw.split(';').map(s => s.trim()).filter(Boolean).forEach(gname => {
          if (groupByName.has(gname)) groupIds.push(groupByName.get(gname));
          else errors.push(label + ": unknown participant group '" + gname + "'");
        });
      }

      const keyDateLower = keyDateRaw.toLowerCase();
      let keyDate = false;
      if (KEYDATE_TRUE.indexOf(keyDateLower) !== -1) keyDate = true;
      else if (KEYDATE_FALSE.indexOf(keyDateLower) === -1) errors.push(label + ": keyDate '" + keyDateRaw + "' must be true/false/yes/no/1/0");

      activities.push({
        type: typeNormalized || typeRaw, name, dateStart, dateEnd,
        timeStart: timeStart || null, timeEnd: timeEnd || null,
        groupIds, keyDate, remarks,
      });
    });

    return errors.length ? { errors, activities: [] } : { errors: [], activities };
  }
```

Update the module's `return { ... }` statement (`csv.js:190`) to:
```js
  return { stripBom, parseCsvText, csvTemplateText, validateCsvRows, CSV_HEADERS, escapeCsvField, buildExportCsv, EXPORT_HEADERS, parseActivitiesCsv, activitiesCsvTemplateText };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — total count is your verified baseline + 9.

- [ ] **Step 5: Commit**

```bash
git add src/js/csv.js tests/csv.test.js
git commit -m "feat: parseActivitiesCsv for Activities mass upload"
```

---

### Task 2: `Project#addActivities`

**Files:**
- Modify: `src/js/store.js` (add the method directly after `addActivity`, `store.js:479-489`)
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: an array of specs shaped like `parseActivitiesCsv`'s `activities` output (Task 1).
- Produces: `Project#addActivities(specs)` → array of created activity objects, one `_pushUndo()` for the whole batch.

- [ ] **Step 1: Write the failing test**

Add to `tests/store.test.js`, near the existing `addActivity` tests (search the file for `addActivity` to find them and place this directly after):

```js
test('addActivities creates every spec in one call with a single undo checkpoint', () => {
  const p = Project.empty('Test');
  const undoStackBefore = p._undoStack.length;
  const created = p.addActivities([
    { type: 'Meeting', name: 'A', dateStart: '2026-07-20', dateEnd: '2026-07-20', timeStart: '9:30', timeEnd: '10:30', groupIds: [], keyDate: true, remarks: '' },
    { type: 'Workshop', name: 'B', dateStart: '2026-07-21', dateEnd: '2026-07-23', timeStart: null, timeEnd: null, groupIds: ['g1'], keyDate: false, remarks: 'note' },
  ]);
  assert.equal(created.length, 2);
  assert.equal(p.activities.length, 2);
  assert.equal(created[0].name, 'A');
  assert.equal(created[1].groupIds[0], 'g1');
  assert.equal(p._undoStack.length, undoStackBefore + 1);

  p.undo();
  assert.equal(p.activities.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `p.addActivities is not a function`.

- [ ] **Step 3: Implement `addActivities`**

In `src/js/store.js`, add directly after `addActivity` (ends at line 489):

```js

    addActivities(specs) {
      this._pushUndo();
      return specs.map(spec => {
        const activity = {
          id: generateId(), type: spec.type, name: spec.name,
          dateStart: spec.dateStart, dateEnd: spec.dateEnd || spec.dateStart,
          timeStart: spec.timeStart || null, timeEnd: spec.timeEnd || null,
          groupIds: (spec.groupIds || []).slice(), keyDate: !!spec.keyDate, remarks: spec.remarks || '',
        };
        this.activities.push(activity);
        return activity;
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS — Task 1's count + 1.

- [ ] **Step 5: Commit**

```bash
git add src/js/store.js tests/store.test.js
git commit -m "feat: add Project#addActivities for bulk activity import"
```

---

### Task 3: Activities tab UI — Mass Upload + Download Template

**Files:**
- Modify: `src/index.html` (add two buttons + hidden file input to `#activities-toolbar`, `index.html:178-192`)
- Modify: `src/js/ui/activities.js` (add the wiring)

**Interfaces:**
- Consumes: `PP.parseActivitiesCsv`, `PP.activitiesCsvTemplateText` (Task 1), `state.project.addActivities` (Task 2), `PP.stripBom`, `PP.parseCsvText` (existing, `csv.js`).

- [ ] **Step 1: Add the buttons and file input to `index.html`**

In `src/index.html`, inside `#activities-toolbar` (`index.html:178-192`), add directly before the closing `</div>` of that toolbar (after the existing `add-activity-button`):

```html
      <button id="download-activities-template-button">Download Template</button>
      <button id="mass-upload-activities-button">Mass Upload</button>
      <input type="file" id="mass-upload-activities-input" accept=".csv,text/csv" hidden>
```

- [ ] **Step 2: Wire the buttons in `activities.js`**

In `src/js/ui/activities.js`, add directly before the closing `}` of `wireActivities` (after the `mouseup` handler block, which ends at `activities.js:441`):

```js

    document.getElementById('download-activities-template-button').addEventListener('click', function () {
      var blob = new Blob([PP.activitiesCsvTemplateText()], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'activities-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    document.getElementById('mass-upload-activities-button').addEventListener('click', function () {
      document.getElementById('mass-upload-activities-input').click();
    });

    document.getElementById('mass-upload-activities-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var rows = PP.parseCsvText(PP.stripBom(reader.result));
        var result = PP.parseActivitiesCsv(rows, state.project.activityGroups);
        if (result.errors.length) {
          window.alert('Cannot import — ' + result.errors.length + ' error(s):\n' + result.errors.join('\n'));
          return;
        }
        var created = state.project.addActivities(result.activities);
        window.alert('Imported ' + created.length + ' activity(ies).');
        onChanged();
      };
      reader.onerror = function () {
        window.alert('Failed to read that file.');
      };
      reader.readAsText(file, 'UTF-8');
      e.target.value = '';
    });
```

- [ ] **Step 3: Build and confirm no regressions**

```bash
node --check src/js/ui/activities.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 2's final count.

- [ ] **Step 4: Commit**

```bash
git add src/index.html src/js/ui/activities.js
git commit -m "feat: Mass Upload and Download Template buttons on the Activities tab"
```

---

### Task 4: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as this repo's prior final-verification tasks: the controller drives a real browser via the Playwright tools already available in this session, not a dispatched subagent.

**Files:** none (verification only).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
python3 build.py
node --test
```

Expected: test count matches Task 2's final count exactly (Task 3 adds no tests).

- [ ] **Step 2: Serve the built app and seed a realistic project**

```bash
cd dist && python3 -m http.server 8796
```

Navigate to it with the Playwright browser tools. Complete the name-picker overlay if it appears. Open the Activities tab and add at least one participant group (needed to test the groupIds column).

- [ ] **Step 3: Download the template, edit it, upload it**

Click Download Template, confirm a `activities-template.csv` file downloads with the documented header and 2 example rows. Using `browser_evaluate` or a local file edit, prepare a CSV with 2 valid rows (one referencing the participant group added in Step 2 by name) and upload it via Mass Upload. Confirm both activities appear in the calendar and the list table, and the group-referencing one shows the group's color swatch.

- [ ] **Step 4: Confirm rejected import**

Upload a CSV with one bad row (e.g. an unknown group name or invalid type). Confirm the error alert lists it and confirm nothing new was added to the activities list (still exactly the 2 from Step 3).

- [ ] **Step 5: Confirm Undo reverts a successful import**

After Step 3's successful import, click Undo once. Confirm both uploaded activities are removed in one step.

- [ ] **Step 6: Verify zero regression to every other tab**

Click through Plan, Gantt, S-Curve, Dashboard, Snapshots, Resources, Deliverable/Billing, Settings, Holidays, Reports, Issues/Risks/Decisions. Confirm no console errors.

- [ ] **Step 7: Final test sweep**

```bash
node --test
```

Expected: same count as Step 1.

- [ ] **Step 8: Record the result**

If every check in Steps 1-7 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-3: fix it, re-run `python3 build.py`, and repeat this task's verification from the relevant step.
