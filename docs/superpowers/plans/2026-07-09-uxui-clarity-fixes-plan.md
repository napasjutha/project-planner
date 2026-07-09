# UX/UI Clarity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four verified clarity bugs found in live user testing of ProjectPlanner: the Plan tab's column header scrolling out of sync with its rows, Gantt task-name labels truncating with no ellipsis or way to read the full name, milestone status being invisible both in the Plan tree and in the right-click menu, and confirm (not assume) that Thai-script content renders correctly everywhere these fixes touch.

**Architecture:** Each of the first three bugs has a distinct, already-diagnosed root cause in a single file (a CSS overflow computation quirk in `layout.css`, a missing wrapper element in `gantt.js`, and a missing state-reflecting label plus missing row indicator in `tree.js`). Each gets its own task with its own live-browser verification, since this project's UI files have no automated test coverage by design (see `CLAUDE.md`: "No jsdom — verified only via real-browser Playwright checks"). A final task re-verifies all four fixes together, in both themes, with real Thai-script content, plus a full console and `node --test` sweep.

**Tech Stack:** Same as the rest of the project — hand-written CSS/vanilla JS, `node:test`, zero external dependencies. No new dependencies.

## Global Constraints

- Zero external dependencies, runtime or dev — ever.
- No code comments except where genuinely non-obvious.
- Any user-controlled string going into `innerHTML` must be escaped via the existing `escapeHtml()` helper in `tree.js`, or use `.textContent`. Never concatenate raw strings into `innerHTML`.
- UI files (`src/js/ui/*.js`) are plain IIFEs with no Node-test coverage (no jsdom) — every task below is verified via a real-browser Playwright check, not `node --test`, though `node --test` must still show the same pass count before and after each task (proving zero engine-level regression).
- Current baseline: 147/147 Node tests passing. Every task's build/test step must reconfirm 147/147 — if the count changes, something is wrong.
- This plan makes no visual/token changes beyond what each fix specifically requires — the existing Ive-style design tokens (`--kpmg-blue`, `--text-secondary`, `--radius-sm`, `--shadow-sm`, etc., defined in `theme.css`) are reused as-is, never redefined.
- `min-width: 1835px` is the current combined width of all 18 Plan-tree grid columns (`#tree-header, .tree-row` in `layout.css`) — every place this plan repeats that literal, it must match that selector's value exactly. If a future change to the column list changes that number, this plan's literal must be updated to match (out of scope for this plan, noted for awareness only).

---

### Task 1: Fix Plan tab column header scrolling out of sync with rows

**Root cause (verified live):** `#tree-body` is declared with `overflow-y: auto; overflow-x: visible;` in `layout.css:106`. Per the CSS Overflow spec, when one axis is non-`visible` and the other is `visible`, the `visible` axis is silently upgraded to compute as `auto`. This turns `#tree-body` into its *own* independent horizontal scroll container — decoupled from `#plan-view`, the outer container whose horizontal scrollbar is what actually moves `#tree-header`. The result: a real horizontal mouse-wheel/trackpad gesture over the rows scrolls only `#tree-body` internally; the header never moves. Confirmed with a real Playwright wheel gesture: before the fix, scrolling 300px over the rows left `#tree-header` at `left: 0` (unmoved) while the rows shifted `-300px`; `#plan-view.scrollLeft` stayed `0` the whole time.

**Files:**
- Modify: `project-planner/src/css/layout.css:106`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — this is an isolated CSS fix.

- [ ] **Step 1: Change the `#tree-body` rule**

In `project-planner/src/css/layout.css`, change:
```css
#tree-body { flex: 1; overflow-y: auto; overflow-x: visible; }
```
to:
```css
#tree-body { flex: 1; overflow-y: auto; overflow-x: hidden; min-width: 1835px; }
```
`overflow-x: hidden` (a non-`visible` value) avoids the auto-upgrade quirk entirely — no independent scroll container is created. `min-width: 1835px` matches the `#tree-header, .tree-row` rule's own `min-width: 1835px` (`layout.css:49`), forcing `#tree-body`'s own box to be at least as wide as the header — so `#tree-body`'s rows (also `min-width: 1835px` each, via the shared `.tree-row` selector) always fit exactly inside it and never need clipping. All real horizontal overflow now happens at `#plan-view` (the single shared scroll container for both header and body), so header and rows can only ever move together.

