# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three more tabs to ProjectPlanner — S-Curve (planned vs actual cumulative progress, with optional snapshot overlay), Dashboard (status donut, phase progress bars, PIC workload, upcoming milestones, top delayed tasks), and Snapshots (take/list/delete, compare any two) — all built on data the Foundation engines already compute (`calc.js`'s `scurve`/`kpis`, `snapshot.js`'s `takeSnapshot`/`compareSnapshots`, both shipped since the Foundation phase).

**Architecture:** Three new `src/js/ui/*.js` files (`scurve.js`, `dashboard.js`, `snapshots.js`), same plain-IIFE style as `tree.js`/`gantt.js`/`app.js`. The tab-switching logic in `app.js` (`wireViewTabs`) generalizes from its current hardcoded 2-view form to a data-driven list, since it now needs to toggle 5 views. `refresh()` renders all five views on every state change, same policy already established by the Gantt phase. Selection state that must survive a full re-render (S-Curve's snapshot-overlay choice, Snapshots' A/B compare choice) lives on `state` itself, not as transient DOM state — this project already hit a bug shape once, twice, where DOM/CSS state silently diverged from what JS thought was true (Gantt's `[hidden]` CSS override, the collapse-suppression bug), and a full-rebuild-per-render view with radio-button selections is exactly the kind of thing that would lose that selection on every unrelated edit if it lived only in the DOM — so this plan puts it in `state` from the start rather than waiting for review to catch it.

**Tech Stack:** Vanilla ES5-compatible JavaScript, raw SVG DOM APIs (`document.createElementNS`) for the S-curve line chart and the dashboard's status donut, plain HTML/CSS bars and tables for everything else. No charting library.

## Global Constraints

- Zero external dependencies, runtime or dev. No charting/SVG library.
- `src/js/ui/scurve.js`, `src/js/ui/dashboard.js`, `src/js/ui/snapshots.js` are plain IIFEs reading/writing `window.PP` directly — same style as `tree.js`/`gantt.js`/`app.js` — never `require`'d by tests, so no UMD wrapper needed.
- Dates are ISO `"YYYY-MM-DD"` strings everywhere.
- No code comments except where genuinely non-obvious.
- File paths exact — every task states `Create:`/`Modify:` paths relative to `project-planner/`.
- Reusable planning tool for any project type/scale — nothing in this plan's code hardcodes phase names, task counts, or company names.
- All user-controlled strings (task names, PIC, remarks, snapshot notes) reaching the DOM must use `.textContent`, never `innerHTML` string concatenation — this codebase has already fixed XSS issues of exactly this shape twice (Foundation, Plan View UI phases).
- Every mutation to `project.tasks` must go through `store.js`'s `Project` methods. Taking/deleting a snapshot does **not** go through `Project` (there is no `addSnapshot`/`deleteSnapshot` method — `snapshot.js`'s `takeSnapshot` already mutates `project.snapshots` directly, bypassing undo/audit entirely; this is pre-existing Foundation-phase behavior, not something this plan introduces or needs to fix).
- DOM-touching files have no automated test framework available (adding jsdom would violate zero-dependency) — each such task's "test" step is `node --check` (syntax only) plus confirming the build succeeds and inlines the new code; real behavioral verification happens once, at this plan's final task, in a real browser (controller-run, not a fresh subagent — same pattern as the last two plans' final tasks).
- Locked interfaces already shipped on `main` that this plan consumes, unchanged:
  - `PP.recalc(project)` → `{ computed, order, children, wbs, overall, kpis, scurve }` (`calc.js`). `scurve` is `Array<{ periodDate, plannedCum, actualCum }>` (0..1 fractions, not percentages).
  - `PP.takeSnapshot(project, computed, note, takenBy)` → `Snapshot` object `{ id, takenAt, takenBy, note, statusDate, tasks, overall, kpis, scurve }`, pushes onto `project.snapshots` (`snapshot.js`).
  - `PP.compareSnapshots(a, b)` → `{ overallDelta: { actualPct, plannedPct }, added, removed, slipped }` (`snapshot.js`).
  - `PP.parseISO(dateISO)` → UTC millis; `PP.toISO(utcMillis)` → `"YYYY-MM-DD"` (`schedule.js`).
  - `state` shape (extended by this plan): `{ project, calc, currentUser, dirty, filters, scurveOverlaySnapshotId, snapshotCompareA, snapshotCompareB }` (`app.js`).
  - `build.py`'s `JS_ORDER` skips any listed file that doesn't yet exist, so pre-registering all three new files in Task 1 is safe.

---

### Task 1: Generalize tabs + S-Curve view

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/build.py`
- Create: `project-planner/src/js/ui/scurve.js`

**Interfaces:**
- Consumes: `state.calc.scurve`, `state.calc.overall` (`calc.js`), `state.project.snapshots` (`store.js`/`snapshot.js`), `PP.parseISO`/`PP.toISO` (`schedule.js`).
- Produces (used by later tasks and `app.js`): `PP.renderScurve(state)`. Adds `state.scurveOverlaySnapshotId` (string snapshot id, or `null`) to the `state` shape — set by a `<select>` in the S-Curve toolbar, read by `renderScurve` to draw an optional dashed overlay curve from a past snapshot's `scurve` data.

- [ ] **Step 1: Add all five tabs and the three new view containers to `src/index.html`**

Change:
```html
  <div id="view-tabs">
    <button class="view-tab active" data-view="plan">Plan</button>
    <button class="view-tab" data-view="gantt">Gantt</button>
  </div>
```
to:
```html
  <div id="view-tabs">
    <button class="view-tab active" data-view="plan">Plan</button>
    <button class="view-tab" data-view="gantt">Gantt</button>
    <button class="view-tab" data-view="scurve">S-Curve</button>
    <button class="view-tab" data-view="dashboard">Dashboard</button>
    <button class="view-tab" data-view="snapshots">Snapshots</button>
  </div>
```

Then, right after the existing `#gantt-view` block's closing `</div>` and before the final `</div>` that closes `#app`, add:
```html
  <div id="scurve-view" hidden>
    <div id="scurve-toolbar">
      <label>Overlay snapshot
        <select id="scurve-overlay-select"><option value="">None</option></select>
      </label>
    </div>
    <div id="scurve-body"></div>
  </div>
  <div id="dashboard-view" hidden>
    <div id="dashboard-body"></div>
  </div>
  <div id="snapshots-view" hidden>
    <div id="snapshots-toolbar">
      <input id="snapshot-note-input" type="text" placeholder="Snapshot note (optional)">
      <button id="take-snapshot-button">Take Snapshot</button>
    </div>
    <div id="snapshots-list"></div>
    <div id="snapshot-comparison"></div>
  </div>
```

Also add a tooltip element (used by the S-Curve chart's hover) right after the existing `<div id="context-menu" ...></div>` line:
```html
<div id="scurve-tooltip" hidden></div>
```

- [ ] **Step 2: Add layout CSS for the new views**

Append to `project-planner/src/css/layout.css`:
```css
#scurve-view, #dashboard-view, #snapshots-view { flex: 1; display: flex; flex-direction: column; overflow: auto; min-height: 0; padding: 12px 20px; }

#scurve-toolbar, #snapshots-toolbar { display: flex; gap: 10px; align-items: center; padding-bottom: 10px; }
#snapshots-toolbar input[type="text"] { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; flex: 1; max-width: 300px; }
#take-snapshot-button {
  background: var(--kpmg-blue); color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; cursor: pointer; font-size: 13px;
}

#scurve-tooltip {
  position: fixed; background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 8px; font-size: 12px; pointer-events: none; z-index: 1000;
}

.dashboard-section { background: var(--surface-alt); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
.dashboard-section h3 { margin: 0 0 10px 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; }
.dashboard-section-wide { grid-column: 1 / -1; }
#dashboard-body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.dashboard-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
.dashboard-bar-label { width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-bar-wrap { flex: 1; height: 14px; background: var(--border); border-radius: 3px; position: relative; overflow: hidden; }
.dashboard-bar { position: absolute; top: 0; left: 0; height: 100%; border-radius: 3px; }
.dashboard-bar.plan { background: var(--kpmg-blue-light); opacity: 0.5; }
.dashboard-bar.actual { background: var(--kpmg-blue); }
.dashboard-bar.pic { background: var(--kpmg-blue); }

.dashboard-list { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.dashboard-list li { padding: 4px 0; border-bottom: 1px solid var(--border); }

.dashboard-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dashboard-table th, .dashboard-table td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); }

.snapshot-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.snapshot-delete-btn {
  background: none; border: 1px solid var(--border); border-radius: 4px;
  padding: 2px 10px; font-size: 12px; cursor: pointer; color: var(--status-delayed);
}
#snapshot-comparison { margin-top: 14px; font-size: 13px; }
#snapshot-comparison ul { margin: 4px 0; padding-left: 20px; }
```

- [ ] **Step 3: Create `src/js/ui/scurve.js`**

Create `project-planner/src/js/ui/scurve.js`:
```js
(function () {
  'use strict';

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function renderScurve(state) {
    var container = document.getElementById('scurve-body');
    container.innerHTML = '';
    var points = state.calc.scurve;
    if (!points.length) {
      container.textContent = 'No data yet — add tasks with planned dates.';
      return;
    }

    var width = 800, height = 320, padding = 40;
    var svg = svgEl('svg', { width: width, height: height, style: 'display:block' });
    var plotW = width - padding * 2;
    var plotH = height - padding * 2;

    function xAt(i) { return padding + (i / Math.max(1, points.length - 1)) * plotW; }
    function yAt(pct) { return padding + (1 - Math.max(0, Math.min(1, pct))) * plotH; }

    for (var g = 0; g <= 4; g++) {
      var gy = padding + (g / 4) * plotH;
      svg.appendChild(svgEl('line', { x1: padding, y1: gy, x2: width - padding, y2: gy, stroke: '#e1e4e8', 'stroke-width': 1 }));
      var label = svgEl('text', { x: 4, y: gy + 4, 'font-size': 10, fill: '#5b6470' });
      label.textContent = Math.round((1 - g / 4) * 100) + '%';
      svg.appendChild(label);
    }

    function pathFor(key) {
      return points.map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + xAt(i) + ' ' + yAt(p[key]);
      }).join(' ');
    }

    svg.appendChild(svgEl('path', { d: pathFor('plannedCum'), fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
    svg.appendChild(svgEl('path', { d: pathFor('actualCum'), fill: 'none', stroke: 'var(--status-complete)', 'stroke-width': 2 }));

    var overlayId = state.scurveOverlaySnapshotId;
    if (overlayId) {
      var snap = state.project.snapshots.find(function (s) { return s.id === overlayId; });
      if (snap && snap.scurve && snap.scurve.length) {
        var overlayPath = snap.scurve.map(function (p, i) {
          return (i === 0 ? 'M ' : 'L ') + xAt(Math.min(i, points.length - 1)) + ' ' + yAt(p.actualCum);
        }).join(' ');
        svg.appendChild(svgEl('path', { d: overlayPath, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
      }
    }

    points.forEach(function (p, i) {
      svg.appendChild(svgEl('circle', {
        cx: xAt(i), cy: yAt(p.actualCum), r: 3, fill: 'var(--status-complete)',
        'data-index': i, class: 'scurve-dot',
      }));
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
  }

  window.PP = window.PP || {};
  window.PP.renderScurve = renderScurve;
  window.PP.renderScurveOverlaySelect = renderScurveOverlaySelect;
  window.PP.wireScurve = wireScurve;
})();
```

- [ ] **Step 4: Generalize `wireViewTabs` and wire the S-Curve overlay select in `app.js`**

Replace the current `wireViewTabs` function:
```js
  function wireViewTabs(state) {
    var tabs = document.querySelectorAll('.view-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var view = tab.dataset.view;
        document.getElementById('plan-view').hidden = view !== 'plan';
        document.getElementById('gantt-view').hidden = view !== 'gantt';
      });
    });
  }
```
with:
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view'];

  function wireViewTabs(state) {
    var tabs = document.querySelectorAll('.view-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var view = tab.dataset.view;
        VIEW_IDS.forEach(function (viewId) {
          var el = document.getElementById(viewId);
          if (el) el.hidden = viewId !== view + '-view';
        });
      });
    });
  }
