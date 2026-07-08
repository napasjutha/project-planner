# Visual Redesign (Ive-Style Refinement) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a coherent, restrained Ive-style visual language (design tokens, refined typography, subtle depth, consistent radius/spacing/motion) across every view of ProjectPlanner, in both light and dark themes, with zero behavior change.

**Architecture:** A foundational token pass in `theme.css` (Task 1) that every later task builds on, followed by component-group passes across `layout.css` (Tasks 2-3, 5-7) and the three UI files that draw hardcoded hex colors directly into inline SVG attributes rather than through CSS (`gantt.js`, `scurve.js`, `dashboard.js` — Tasks 4-5), converting those to `var(--token)` references. This incidentally fixes a real pre-existing bug: those three files' hardcoded hex values never adapted to the dark-mode toggle, so Gantt, S-Curve, and the Dashboard donut have always rendered with light-theme colors even when dark mode is active — converting them to tokens fixes this for free while doing the palette refresh anyway. Final task is controller-run visual verification across all 8 views in both themes.

**Tech Stack:** Same as the rest of the project — hand-written CSS, CSS custom properties, `node:test`. No new dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev.
- No code comments except where genuinely non-obvious.
- Zero behavior change — every click target, keyboard interaction, and data flow stays exactly as it is today. This is a visual/CSS pass, not a feature change.
- No new HTML structure beyond what a listed treatment literally requires (none do, per the spec).
- The existing 108 Node tests are unaffected by this entire plan (no engine/UI-logic files change) — every task must confirm `node --test` still shows 108/108 passing.
- `print.css` is untouched — separate print-media concern, orthogonal to this pass.
- `--kpmg-blue` (`#00338D`), `--kpmg-blue-mid` (`#005EB8`), `--kpmg-blue-light` (`#0091DA`) are unchanged — the one accent color family, kept exactly as-is throughout.
- The Reports panel (`#report-panel` and its descendants in `layout.css`) stays hardcoded hex, not CSS vars — Copy-as-Image must render identically regardless of the live theme toggle. Only the literal hex *values* are refreshed to match the new palette; the hardcoded-not-var architecture is unchanged.
- Two radii only: `--radius-sm: 6px` (buttons, inputs, small tags/pills) and `--radius-lg: 12px` (cards, panels, overlays, context menu) — replacing today's inconsistent 3/4/6/8px mix everywhere they appear.
- Two shadow tokens: `--shadow-sm` (cards/tiles/buttons at rest) and `--shadow-md` (floating elements — context menu, overlay card). In dark mode, `--shadow-sm` becomes `none` (shadows don't read on dark backgrounds) and card-tier components additionally gain `border: 1px solid var(--border)` in dark mode to keep visual separation from the page background; `--shadow-md` becomes darker/higher-opacity instead of disappearing, since floating elements still need to read as elevated above dark content.
- Status colors are harmonized but stay functionally vivid (legibility for scanning > restraint): `--status-not-start`/`--status-cancelled` → `#98989d`, `--status-delayed`/`--status-blocked` → `#ff3b30`, `--status-complete` → `#34c759`, `--status-in-progress` unchanged (`#0091DA`).
- `--text-muted` is renamed to `--text-secondary` (`#6e6e73` light / `#98989d` dark) — every one of its 8 existing usages across `layout.css` is updated to `var(--text-secondary)` as part of whichever task below already touches that selector (no separate rename task, no backward-compat alias kept — by Task 8's final verification, zero `--text-muted` references remain anywhere).
- Opacity-tint backgrounds (status pills, holiday pill) are locked at 12% opacity in light mode; if Task 8's live dark-mode check finds insufficient contrast, raise to ~20% opacity in `[data-theme="dark"]` only for that specific rule — this is the one adjustment intentionally deferred to live verification rather than locked here.

---

### Task 1: `theme.css` — token foundation

**Files:**
- Modify: `project-planner/src/css/theme.css`

**Interfaces:**
- Consumes: nothing (this is the foundation).
- Produces: every CSS custom property later tasks reference — `--surface-alt` (refined value), `--surface-sunken` (new), `--border` (refined value), `--border-strong` (new), `--text` (refined value), `--text-secondary` (new, replaces `--text-muted`), `--text-tertiary` (new), `--focus-ring` (new), `--status-not-start`/`--status-delayed`/`--status-complete`/`--status-blocked`/`--status-cancelled` (refined values), `--shadow-sm`/`--shadow-md` (new), `--radius-sm`/`--radius-lg` (new). All defined in both `:root` (light) and `[data-theme="dark"]`, exactly as below — later tasks only ever consume these by name, never redefine them.

- [ ] **Step 1: Replace the entire `:root` block**

In `project-planner/src/css/theme.css`, change:
```css
:root {
  --kpmg-blue: #00338D;
  --kpmg-blue-mid: #005EB8;
  --kpmg-blue-light: #0091DA;
  --surface: #ffffff;
  --surface-alt: #f5f6f7;
  --text: #1a1a1a;
  --text-muted: #5b6470;
  --border: #e1e4e8;
  --status-not-start: #9aa5b1;
  --status-in-progress: #0091DA;
  --status-delayed: #d64545;
  --status-complete: #1a8f5e;
  --status-blocked: #d64545;
  --status-cancelled: #9aa5b1;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
}
```
to:
```css
:root {
  --kpmg-blue: #00338D;
  --kpmg-blue-mid: #005EB8;
  --kpmg-blue-light: #0091DA;
  --surface: #ffffff;
  --surface-alt: #f7f7f8;
  --surface-sunken: #f0f1f2;
  --text: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary: #98989d;
  --border: #e5e5ea;
  --border-strong: #d1d1d6;
  --focus-ring: #0091DA;
  --status-not-start: #98989d;
  --status-in-progress: #0091DA;
  --status-delayed: #ff3b30;
  --status-complete: #34c759;
  --status-blocked: #ff3b30;
  --status-cancelled: #98989d;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.12);
  --radius-sm: 6px;
  --radius-lg: 12px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
}
```

- [ ] **Step 2: Replace the `[data-theme="dark"]` block**

Change:
```css
[data-theme="dark"] {
  --surface: #1c1e22;
  --surface-alt: #26292e;
  --text: #e7e9ec;
  --text-muted: #9aa5b1;
  --border: #33373d;
}
```
to:
```css
[data-theme="dark"] {
  --surface: #1c1c1e;
  --surface-alt: #2c2c2e;
  --surface-sunken: #232325;
  --text: #f5f5f7;
  --text-secondary: #98989d;
  --text-tertiary: #6e6e73;
  --border: #38383a;
  --border-strong: #48484a;
  --shadow-sm: none;
  --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
}
```

- [ ] **Step 3: Add the global focus-visible and reduced-motion rules**

At the end of `project-planner/src/css/theme.css` (after the existing `body { ... }` rule), add:
```css

*:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 4: Build and confirm no regressions**

Run:
```bash
cd "project-planner"
python3 build.py
node --test
```
Expected: build succeeds; all 108 tests pass (this task touches no JS/engine files, so the count must be unchanged). No visual check yet — `layout.css` still references the now-removed `--text-muted` and will look broken/unstyled for muted text until Tasks 2-6 land; that's expected and resolved by the end of this plan, not by this task alone.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/css/theme.css
git commit -m "Add Ive-style design token foundation to theme.css"
```

---

### Task 2: Header, KPI row, buttons, tabs (chrome)

**Files:**
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `--surface-alt`, `--surface-sunken`, `--text-secondary`, `--text-tertiary`, `--shadow-sm`, `--shadow-md`, `--radius-sm`, `--radius-lg`, `--kpmg-blue`, `--kpmg-blue-mid` (all from Task 1).
- Produces: nothing new consumed by later tasks — this task's selectors (`#app-header`, `.kpi-card`, buttons, `.view-tab`) are leaves in the dependency graph.

- [ ] **Step 1: Refine the header, KPI cards, and their buttons**

Change:
```css
#app-header { border-bottom: 1px solid var(--border); padding: 12px 20px; }

#header-top { display: flex; align-items: center; gap: 16px; }

#project-name { font-weight: 600; font-size: 16px; color: var(--kpmg-blue); flex: 1; }

#save-button {
  background: var(--kpmg-blue);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 13px;
}
#save-button:hover { background: var(--kpmg-blue-mid); }

#dirty-indicator { color: var(--status-delayed); font-size: 12px; }

#kpi-row { display: flex; gap: 12px; margin-top: 12px; }

.kpi-card { background: var(--surface-alt); border-radius: 6px; padding: 8px 14px; min-width: 90px; }
.kpi-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; }
.kpi-value { font-size: 18px; font-weight: 600; color: var(--text); }
```
to:
```css
#app-header { border-bottom: 1px solid var(--border); padding: 16px 24px; }

#header-top { display: flex; align-items: center; gap: 16px; }

#project-name { font-weight: 600; font-size: 18px; letter-spacing: -0.01em; color: var(--kpmg-blue); flex: 1; }

#save-button {
  background: var(--kpmg-blue);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  cursor: pointer;
  font-size: 13px;
  box-shadow: var(--shadow-sm);
  transition: background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
#save-button:hover { background: var(--kpmg-blue-mid); box-shadow: var(--shadow-md); }
#save-button:active { transform: scale(0.98); }

#dirty-indicator { color: var(--status-delayed); font-size: 12px; }

#kpi-row { display: flex; gap: 12px; margin-top: 16px; }

.kpi-card { background: var(--surface-alt); border-radius: var(--radius-lg); padding: 12px 20px; min-width: 96px; box-shadow: var(--shadow-sm); }
[data-theme="dark"] .kpi-card { box-shadow: none; border: 1px solid var(--border); }
.kpi-label { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .04em; }
.kpi-value { font-size: 28px; font-weight: 500; color: var(--text); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 2: Refine `#add-task-button` and toolbar inputs (secondary-button treatment)**

Change:
```css
#toolbar { display: flex; gap: 10px; padding: 8px 20px; border-bottom: 1px solid var(--border); align-items: center; }
#toolbar input[type="text"], #toolbar select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; }

#add-task-button {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
}
#add-task-button:hover { background: var(--border); }
```
to:
```css
#toolbar { display: flex; gap: 10px; padding: 12px 24px; border-bottom: 1px solid var(--border); align-items: center; }
#toolbar input[type="text"], #toolbar select { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; transition: border-color 150ms ease; }

#add-task-button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 150ms ease;
}
#add-task-button:hover { background: var(--surface-sunken); }
```

- [ ] **Step 3: Refine view tabs**

Change:
```css
#view-tabs { display: flex; gap: 4px; padding: 6px 20px; border-bottom: 1px solid var(--border); }
.view-tab {
  background: none; border: none; padding: 6px 14px; font-size: 13px; cursor: pointer;
  color: var(--text-muted); border-bottom: 2px solid transparent;
}
.view-tab.active { color: var(--kpmg-blue); border-bottom-color: var(--kpmg-blue); font-weight: 600; }
```
to:
```css
#view-tabs { display: flex; gap: 4px; padding: 8px 24px; border-bottom: 1px solid var(--border); }
.view-tab {
  background: none; border: none; padding: 8px 16px; font-size: 13px; cursor: pointer;
  color: var(--text-secondary); border-bottom: 2px solid transparent;
  transition: color 150ms ease, border-color 200ms ease;
}
.view-tab.active { color: var(--kpmg-blue); border-bottom-color: var(--kpmg-blue); font-weight: 600; }
```

- [ ] **Step 4: Build and confirm no regressions**

Run:
```bash
cd "project-planner"
python3 build.py
node --test
```
Expected: build succeeds; 108/108 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/css/layout.css
git commit -m "Refine header, KPI cards, buttons, and tabs with Ive-style tokens"
```

---

### Task 3: Plan tree

**Files:**
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `--border`, `--surface`, `--surface-sunken`, `--text-tertiary`, `--status-*` tokens (from Task 1). Consumes the existing `.tree-row.is-parent` class and 17-column `grid-template-columns` order (WBS, Task, PIC, P-Start, P-Finish, A-Start, A-Finish, Duration, Weight, %Plan, %Actual, Status, Updated By, Updated At, Remarks, Billing Amt, Billing Status) already shipped by the Data Quality & Display plan — this task only restyles, it does not change column count or order.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Refine row height, dividers, hover, and parent-row accent**

Change:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px;
  min-width: 1695px;
  align-items: center;
  padding: 6px 20px;
  gap: 8px;
  font-size: 13px;
}
#tree-header { font-size: 11px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.tree-row { border-bottom: 1px solid var(--border); }
.tree-row:hover { background: var(--surface-alt); }
.tree-row.is-parent { font-weight: 600; background: var(--surface-alt); }
.tree-row.is-parent:hover { background: var(--border); }

.toggle { cursor: pointer; display: inline-block; width: 14px; color: var(--text-muted); }
```
to:
```css
#tree-header, .tree-row {
  display: grid;
  grid-template-columns: 40px 220px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 100px 110px;
  min-width: 1695px;
  align-items: center;
  padding: 8px 20px;
  gap: 8px;
  font-size: 13px;
}
#tree-header { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-strong); }
.tree-row { border-bottom: 1px solid var(--border); transition: background 150ms ease; }
.tree-row:hover { background: var(--surface-sunken); }
.tree-row.is-parent { font-weight: 600; background: var(--surface-sunken); border-left: 3px solid var(--kpmg-blue-light); }
.tree-row.is-parent:hover { background: var(--border); }

.toggle { cursor: pointer; display: inline-block; width: 14px; color: var(--text-secondary); }
```

- [ ] **Step 2: Right-align numeric/date columns and add sticky WBS/Task columns**

Add these new rules directly after the `.toggle { ... }` rule (before `.cell { ... }`):
```css
.col-start, .col-finish, .col-astart, .col-afinish,
.col-duration, .col-weight, .col-plan, .col-actual, .col-billing-amount {
  text-align: right;
}

.col-wbs {
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 1;
}
.tree-row.is-parent .col-wbs { background: var(--surface-sunken); }

.col-name {
  position: sticky;
  left: 40px;
  background: var(--surface);
  z-index: 1;
}
.tree-row.is-parent .col-name { background: var(--surface-sunken); }
```
(The `.cell` spans for editable text/date fields — `.col-start`, `.col-finish`, `.col-astart`, `.col-afinish` — already carry the `.cell` class from `tree.js`'s `dateCell` helper on leaf rows; adding `text-align: right` to their class selectors here applies regardless of whether the `.cell` class is also present, since both selectors target the same element. `.col-billing-amount` similarly is either a plain span or a `.cell` span depending on `task.milestone`, per `tree.js` — right-alignment applies either way.)

- [ ] **Step 3: Refine status pills**

Change:
```css
.status-NotStart { color: var(--status-not-start); }
.status-InProgress { color: var(--status-in-progress); }
.status-Delayed { color: var(--status-delayed); font-weight: 600; }
.status-Complete { color: var(--status-complete); }
.status-Blocked { color: var(--status-blocked); font-weight: 600; }
.status-Cancelled { color: var(--status-cancelled); text-decoration: line-through; }
```
to:
```css
[class^="status-"] {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.status-NotStart { color: var(--status-not-start); background: rgba(152,152,157,0.12); }
.status-InProgress { color: var(--status-in-progress); background: rgba(0,145,218,0.12); }
.status-Delayed { color: var(--status-delayed); background: rgba(255,59,48,0.12); }
.status-Complete { color: var(--status-complete); background: rgba(52,199,89,0.12); }
.status-Blocked { color: var(--status-blocked); background: rgba(255,59,48,0.12); }
.status-Cancelled { color: var(--status-cancelled); background: rgba(152,152,157,0.12); text-decoration: line-through; }

[data-theme="dark"] .status-NotStart, [data-theme="dark"] .status-Cancelled { background: rgba(152,152,157,0.2); }
[data-theme="dark"] .status-InProgress { background: rgba(0,145,218,0.2); }
[data-theme="dark"] .status-Delayed, [data-theme="dark"] .status-Blocked { background: rgba(255,59,48,0.2); }
[data-theme="dark"] .status-Complete { background: rgba(52,199,89,0.2); }
```
(`[class^="status-"]` matches every element whose `class` attribute *starts with* `status-` — every status span in `tree.js` is rendered as `class="col-status status-' + computed.status.replace(...)"`, i.e. `status-` is the *second* class token, not a prefix of the full attribute. Confirm this selector actually matches by checking the rendered markup in Step 4 below; if it does not match because `status-*` isn't the leading class, replace `[class^="status-"]` with the six individual selectors' shared declaration block instead — i.e. `.status-NotStart, .status-InProgress, .status-Delayed, .status-Complete, .status-Blocked, .status-Cancelled { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }` — before proceeding.)

- [ ] **Step 4: Build, verify the status-pill selector actually matches, and confirm no regressions**

Run:
```bash
cd "project-planner"
python3 build.py
grep -o 'class="col-status status-[A-Za-z]*"' dist/ProjectPlanner.html | head -1
```
Expected output shows the full class attribute, e.g. `class="col-status status-NotStart"` — confirming `status-` is NOT the first class token (`col-status` is). This means `[class^="status-"]` from Step 3 will **not** match. Replace it now: change
```css
[class^="status-"] {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
```
to:
```css
.status-NotStart, .status-InProgress, .status-Delayed, .status-Complete, .status-Blocked, .status-Cancelled {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
```
Then run:
```bash
python3 build.py
node --test
```
Expected: build succeeds; 108/108 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/css/layout.css
git commit -m "Refine Plan tree: hairline rows, parent accent, status pills, sticky/right-aligned columns"
```

---

### Task 4: Gantt and S-Curve chart color tokens

**Files:**
- Modify: `project-planner/src/js/ui/gantt.js`
- Modify: `project-planner/src/js/ui/scurve.js`
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `--surface-alt`, `--surface-sunken`, `--border`, `--text-secondary`, `--text-tertiary`, `--kpmg-blue-light` (from Task 1). Consumes the existing `svgEl(tag, attrs)` helper already defined in both `gantt.js` and `scurve.js` — unchanged, only the `attrs` values passed to it change.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Convert `gantt.js`'s hardcoded hex to CSS var references**

In `src/js/ui/gantt.js`, change the weekend/holiday shading (this also fixes a real bug: these were hardcoded light-theme colors that never adapted to dark mode):
```js
      if (dow === 0 || dow === 6 || isHoliday) {
        svg.appendChild(svgEl('rect', {
          x: d * pxPerDay, y: 0, width: pxPerDay, height: height,
          fill: isHoliday ? '#e8f2fb' : '#f5f6f7',
        }));
      }
```
to:
```js
      if (dow === 0 || dow === 6 || isHoliday) {
        svg.appendChild(svgEl('rect', {
          x: d * pxPerDay, y: 0, width: pxPerDay, height: height,
          fill: isHoliday ? 'var(--kpmg-blue-light)' : 'var(--surface-alt)',
          'fill-opacity': isHoliday ? 0.12 : 1,
        }));
      }
```
Change the month-label text and separator line:
```js
        var label = svgEl('text', { x: d * pxPerDay + 4, y: 14, 'font-size': 11, fill: '#5b6470' });
```
to:
```js
        var label = svgEl('text', { x: d * pxPerDay + 4, y: 14, 'font-size': 11, fill: 'var(--text-secondary)' });
```
```js
        svg.appendChild(svgEl('line', {
          x1: d * pxPerDay, y1: 0, x2: d * pxPerDay, y2: height,
          stroke: '#e1e4e8', 'stroke-width': 1,
        }));
```
to:
```js
        svg.appendChild(svgEl('line', {
          x1: d * pxPerDay, y1: 0, x2: d * pxPerDay, y2: height,
          stroke: 'var(--border)', 'stroke-width': 1,
        }));
```
Change the bar background track and radius (`rx: 3` → `rx: 4` per the spec's "bars get border-radius: 4px"):
```js
      svg.appendChild(svgEl('rect', {
        x: x1, y: y, width: barWidth, height: BAR_HEIGHT, rx: 3,
        fill: '#dce6f5', stroke: 'var(--kpmg-blue)', 'stroke-width': 1,
        'data-id': id, class: 'gantt-bar',
      }));

      var fillWidth = barWidth * Math.max(0, Math.min(1, computed.actualPct));
      if (fillWidth > 0) {
        svg.appendChild(svgEl('rect', {
          x: x1, y: y, width: fillWidth, height: BAR_HEIGHT, rx: 3,
          fill: computed.status === 'Delayed' ? 'var(--status-delayed)' : 'var(--status-complete)',
          style: 'pointer-events:none',
        }));
      }
```
to:
```js
      svg.appendChild(svgEl('rect', {
        x: x1, y: y, width: barWidth, height: BAR_HEIGHT, rx: 4,
        fill: 'var(--surface-sunken)', stroke: 'var(--kpmg-blue)', 'stroke-width': 1,
        'data-id': id, class: 'gantt-bar',
      }));

      var fillWidth = barWidth * Math.max(0, Math.min(1, computed.actualPct));
      if (fillWidth > 0) {
        svg.appendChild(svgEl('rect', {
          x: x1, y: y, width: fillWidth, height: BAR_HEIGHT, rx: 4,
          fill: computed.status === 'Delayed' ? 'var(--status-delayed)' : 'var(--status-complete)',
          style: 'pointer-events:none',
        }));
      }
```
Change the dependency-arrow line and arrowhead:
```js
        svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 1 }));
        svg.appendChild(svgEl('polygon', {
          points: [thisX, thisY, thisX - 6, thisY - 3, thisX - 6, thisY + 3].join(','),
          fill: '#9aa5b1',
        }));