- [ ] **Step 2: Build**

```bash
cd "project-planner"
python3 build.py
node --test
```
Expected: build succeeds; 147/147 tests pass (this is a CSS-only change, so the count must be unchanged from baseline).

- [ ] **Step 3: Live-verify the fix in a real browser**

Serve the built file and navigate to it:
```bash
cd "project-planner/dist"
python3 -m http.server 8981
```
Navigate a Playwright browser to `http://localhost:8981/`, set `localStorage.setItem('pp:currentUser', 'Tester')` and reload to skip the name picker. Add at least 25 tasks with long names (so the Plan tree's columns overflow the viewport and a horizontal scrollbar appears — `state.project.addTask(...)` in a loop via `browser_evaluate`, then call the app's own refresh path is not exposed globally, so instead seed via the `#project-data` script tag before load, or use the `+ Add Task` button repeatedly).

Then, with the mouse positioned over the rows (not the header), perform a real horizontal scroll gesture (Playwright `mouse.wheel(deltaX, 0)` with a nonzero `deltaX`, e.g. `300`). Confirm via `getBoundingClientRect()`:
- `#tree-header`'s `left` and the first `.tree-row`'s `left` both shift by the same amount (they must move together — this is the actual bug being fixed).
- `getComputedStyle(document.getElementById('tree-body')).overflowX` reports `"hidden"`.
- `document.getElementById('tree-body').scrollLeft` stays `0` after the gesture (proving `#tree-body` is no longer scrolling independently — all the movement happened on `#plan-view`).

Also confirm vertical scrolling still works normally (scroll the mouse wheel vertically over the rows; confirm rows scroll and the header does NOT move vertically, since `#tree-body` still has `overflow-y: auto` and `#plan-view` still has `overflow-y: hidden`).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/css/layout.css
git commit -m "Fix Plan tab column header scrolling out of sync with rows"
```

---

### Task 2: Fix Gantt task-name labels truncating with no ellipsis or way to read the full name

**Root cause (verified live):** In `src/js/ui/gantt.js`, `renderGantt()` sets `row.textContent = task.name` directly on the flex-container `.gantt-label-row` div (`gantt.js:191-196`). `.gantt-label-row` in `layout.css:164-167` declares `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` directly on that flex container — but a bare text node placed straight into a flex container becomes an anonymous flex item whose default `min-width` is `auto` (content-based), which never shrinks below its own intrinsic width, so the ellipsis truncation this rule intends never actually engages. Confirmed live: long names (English or Thai) are hard-clipped at the container's edge with no `…` character, and there is no `title` attribute, so there is no way to see the full name without switching back to the Plan tab.

**Files:**
- Modify: `project-planner/src/js/ui/gantt.js:185-197`
- Modify: `project-planner/src/css/layout.css:164-167`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Wrap the label text in a truncatable span and add a native tooltip**

In `project-planner/src/js/ui/gantt.js`, change:
```js
    var spacer = document.createElement('div');
    spacer.style.height = HEADER_HEIGHT + 'px';
    labels.appendChild(spacer);
    rows.forEach(function (id) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var row = document.createElement('div');
      row.className = 'gantt-label-row';
      row.style.height = ROW_HEIGHT + 'px';
      row.style.paddingLeft = (computed.depth * 16) + 'px';
      row.textContent = task.name;
      labels.appendChild(row);
    });