```

Change `refresh` from:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
    renderPicFilter(state);
    PP.renderTree(state);
    PP.renderGantt(state);
    if (markDirty) {
```
to:
```js
  function refresh(state, markDirty) {
    state.calc = PP.recalc(state.project);
    renderHeader(state);
    renderPicFilter(state);
    PP.renderTree(state);
    PP.renderGantt(state);
    PP.renderScurve(state);
    PP.renderScurveOverlaySelect(state);
    if (markDirty) {
```
(leave the rest of the function body unchanged).

In `showApp(state)`, change:
```js
    wireGanttZoom(state);
    PP.wireTree(state, function () { refresh(state, true); });
    PP.wireGantt(state, function () { refresh(state, true); });
```
to:
```js
    wireGanttZoom(state);
    PP.wireTree(state, function () { refresh(state, true); });
    PP.wireGantt(state, function () { refresh(state, true); });
    PP.wireScurve(state, function () { PP.renderScurve(state); });
```

In `boot()`, change the `state` object literal from:
```js
    var state = {
      project: project,
      currentUser: localStorage.getItem('pp:currentUser'),
      dirty: false,
      calc: null,
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
    };
```
to:
```js
    var state = {
      project: project,
      currentUser: localStorage.getItem('pp:currentUser'),
      dirty: false,
      calc: null,
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
      scurveOverlaySnapshotId: null,
    };
```

