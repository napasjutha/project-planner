# Reports Progress S-Curve + Divider Redesign — Design Spec

**Date:** 2026-07-15
**Status:** Approved design (brainstorm complete)
**Scope:** Two additive changes to the already-shipped 11-page Reports deck (`src/js/reportsEngine.js` + `src/js/ui/reports.js`): (1) the Progress page (page 4, "01 ผลการดำเนินงาน") gains the S-Curve chart alongside its KPI tiles, in a two-column layout; (2) the 4 section-divider pages get a dark-navy full-bleed redesign with a huge section number and gradient accent bar, closer to the reference PDF's look. Independent of the Activities drag-and-drop spec (separate, unrelated tab).

## 1. Shared S-Curve rendering

`src/js/ui/scurve.js` currently builds its chart inline inside `renderScurve` (grid lines, `xAt`/`yAt`, `pathFor`, plan/actual paths, dot markers + tooltip wiring, snapshot overlay). Extract the non-interactive drawing into a new exported function so the Reports page reuses the exact same chart math instead of a second copy:

```js
// src/js/ui/scurve.js
function buildScurveSvg(points, statusDate, opts) {
  // opts: { width, height, padding, interactive (default true) }
  // returns the <svg> element with grid lines + plan/actual paths drawn.
  // when interactive is true, also appends dot markers with data-index
  // (existing renderScurve wires mouseenter/mouseleave on these afterward,
  // same as today — buildScurveSvg itself does not touch #scurve-tooltip).
}
```

`renderScurve` (live S-Curve tab) becomes: build via `buildScurveSvg(points, statusDate, {width:800, height:320, padding:40, interactive:true})`, append to `#scurve-body`, then wire tooltip listeners on the returned dots exactly as today. No behavior change to the live tab — this is a pure extraction.

`buildScurveSvg` does NOT render the snapshot-overlay dashed path (that stays specific to the live tab, appended by `renderScurve` after calling `buildScurveSvg`, same as it appends today). The Reports page never has a snapshot overlay selector, so it never needs that path.

Export: `window.PP.buildScurveSvg = buildScurveSvg;`

## 2. Progress page data

`reportsEngine.js`'s `buildProgressPageData(project, calc)` gains two fields:

```js
function buildProgressPageData(project, calc) {
  // ...existing tiles/delayedTasks unchanged...
  var MAX_DELAYED_SHOWN = 8;
  var delayedTasks = /* existing loop, unchanged */;
  var truncated = delayedTasks.length > MAX_DELAYED_SHOWN;
  return {
    kpis: tiles,
    delayedTasks: delayedTasks.slice(0, MAX_DELAYED_SHOWN),
    delayedMoreCount: truncated ? delayedTasks.length - MAX_DELAYED_SHOWN : 0,
    scurvePoints: calc.scurve,
    statusDate: project.meta.statusDate,
  };
}
```

`calc.scurve` is already the exact point array `buildScurveSvg` consumes (`{periodDate, plannedCum, actualCum}`) — no new computation, just threading an existing field through. The 8-item cap keeps the fixed-height 720px report page from overflowing; capping happens in the engine (testable) rather than via CSS clipping.

## 3. Progress page layout

`renderProgressPage` in `reports.js` changes from a single stacked column to two columns:

- **Left (~65% width):** the S-Curve chart, built via `PP.buildScurveSvg(data.scurvePoints, data.statusDate, {width: 760, height: 480, padding: 36, interactive: false})`.
- **Right (~35% width, sidebar):** the 6 KPI tiles in a 2-column grid (3 rows × 2 cols, smaller than the current full-width tiles), then the "Delayed Items" subheading and list below. If `data.delayedMoreCount > 0`, append a trailing `<li class="report-list-more">+N more</li>`-style note (or a `<p>` after the list — implementer's call, just must render the count).

New CSS (`layout.css`, alongside the existing `.report-kpi-*` rules):
```css
.report-progress-body { display: flex; gap: 24px; flex: 1; min-height: 0; }
.report-progress-chart { flex: 0 0 65%; }
.report-progress-sidebar { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.report-kpi-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.report-kpi-tile { padding: 10px 14px; }
.report-kpi-tile-value { font-size: 20px; }
```
(`.report-kpi-row`/`.report-kpi-tile`/`.report-kpi-tile-value` are edited in place — grid replaces flex, sizes shrink to fit the narrower sidebar. No other page uses these classes.)

`renderProgressPage` wraps the chart + sidebar in a new `el('div', {class:'report-progress-body'}, [...])` beneath the existing `report-page-heading`.

## 4. Divider page redesign

Reference PDF divider slides: full-bleed dark navy, a huge section number, a thin gradient accent bar, section title in white. Current dividers share `.report-page-title, .report-page-divider, .report-page-closing` (blue→pink gradient) — this spec splits `.report-page-divider` out into its own rule; title/closing pages are unchanged (already read fine as "cover" style, out of scope here).

**Data:** `SECTION_TITLES` entries already embed the number, e.g. `'01 ผลการดำเนินงาน'`. No engine change — `renderDividerPage` (UI layer) splits it for display:

```js
function renderDividerPage(data) {
  var m = /^(\d+)\s+(.*)$/.exec(data.title);
  var number = m ? m[1] : '';
  var label = m ? m[2] : data.title;
  return el('section', { class: 'report-page report-page-divider' }, [
    el('div', { class: 'report-divider-number' }, [number]),
    el('div', { class: 'report-divider-inner' }, [
      el('h1', { class: 'report-divider-title' }, [label]),
    ]),
  ]);
}
```

**CSS** (`layout.css`):
```css
.report-page-divider {
  justify-content: center; align-items: flex-start; color: #ffffff;
  background: #0A1A33;
  position: relative;
}
.report-divider-number {
  position: absolute; top: 40px; left: 56px;
  font-size: 220px; font-weight: 700; line-height: 1;
  color: rgba(255,255,255,0.08);
}
.report-divider-inner {
  border-left: 6px solid transparent;
  border-image: linear-gradient(180deg, #0091DA 0%, #E5007E 100%) 1;
  padding-left: 24px; position: relative; z-index: 1;
}
.report-divider-title { font-size: 40px; font-weight: 600; margin: 0; color: #ffffff; }
```
(`.report-page-title, .report-page-divider, .report-page-closing` selector loses `.report-page-divider`; `.report-divider-inner`/`.report-divider-title` rules are edited in place — divider now white-on-navy same as before, so no change needed to those two beyond the border switching to a gradient.)

## 5. Testing

- `tests/reportsEngine.test.js`: extend the `buildProgressPageData` tests — assert `scurvePoints` equals the `calc.scurve` passed in, assert `statusDate` matches `project.meta.statusDate`, assert `delayedTasks` caps at 8 with `delayedMoreCount` set correctly (test with >8 and ≤8 delayed tasks).
- `tests/scurve.test.js` does not exist today (`scurve.js` is a UI file, no Node tests) — no new Node test for `buildScurveSvg` itself; verified via controller-run Playwright checks instead, same as the rest of `scurve.js`/`reports.js`.
- Controller-run Playwright checks: live S-Curve tab still renders identically (dots, tooltip, snapshot overlay) after the extraction — regression check, not new behavior. Reports tab Progress page shows chart + 2-column sidebar with no console errors, at both screen size and via `window.print()` preview. Divider pages render dark navy with visible big number + gradient bar + white title, for all 4 sections.

## 6. Out of Scope

- Title and closing pages' styling (unchanged, still blue→pink gradient).
- KPMG logo watermark on content pages (mentioned as a PDF detail during brainstorming, not part of this pass — a possible future follow-up).
- Any change to the live S-Curve tab's behavior beyond the internal refactor (interactivity, overlay, tooltip all unchanged).
- Activities tab drag-and-drop (separate spec, unrelated code).