```
to:
```js
    var spacer = document.createElement('div');
    spacer.style.height = HEADER_HEIGHT + 'px';
    labels.appendChild(spacer);
    rows.forEach(function (id) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var row = document.createElement('div');
      row.className = 'gantt-label-row';
      row.style.height = ROW_HEIGHT + 'px';
      row.style.paddingLeft = (computed.depth * 16) + 'px';
      row.title = task.name;
      var nameSpan = document.createElement('span');
      nameSpan.className = 'gantt-label-text';
      nameSpan.textContent = task.name;
      row.appendChild(nameSpan);
      labels.appendChild(row);
    });
```
`row.title` gives every row a native browser hover tooltip showing the full, untruncated name — no custom tooltip code needed. `task.name` is placed via `.textContent`, matching this codebase's existing XSS-safe convention (never raw `innerHTML` concatenation of user data).

- [ ] **Step 2: Move the truncation CSS onto the new inner span**

In `project-planner/src/css/layout.css`, change:
```css
.gantt-label-row {
  display: flex; align-items: center; font-size: 13px; padding-left: 8px;
  border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
```
to:
```css
.gantt-label-row {
  display: flex; align-items: center; font-size: 13px; padding-left: 8px;
  border-bottom: 1px solid var(--border);
}
.gantt-label-text {
  flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
```
`flex: 1; min-width: 0;` is what actually makes the ellipsis engage: it lets this flex item shrink below its own text's intrinsic width (overriding the default `min-width: auto` that blocked truncation before), while `flex: 1` lets it fill the row. Confirmed live in an isolated flex test with real Thai text: with this exact rule, a span's `clientWidth` (198px) drops below its `scrollWidth` (639px) inside a 200px-wide flex row, which is what triggers the ellipsis rendering — this works identically for Thai and Latin script, since `text-overflow: ellipsis` operates on rendered width, not on word boundaries.

- [ ] **Step 3: Build**

```bash
cd "project-planner"
node --check src/js/ui/gantt.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 147/147 tests pass (this task touches no engine/logic files).

- [ ] **Step 4: Live-verify the fix in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least one task whose name is long enough to overflow the 200px label column (both a long English name and a long Thai name — Thai text does not use spaces between words, so it specifically exercises the ellipsis-by-width behavior rather than ellipsis-by-word-boundary). Open the Gantt tab and confirm via `browser_evaluate`:
- Each `.gantt-label-row` has a non-empty `title` attribute equal to that task's full `name`.
- The `.gantt-label-text` span's rendered text visually ends in `…` for the long names (check via `getComputedStyle(span).textOverflow === 'ellipsis'` and `span.scrollWidth > span.clientWidth`).
- Take a screenshot and visually confirm the long Thai name is legibly truncated (not garbled) and a short name is not truncated at all (renders in full, no visual regression for the common case).
- Hover over a truncated row (Playwright `element.hover()`) — while Playwright cannot screenshot the native OS tooltip reliably, confirm the `title` attribute is present and correct as the underlying mechanism.

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/ui/gantt.js src/css/layout.css
git commit -m "Fix Gantt task-name labels: working ellipsis truncation plus full-name hover tooltip"
```

---

### Task 3: Make milestone status visible in the Plan tree and the right-click menu

**Root cause (verified live):** `state.project.tasks` has a `milestone` boolean (`task.milestone`), and the Gantt view already renders milestones as a distinct diamond shape (`gantt.js:99-108`, `fill: 'var(--kpmg-blue)'`) — but nowhere in the Plan tree (`tree.js`'s `renderTree()`) is `task.milestone` reflected visually; the only trace is that the Billing Amount/Billing Status cells happen to render non-empty only for milestone tasks (`tree.js:39-44`), which is indirect and easy to miss (an empty cell looks the same as an N/A cell). The right-click context menu (`tree.js:151-192`) has a static `'Toggle Milestone'` label (`tree.js:172`) that never reflects whether the task currently *is* a milestone — clicking it always looks like the same action regardless of state. Confirmed live via a real right-click: the menu item text is always exactly `"Toggle Milestone"`, with no checkmark or state indication, for both milestone and non-milestone tasks.

**Files:**
- Modify: `project-planner/src/js/ui/tree.js:56-76` (row rendering)
- Modify: `project-planner/src/js/ui/tree.js:172` (context menu label)
- Modify: `project-planner/src/css/layout.css:61` (add a rule after `.toggle`)

**Interfaces:**
- Consumes: nothing new — `task.milestone` already exists on every task object (`store.js`'s `Project`/task shape, unchanged by this task).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add a milestone marker to the Plan tree row**

In `project-planner/src/js/ui/tree.js`, in `renderTree()`, change:
```js
      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren ? ' is-parent' : '');
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + escapeHtml(task.name) +
        '</span>' +
```
to:
```js
      var milestoneMarker = task.milestone ? '<span class="milestone-marker" title="Milestone">&#9670;</span>' : '';
      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren ? ' is-parent' : '');
      row.dataset.id = id;
      row.innerHTML =
        '<span class="col-wbs">' + computed.wbs + '</span>' +
        '<span class="cell col-name" data-field="name" style="padding-left:' + (computed.depth * 20) + 'px">' +
          '<span class="toggle">' + toggleChar + '</span>' + milestoneMarker + escapeHtml(task.name) +
        '</span>' +