- [ ] **Step 5: Register `scurve.js`, `dashboard.js`, `snapshots.js` in `build.py`**

Change `JS_ORDER` from:
```python
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/app.js",
]
```
to:
```python
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
    "filters.js",
    "ui/tree.js",
    "ui/gantt.js",
    "ui/scurve.js",
    "ui/dashboard.js",
    "ui/snapshots.js",
    "ui/app.js",
]
```
`ui/dashboard.js` and `ui/snapshots.js` don't exist yet — `build.py` already skips missing files, so this is safe (same pattern used when the Gantt plan pre-registered `ui/gantt.js` before it existed).

- [ ] **Step 6: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/scurve.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderScurve" dist/ProjectPlanner.html
node --test
```
Expected: both syntax checks clean; build succeeds; grep prints `1`; all 92 tests still pass (this task adds no Node tests — pure DOM/SVG code, verified in Task 4).

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/js/ui/app.js src/js/ui/scurve.js build.py
git commit -m "Generalize view tabs and add S-Curve view with snapshot overlay"
```

---

### Task 2: Dashboard view

**Files:**
- Modify: `project-planner/src/js/ui/app.js`
- Create: `project-planner/src/js/ui/dashboard.js`

**Interfaces:**
- Consumes: `state.calc.{computed, order, children}` (`calc.js`), `state.project.tasks` (`store.js`), `PP.parseISO`/`PP.toISO` (`schedule.js`).
- Produces: `PP.renderDashboard(state)` — rebuilds `#dashboard-body`'s contents (status donut, phase progress bars, PIC workload bars, upcoming-milestones list, top-delayed-tasks table).