```
to:
```js
        svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: 'var(--text-tertiary)', 'stroke-width': 1 }));
        svg.appendChild(svgEl('polygon', {
          points: [thisX, thisY, thisX - 6, thisY - 3, thisX - 6, thisY + 3].join(','),
          fill: 'var(--text-tertiary)',
        }));
```

- [ ] **Step 2: Convert `scurve.js`'s hardcoded hex to CSS var references**

In `src/js/ui/scurve.js`, change the grid line and percentage label:
```js
      svg.appendChild(svgEl('line', { x1: padding, y1: gy, x2: width - padding, y2: gy, stroke: '#e1e4e8', 'stroke-width': 1 }));
      var label = svgEl('text', { x: 4, y: gy + 4, 'font-size': 10, fill: '#5b6470' });
```
to:
```js
      svg.appendChild(svgEl('line', { x1: padding, y1: gy, x2: width - padding, y2: gy, stroke: 'var(--border)', 'stroke-width': 1 }));
      var label = svgEl('text', { x: 4, y: gy + 4, 'font-size': 10, fill: 'var(--text-secondary)' });
```
Change the snapshot-overlay dashed line:
```js
        svg.appendChild(svgEl('path', { d: overlayPath, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
```
to:
```js
        svg.appendChild(svgEl('path', { d: overlayPath, fill: 'none', stroke: 'var(--text-tertiary)', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
```

- [ ] **Step 3: Refine the Gantt zoom toolbar buttons in `layout.css`**

Change:
```css
#gantt-toolbar { display: flex; gap: 4px; padding: 6px 20px; border-bottom: 1px solid var(--border); }
.gantt-zoom-btn {
  background: var(--surface-alt); border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--text-muted);
}
.gantt-zoom-btn.active { background: var(--kpmg-blue); border-color: var(--kpmg-blue); color: #fff; }
```
to:
```css
#gantt-toolbar { display: flex; gap: 4px; padding: 8px 24px; border-bottom: 1px solid var(--border); }
.gantt-zoom-btn {
  background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 6px 14px; font-size: 12px; cursor: pointer; color: var(--text-secondary);
  transition: background 150ms ease, color 150ms ease;
}
.gantt-zoom-btn:hover { background: var(--surface-sunken); }
.gantt-zoom-btn.active { background: var(--kpmg-blue); border-color: var(--kpmg-blue); color: #fff; box-shadow: var(--shadow-sm); }
```

- [ ] **Step 4: Build and confirm no regressions**

Run:
```bash
cd "project-planner"
node --check src/js/ui/gantt.js
node --check src/js/ui/scurve.js
python3 build.py
node --test
```
Expected: syntax clean on both files; build succeeds; 108/108 tests pass (this task's JS changes are pure DOM/SVG rendering, no Node-testable surface — verified live in Task 8).

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/ui/gantt.js src/js/ui/scurve.js src/css/layout.css
git commit -m "Convert Gantt/S-Curve hardcoded chart colors to design tokens (fixes dark-mode chart colors as a side effect)"
```

---

### Task 5: Dashboard

**Files:**
- Modify: `project-planner/src/js/ui/dashboard.js`
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `--surface-sunken`, `--text-secondary`, `--shadow-sm`, `--radius-sm`, `--radius-lg`, `--kpmg-blue`, `--kpmg-blue-light`, `--status-*` tokens (from Task 1).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Convert `STATUS_COLORS` to CSS var references**

In `src/js/ui/dashboard.js`, change:
```js
  var STATUS_COLORS = {
    'Not Start': '#9aa5b1', 'In Progress': '#0091DA', 'Delayed': '#d64545',
    'Complete': '#1a8f5e', 'Blocked': '#d64545', 'Cancelled': '#9aa5b1',
  };
```
to:
```js
  var STATUS_COLORS = {
    'Not Start': 'var(--status-not-start)', 'In Progress': 'var(--status-in-progress)', 'Delayed': 'var(--status-delayed)',
    'Complete': 'var(--status-complete)', 'Blocked': 'var(--status-blocked)', 'Cancelled': 'var(--status-cancelled)',
  };
```
(This is a real bug fix, not just a palette refresh: the donut previously rendered hardcoded light-theme colors regardless of the dark-mode toggle.)

- [ ] **Step 2: Refine `.dashboard-section` cards and bars in `layout.css`**

Change:
```css
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
```
to:
```css
.dashboard-section { background: var(--surface-alt); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow-sm); }
[data-theme="dark"] .dashboard-section { box-shadow: none; border: 1px solid var(--border); }
.dashboard-section h3 { margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.04em; color: var(--text-secondary); text-transform: uppercase; }
.dashboard-section-wide { grid-column: 1 / -1; }
#dashboard-body { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.dashboard-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.dashboard-bar-label { width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-bar-wrap { flex: 1; height: 14px; background: var(--surface-sunken); border-radius: var(--radius-sm); position: relative; overflow: hidden; }
.dashboard-bar { position: absolute; top: 0; left: 0; height: 100%; border-radius: var(--radius-sm); }
.dashboard-bar.plan { background: var(--kpmg-blue-light); opacity: 0.35; }
.dashboard-bar.actual { background: var(--kpmg-blue); }
.dashboard-bar.pic { background: var(--kpmg-blue); }

.dashboard-list { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.dashboard-list li { padding: 6px 0; border-bottom: 1px solid var(--border); }

.dashboard-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dashboard-table th, .dashboard-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
```

- [ ] **Step 3: Build and confirm no regressions**

Run:
```bash
cd "project-planner"
node --check src/js/ui/dashboard.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 108/108 tests pass.

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/js/ui/dashboard.js src/css/layout.css
git commit -m "Refine Dashboard cards and bars; fix donut chart colors to respect dark mode"
```

---

### Task 6: Snapshots, Settings, Holidays

**Files:**
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `--surface-alt`, `--surface-sunken`, `--border`, `--text-secondary`, `--shadow-sm`, `--radius-sm`, `--radius-lg`, `--kpmg-blue`, `--status-delayed` (from Task 1).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Refine Snapshots toolbar and rows**

Change:
```css
#scurve-toolbar, #snapshots-toolbar { display: flex; gap: 10px; align-items: center; padding-bottom: 10px; }
#snapshots-toolbar input[type="text"] { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; flex: 1; max-width: 300px; }
#take-snapshot-button {
  background: var(--kpmg-blue); color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; cursor: pointer; font-size: 13px;
}
```
to:
```css
#scurve-toolbar, #snapshots-toolbar { display: flex; gap: 10px; align-items: center; padding-bottom: 16px; }
#snapshots-toolbar input[type="text"] { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; flex: 1; max-width: 300px; }
#take-snapshot-button {
  background: var(--kpmg-blue); color: #fff; border: none; border-radius: var(--radius-sm);
  padding: 8px 18px; cursor: pointer; font-size: 13px; box-shadow: var(--shadow-sm);
  transition: background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
#take-snapshot-button:hover { background: var(--kpmg-blue-mid); box-shadow: var(--shadow-md); }
#take-snapshot-button:active { transform: scale(0.98); }
```

- [ ] **Step 2: Refine snapshot rows and delete buttons (quiet-button treatment)**

Change:
```css
.snapshot-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.snapshot-delete-btn {
  background: none; border: 1px solid var(--border); border-radius: 4px;
  padding: 2px 10px; font-size: 12px; cursor: pointer; color: var(--status-delayed);
}
#snapshot-comparison { margin-top: 14px; font-size: 13px; }
#snapshot-comparison ul { margin: 4px 0; padding-left: 20px; }
```
to:
```css
.snapshot-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.snapshot-delete-btn {
  background: none; border: 1px solid transparent; border-radius: var(--radius-sm);
  padding: 2px 10px; font-size: 12px; cursor: pointer; color: var(--status-delayed);
  transition: background 150ms ease, border-color 150ms ease;
}
.snapshot-delete-btn:hover { background: var(--surface-sunken); border-color: var(--border); }
#snapshot-comparison { margin-top: 16px; font-size: 13px; }
#snapshot-comparison ul { margin: 4px 0; padding-left: 20px; }
```

- [ ] **Step 3: Refine Settings sections, buttons, and PIC editor**

Change:
```css
#settings-view { flex: 1; overflow: auto; padding: 12px 20px; }
.settings-section { background: var(--surface-alt); border-radius: 8px; padding: 14px; margin-bottom: 12px; max-width: 500px; }
.settings-section-wide { max-width: none; }
.settings-section h3 { margin: 0 0 10px 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; }
.settings-section input[type="text"] { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; }
.theme-btn, #new-project-button, #add-pic-button {
  background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
  padding: 5px 12px; font-size: 13px; cursor: pointer; margin-right: 6px;
}
.theme-btn.active { background: var(--kpmg-blue); color: #fff; border-color: var(--kpmg-blue); }
.pic-editor-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.pic-remove-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); }
```
to:
```css
#settings-view { flex: 1; overflow: auto; padding: 16px 24px; }
.settings-section { background: var(--surface-alt); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 16px; max-width: 500px; box-shadow: var(--shadow-sm); }
[data-theme="dark"] .settings-section { box-shadow: none; border: 1px solid var(--border); }
.settings-section-wide { max-width: none; }
.settings-section h3 { margin: 0 0 12px 0; font-size: 11px; letter-spacing: 0.04em; color: var(--text-secondary); text-transform: uppercase; }
.settings-section input[type="text"] { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; }
.theme-btn, #new-project-button, #add-pic-button {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 7px 14px; font-size: 13px; cursor: pointer; margin-right: 6px;
  transition: background 150ms ease;
}
.theme-btn:hover, #new-project-button:hover, #add-pic-button:hover { background: var(--surface-sunken); }
.theme-btn.active { background: var(--kpmg-blue); color: #fff; border-color: var(--kpmg-blue); }
.pic-editor-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.pic-remove-btn { background: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); transition: background 150ms ease, border-color 150ms ease; }
.pic-remove-btn:hover { background: var(--surface-sunken); border-color: var(--border); }
```

- [ ] **Step 4: Refine Holidays view — toolbar, bulk import, year nav, calendar cells**

Change:
```css
#holidays-view { flex: 1; overflow: auto; padding: 12px 20px; }
#holidays-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
#holidays-toolbar input[type="text"], #holidays-toolbar input[type="date"] { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; }
#add-holiday-button { background: var(--kpmg-blue); color: #fff; border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 13px; }
#holiday-impact-banner { font-size: 12px; color: var(--status-delayed); }
#holidays-bulk { display: flex; gap: 8px; margin-bottom: 14px; }
#holidays-bulk-input { flex: 1; font-size: 12px; padding: 6px; border: 1px solid var(--border); border-radius: 4px; }
#holidays-bulk-import-button { background: var(--surface-alt); border: 1px solid var(--border); border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 13px; }
#holidays-year-nav { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; font-size: 13px; }
#holidays-year-nav button { background: var(--surface-alt); border: 1px solid var(--border); border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 12px; }
#holidays-calendar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.holiday-month { background: var(--surface-alt); border-radius: 6px; padding: 8px; }
.holiday-month-title { font-size: 11px; font-weight: 600; margin-bottom: 6px; color: var(--text-muted); }
.holiday-month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.holiday-day { font-size: 10px; text-align: center; padding: 2px 0; border-radius: 2px; }
.holiday-day-weekend { background: var(--border); }
.holiday-day-holiday { background: var(--kpmg-blue); color: #fff; }
.holiday-remove-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); }
```
to:
```css
#holidays-view { flex: 1; overflow: auto; padding: 16px 24px; }
#holidays-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
#holidays-toolbar input[type="text"], #holidays-toolbar input[type="date"] { padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; }
#add-holiday-button { background: var(--kpmg-blue); color: #fff; border: none; border-radius: var(--radius-sm); padding: 7px 14px; cursor: pointer; font-size: 13px; transition: background 150ms ease; }
#add-holiday-button:hover { background: var(--kpmg-blue-mid); }
#holiday-impact-banner { font-size: 12px; color: var(--status-delayed); }
#holidays-bulk { display: flex; gap: 8px; margin-bottom: 20px; }
#holidays-bulk-input { flex: 1; font-size: 12px; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
#holidays-bulk-import-button { background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 14px; cursor: pointer; font-size: 13px; transition: background 150ms ease; }
#holidays-bulk-import-button:hover { background: var(--surface-sunken); }
#holidays-year-nav { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; font-size: 13px; }
#holidays-year-nav button { background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 12px; cursor: pointer; font-size: 12px; transition: background 150ms ease; }
#holidays-year-nav button:hover { background: var(--surface-sunken); }
#holidays-calendar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.holiday-month { background: var(--surface-alt); border-radius: var(--radius-lg); padding: 12px; box-shadow: var(--shadow-sm); }
[data-theme="dark"] .holiday-month { box-shadow: none; border: 1px solid var(--border); }
.holiday-month-title { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; margin-bottom: 8px; color: var(--text-secondary); text-transform: uppercase; }
.holiday-month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.holiday-day { font-size: 10px; text-align: center; padding: 2px 0; border-radius: var(--radius-sm); }
.holiday-day-weekend { background: var(--surface-sunken); }
.holiday-day-holiday { background: rgba(0,51,141,0.12); color: var(--kpmg-blue); font-weight: 600; }
[data-theme="dark"] .holiday-day-holiday { background: rgba(0,145,218,0.2); color: var(--kpmg-blue-light); }
.holiday-remove-btn { background: none; border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; cursor: pointer; color: var(--status-delayed); transition: background 150ms ease, border-color 150ms ease; }
.holiday-remove-btn:hover { background: var(--surface-sunken); border-color: var(--border); }
```
(`.holiday-day-holiday` switches from `--kpmg-blue` to `--kpmg-blue-light` in dark mode for its pill-tint text color, matching the status-pill dark-mode pattern from Task 3 — `--kpmg-blue` at low opacity against the dark surface would have insufficient contrast for text, while `--kpmg-blue-light` is designed to read against dark backgrounds already, per its existing use as the in-progress status color.)

- [ ] **Step 5: Build and confirm no regressions**

Run:
```bash
cd "project-planner"
python3 build.py
node --test
```
Expected: build succeeds; 108/108 tests pass.

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/css/layout.css
git commit -m "Refine Snapshots, Settings, and Holidays with card treatment and quiet delete buttons"
```

---

### Task 7: Reports panel and overlays/context menu

**Files:**
- Modify: `project-planner/src/css/layout.css`

**Interfaces:**
- Consumes: `--radius-lg`, `--shadow-md` (from Task 1). The Reports panel section intentionally does NOT consume CSS vars for its own hardcoded colors (see Global Constraints) — only the literal hex values are refreshed.
- Produces: nothing new consumed by later tasks (this is the last CSS-only task before final verification).

- [ ] **Step 1: Refine overlay card and context menu**

Change:
```css
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.overlay-card { background: var(--surface); padding: 24px; border-radius: 8px; min-width: 280px; }
.overlay-card h2 { margin-top: 0; font-size: 16px; }
.overlay-card input { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 4px; }
.overlay-card button { background: var(--kpmg-blue); color: #fff; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer; }

.context-menu {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 140px;
  z-index: 1000;
  padding: 4px 0;
}
.context-menu-item { padding: 6px 14px; font-size: 13px; cursor: pointer; }
.context-menu-item:hover { background: var(--surface-alt); }
```
to:
```css
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.overlay-card { background: var(--surface); padding: 24px; border-radius: var(--radius-lg); min-width: 280px; box-shadow: var(--shadow-md); }
[data-theme="dark"] .overlay-card { border: 1px solid var(--border); }
.overlay-card h2 { margin-top: 0; font-size: 16px; }
.overlay-card input { width: 100%; padding: 8px 10px; margin-bottom: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.overlay-card button { background: var(--kpmg-blue); color: #fff; border: none; border-radius: var(--radius-sm); padding: 8px 16px; cursor: pointer; transition: background 150ms ease; }
.overlay-card button:hover { background: var(--kpmg-blue-mid); }

.context-menu {
  position: fixed;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  min-width: 140px;
  z-index: 1000;
  padding: 8px 0;
}
[data-theme="dark"] .context-menu { border: 1px solid var(--border); }
.context-menu-item { padding: 6px 14px; font-size: 13px; cursor: pointer; transition: background 150ms ease; }
.context-menu-item:hover { background: var(--surface-alt); }
```

- [ ] **Step 2: Refine the S-Curve tooltip**

Change:
```css
#scurve-tooltip {
  position: fixed; background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 4px 8px; font-size: 12px; pointer-events: none; z-index: 1000;
}
```
to:
```css
#scurve-tooltip {
  position: fixed; background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 6px 10px; font-size: 12px; pointer-events: none; z-index: 1000;
  box-shadow: var(--shadow-md);
}
```

- [ ] **Step 3: Refresh Reports panel hardcoded hex and toolbar**

Change:
```css
#reports-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
#reports-toolbar select, #reports-toolbar button {
  padding: 5px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; cursor: pointer;
}
#report-copy-image-button, #report-copy-table-button { background: var(--kpmg-blue); color: #fff; border: none; }
#report-panel-wrap { overflow: auto; }
#report-panel { width: 1280px; min-height: 720px; background: #ffffff; color: #1a1a1a; padding: 40px; box-sizing: border-box; }
.report-panel-inner h1 { font-size: 28px; color: #00338D; margin: 0 0 8px 0; }
.report-panel-inner h2 { font-size: 18px; margin: 20px 0 10px 0; color: #005EB8; }
.report-meta { font-size: 14px; color: #5b6470; margin-bottom: 6px; }
.report-kpi-row { display: flex; gap: 20px; margin: 16px 0; }
.report-kpi { background: #f5f6f7; border-radius: 6px; padding: 10px 16px; font-size: 15px; font-weight: 600; }
.report-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
.report-table th, .report-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e1e4e8; }
.report-list { font-size: 14px; padding-left: 20px; margin: 8px 0; }
```
to:
```css
#reports-toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
#reports-toolbar select, #reports-toolbar button {
  padding: 7px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; cursor: pointer;
  transition: background 150ms ease;
}
#report-copy-image-button, #report-copy-table-button { background: var(--kpmg-blue); color: #fff; border: none; }
#report-copy-image-button:hover, #report-copy-table-button:hover { background: var(--kpmg-blue-mid); }
#report-panel-wrap { overflow: auto; }
#report-panel { width: 1280px; min-height: 720px; background: #ffffff; color: #1d1d1f; padding: 40px; box-sizing: border-box; }
.report-panel-inner h1 { font-size: 28px; font-weight: 500; color: #00338D; margin: 0 0 8px 0; }
.report-panel-inner h2 { font-size: 20px; margin: 20px 0 10px 0; color: #005EB8; }
.report-meta { font-size: 15px; color: #6e6e73; margin-bottom: 6px; }
.report-kpi-row { display: flex; gap: 20px; margin: 16px 0; }
.report-kpi { background: #f7f7f8; border-radius: var(--radius-lg); padding: 12px 20px; font-size: 15px; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.report-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
.report-table th, .report-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5ea; }
.report-list { font-size: 14px; padding-left: 20px; margin: 8px 0; }
```
(`.report-kpi`'s shadow uses the literal `0 1px 2px rgba(0,0,0,0.06)` value rather than `var(--shadow-sm)`, matching the Reports panel's existing hardcoded-not-var pattern — the panel must render identically regardless of the live theme, and `var(--shadow-sm)` resolves to `none` in dark mode, which would be wrong for an always-light report export.)

- [ ] **Step 4: Build and confirm no regressions**

Run:
```bash
cd "project-planner"
python3 build.py
node --test
```
Expected: build succeeds; 108/108 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/css/layout.css
git commit -m "Refine overlays, context menu, tooltip, and Reports panel palette"
```

---

### Task 8: End-to-end visual verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only).

- [ ] **Step 1: Grep-verify zero remaining `--text-muted` references**

Run:
```bash
cd "project-planner"
grep -rn "text-muted" src/
```
Expected: no output at all. If any remain, that selector's task above was incomplete — fix it now, referencing whichever task's Step should have renamed it, then re-run this grep until clean.

- [ ] **Step 2: Build and seed**

Run `cd "project-planner" && python3 build.py`. Temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, never `src/`) to include a small multi-task project: a parent/phase with 2 leaf children (varied statuses — one Complete, one Delayed, one In Progress), one milestone task with billing set, at least one holiday, and one snapshot (take it live after seeding). Serve via `cd dist && python3 -m http.server <port>` and navigate to it.

- [ ] **Step 3: Verify light theme across all 8 views**

For each of Plan, Gantt, S-Curve, Dashboard, Snapshots, Settings, Holidays, Reports: take a screenshot. Confirm: no layout breakage, no text/element overflow or clipping, KPI cards show the refined large numerals, buttons show the primary/secondary distinction, status pills render as rounded tinted badges (not plain colored text), Plan tree's WBS/Task columns stay visible while scrolling right (sticky), numeric/date Plan-tree columns are right-aligned, Dashboard donut/bars use the harmonized status colors, Gantt bars show the refined track/fill colors and rounded ends, holiday shading in Gantt renders as a subtle blue tint (not solid), Reports panel renders with the refreshed palette.

- [ ] **Step 4: Verify dark theme across all 8 views**

Toggle to dark theme via Settings. Repeat Step 3's screenshot sweep across all 8 views. Confirm specifically: cards (KPI, Dashboard sections, Settings sections, Holiday months) show a border instead of a (invisible) shadow via `getComputedStyle` — not just visual inspection, per this project's established habit of verifying computed style rather than trusting appearance; context menu and overlay card still show a visible shadow (darker variant); Gantt/S-Curve/Dashboard-donut chart colors now correctly follow the dark palette (this is the bug-fix verification — confirm these do NOT still show light-theme colors); status pill and holiday-pill backgrounds are legible against the dark surface (if not, apply the §3.10-specified ~20% opacity dark-mode override now, per the spec's pre-approved fallback, and re-verify).

- [ ] **Step 5: Verify keyboard focus**

Tab through the header buttons, view tabs, and a toolbar input. Confirm each shows the `--focus-ring` outline via `getComputedStyle` (not just visual glance) when focused via keyboard, in both themes.

- [ ] **Step 6: Verify zero behavior regression**

Exercise: switch every view tab, edit a Plan-tree cell (leaf date, remarks), toggle a task's milestone flag and confirm Billing cells appear, take a Snapshot, add and remove a holiday, change the status date, use Gantt zoom controls, hover a Dashboard bar/S-Curve dot for its tooltip, open and close the right-click context menu, open Load Project's file picker (cancel it, no need to complete a full load). Confirm every interaction still works exactly as before — this plan must produce zero functional change.

- [ ] **Step 7: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole session (only the benign favicon 404 is expected). Then run `cd "project-planner" && node --test` one more time and confirm all 108 tests still pass.

- [ ] **Step 8: Record the result**

If every check in Steps 1–7 passes, this plan is complete — no commit needed for this task unless Step 4 required the dark-mode opacity adjustment from §3.10, in which case commit that one small fix now with a clear message. If any other check fails, that is a real bug in one of Tasks 1–7: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: every view of ProjectPlanner shares one coherent, restrained design language — consistent spacing/radius/shadow/typography tokens, a harmonized status-color family, refined chrome (buttons/tabs/KPI cards), a denser-but-polished Plan tree with sticky/right-aligned columns and pill-badge statuses, and consistent card treatment across Dashboard/Settings/Snapshots/Holidays — in both light and dark themes, with zero behavior change and a fixed dark-mode bug in the Gantt/S-Curve/Dashboard-donut charts as a side effect of the token conversion.
