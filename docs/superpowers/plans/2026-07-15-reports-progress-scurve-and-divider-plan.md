# Reports Progress S-Curve + Divider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the S-Curve chart to the Reports tab's Progress page (page 4) in a two-column layout alongside the existing KPI tiles, and redesign the 4 section-divider pages with a dark-navy full-bleed look (big section number, gradient accent bar) matching the reference PDF more closely.

**Architecture:** Task 1 extracts the SVG-drawing logic already in `src/js/ui/scurve.js` into a reusable `PP.buildScurveSvg(points, statusDate, opts)` — a pure refactor, zero behavior change to the live S-Curve tab. Task 2 threads `scurvePoints`/`statusDate`/a capped+counted `delayedTasks` through `src/js/reportsEngine.js`'s `buildProgressPageData`, Node-tested. Task 3 rewrites `renderProgressPage` in `src/js/ui/reports.js` into a two-column layout (chart left, KPI+delayed sidebar right) using Task 1's function and Task 2's data. Task 4 redesigns `renderDividerPage` and its CSS. Task 5 is controller-run end-to-end verification.

**Tech Stack:** Vanilla JS (no framework), Node's built-in `node:test`, hand-rolled SVG via `document.createElementNS`.

## Global Constraints

- Zero external dependencies — no npm packages, no CDN, no bundler. `src/` → `python3 build.py` → `dist/ProjectPlanner.html`.
- Engines (`src/js/*.js`): UMD-lite wrapper, Node-tested, no DOM. `src/js/ui/*.js`: plain IIFEs, no UMD, no jsdom — verified only via controller-run Playwright checks, never by a fresh implementer subagent.
- Baseline: 246/246 Node tests passing as of this plan's start (verified via `node --test` immediately before Task 1 — if your local run differs, use your verified number instead and adjust later "Expected" counts accordingly).
- This plan is **independent** of `docs/superpowers/plans/2026-07-15-activities-calendar-drag-move-plan.md` — different tabs, no shared files, no merge-order dependency. Safe to build on a parallel worktree.
- `buildScurveSvg`'s extraction (Task 1) must not change the live S-Curve tab's behavior in any way: same interactivity (dot hover tooltip), same snapshot-overlay dashed line, same "Actual line stops at status date" cutoff logic. This is a pure refactor for the live tab; only the Reports page usage (Task 3) is new/additive.
- Run `python3 build.py` after every `src/` change, before any manual/browser verification step.
- No new user-controlled strings are introduced into `innerHTML` by this plan — the divider redesign (Task 4) only restructures existing trusted `SECTION_TITLES` strings (already used via `el()`'s `textContent`-based helper, never raw `innerHTML` concatenation).

---

### Task 1: Extract `buildScurveSvg` in `scurve.js`

**Files:**
- Modify: `src/js/ui/scurve.js:1-119` (whole file)

**Interfaces:**
- Produces: `PP.buildScurveSvg(points, statusDate, opts)` — `points` is `calc.scurve` (array of `{periodDate, plannedCum, actualCum}`); `opts: {width, height, padding, interactive, overlayPoints}`, all optional (`width` defaults 800, `height` defaults 320, `padding` defaults 40, `interactive` defaults `true`, `overlayPoints` defaults `null`/no overlay). Returns an `<svg>` DOM element with grid lines, the plan line, the actual line (stopping at `statusDate`), an optional dashed overlay line, and (if `interactive`) dot markers with `data-index` + class `scurve-dot` (caller wires their own mouse listeners on these — `buildScurveSvg` itself never touches `#scurve-tooltip`).
- Consumes: nothing new — same inputs `renderScurve` already has (`state.calc.scurve`, `state.project.meta.statusDate`, `state.scurveOverlaySnapshotId`).

- [ ] **Step 1: Replace the contents of `scurve.js`**

Replace the entire file with:

```js
(function () {
  'use strict';

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function buildScurveSvg(points, statusDate, opts) {
    opts = opts || {};
    var width = opts.width || 800, height = opts.height || 320, padding = opts.padding != null ? opts.padding : 40;
    var interactive = opts.interactive !== false;
    var svg = svgEl('svg', { width: width, height: height, style: 'display:block' });
    var plotW = width - padding * 2;
    var plotH = height - padding * 2;

    function xAt(i) { return padding + (i / Math.max(1, points.length - 1)) * plotW; }
    function yAt(pct) { return padding + (1 - Math.max(0, Math.min(1, pct))) * plotH; }

    for (var g = 0; g <= 4; g++) {
      var gy = padding + (g / 4) * plotH;
      svg.appendChild(svgEl('line', { x1: padding, y1: gy, x2: width - padding, y2: gy, stroke: 'var(--border)', 'stroke-width': 1 }));
      var label = svgEl('text', { x: 4, y: gy + 4, 'font-size': 10, fill: 'var(--text-secondary)' });
      label.textContent = Math.round((1 - g / 4) * 100) + '%';
      svg.appendChild(label);
    }

    function pathFor(key, pts) {
      return (pts || points).map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + xAt(i) + ' ' + yAt(p[key]);
      }).join(' ');
    }

    function actualCutoffIndex() {
      for (var i = 0; i < points.length; i++) {
        if (points[i].periodDate > statusDate) return Math.max(0, i - 1);
      }
      return points.length - 1;
    }

    var actualPoints = points.slice(0, actualCutoffIndex() + 1);

    svg.appendChild(svgEl('path', { d: pathFor('plannedCum'), fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
    svg.appendChild(svgEl('path', { d: pathFor('actualCum', actualPoints), fill: 'none', stroke: 'var(--status-complete)', 'stroke-width': 2 }));

    if (opts.overlayPoints && opts.overlayPoints.length) {
      var overlayPath = opts.overlayPoints.map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + xAt(Math.min(i, points.length - 1)) + ' ' + yAt(p.actualCum);
      }).join(' ');
      svg.appendChild(svgEl('path', { d: overlayPath, fill: 'none', stroke: 'var(--text-tertiary)', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
    }

    if (interactive) {
      actualPoints.forEach(function (p, i) {
        svg.appendChild(svgEl('circle', {
          cx: xAt(i), cy: yAt(p.actualCum), r: 3, fill: 'var(--status-complete)',
          'data-index': i, class: 'scurve-dot',
        }));
      });
    }

    return svg;
  }

  function renderScurve(state) {
    var container = document.getElementById('scurve-body');
    container.innerHTML = '';
    var points = state.calc.scurve;
    if (!points.length) {
      container.textContent = 'No data yet — add tasks with planned dates.';
      return;
    }

    var overlayPoints = null;
    var overlayId = state.scurveOverlaySnapshotId;
    if (overlayId) {
      var snap = state.project.snapshots.find(function (s) { return s.id === overlayId; });
      if (snap && snap.scurve && snap.scurve.length) overlayPoints = snap.scurve;
    }

    var svg = buildScurveSvg(points, state.project.meta.statusDate, {
      width: 800, height: 320, padding: 40, interactive: true, overlayPoints: overlayPoints,
    });
    container.appendChild(svg);

    var tooltip = document.getElementById('scurve-tooltip');
    svg.querySelectorAll('.scurve-dot').forEach(function (dot) {
      dot.addEventListener('mouseenter', function (e) {
        var i = Number(dot.dataset.index);
        var p = points[i];
        tooltip.hidden = false;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
        tooltip.textContent = p.periodDate + ' — Plan ' + Math.round(p.plannedCum * 100) + '% / Actual ' + Math.round(p.actualCum * 100) + '%';
      });
      dot.addEventListener('mouseleave', function () { tooltip.hidden = true; });
    });
  }

  function renderScurveOverlaySelect(state) {
    var select = document.getElementById('scurve-overlay-select');
    var current = select.value;
    select.innerHTML = '';
    var noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    select.appendChild(noneOption);
    state.project.snapshots.forEach(function (snap) {
      var option = document.createElement('option');
      option.value = snap.id;
      option.textContent = (snap.takenAt || '').slice(0, 10) + (snap.note ? ' — ' + snap.note : '');
      select.appendChild(option);
    });
    select.value = current;
  }

  function wireScurve(state, onOverlayChanged) {
    document.getElementById('scurve-overlay-select').addEventListener('change', function (e) {
      state.scurveOverlaySnapshotId = e.target.value || null;
      onOverlayChanged();
    });
    document.getElementById('scurve-copy-image-button').addEventListener('click', function () {
      PP.copyElementAsImage(document.getElementById('scurve-body'));
    });
  }

  window.PP = window.PP || {};
  window.PP.buildScurveSvg = buildScurveSvg;
  window.PP.renderScurve = renderScurve;
  window.PP.renderScurveOverlaySelect = renderScurveOverlaySelect;
  window.PP.wireScurve = wireScurve;
})();
```

This is a pure extraction: `renderScurve`'s observable behavior (grid, plan/actual lines, cutoff at status date, dot tooltips, dashed overlay) is unchanged — only the internal structure moved into `buildScurveSvg` plus a thin wrapper.

- [ ] **Step 2: Build and confirm no regressions**

```bash
node --check src/js/ui/scurve.js
cd "project-planner" 2>/dev/null; python3 build.py
node --test
```

Expected: `node --check` prints nothing (syntax clean); build succeeds; test count unchanged at your verified baseline (this task touches no engine/logic file — `scurve.js` has no automated coverage, per this repo's UI-file convention).

- [ ] **Step 3: Commit**

```bash
git add src/js/ui/scurve.js
git commit -m "refactor: extract buildScurveSvg from renderScurve for reuse"
```

---

### Task 2: `buildProgressPageData` — S-Curve data + delayed-list cap

**Files:**
- Modify: `src/js/reportsEngine.js:32-54` (`buildProgressPageData`)
- Test: `tests/reportsEngine.test.js`

**Interfaces:**
- Consumes: `calc.scurve` (already produced by `PP.recalc`, array of `{periodDate, plannedCum, actualCum}` — no change needed to `calc.js`).
- Produces: `buildProgressPageData(project, calc)` returns `{ kpis, delayedTasks, delayedMoreCount, scurvePoints, statusDate }` — `delayedTasks` is capped at 8 entries (in WBS/`calc.order` order, same as today), `delayedMoreCount` is `0` when there are 8 or fewer delayed tasks, otherwise the count beyond 8. `scurvePoints` is `calc.scurve` unchanged. `statusDate` is `project.meta.statusDate`. Task 3 consumes all five fields.

- [ ] **Step 1: Write the failing tests**

In `tests/reportsEngine.test.js`, replace the existing `'buildProgressPageData produces 6 KPI tiles...'` test (lines 62-79) with:

```js
test('buildProgressPageData produces 6 KPI tiles (Actual/Planned/Variance/Delayed/Complete/Deliverables) matching calc.kpis, and lists exactly the delayed leaf task', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);

  const pct = x => Math.round(x * 100) + '%';
  assert.deepEqual(data.kpis, [
    { label: 'Actual', value: pct(calc.kpis.actualPct) },
    { label: 'Planned', value: pct(calc.kpis.plannedPct) },
    { label: 'Variance', value: pct(calc.kpis.variance) },
    { label: 'Delayed', value: String(calc.kpis.delayedCount) },
    { label: 'Complete', value: calc.kpis.completeCount + '/' + calc.kpis.totalCount },
    { label: 'Deliverables', value: calc.kpis.deliverablesComplete + '/' + calc.kpis.deliverablesTotal },
  ]);

  assert.equal(data.delayedTasks.length, 1);
  assert.deepEqual(data.delayedTasks[0], { name: 'Build Phase', plannedFinish: '2026-06-20', remarks: 'Waiting on vendor' });
  assert.equal(data.delayedMoreCount, 0);
  assert.deepEqual(data.scurvePoints, calc.scurve);
  assert.equal(data.statusDate, '2026-07-09');
});
```

Then add two new tests directly after it (before the `'buildProgressPageData returns an empty delayedTasks array...'` test):

```js
test('buildProgressPageData caps delayedTasks at 8 and reports the remainder via delayedMoreCount', () => {
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    tasks.push({
      id: 't' + i, parentId: null, order: i, name: 'Task ' + i,
      plannedStart: '2026-06-01', plannedFinish: '2026-06-05',
      actualStart: null, actualFinish: null, owner: 'Alice', remarks: '',
    });
  }
  const project = fixtureProject({ tasks });
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);

  assert.equal(calc.kpis.delayedCount, 10);
  assert.equal(data.delayedTasks.length, 8);
  assert.equal(data.delayedMoreCount, 2);
});

test('buildProgressPageData reports delayedMoreCount 0 when there are exactly 8 delayed tasks', () => {
  const tasks = [];
  for (let i = 0; i < 8; i++) {
    tasks.push({
      id: 't' + i, parentId: null, order: i, name: 'Task ' + i,
      plannedStart: '2026-06-01', plannedFinish: '2026-06-05',
      actualStart: null, actualFinish: null, owner: 'Alice', remarks: '',
    });
  }
  const project = fixtureProject({ tasks });
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);

  assert.equal(data.delayedTasks.length, 8);
  assert.equal(data.delayedMoreCount, 0);
});
```

Also add `delayedMoreCount` to the existing empty-delayed test (now a few lines further down):

```js
test('buildProgressPageData returns an empty delayedTasks array when nothing is delayed', () => {
  const project = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '' },
    ],
  });
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);
  assert.deepEqual(data.delayedTasks, []);
  assert.equal(data.delayedMoreCount, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `data.delayedMoreCount` is `undefined` (assertion errors on the new/changed assertions), `data.scurvePoints` is `undefined`, `data.statusDate` is `undefined`.

- [ ] **Step 3: Implement the change**

In `src/js/reportsEngine.js`, replace `buildProgressPageData` (lines 32-54) with:

```js
  function buildProgressPageData(project, calc) {
    var kpis = calc.kpis;
    var tiles = [
      { label: 'Actual', value: pct(kpis.actualPct) },
      { label: 'Planned', value: pct(kpis.plannedPct) },
      { label: 'Variance', value: pct(kpis.variance) },
      { label: 'Delayed', value: String(kpis.delayedCount) },
      { label: 'Complete', value: kpis.completeCount + '/' + kpis.totalCount },
      { label: 'Deliverables', value: kpis.deliverablesComplete + '/' + kpis.deliverablesTotal },
    ];

    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));
    var delayedTasks = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var c = calc.computed.get(id);
      if (c.status !== 'Delayed') return;
      var task = byId.get(id);
      delayedTasks.push({ name: task.name, plannedFinish: c.plannedFinish, remarks: task.remarks || '' });
    });

    var MAX_DELAYED_SHOWN = 8;
    var delayedMoreCount = delayedTasks.length > MAX_DELAYED_SHOWN ? delayedTasks.length - MAX_DELAYED_SHOWN : 0;

    return {
      kpis: tiles,
      delayedTasks: delayedTasks.slice(0, MAX_DELAYED_SHOWN),
      delayedMoreCount: delayedMoreCount,
      scurvePoints: calc.scurve,
      statusDate: project.meta.statusDate,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — total count is your Task 1 baseline + 2 (the two new tests; the third change is an edit to an existing test, not a new one).

- [ ] **Step 5: Commit**

```bash
git add src/js/reportsEngine.js tests/reportsEngine.test.js
git commit -m "feat: thread S-curve data and a capped delayed-list count through buildProgressPageData"
```

---

### Task 3: Progress page two-column layout

**Files:**
- Modify: `src/js/ui/reports.js:53-71` (`renderProgressPage`)
- Modify: `src/css/layout.css:389-392` (`.report-kpi-row`, `.report-kpi-tile`, `.report-kpi-tile-value`)

**Interfaces:**
- Consumes: `PP.buildScurveSvg` (Task 1); `data.scurvePoints`, `data.statusDate`, `data.delayedMoreCount` (Task 2, on top of the pre-existing `data.kpis`/`data.delayedTasks`).

- [ ] **Step 1: Replace `renderProgressPage` in `reports.js`**

Replace lines 53-71 with:

```js
  function renderProgressPage(data) {
    var chart = PP.buildScurveSvg(data.scurvePoints, data.statusDate, { width: 760, height: 480, padding: 36, interactive: false });
    var chartCol = el('div', { class: 'report-progress-chart' }, [chart]);

    var kpiRow = el('div', { class: 'report-kpi-row' }, data.kpis.map(function (tile) {
      return el('div', { class: 'report-kpi-tile' }, [
        el('div', { class: 'report-kpi-tile-label' }, [tile.label]),
        el('div', { class: 'report-kpi-tile-value' }, [tile.value]),
      ]);
    }));
    var delayedItems = data.delayedTasks.map(function (t) {
      return el('li', {}, [t.name + ' — due ' + (t.plannedFinish || '') + (t.remarks ? ' (' + t.remarks + ')' : '')]);
    });
    if (data.delayedMoreCount > 0) {
      delayedItems.push(el('li', { class: 'report-list-more' }, ['+' + data.delayedMoreCount + ' more']));
    }
    var delayedBody = data.delayedTasks.length
      ? el('ul', { class: 'report-list' }, delayedItems)
      : el('p', { class: 'report-empty-note' }, ['No delayed items.']);
    var sidebar = el('div', { class: 'report-progress-sidebar' }, [
      kpiRow,
      el('h3', { class: 'report-subheading' }, ['Delayed Items']),
      delayedBody,
    ]);

    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[0]]),
      el('div', { class: 'report-progress-body' }, [chartCol, sidebar]),
    ]);
  }
```

- [ ] **Step 2: Update the KPI tile CSS for the sidebar**

In `src/css/layout.css`, replace lines 389-392:

```css
.report-kpi-row { display: flex; gap: 16px; flex-wrap: wrap; }
.report-kpi-tile { background: #f7f7f8; border-radius: 12px; padding: 14px 22px; min-width: 130px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.report-kpi-tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6e73; }
.report-kpi-tile-value { font-size: 26px; font-weight: 600; color: #00338D; }
```

with:

```css
.report-progress-body { display: flex; gap: 24px; flex: 1; min-height: 0; }
.report-progress-chart { flex: 0 0 65%; }
.report-progress-sidebar { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.report-kpi-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.report-kpi-tile { background: #f7f7f8; border-radius: 12px; padding: 10px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.report-kpi-tile-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6e6e73; }
.report-kpi-tile-value { font-size: 20px; font-weight: 600; color: #00338D; }
.report-list-more { color: #6e6e73; font-style: italic; }
```

- [ ] **Step 3: Build and confirm no regressions**

```bash
node --check src/js/ui/reports.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 2's final count (this task touches no engine/logic file in a test-observable way).

- [ ] **Step 4: Commit**

```bash
git add src/js/ui/reports.js src/css/layout.css
git commit -m "feat: two-column S-curve + KPI sidebar layout on the Reports Progress page"
```

---

### Task 4: Divider page redesign

**Files:**
- Modify: `src/js/ui/reports.js:45-51` (`renderDividerPage`)
- Modify: `src/css/layout.css:368-379` (`.report-page-title, .report-page-divider, .report-page-closing`, `.report-divider-inner`, `.report-divider-title`)

**Interfaces:**
- Consumes: `PP.SECTION_TITLES` entries (unchanged format, e.g. `'01 ผลการดำเนินงาน'`) — no `reportsEngine.js` change.

- [ ] **Step 1: Replace `renderDividerPage` in `reports.js`**

Replace lines 45-51 with:

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

- [ ] **Step 2: Split divider styling out of the shared title/divider/closing rule**

In `src/css/layout.css`, replace lines 368-379:

```css
.report-page-title, .report-page-divider, .report-page-closing {
  justify-content: center; align-items: flex-start; color: #ffffff;
  background: linear-gradient(135deg, #00338D 0%, #005EB8 60%, #E5007E 100%);
}
.report-page-closing { align-items: center; text-align: center; }

.report-title-project { font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-bottom: 16px; }
.report-title-heading { font-size: 48px; font-weight: 600; margin: 0 0 16px 0; }
.report-title-date { font-size: 16px; opacity: 0.9; }

.report-divider-inner { border-left: 6px solid #ffffff; padding-left: 24px; }
.report-divider-title { font-size: 40px; font-weight: 600; margin: 0; }
```

with:

```css
.report-page-title, .report-page-closing {
  justify-content: center; align-items: flex-start; color: #ffffff;
  background: linear-gradient(135deg, #00338D 0%, #005EB8 60%, #E5007E 100%);
}
.report-page-closing { align-items: center; text-align: center; }

.report-title-project { font-size: 16px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-bottom: 16px; }
.report-title-heading { font-size: 48px; font-weight: 600; margin: 0 0 16px 0; }
.report-title-date { font-size: 16px; opacity: 0.9; }

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

(`.report-page-divider` is removed from the shared selector and given its own rule; title/closing pages keep the original blue→pink gradient unchanged.)

- [ ] **Step 3: Build and confirm no regressions**

```bash
node --check src/js/ui/reports.js
python3 build.py
node --test
```

Expected: syntax clean; build succeeds; test count unchanged from Task 3's final count.

- [ ] **Step 4: Commit**

```bash
git add src/js/ui/reports.js src/css/layout.css
git commit -m "feat: dark-navy divider pages with section number and gradient accent bar"
```

---

### Task 5: End-to-end verification (controller-run, not a fresh subagent)

Same pattern as this repo's prior final-verification tasks: the controller drives a real browser via the Playwright tools already available in this session, not a dispatched subagent.

**Files:** none (verification only).

- [ ] **Step 1: Build and confirm the full test suite**

```bash
python3 build.py
node --test
```

Expected: test count matches Task 2's final count exactly (Tasks 3-4 add no tests).

- [ ] **Step 2: Serve the built app and seed a realistic project**

```bash
cd dist && python3 -m http.server 8791
```

Navigate to it with the Playwright browser tools (`file://` URLs are blocked by the sandbox). Complete the name-picker overlay if it appears. Load or seed a project with at least one delayed task and at least one scurve data point (any existing UAT seed file works, or add a couple of tasks with a `plannedFinish` in the past relative to the status date).

- [ ] **Step 3: Confirm the live S-Curve tab is unaffected**

Open the S-Curve tab. Confirm: the plan (blue) and actual (green) lines render, the actual line stops at the status date, hovering a dot shows the tooltip with the correct period/percent text, and (if a snapshot exists) selecting it in the overlay dropdown shows the dashed overlay line. This must look and behave identically to before Task 1's refactor.

- [ ] **Step 4: Confirm the Reports Progress page**

Open the Reports tab. On page 4 ("01 ผลการดำเนินงาน"), confirm: an S-Curve chart renders on the left (~65% width, no dots/tooltip since it's non-interactive), the 6 KPI tiles render in a 2-column grid on the right, the delayed-items list renders below the tiles, and if more than 8 tasks are delayed a "+N more" line appears at the end of the list.

- [ ] **Step 5: Confirm all 4 divider pages**

Step through pages 3, 5, 7, 9 (the divider pages). Confirm each: has a dark navy background, shows a large low-opacity number in the corner matching its section ("01", "02", "03", "04"), shows the section title in white next to a blue→pink gradient accent bar, and that the title (page 1) and closing (page 11) pages are unchanged (still the blue→pink gradient background).

- [ ] **Step 6: Confirm print preview still works**

Click "Export PDF" (or call `window.print()` via the Playwright evaluate tool) and confirm the print dialog opens with no console errors logged beforehand.

- [ ] **Step 7: Verify zero regression to every other tab**

Click through Plan, Gantt, Dashboard, Snapshots, Resources, Deliverable/Billing, Settings, Holidays, Activities, Issues/Risks/Decisions. Confirm no console errors and each tab still renders its content.

- [ ] **Step 8: Final test sweep**

```bash
node --test
```

Expected: same count as Step 1 — nothing regressed.

- [ ] **Step 9: Record the result**

If every check in Steps 1-8 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-4: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.