- [ ] **Step 1: Create `src/js/ui/dashboard.js`**

Create `project-planner/src/js/ui/dashboard.js`:
```js
(function () {
  'use strict';

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  var STATUS_COLORS = {
    'Not Start': '#9aa5b1', 'In Progress': '#0091DA', 'Delayed': '#d64545',
    'Complete': '#1a8f5e', 'Blocked': '#d64545', 'Cancelled': '#9aa5b1',
  };

  function donutPath(cx, cy, r, startFrac, endFrac) {
    var startAngle = startFrac * 2 * Math.PI - Math.PI / 2;
    var endAngle = endFrac * 2 * Math.PI - Math.PI / 2;
    var x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    var x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    var largeArc = (endFrac - startFrac) > 0.5 ? 1 : 0;
    return 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z';
  }

  function renderDonut(computed, order, children) {
    var counts = {};
    order.forEach(function (id) {
      if ((children.get(id) || []).length > 0) return;
      var status = computed.get(id).status;
      counts[status] = (counts[status] || 0) + 1;
    });
    var total = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0);
    var svg = svgEl('svg', { width: 160, height: 160, viewBox: '0 0 160 160' });
    if (total === 0) return svg;
    var acc = 0;
    Object.keys(counts).forEach(function (status) {
      var frac = counts[status] / total;
      svg.appendChild(svgEl('path', { d: donutPath(80, 80, 70, acc, acc + frac), fill: STATUS_COLORS[status] || '#ccc' }));
      acc += frac;
    });
    svg.appendChild(svgEl('circle', { cx: 80, cy: 80, r: 40, fill: 'var(--surface)' }));
    return svg;
  }

  function renderDashboard(state) {
    var container = document.getElementById('dashboard-body');
    container.innerHTML = '';
    var calc = state.calc;
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));

    var donutSection = document.createElement('div');
    donutSection.className = 'dashboard-section';
    var donutTitle = document.createElement('h3');
    donutTitle.textContent = 'Status Breakdown';
    donutSection.appendChild(donutTitle);
    donutSection.appendChild(renderDonut(calc.computed, calc.order, calc.children));
    container.appendChild(donutSection);

    var phaseSection = document.createElement('div');
    phaseSection.className = 'dashboard-section';
    var phaseTitle = document.createElement('h3');
    phaseTitle.textContent = 'Progress by Phase';
    phaseSection.appendChild(phaseTitle);
    var roots = calc.children.get(null) || [];
    roots.forEach(function (id) {
      var task = byId.get(id);
      var computed = calc.computed.get(id);
      var row = document.createElement('div');
      row.className = 'dashboard-bar-row';
      var label = document.createElement('span');
      label.className = 'dashboard-bar-label';
      label.textContent = task.name;
      var barWrap = document.createElement('span');
      barWrap.className = 'dashboard-bar-wrap';
      var planBar = document.createElement('span');
      planBar.className = 'dashboard-bar plan';
      planBar.style.width = Math.round(computed.plannedPctToDate * 100) + '%';
      var actualBar = document.createElement('span');
      actualBar.className = 'dashboard-bar actual';
      actualBar.style.width = Math.round(computed.actualPct * 100) + '%';
      barWrap.appendChild(planBar);
      barWrap.appendChild(actualBar);
      row.appendChild(label);
      row.appendChild(barWrap);
      phaseSection.appendChild(row);
    });
    container.appendChild(phaseSection);

    var picSection = document.createElement('div');
    picSection.className = 'dashboard-section';
    var picTitle = document.createElement('h3');
    picTitle.textContent = 'Workload by PIC';
    picSection.appendChild(picTitle);
    var picCounts = {};
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      if (!task.pic) return;
      picCounts[task.pic] = (picCounts[task.pic] || 0) + 1;
    });
    var picNames = Object.keys(picCounts);
    var maxCount = picNames.reduce(function (m, k) { return Math.max(m, picCounts[k]); }, 1);
    picNames.sort().forEach(function (pic) {
      var row = document.createElement('div');
      row.className = 'dashboard-bar-row';
      var label = document.createElement('span');
      label.className = 'dashboard-bar-label';
      label.textContent = pic + ' (' + picCounts[pic] + ')';
      var barWrap = document.createElement('span');
      barWrap.className = 'dashboard-bar-wrap';
      var bar = document.createElement('span');
      bar.className = 'dashboard-bar pic';
      bar.style.width = Math.round((picCounts[pic] / maxCount) * 100) + '%';
      barWrap.appendChild(bar);
      row.appendChild(label);
      row.appendChild(barWrap);
      picSection.appendChild(row);
    });
    container.appendChild(picSection);

    var milestoneSection = document.createElement('div');
    milestoneSection.className = 'dashboard-section';
    var milestoneTitle = document.createElement('h3');
    milestoneTitle.textContent = 'Upcoming Milestones (14 days)';
    milestoneSection.appendChild(milestoneTitle);
    var statusDate = state.project.meta.statusDate;
    var horizonISO = PP.toISO(PP.parseISO(statusDate) + 14 * 86400000);
    var upcomingList = document.createElement('ul');
    upcomingList.className = 'dashboard-list';
    calc.order.forEach(function (id) {
      var task = byId.get(id);
      if (!task.milestone) return;
      var computed = calc.computed.get(id);
      if (!computed.plannedFinish) return;
      if (computed.plannedFinish >= statusDate && computed.plannedFinish <= horizonISO) {
        var li = document.createElement('li');
        li.textContent = computed.plannedFinish + ' — ' + task.name;
        upcomingList.appendChild(li);
      }
    });
    if (!upcomingList.children.length) {
      var none = document.createElement('li');
      none.textContent = 'None in range';
      upcomingList.appendChild(none);
    }
    milestoneSection.appendChild(upcomingList);
    container.appendChild(milestoneSection);

    var delayedSection = document.createElement('div');
    delayedSection.className = 'dashboard-section dashboard-section-wide';
    var delayedTitle = document.createElement('h3');
    delayedTitle.textContent = 'Top Delayed Tasks';
    delayedSection.appendChild(delayedTitle);
    var delayedRows = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var computed = calc.computed.get(id);
      if (computed.status !== 'Delayed') return;
      delayedRows.push({ task: byId.get(id), computed: computed });
    });
    delayedRows.sort(function (a, b) { return a.computed.plannedFinish < b.computed.plannedFinish ? -1 : 1; });
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['Task', 'PIC', 'P-Finish', '% Actual', 'Remarks'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    delayedRows.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.task.name, r.task.pic || '', r.computed.plannedFinish, Math.round(r.computed.actualPct * 100) + '%', r.task.remarks || ''].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    delayedSection.appendChild(table);
    container.appendChild(delayedSection);
  }

  window.PP = window.PP || {};
  window.PP.renderDashboard = renderDashboard;
})();
```

