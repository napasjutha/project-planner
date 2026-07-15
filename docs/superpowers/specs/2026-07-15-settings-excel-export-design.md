# Settings: Ready-to-Use Excel Export — Design Spec

**Date:** 2026-07-15
**Status:** Approved design (brainstorm complete)
**Scope:** A new "Export Excel" button in the Settings tab that produces a formatted, ready-to-open spreadsheet — not a plain CSV. Since this app is zero-dependency (no xlsx library, no CDN), the mechanism is an HTML table served with an `.xls` extension and `application/vnd.ms-excel` MIME type, which Excel opens as a real formatted spreadsheet (colors, bold headers, column widths) with zero client-side library code. Independent of the Reports v2, Plan-tab, and Activities-CSV specs written alongside this one.

## 1. Why HTML-table-as-.xls, not real XLSX

A genuine `.xlsx` file is a zipped XML bundle — producing one from scratch without a library is impractical and out of proportion for this request. Excel has supported opening an HTML table saved with a `.xls` extension since Excel 2003 (it detects the HTML content and imports it as a worksheet, including inline CSS for background colors, bold, and column widths via `<col>` width hints). This is a well-established zero-dependency trick, not a hack specific to this app, and it fully satisfies "ready to use" — the file opens in Excel already colored and formatted, no manual cleanup.

## 2. Engine: new `src/js/xlsExport.js`

New file (not folded into `csv.js`, since the output format — an HTML document string, not delimited text — is different enough to warrant its own file per this codebase's file-per-responsibility convention):

```js
function buildExportXlsHtml(project, calc) {
  // returns a full HTML document string (see 2.1 for exact shape)
}
```
Pure function, same `(project, calc)` signature as `buildExportCsv`, Node-tested. Registered in `build.py`'s `JS_ORDER` alongside the other top-level engines.

### 2.1 Output shape

One `<table>`, columns matching what's already visible on the Plan tab: WBS, Task, Owner, PIC, P-Start, P-Finish, A-Start, A-Finish, Duration, Weight, % Plan, % Actual, Status, Remarks. Row order follows `calc.order` (the same WBS-sorted traversal `buildExportCsv` already uses).

Styling, inline (Excel's HTML importer only honors inline `style=`, not `<style>` blocks reliably across versions — inline is the safe choice):
- Header row: `background:#00338D; color:#ffffff; font-weight:bold;` — this app's existing KPMG blue.
- Parent/summary task rows (rows with children): `background:#f7f7f8; font-weight:bold;` — same visual weight the Plan tab already gives parent rows.
- Status cells: background tint by status, reusing this app's existing status color language (Delayed rows get a light red tint, Complete rows a light green tint, Blocked a light orange tint) — same semantic colors already used for the status pills elsewhere in the app, just as cell backgrounds instead of pills (pills don't survive the HTML-to-Excel import; background color does).
- Indentation: task names get `padding-left` proportional to WBS depth (matching the Plan tab's own indentation), so the hierarchy reads correctly even without Excel's outline/grouping feature.
- `<col>` elements with explicit widths so columns aren't Excel's default uniform width — Task gets the widest column, short numeric columns (Duration, Weight, %) stay narrow.

Document wrapper: `<html><head><meta charset="utf-8"></head><body><table>...</table></body></html>` — the `charset="utf-8"` meta tag plus a UTF-8 BOM at the very start of the string (`'﻿' + htmlString`, prepended where the Blob is built) is what makes Excel render this project's Thai task names correctly instead of mojibake. (Note: the existing plain-CSV export in `app.js`'s `handleExportCsv` does **not** currently prepend a BOM — a pre-existing gap, out of scope for this spec to fix, but the new Excel export must not repeat it, since "ready to use" explicitly requires Thai text to render correctly on open, not just importable-with-a-manual-encoding-fix.)

## 3. UI wiring

`settings.js` gains an "Export Excel" button (new markup in `index.html`'s Settings view, near the existing theme/rename controls). Click handler, following the exact `handleExportCsv` pattern in `app.js`:

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
`slugifyProjectName` is the existing helper in `app.js` (already used by `handleExportCsv`) — reused as-is, not duplicated.

## 4. Testing

- `tests/xlsExport.test.js` (new): `buildExportXlsHtml` produces valid-looking HTML (parses as a DOM via a lightweight string-contains check, since this is a Node test with no jsdom — assert the string contains the expected `<table>`, correct row count matching `calc.order.length`, header cells matching the documented column list, a Thai task name appears in the output unescaped-but-HTML-safe (i.e. `&amp;`/`&lt;`/`&gt;` escaped for any literal `<`/`>`/`&` in a task name, everything else passed through), status-tint class/style present on at least one Delayed row).
- UI: no Node coverage (existing convention) — controller-run Playwright check: click Export Excel, confirm the download fires with a `.xls` filename, open the file's raw content (via the downloaded blob, not literally opening Excel) and visually confirm the header styling and a Thai task name are present and correctly encoded.

## 5. Out of Scope

- Adding a UTF-8 BOM to the existing plain-CSV export (`handleExportCsv`) — noted as a pre-existing gap above, not part of this request.
- Multi-sheet workbooks (Dashboard/Billing/Activities as separate tabs within one file) — this spec covers the single task-list export only, matching what "Export excel" was asked for.