```
`&#9670;` is the `◆` (black diamond) character — the same shape the Gantt view already uses for milestones (`gantt.js:99-108`), so the two views speak the same visual language. `milestoneMarker` contains no task-controlled data (it's a fixed literal string gated by a boolean), so it's safe to place directly into `innerHTML` without `escapeHtml()`; `task.name` right after it is still passed through `escapeHtml()` exactly as before.

- [ ] **Step 2: Style the marker**

In `project-planner/src/css/layout.css`, immediately after:
```css
.toggle { cursor: pointer; display: inline-block; width: 14px; color: var(--text-secondary); }
```
add:
```css
.milestone-marker { color: var(--kpmg-blue); font-size: 10px; margin-right: 4px; }
```

- [ ] **Step 3: Make the context menu label reflect current milestone state**

In `project-planner/src/js/ui/tree.js`, in `showContextMenu()`, change:
```js
      ['Toggle Milestone', function () { state.project.updateTask(id, { milestone: !task.milestone }, state.currentUser); }],
```
to:
```js
      [task.milestone ? '✓ Milestone (click to unset)' : 'Mark as Milestone', function () { state.project.updateTask(id, { milestone: !task.milestone }, state.currentUser); }],
```
`✓` is a checkmark (`✓`). This label is built fresh every time `showContextMenu()` runs (it already re-reads `task` from `state.project.tasks` at the top of the function, `tree.js:158`), so it always reflects the task's current state at the moment the menu is opened — no separate state tracking needed. The click handler itself is unchanged (still toggles `task.milestone`); only the displayed text changes based on current state. This item's label is set via `item.textContent = a[0]` (`tree.js:178`, unchanged), so no escaping concern — it's always one of these two fixed strings, never task-controlled data.

- [ ] **Step 4: Build**

```bash
cd "project-planner"
node --check src/js/ui/tree.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; 147/147 tests pass.

- [ ] **Step 5: Live-verify the fix in a real browser**

Serve `dist/ProjectPlanner.html`, seed a project with at least one milestone task and one non-milestone task. Confirm via `browser_evaluate`:
- The milestone task's `.tree-row` contains an element with class `milestone-marker` whose text is `◆`; the non-milestone task's row does not.
- Right-click the milestone task and confirm the context menu's last item's `textContent` is `"✓ Milestone (click to unset)"`.
- Right-click the non-milestone task and confirm the context menu's last item's `textContent` is `"Mark as Milestone"`.
- Click that item on the non-milestone task, confirm the row now shows the `◆` marker and a second right-click shows the "✓ Milestone (click to unset)" label; click it again and confirm both revert.
- Take a screenshot of the Plan tree showing both a milestone and non-milestone row side by side, confirming the marker is visually clear at a glance without opening the context menu.

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/js/ui/tree.js src/css/layout.css
git commit -m "Make milestone status visible in Plan tree rows and the right-click menu"
```

---