- [ ] **Step 2: Wire it into `refresh()` in `app.js`**

Change:
```js
    PP.renderScurve(state);
    PP.renderScurveOverlaySelect(state);
    if (markDirty) {
```
to:
```js
    PP.renderScurve(state);
    PP.renderScurveOverlaySelect(state);
    PP.renderDashboard(state);
    if (markDirty) {
```

- [ ] **Step 3: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/dashboard.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderDashboard" dist/ProjectPlanner.html
node --test
```
Expected: both syntax checks clean; build succeeds; grep prints `1`; all 92 tests pass (no new Node tests — verified in Task 4).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/js/ui/dashboard.js src/js/ui/app.js
git commit -m "Add Dashboard view: status donut, phase/PIC bars, milestones, delayed table"
```

---

### Task 3: Snapshots view + comparison

**Files:**
- Modify: `project-planner/src/js/ui/app.js`
- Create: `project-planner/src/js/ui/snapshots.js`

**Interfaces:**
- Consumes: `PP.takeSnapshot`, `PP.compareSnapshots` (`snapshot.js`, unchanged since Foundation).
- Produces: `PP.renderSnapshots(state)`, `PP.wireSnapshots(state, onChanged)`. Adds `state.snapshotCompareA`/`state.snapshotCompareB` (string snapshot ids, or `null`) to the `state` shape, so the A/B comparison selection survives the full DOM rebuild every `refresh()` triggers (radio button `checked` state alone would not survive `innerHTML = ''`).

