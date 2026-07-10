# CSV Export + S-Curve Polish — Design Spec

**Date:** 2026-07-10
**Status:** Approved design (brainstorm complete)
**Scope:** Three independent, small features bundled into one plan at the user's request: (1) a new report-style CSV export, (2) Copy-as-Image for the S-Curve tab, (3) fixing the S-Curve Actual line to stop at the status date instead of flat-lining across future dates. Touches `src/js/csv.js`, `src/js/ui/app.js`, `src/js/ui/scurve.js`, `src/js/ui/reports.js`, `src/index.html` (engines + UI); adds one new UI file, `src/js/ui/imagecopy.js`.

## 1. Purpose

Three independent gaps found in live use:
1. The app can *import* CSV and download an *empty template*, but has no way to export the current project's tasks as CSV for external viewing/sharing.
2. Reports tab has "Copy as Image" (canvas-rasterize to clipboard); S-Curve does not, despite being an equally shareable chart.
3. S-Curve's Actual line is computed and drawn across the entire project timeline (start → planned finish), so it flat-lines out across future dates that haven't happened yet, rather than stopping at "today" (the Status Date field).

## 2. Decisions Log

| Question | Decision |
|---|---|
| CSV export scope | Report-style, not round-trip. Mirrors the Plan tree's visible columns minus Milestone and Billing (those moved to their own tab and aren't core to a task-list report). Not intended to be re-imported — no `Row`/`Level` columns, `Predecessors` shown as WBS refs rather than row numbers. |
| CSV export columns | `WBS, Task, Owner, PIC, P-Start, P-Finish, A-Start, A-Finish, Duration, Weight, %Plan, %Actual, Status, Updated By, Updated At, Remarks, Predecessors` — 17 columns, exactly what's already visible on the Plan tab today, nothing invented. |
| CSV export value formatting | Percentages as display strings ("25%", matching `fmtPct` used elsewhere), Predecessors as comma-separated WBS references ("1.2, 1.3"), matching exactly what's shown on screen. |
| CSV export encoding | UTF-8 with BOM (`﻿` prefix) — per persisted project convention (real data is heavily Thai; a BOM makes Excel auto-detect UTF-8 on double-click open instead of guessing the system codepage and re-mangling the text, which is exactly the failure mode diagnosed earlier this session). |
| CSV export scope (filters) | Exports every task, ignoring active Plan-tab filters — matches how the existing JSON Save/export already behaves (full snapshot, not a filtered view). |
| CSV export filename | `<project-name-slug>_export_<date>.csv`, matching the existing JSON save's `slugifyProjectName(...)` + date convention (`app.js`'s `handleSave`). |
| CSV export button location | Settings tab, next to "Download CSV Template" / "Import CSV". |
| S-Curve Copy-as-Image mechanism | Extract the generic canvas-rasterize-SVG-to-clipboard logic (`collectAllStyles`, `panelToPngBlob`, the clipboard-write + error-alert wrapper) out of `reports.js` into a new shared file, `src/js/ui/imagecopy.js`, exposing `PP.copyElementAsImage(el)`. `reports.js`'s `copyPanelAsImage()` becomes a one-line wrapper calling the shared helper; `scurve.js` gets a new `#scurve-copy-image-button` calling the same helper on `#scurve-body`. One implementation, not two copies of the same rasterization code. |
| S-Curve Actual line cutoff | The Actual line (and its hover dots) stop being drawn at the first S-Curve data point whose date is *after* `state.project.meta.statusDate` — i.e., the line and dots only cover dates up to and including the status date. The Planned line is unaffected and keeps drawing all the way to the project's planned finish (or the status date if that's later, per the existing `endBound` rule in `calc.js` — unchanged). |

## 3. CSV Export

### 3.1 New serialization helper (`src/js/csv.js`)

`csv.js` currently only *parses* CSV (`parseCsvText`) — there's no writer, so a proper RFC4180 field-escaper is new:

```js
function escapeCsvField(value) {
  var s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
```

A new exported function builds the full export text from a project + its computed calc data:

```js
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

This mirrors exactly how `tree.js`'s `renderTree()` already computes each of these display values (`fmtPct`, `lastUpdated` lookup, WBS-based predecessor text) — no new computation logic, just re-reading the same computed fields into CSV rows instead of DOM cells. `\r\n` line endings and the `﻿` BOM prefix match RFC4180/Excel expectations.

### 3.2 Wiring (`src/js/ui/app.js`, `src/index.html`)

New button in Settings, next to the existing CSV buttons:
```html
<button id="export-csv-button">Export CSV</button>
```

New handler in `app.js`, following the exact download-trigger pattern `handleSave` and `handleDownloadCsvTemplate` already use (`Blob` → `URL.createObjectURL` → temporary `<a download>` click → `URL.revokeObjectURL`):
```js
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
Wired in `wireHeader`/toolbar setup alongside the other CSV buttons: `document.getElementById('export-csv-button').addEventListener('click', function () { handleExportCsv(state); });`.

## 4. S-Curve Copy-as-Image

### 4.1 Shared helper (`src/js/ui/imagecopy.js`, new file)

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
This is a verbatim extraction of `reports.js`'s existing `collectAllStyles`/`panelToPngBlob`/error-handling — same canvas-tainting-safe `data:` URI approach already proven working (per this project's own documented gotcha: `blob:` URLs taint the canvas via `<foreignObject>`, `data:` URIs don't).

### 4.2 `reports.js` becomes a thin caller

Remove `collectAllStyles` and `panelToPngBlob` entirely; change `copyPanelAsImage`:
```js
function copyPanelAsImage() {
  PP.copyElementAsImage(document.getElementById('report-panel'));
}
```

### 4.3 `scurve.js` gets the same button

New button in the S-Curve toolbar (`src/index.html`, inside `#scurve-toolbar`, next to the overlay-snapshot select):
```html
<button id="scurve-copy-image-button">Copy as Image</button>
```
New wiring in `scurve.js`'s `wireScurve`:
```js
document.getElementById('scurve-copy-image-button').addEventListener('click', function () {
  PP.copyElementAsImage(document.getElementById('scurve-body'));
});
```

### 4.4 Build order (`build.py`)

`imagecopy.js` must load before both `reports.js` and `scurve.js` (both call `PP.copyElementAsImage`). Inserted early in the `ui/*` group, before `ui/scurve.js`.

## 5. S-Curve Actual Line Stops at Status Date

In `scurve.js`'s `renderScurve`, the Actual line and its hover dots currently iterate the full `points` array (which spans the whole project timeline, per `calc.js`'s `computeScurve` `endBound` logic — unchanged by this spec). A cutoff index is computed once per render:

```js
function actualCutoffIndex(points, statusDate) {
  for (var i = 0; i < points.length; i++) {
    if (points[i].periodDate > statusDate) return Math.max(0, i - 1);
  }
  return points.length - 1;
}
```

The Actual path and dot-rendering loop both use `points.slice(0, cutoff + 1)` instead of the full `points` array — `xAt(i)` positions are unaffected since slicing from index 0 preserves each remaining point's original index (the x-axis scale is still computed against the full `points.length`, so the Actual line's rightmost point lands at its true chronological x-position, it just stops there instead of continuing). The Planned line's `pathFor('plannedCum')` call is untouched — it still draws across every point in `points`.

## 6. Testing

- `csv.js`: `buildExportCsv`/`escapeCsvField` are pure functions with full Node test coverage — new tests cover: header row exact match, BOM prefix present, CRLF line endings, field escaping (commas/quotes/newlines in a task name or remarks), percentage formatting, predecessors rendered as comma-separated WBS strings, an empty project producing just the header + BOM.
- `imagecopy.js`, `scurve.js`, `reports.js`, `app.js` are UI files with no automated coverage by this project's standing convention (no jsdom) — verified via controller-run Playwright checks: Export CSV button downloads a file with the exact expected header/BOM/rows for a seeded project with Thai text, commas-in-remarks, and predecessors; S-Curve Copy-as-Image button successfully writes a PNG to the clipboard (mirroring the existing Reports Copy-as-Image verification pattern) with zero console errors; a seeded project with a status date partway through its timeline shows the Actual line/dots stopping exactly at that date while the Planned line continues to project end; Reports tab's own Copy-as-Image still works identically after the extraction (regression check on the refactor).
- Regression: existing test count must stay unchanged for `scurve.js`/`reports.js`/`imagecopy.js` (no Node coverage), and grow by exactly the new `csv.js` tests on top of the current baseline.

## 7. Out of Scope

- CSV export is not re-importable (no Row/Level columns) — intentional, per the report-style decision.
- No changes to the existing CSV Import or Template-download features.
- No changes to Reports tab's Copy-as-Table, or to any other tab's export/copy capabilities.
- No changes to `calc.js`'s `computeScurve`/`endBound` logic — the Planned line's range is unchanged; only which points the Actual line/dots draw through changes.