### Task 4: End-to-end verification across all fixes, both themes, and real Thai content (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task in this repo: the controller drives a real browser via the Playwright tools already available in this session, rather than dispatching a subagent.

**Files:** none (verification only, unless a check below fails).

- [ ] **Step 1: Build and seed with realistic mixed Thai/English content**

```bash
cd "project-planner"
python3 build.py
node --test
```
Expected: 147/147 tests pass. Seed a project (via the `#project-data` script tag in a copy of `dist/ProjectPlanner.html`, per this repo's established seeding technique) with: at least 25 tasks so the Plan tree overflows horizontally, a mix of Thai-only names, Thai+English mixed names, and one Thai name long enough to overflow the Gantt label column, at least 2 milestone tasks and several non-milestone tasks, and tasks assigned across at least 3 PICs. Serve it and navigate a Playwright browser to it, skip the name picker via `localStorage.setItem('pp:currentUser', ...)`.

- [ ] **Step 2: Re-verify Task 1 (header/row scroll sync) with real content**

With the mouse over the Plan tree rows, perform a real horizontal wheel scroll. Confirm `#tree-header` and the visible rows shift by the same amount, using `getBoundingClientRect()` before/after, exactly as in Task 1's own verification — this re-check confirms the fix still holds with a full, realistic dataset (not just the synthetic one used in Task 1).

- [ ] **Step 3: Re-verify Task 2 (Gantt label truncation) with real content**

Open the Gantt tab. Confirm the long Thai task name renders truncated with a working ellipsis (`scrollWidth > clientWidth` on its `.gantt-label-text` span) and that `row.title` equals the full name. Take a screenshot confirming the truncation is legible (not garbled mid-character — Thai combining marks must not be cut off between a base character and its vowel/tone mark in a way that produces a broken glyph; if this occurs, note it as a new finding rather than assuming ellipsis truncation is always safe for combining scripts, since CSS `text-overflow: ellipsis` truncates at the character-cluster level in modern browsers but this must be confirmed visually, not assumed).

- [ ] **Step 4: Re-verify Task 3 (milestone visibility) with real content**

Confirm every seeded milestone task shows the `◆` marker in the Plan tree and every non-milestone task does not. Right-click one of each and confirm the context menu label matches the task's actual state.

- [ ] **Step 5: Verify dark theme**

Toggle to dark theme via Settings. Repeat Steps 2-4's checks. Confirm the `.milestone-marker`'s `var(--kpmg-blue)` color and the Gantt label `title` tooltip mechanism are unaffected by theme (both are theme-invariant by design — `--kpmg-blue` is not redefined in `[data-theme="dark"]`, and `title` is a browser-native attribute with no CSS dependency).

- [ ] **Step 6: Verify zero regression to existing functionality**

Exercise: switch every view tab, edit a Plan-tree cell, drag a Gantt bar, take a Snapshot, add a holiday, use the PIC filter and search box, open and close the right-click context menu on both a parent row and a leaf row. Confirm every interaction still works exactly as it did before this plan — this plan must produce zero functional regressions outside the four fixes described.

- [ ] **Step 7: Console and final test sweep**

Confirm no uncaught JS errors were logged to the browser console across the whole verification session (only the benign favicon 404 is expected — per this project's established pattern). Then run:
```bash
cd "project-planner"
node --test
```
Confirm 147/147 tests still pass.

- [ ] **Step 8: Record the result**

If every check in Steps 1-7 passes, this plan is complete — no commit needed for this task. If any check fails, that is a real bug in one of Tasks 1-3: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: the Plan tab's column header always scrolls in sync with its rows (both directions), Gantt task-name labels truncate legibly with a working ellipsis and reveal their full name on hover via a native tooltip, milestone status is visible at a glance in the Plan tree (a `◆` marker matching the Gantt view's own milestone symbol) and unambiguous in the right-click menu (a state-reflecting label), and all of the above is confirmed — not assumed — to work correctly with real Thai-script content in both light and dark themes, with zero regressions to existing functionality.