- [ ] **Step 1: Create `src/js/ui/snapshots.js`**

Create `project-planner/src/js/ui/snapshots.js`:
```js
(function () {
  'use strict';

  function renderSnapshots(state) {
    var list = document.getElementById('snapshots-list');
    list.innerHTML = '';
    var snaps = state.project.snapshots;

    if (!snaps.length) {
      var empty = document.createElement('div');
      empty.textContent = 'No snapshots yet.';
      list.appendChild(empty);
    }

    snaps.slice().reverse().forEach(function (snap) {
      var row = document.createElement('div');
      row.className = 'snapshot-row';
      row.dataset.id = snap.id;

      var info = document.createElement('span');
      info.textContent = (snap.takenAt || '').slice(0, 10) + ' by ' + snap.takenBy +
        (snap.note ? ' — ' + snap.note : '') + ' (Actual ' + Math.round(snap.overall.actualPct * 100) + '%)';
      row.appendChild(info);

      var labelA = document.createElement('label');
      var checkboxA = document.createElement('input');
      checkboxA.type = 'radio';
      checkboxA.name = 'snapshot-a';
      checkboxA.value = snap.id;
      checkboxA.className = 'snapshot-select-a';
      checkboxA.checked = snap.id === state.snapshotCompareA;
      labelA.appendChild(checkboxA);
      labelA.appendChild(document.createTextNode('A'));
      row.appendChild(labelA);

      var labelB = document.createElement('label');
      var checkboxB = document.createElement('input');
      checkboxB.type = 'radio';
      checkboxB.name = 'snapshot-b';
      checkboxB.value = snap.id;
      checkboxB.className = 'snapshot-select-b';
      checkboxB.checked = snap.id === state.snapshotCompareB;
      labelB.appendChild(checkboxB);
      labelB.appendChild(document.createTextNode('B'));
      row.appendChild(labelB);

      var deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'snapshot-delete-btn';
      deleteBtn.dataset.id = snap.id;
      row.appendChild(deleteBtn);

      list.appendChild(row);
    });

    renderComparison(state);
  }

  function renderComparison(state) {
    var out = document.getElementById('snapshot-comparison');
    out.innerHTML = '';
    var a = state.project.snapshots.find(function (s) { return s.id === state.snapshotCompareA; });
    var b = state.project.snapshots.find(function (s) { return s.id === state.snapshotCompareB; });
    if (!a || !b) {
      out.textContent = 'Select A and B above to compare.';
      return;
    }
    var diff = PP.compareSnapshots(a, b);

    var summary = document.createElement('div');
    summary.textContent = 'Actual change: ' + Math.round(diff.overallDelta.actualPct * 100) +
      'pp, Plan change: ' + Math.round(diff.overallDelta.plannedPct * 100) + 'pp';
    out.appendChild(summary);

    var added = document.createElement('div');
    added.textContent = 'Added tasks: ' + diff.added.length;
    out.appendChild(added);

    var removed = document.createElement('div');
    removed.textContent = 'Removed tasks: ' + diff.removed.length;
    out.appendChild(removed);

    var slippedTitle = document.createElement('div');
    slippedTitle.textContent = 'Slipped tasks: ' + diff.slipped.length;
    out.appendChild(slippedTitle);
    if (diff.slipped.length) {
      var ul = document.createElement('ul');
      diff.slipped.forEach(function (s) {
        var li = document.createElement('li');
        var task = b.tasks.find(function (t) { return t.id === s.id; });
        li.textContent = (task ? task.name : s.id) + ': ' + s.from + ' -> ' + s.to;
        ul.appendChild(li);
      });
      out.appendChild(ul);
    }
  }

  function wireSnapshots(state, onChanged) {
    document.getElementById('take-snapshot-button').addEventListener('click', function () {
      var noteInput = document.getElementById('snapshot-note-input');
      PP.takeSnapshot(state.project, state.calc, noteInput.value, state.currentUser);
      noteInput.value = '';
      onChanged();
    });

    var list = document.getElementById('snapshots-list');
    list.addEventListener('click', function (e) {
      var deleteBtn = e.target.closest('.snapshot-delete-btn');
      if (!deleteBtn) return;
      var id = deleteBtn.dataset.id;
      state.project.snapshots = state.project.snapshots.filter(function (s) { return s.id !== id; });
      if (state.snapshotCompareA === id) state.snapshotCompareA = null;
      if (state.snapshotCompareB === id) state.snapshotCompareB = null;
      onChanged();
    });

    list.addEventListener('change', function (e) {
      if (e.target.classList.contains('snapshot-select-a')) {
        state.snapshotCompareA = e.target.value;
        renderComparison(state);
      } else if (e.target.classList.contains('snapshot-select-b')) {
        state.snapshotCompareB = e.target.value;
        renderComparison(state);
      }
    });
  }

  window.PP = window.PP || {};
  window.PP.renderSnapshots = renderSnapshots;
  window.PP.wireSnapshots = wireSnapshots;
})();
```

