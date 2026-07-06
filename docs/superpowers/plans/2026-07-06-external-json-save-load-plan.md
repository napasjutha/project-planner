# External JSON Save/Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ProjectPlanner's save model — Save now downloads a versioned `.json` data file only (not a full re-embedded HTML copy), and a new "Load Project" button reads a `.json` back into the app. The HTML shell stays permanently generic and reusable across unlimited independent projects: copy it once, paste it into any project folder, plan, save — the shell never changes, only the small data file does.

**Architecture:** `handleSave` in `app.js` stops cloning `document.documentElement` entirely and just downloads `project.serialize()` as JSON. A new `handleLoadProject` reads a picked file via `FileReader`, validates its shape, and replaces `state.project`. No engine changes — this is a persistence-layer-only change; `calc.js`/`store.js`/`schedule.js` etc. are untouched.

**Tech Stack:** Vanilla `Blob`/`FileReader`/`<input type="file">` — all standard browser APIs, zero dependencies, same as every prior phase.

## Global Constraints

- Zero external dependencies, runtime or dev.
- This is the load-bearing requirement for the whole project: **one reusable HTML file + one small per-project data file, no infrastructure, no licensing, no install.** Every decision in this plan optimizes for "copy the HTML anywhere, open it, plan, save" working identically across every project someone starts — not for any richer sync/collaboration mechanism.
- No code comments except where genuinely non-obvious.
- File paths exact — every task states `Modify:`/`Create:` paths relative to `project-planner/`.
- DOM/File-API code has no automated test framework available (zero-dependency blocks jsdom) — each such task's "test" step is `node --check` (syntax only) plus confirming the build succeeds; real behavioral verification happens once, at this plan's final task, in a real browser (controller-run, not a fresh subagent — same pattern as every prior plan's final task).
- Locked interfaces already shipped on `main` this plan consumes unchanged: `PP.Project` (`store.js`) — `constructor(data)`, `serialize()`, `toJSON()`. `state` shape `{ project, calc, currentUser, dirty, filters, scurveOverlaySnapshotId, snapshotCompareA, snapshotCompareB, holidaysViewYear }` (`app.js`).
- `slugifyProjectName(name)` (already shipped in `app.js`) is reused unchanged for the new `.json` filename — same `<slug>_rev<N>_<date>` convention, just a different file extension.
- Required-field validation (block Save if `plannedStart`/`plannedFinish` missing) is **out of scope for this plan** — it's Part II of the same spec (Data Quality & Display, a separate upcoming plan) and will be inserted into this plan's `handleSave` once that plan runs. Don't add it here.

---

### Task 1: Replace `handleSave` with JSON-only save

**Files:**
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/src/js/store.js`
- Modify: `project-planner/src/index.html`

**Interfaces:**
- Consumes: `PP.Project.serialize()`, `slugifyProjectName(name)` (both already shipped, unchanged).
- Produces: `meta.schemaVersion` (number, currently always `1`) — a new field on every project's `meta` object, present from this task forward on every project created via `Project.empty()` and in the shipped seed. Not yet read/enforced anywhere (no migration logic exists yet — that's future roadmap, out of scope here) — this task only ensures the field exists on every project going forward, before real `.json` files start circulating without it. `handleSave`'s signature (`handleSave(state)`, called from the Save button's click listener) is unchanged, only its internal behavior changes.

- [ ] **Step 1: Write the failing test**

Add to `project-planner/tests/store.test.js` (append near the other `Project.empty` tests):
```js
test('Project.empty sets schemaVersion 1 on meta', () => {
  const p = Project.empty('Test');
  assert.equal(p.meta.schemaVersion, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: FAIL — `p.meta.schemaVersion` is `undefined`, not `1`.

- [ ] **Step 3: Add `schemaVersion` to `Project.empty()` in `src/js/store.js`**

Change:
```js
    static empty(name) {
      const now = new Date().toISOString();
      return new Project({
        meta: {
          id: generateId(), name, statusDate: now.slice(0, 10),
          revision: 0, savedBy: null, savedAt: null, createdAt: now,
        },
```
to:
```js
    static empty(name) {
      const now = new Date().toISOString();
      return new Project({
        meta: {
          id: generateId(), name, statusDate: now.slice(0, 10),
          revision: 0, savedBy: null, savedAt: null, createdAt: now,
          schemaVersion: 1,
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: PASS, all tests pass (92 existing + 1 new = 93).

- [ ] **Step 5: Add `schemaVersion` to the seed JSON in `src/index.html`**

Change:
```html
<script type="application/json" id="project-data">{"meta":{"id":"seed","name":"New Project","statusDate":"2026-01-01","revision":0,"savedBy":null,"savedAt":null,"createdAt":"2026-01-01T00:00:00.000Z"},"tasks":[],"holidays":[],"picList":[],"snapshots":[],"auditLog":[],"settings":{"theme":"kpmg-light","ganttZoom":"week"}}</script>
```
to:
```html
<script type="application/json" id="project-data">{"meta":{"id":"seed","name":"New Project","statusDate":"2026-01-01","revision":0,"savedBy":null,"savedAt":null,"createdAt":"2026-01-01T00:00:00.000Z","schemaVersion":1},"tasks":[],"holidays":[],"picList":[],"snapshots":[],"auditLog":[],"settings":{"theme":"kpmg-light","ganttZoom":"week"}}</script>
```

- [ ] **Step 6: Replace `handleSave` in `src/js/ui/app.js`**

Change:
```js
  function handleSave(state) {
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();

    var clone = document.documentElement.cloneNode(true);
    var dataScript = clone.querySelector('#project-data');
    dataScript.textContent = json;
    clone.querySelector('#dirty-indicator').textContent = '';
    clone.querySelector('#app').hidden = true;
    clone.querySelector('#name-picker').hidden = true;
    var html = '<!doctype html>\n' + clone.outerHTML;

    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var dateStr = state.project.meta.savedAt.slice(0, 10);
    a.download = slugifyProjectName(state.project.meta.name) + '_rev' + state.project.meta.revision + '_' + dateStr + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.dirty = false;
    document.getElementById('dirty-indicator').textContent = '';
    localStorage.setItem(storageKey(state.project.meta.id), json);
  }
```
to:
```js
  function handleSave(state) {
    state.project.meta.savedBy = state.currentUser;
    state.project.meta.savedAt = new Date().toISOString();
    var json = state.project.serialize();

    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var dateStr = state.project.meta.savedAt.slice(0, 10);
    a.download = slugifyProjectName(state.project.meta.name) + '_rev' + state.project.meta.revision + '_' + dateStr + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    state.dirty = false;
    document.getElementById('dirty-indicator').textContent = '';
    localStorage.setItem(storageKey(state.project.meta.id), json);
  }
```

This removes the entire `document.documentElement.cloneNode`/`#project-data`/`#dirty-indicator`/`#app`/`#name-picker` DOM-surgery block — none of it is needed once Save only ever produces a small data file, not a full page clone. `slugifyProjectName` and the `<slug>_rev<N>_<date>` naming convention are unchanged, just with a `.json` extension.

- [ ] **Step 7: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/app.js
python3 build.py
node --test
```
Expected: syntax clean; build succeeds; all 93 tests pass (92 existing + the `schemaVersion` test from Step 1 — this task adds no further Node tests beyond that, since `handleSave` itself is pure DOM/File code, verified in Task 3).

- [ ] **Step 8: Commit**

```bash
cd "project-planner"
git add src/js/ui/app.js src/js/store.js src/index.html
git commit -m "Add schemaVersion to project metadata; change Save to download a versioned JSON data file instead of a full HTML copy"
```

---

### Task 2: Add "Load Project" file picker

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/js/ui/app.js`

**Interfaces:**
- Consumes: `PP.Project` (`store.js`), `refresh(state, markDirty)` (already defined earlier in `app.js`).
- Produces: `handleLoadProject(state, file)` — not consumed by any later task in this plan, but this is the function name/signature the next spec (Data Quality & Display) and any future work should call if it needs to trigger a project load programmatically.

- [ ] **Step 1: Add the "Load Project" button and hidden file input to `src/index.html`**

Change:
```html
    <div id="header-top">
      <span id="project-name"></span>
      <label>Status date <input type="date" id="status-date-input"></label>
      <button id="save-button">Save</button>
      <span id="dirty-indicator"></span>
    </div>
```
to:
```html
    <div id="header-top">
      <span id="project-name"></span>
      <label>Status date <input type="date" id="status-date-input"></label>
      <button id="save-button">Save</button>
      <button id="load-project-button">Load Project</button>
      <input type="file" id="load-project-input" accept="application/json" hidden>
      <span id="dirty-indicator"></span>
    </div>
```

- [ ] **Step 2: Add `handleLoadProject` and wire the button in `src/js/ui/app.js`**

Add this function right after `handleSave` (which Task 1 already updated):
```js
  function handleLoadProject(state, file) {
    if (state.dirty && !window.confirm('Unsaved changes will be lost — load anyway?')) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        window.alert('That file is not valid JSON.');
        return;
      }
      if (!parsed || !parsed.meta || !Array.isArray(parsed.tasks)) {
        window.alert('That file does not look like a ProjectPlanner project (missing meta/tasks).');
        return;
      }
      state.project = new PP.Project(parsed);
      state.dirty = false;
      state.scurveOverlaySnapshotId = null;
      state.snapshotCompareA = null;
      state.snapshotCompareB = null;
      state.holidaysViewYear = null;
      refresh(state, false);
    };
    reader.onerror = function () {
      window.alert('Failed to read that file.');
    };
    reader.readAsText(file);
  }
```

In `wireHeader(state)`, change:
```js
  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
  }
```
to:
```js
  function wireHeader(state) {
    document.getElementById('status-date-input').addEventListener('change', function (e) {
      state.project.meta.statusDate = e.target.value;
      refresh(state, true);
    });
    document.getElementById('save-button').addEventListener('click', function () {
      handleSave(state);
    });
    document.getElementById('load-project-button').addEventListener('click', function () {
      document.getElementById('load-project-input').click();
    });
    document.getElementById('load-project-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) handleLoadProject(state, file);
      e.target.value = '';
    });
  }
```
(`e.target.value = ''` at the end resets the file input so picking the *same* filename again still fires a `change` event next time — otherwise browsers don't re-fire `change` for an identical file selection.)

- [ ] **Step 3: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/app.js
python3 build.py
grep -c "function handleLoadProject" dist/ProjectPlanner.html
node --test
```
Expected: syntax clean; build succeeds; grep prints `1`; all 93 tests pass (no new Node tests — verified in Task 3).

- [ ] **Step 4: Commit**

```bash
cd "project-planner"
git add src/index.html src/js/ui/app.js
git commit -m "Add Load Project file picker to restore a saved JSON project"
```

---

### Task 3: End-to-end browser verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task: the controller drives a real browser via the Playwright tools already available in this session.

**Files:** none (verification only).

- [ ] **Step 1: Build and seed**

Run `cd "project-planner" && python3 build.py`. Temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, never `src/`) to include 2-3 tasks with varied dates/status so the round-trip has real data to verify. Serve via `cd dist && python3 -m http.server <port>` (`file://` is blocked by this session's sandbox) and navigate to it.

- [ ] **Step 2: Verify Save produces a `.json`, not an `.html`**

Complete the name-picker flow, click Save. Confirm the downloaded filename ends in `.json` (via the browser tools' download-event capture) and matches the `<slug>_rev<N>_<date>.json` pattern. Read the downloaded file's contents directly and confirm it's valid JSON with a `meta`/`tasks` shape matching the current project — not an HTML document.

- [ ] **Step 3: Verify Load Project round-trips real data**

In the same browser session, click "New Project (blank)" in Settings (or reload to a fresh blank state) to clear the current data, then click "Load Project" and pick the `.json` downloaded in Step 2. Confirm: the Plan view now shows the same tasks that were present before Save was clicked, with the same dates/status/names — a genuine round trip, not just "some data appeared."

- [ ] **Step 4: Verify error handling**

Create a throwaway non-JSON text file (e.g. via the browser tools or a quick shell `echo` to a temp path) and attempt to load it via "Load Project" — confirm a clear `alert` appears ("not valid JSON") and the current project is untouched (still shows the data from Step 3, not blanked out or crashed). Then try loading a syntactically valid JSON file that lacks `meta`/`tasks` (e.g. `{"foo": "bar"}`) — confirm the "does not look like a ProjectPlanner project" alert appears, again without disturbing the current project.

- [ ] **Step 5: Verify the unsaved-changes guard**

Make an edit (e.g. change a task's `% Actual`) so `state.dirty` is true, then click "Load Project" and pick any valid project json. Confirm the `confirm()` dialog ("Unsaved changes will be lost — load anyway?") appears before the load proceeds; canceling it leaves the current (dirty, unsaved) project untouched.

- [ ] **Step 6: Check console errors and Node suite**

Confirm no uncaught JS errors were logged to the browser console during any of the above (check via the browser tools' console-message capability, across the whole session). Then run `cd "project-planner" && node --test` one more time and confirm all 93 tests still pass.

- [ ] **Step 7: Record the result**

If every check in Steps 2–6 passes, this plan is complete — no commit needed for this task (verification only). If any check fails, that is a real bug in Task 1 or 2's code: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: `ProjectPlanner.html` is a permanently generic, reusable app shell — Save writes a small versioned `.json` data file, Load Project reads one back in, and the HTML itself never needs to be re-copied or re-shared per project. The next plan (Data Quality & Display — required-field validation, last-updated-by columns, parent/child row styling, Actual Start/Finish/Remarks columns, auto-derived `% Actual`, Billing Milestone fields) inserts its Save-blocking validation directly into this plan's now-simplified `handleSave`.
