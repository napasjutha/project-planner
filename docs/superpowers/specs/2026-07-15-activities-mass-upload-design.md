# Activities Mass Upload (CSV) — Design Spec

**Date:** 2026-07-15
**Status:** Approved design (brainstorm complete)
**Scope:** Bulk-create Activities via CSV upload, mirroring the existing task CSV import's validate-then-commit pattern. Includes a downloadable CSV template button (same pattern as the Plan tab's existing `csv-template-button`). Independent of the Reports v2, Plan-tab, and Excel-export specs written alongside this one.

## 1. CSV format

Header row, exact column order:
```
type,name,dateStart,dateEnd,timeStart,timeEnd,groupIds,keyDate,remarks
```
- `type`: `Meeting` or `Workshop` (case-insensitive on input, normalized to the canonical casing on import).
- `name`: required, non-empty.
- `dateStart`: required, `YYYY-MM-DD`.
- `dateEnd`: optional — defaults to `dateStart` if blank (same rule as the Add Activity form).
- `timeStart`, `timeEnd`: optional free text (e.g. `9:30`), blank allowed.
- `groupIds`: semicolon-separated **group names** (not ids — names are what a human filling out a spreadsheet actually has). Resolved against `project.activityGroups` by exact name match. Blank allowed (no groups).
- `keyDate`: `true`/`false`/`yes`/`no`/`1`/`0`/blank (blank = false), case-insensitive.
- `remarks`: optional free text.

## 2. Engine: new `parseActivitiesCsv`

Added to `src/js/csv.js` (already the home of `parseCsvText`/`validateCsvRows`/`buildExportCsv` for tasks — this keeps all CSV parsing in one engine file rather than splitting it across two):

```js
function parseActivitiesCsv(rows, activityGroups) {
  // rows: output of parseCsvText (array of arrays, header already stripped by caller — same contract as validateCsvRows)
  // activityGroups: project.activityGroups, for name -> id resolution
  // returns { activities: [...specs ready for addActivities...], errors: [...one string per bad row, 1-indexed against the original file...] }
}
```
Validation errors (collected, not thrown, so one bad row doesn't block reporting the rest — same UX as `validateCsvRows`): missing `name`, missing/malformed `dateStart`, malformed `dateEnd` (not a valid date), `dateEnd < dateStart`, invalid `type` (not Meeting/Workshop), any `groupIds` name with no match in `activityGroups`. On any error, the whole batch is rejected (all-or-nothing import, same as the existing task CSV import) — the UI shows every collected error at once so the user fixes the spreadsheet and re-uploads once, rather than discovering errors one row at a time.

## 3. Store: new bulk method

`Project#addActivities(specs, who)` — bulk version of the existing per-row `addActivity`, which currently pushes undo once per call (fine for the single-row Add Activity form, wrong for a 50-row import — that would be 50 undo steps for one paste). New method:

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
One `_pushUndo()` for the whole import — matches `addTasks`' existing bulk-import shape exactly (same file, same convention, no new pattern invented).

## 4. UI: `activities.js`

- "Mass Upload" button + hidden file input, wired exactly like the Plan tab's `import-csv-button`/`import-csv-input` pair in `app.js` (`FileReader.readAsText(file, 'UTF-8')`, `PP.stripBom`, `PP.parseCsvText`).
- On file selection: parse via `PP.parseActivitiesCsv(rows, state.project.activityGroups)`. If `errors.length`, `window.alert` listing them (same message format as the task import's error alert) and stop — nothing is imported. Otherwise `state.project.addActivities(activities)`, `window.alert('Imported N activity(ies).')`, `onChanged()`.
- "Download Template" button next to it: a static CSV string (header row + one example row per type, Meeting and Workshop) downloaded via the same Blob/anchor-click pattern as `handleDownloadCsvTemplate` in `app.js`, filename `activities-template.csv`.

## 5. Testing

- `tests/csv.test.js`: new tests for `parseActivitiesCsv` — valid multi-row parse, missing name, missing/malformed dateStart, dateEnd before dateStart, invalid type, unknown group name, blank optional fields default correctly (dateEnd defaults to dateStart, keyDate defaults false, groupIds defaults empty array), `keyDate` accepts all documented truthy/falsy spellings.
- `tests/store.test.js`: new test for `addActivities` — bulk-creates all rows, single `_pushUndo()` (one Undo reverts the entire batch, not row-by-row).
- UI: no Node coverage (existing convention) — controller-run Playwright check: download the template, edit it to add 2 valid rows, upload, confirm both appear in the calendar and list; upload a file with one bad row, confirm the error alert lists it and nothing was imported; confirm one Undo after a successful import removes every uploaded activity.

## 6. Out of Scope

- Editing multiple activities via re-upload (this is create-only — updating existing activities by CSV is a different feature, not requested).
- Any change to the single-row Add Activity form, which keeps using the existing per-row `addActivity`.