Note the delete handler also clears `state.snapshotCompareA`/`B` if the deleted snapshot was selected — otherwise a stale id would linger in `state` pointing at a snapshot that no longer exists, and `renderComparison` would silently show "Select A and B" forever without the corresponding radio ever being uncheckable (since the deleted row is gone).

- [ ] **Step 2: Wire it into `app.js`**

Change `refresh` (again) from:
```js
    PP.renderDashboard(state);
    if (markDirty) {
```
to:
```js
    PP.renderDashboard(state);
    PP.renderSnapshots(state);
    if (markDirty) {
```

In `showApp(state)`, change:
```js
    PP.wireGantt(state, function () { refresh(state, true); });
    PP.wireScurve(state, function () { PP.renderScurve(state); });
```
to:
```js
    PP.wireGantt(state, function () { refresh(state, true); });
    PP.wireScurve(state, function () { PP.renderScurve(state); });
    PP.wireSnapshots(state, function () { refresh(state, true); });
```

In `boot()`, change the `state` object literal (again) from:
```js
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
      scurveOverlaySnapshotId: null,
    };
```
to:
```js
      filters: { search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false },
      scurveOverlaySnapshotId: null,
      snapshotCompareA: null,
      snapshotCompareB: null,
    };
```

- [ ] **Step 3: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/snapshots.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderSnapshots" dist/ProjectPlanner.html
node --test
```
Expected: both syntax checks clean; build succeeds; grep prints `1`; all 92 tests pass (no new Node tests — verified in Task 4).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/js/ui/snapshots.js src/js/ui/app.js
git commit -m "Add Snapshots view: take/delete, A/B comparison with persisted selection"
```

---

### Task 4: End-to-end browser verification (controller-run, not a fresh subagent)

Same pattern as the last two plans' final tasks: the controller drives a real browser via the Playwright tools already in this session, since SVG rendering and multi-view state persistence cannot be verified any other way without violating the zero-dependency constraint.

**Files:** none (verification only).

- [ ] **Step 1: Build and seed**

Run `cd "project-planner" && python3 build.py`. The default seed is blank (`tasks: []`), which won't exercise the S-Curve/Dashboard meaningfully. Temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, never `src/`) to include at least: a phase with 3-4 leaf children spanning a range of `plannedStart`/`plannedFinish`/`actualPct` (some complete, at least one delayed, varied PIC assignments), and one milestone. Serve via `cd dist && python3 -m http.server <port>` (`file://` is blocked by this session's Playwright sandbox) and navigate to it.

- [ ] **Step 2: Verify S-Curve**

Complete the name-picker flow, click the "S-Curve" tab, confirm: an SVG line chart renders with two curves (planned, actual); hovering a data point shows the tooltip with date/plan%/actual% text; the "Overlay snapshot" dropdown shows "None" only (no snapshots taken yet).

- [ ] **Step 3: Verify Dashboard**

Click the "Dashboard" tab, confirm: the status donut renders with colored arc segments (not a single blank circle) given the mixed-status seed data; "Progress by Phase" shows one bar row per top-level task with distinguishable plan/actual bar widths; "Workload by PIC" shows one row per PIC with a proportional bar; "Upcoming Milestones" lists the seeded milestone if its date falls within 14 days of the status date (adjust the seed's milestone date or the status date so at least one test case falls inside the window, to confirm the list isn't just always empty); "Top Delayed Tasks" table lists the seeded delayed task(s) with correct PIC/date/%/remarks values.

- [ ] **Step 4: Verify Snapshots — take, list, and that KPIs/scurve are captured**

Click the "Snapshots" tab, type a note, click "Take Snapshot", confirm: a new row appears in the list showing today's date, the current user's name, the note, and the current Actual%; switch to the S-Curve tab and confirm the "Overlay snapshot" dropdown now offers this snapshot; select it and confirm a third dashed curve renders (it will be identical to the live actual curve at this point since nothing changed since the snapshot, but confirm it renders without error).

- [ ] **Step 5: Verify Snapshots — edit, take a second snapshot, and compare**

Go to the Plan tab, edit a delayed task's `% Actual` to a higher value (e.g. from 30% to 60%), confirm the KPI header updates; go back to Snapshots, take a second snapshot; select the first snapshot as "A" and the second as "B"; confirm the comparison panel shows a positive "Actual change" percentage-point delta reflecting the edit, `Added tasks: 0`, `Removed tasks: 0`, and `Slipped tasks: 0` (no dates were changed, only a progress percentage).

- [ ] **Step 6: Verify the A/B selection survives an unrelated re-render**

While still on the Snapshots tab with A and B selected, switch to the Plan tab and toggle a task's collapse arrow (an unrelated, full-`refresh()`-triggering action), then switch back to Snapshots. Confirm the A/B radio selections are still checked and the comparison panel still shows the same diff — not reset to "Select A and B above to compare." This is the specific bug this plan's architecture note was written to avoid; confirm it actually doesn't regress.

- [ ] **Step 7: Verify snapshot deletion**

Delete one of the two snapshots via its row's Delete button. Confirm: the row disappears from the list; the S-Curve tab's overlay dropdown no longer offers it (and if it was the selected overlay, the overlay curve disappears without a console error); if it was selected as A or B in the comparison, the comparison panel reverts to "Select A and B above to compare" rather than referencing a now-nonexistent snapshot.

- [ ] **Step 8: Check console errors and Node suite**

Confirm no uncaught JS errors were logged to the browser console during any of the above (check via the browser tools' console-message capability, across the whole session). Then run `cd "project-planner" && node --test` one more time and confirm all 92 tests still pass.

- [ ] **Step 9: Record the result**

If every check in Steps 2–8 passes, this plan is complete — no commit needed for this task (verification only). If any check fails, that is a real bug in Task 1, 2, or 3's code: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: ProjectPlanner has five working tabs — Plan, Gantt, S-Curve, Dashboard, Snapshots — covering everything in spec §6.4/§6.5/§6.6, all sharing the same `state` object and `renderX`/`wireX` conventions established across the last three plans. The next plan (Reports & polish: report panels, clipboard copy, print CSS, themes, Settings, Holidays management page, audit log viewer, blank-project starter flow, cross-browser pass) is the final build phase per the spec's §11 build order.

**Known deferred scope:** the S-Curve's snapshot overlay only ever shows the *actual* curve from the past snapshot (not its planned curve) — sufficient for the "how has actual progress changed week over week" narrative the spec calls for, but a planned-vs-planned overlay (e.g. to see if the baseline itself moved) is deferred to the Reports & polish phase if wanted. Dashboard's phase/PIC bars use task *counts*, not weighted duration, for the PIC workload metric — a reasonable first cut per YAGNI, revisit only if real usage shows it's misleading.
