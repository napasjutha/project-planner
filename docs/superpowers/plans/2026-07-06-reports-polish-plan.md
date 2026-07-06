# Reports & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish ProjectPlanner's last three tabs — Settings (theme toggle, PIC list editor, project rename, audit log viewer, blank-project reset), Holidays (management table, bulk paste, year calendar strip, impact banner), and Reports (three PowerPoint-ready 16:9 templates with Copy-as-Image and Copy-as-Table) — plus print CSS. This is the final phase per the spec's §11 build order; after this, every planned feature exists.

**Architecture:** Three more `src/js/ui/*.js` files (`settings.js`, `holidays.js`, `reports.js`), same plain-IIFE convention as every prior UI file, plumbed through the same `VIEW_IDS`/`renderX`/`wireX` pattern established across the last three phases. Reports render into a fixed-size, always-white/always-dark-text `#report-panel` (deliberately independent of the app's light/dark theme — these are meant to be pasted into PowerPoint, not viewed as part of the app chrome). Copy-as-Image uses a hand-built, zero-dependency technique: serialize the report panel plus every current stylesheet's CSS text into an SVG `<foreignObject>`, rasterize that SVG to a `<canvas>` via `Image`/`drawImage`, then `canvas.toBlob()` → `ClipboardItem`. Copy-as-Table writes `text/html` (a real `<table>`) and `text/plain` (tab-separated) onto the clipboard together, so PowerPoint/Word paste an editable table and plain-text targets get TSV. `print.css` (already referenced in `build.py`'s `CSS_ORDER` since the Foundation phase, but never created) finally exists, hiding everything except `#report-panel` when printing.

**Tech Stack:** Vanilla ES5-compatible JavaScript, `document.createElementNS`/`XMLSerializer`/`Canvas`/`ClipboardItem` — all standard browser APIs, no library.

## Global Constraints

- Zero external dependencies, runtime or dev. No screenshot/canvas/clipboard library.
- `settings.js`, `holidays.js`, `reports.js` are plain IIFEs (no UMD) — same style as every other `ui/*.js` file, never `require`'d by tests.
- Dates are ISO `"YYYY-MM-DD"` strings; `PP.parseISO`/`PP.toISO` for date arithmetic.
- No code comments except genuinely non-obvious.
- File paths exact — every task states `Create:`/`Modify:` paths relative to `project-planner/`.
- Reusable planning tool for any project type/scale — nothing in this plan's code hardcodes phase names, task counts, or company names.
- ALL user-controlled strings (task names, PIC, remarks, holiday labels, snapshot notes) reaching the DOM must use `.textContent`/`createTextNode`, never `innerHTML` string concatenation — this codebase has fixed XSS bugs of exactly this shape twice across four prior UI phases; the other two phases were clean specifically because every subagent followed this rule without exception, and this phase adds three more files that touch free-text user input (holiday labels, PIC names) for the first time since the Plan view.
- `#report-panel`'s CSS deliberately hardcodes white background / dark text regardless of `[data-theme="dark"]` — this is intentional (reports must look the same on paste into PowerPoint no matter what theme the app UI is in), not a theme-consistency bug to fix.
- Editing `project.holidays`, `project.picList`, and `project.settings` (theme, PIC list, holidays) bypasses `store.js`'s `Project.updateTask`/`updateTasks` — this is the same sanctioned pattern already used for `project.snapshots` in the Analytics phase (these are project-level configuration/reference data, not task business data; the "mutations go through Project methods" rule only ever applied to `project.tasks`).
- Every holiday add/remove/bulk-import must trigger a full `recalc()` (via the standard `refresh(state, true)` path), since durations/weights/statuses all depend on the holiday list.
- DOM-touching files have no automated test framework available (adding jsdom would violate zero-dependency) — each such task's "test" step is `node --check` (syntax only) plus confirming the build succeeds and inlines the new code; real behavioral verification happens once, at this plan's final task, in a real browser (controller-run, not a fresh subagent — same pattern as every prior plan's final task).
- Locked interfaces already shipped on `main` this plan consumes unchanged: `PP.recalc`, `PP.Project` (`store.js`), `PP.parseISO`/`PP.toISO` (`schedule.js`), `state` shape `{ project, calc, currentUser, dirty, filters, scurveOverlaySnapshotId, snapshotCompareA, snapshotCompareB }` (extended by this plan to also include `holidaysViewYear`).
- `build.py`'s `JS_ORDER`/`CSS_ORDER` skip any listed file that doesn't yet exist, so pre-registering new files is safe. `CSS_ORDER` already lists `print.css` (added in the Foundation phase) — it has never been created, so it has silently been skipped every build until now.

---

### Task 1: Settings view

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/js/ui/app.js`
- Modify: `project-planner/build.py`
- Create: `project-planner/src/js/ui/settings.js`

**Interfaces:**
- Consumes: `PP.Project.empty(name)` (`store.js`), `state.project.{meta,settings,picList,auditLog,tasks}`.
- Produces: `PP.renderSettings(state)`, `PP.wireSettings(state, onChanged)`, `PP.applyTheme(theme)` (also used directly by `app.js`'s `boot()`/`refresh()` to keep `<html data-theme>` in sync without needing the Settings tab to be open).

- [ ] **Step 1: Add the Settings tab and view to `src/index.html`**

Change:
```html
  <div id="view-tabs">
    <button class="view-tab active" data-view="plan">Plan</button>
    <button class="view-tab" data-view="gantt">Gantt</button>
    <button class="view-tab" data-view="scurve">S-Curve</button>
    <button class="view-tab" data-view="dashboard">Dashboard</button>
    <button class="view-tab" data-view="snapshots">Snapshots</button>
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
    <button class="view-tab" data-view="settings">Settings</button>
    <button class="view-tab" data-view="holidays">Holidays</button>
    <button class="view-tab" data-view="reports">Reports</button>
  </div>
```
(This adds all three remaining tabs now — `holidays-view`/`reports-view` containers are added by Tasks 2/3, `build.py` already tolerates referencing not-yet-built JS for them, and an empty/missing view container is simply never un-hidden until its own task adds it, matching the pattern already used across every prior phase.)

Right after the `#snapshots-view` block's closing `</div>` and before the final `</div>` that closes `#app`, add:
```html
  <div id="settings-view" hidden>
    <div class="settings-section">
      <h3>Theme</h3>
      <button class="theme-btn" data-theme="kpmg-light">Light</button>
      <button class="theme-btn" data-theme="kpmg-dark">Dark</button>
    </div>
    <div class="settings-section">
      <h3>Project</h3>
      <label>Name <input id="project-rename-input" type="text"></label>
      <button id="new-project-button">New Project (blank)</button>
    </div>
    <div class="settings-section">
      <h3>PIC List</h3>
      <div id="pic-list-editor"></div>
      <input id="new-pic-input" type="text" placeholder="Add PIC name">
      <button id="add-pic-button">Add</button>
    </div>
    <div class="settings-section settings-section-wide">
      <h3>Audit Log</h3>
      <div id="audit-log-body"></div>
    </div>
  </div>
```

- [ ] **Step 2: Add Settings CSS to `src/css/layout.css`**

Append:
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

- [ ] **Step 3: Create `src/js/ui/settings.js`**

Create `project-planner/src/js/ui/settings.js`:
```js
(function () {
  'use strict';

  function applyTheme(theme) {
    if (theme === 'kpmg-dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function renderSettings(state) {
    applyTheme(state.project.settings.theme);

    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === (state.project.settings.theme || 'kpmg-light'));
    });

    var nameInput = document.getElementById('project-rename-input');
    if (document.activeElement !== nameInput) nameInput.value = state.project.meta.name;

    var picEditor = document.getElementById('pic-list-editor');
    picEditor.innerHTML = '';
    (state.project.picList || []).forEach(function (pic) {
      var row = document.createElement('div');
      row.className = 'pic-editor-row';
      var label = document.createElement('span');
      label.textContent = pic;
      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'pic-remove-btn';
      removeBtn.dataset.pic = pic;
      row.appendChild(label);
      row.appendChild(removeBtn);
      picEditor.appendChild(row);
    });

    var auditBody = document.getElementById('audit-log-body');
    auditBody.innerHTML = '';
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['When', 'Who', 'Task', 'Field', 'Old', 'New'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    state.project.auditLog.slice().reverse().slice(0, 200).forEach(function (entry) {
      var tr = document.createElement('tr');
      var taskName = byId.has(entry.taskId) ? byId.get(entry.taskId).name : entry.taskId;
      [entry.when, entry.who, taskName, entry.field, String(entry.old), String(entry.new)].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    auditBody.appendChild(table);
  }

  function wireSettings(state, onChanged) {
    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.project.settings.theme = b.dataset.theme;
        onChanged();
      });
    });

    document.getElementById('project-rename-input').addEventListener('change', function (e) {
      state.project.meta.name = e.target.value;
      onChanged();
    });

    document.getElementById('add-pic-button').addEventListener('click', function () {
      var input = document.getElementById('new-pic-input');
      var name = input.value.trim();
      if (!name) return;
      state.project.picList = state.project.picList || [];
      if (state.project.picList.indexOf(name) === -1) state.project.picList.push(name);
      input.value = '';
      onChanged();
    });

    document.getElementById('pic-list-editor').addEventListener('click', function (e) {
      var btn = e.target.closest('.pic-remove-btn');
      if (!btn) return;
      state.project.picList = state.project.picList.filter(function (p) { return p !== btn.dataset.pic; });
      onChanged();
    });

    document.getElementById('new-project-button').addEventListener('click', function () {
      var confirmed = window.confirm('Start a new blank project? This replaces the currently open project in this browser tab (already-saved files on disk are unaffected).');
      if (!confirmed) return;
      var name = window.prompt('New project name:', 'New Project') || 'New Project';
      state.project = PP.Project.empty(name);
      state.dirty = false;
      state.scurveOverlaySnapshotId = null;
      state.snapshotCompareA = null;
      state.snapshotCompareB = null;
      onChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderSettings = renderSettings;
  window.PP.wireSettings = wireSettings;
  window.PP.applyTheme = applyTheme;
})();
```

- [ ] **Step 4: Wire it into `app.js`**

Change `refresh` from:
```js
    PP.renderDashboard(state);
    PP.renderSnapshots(state);
    if (markDirty) {
```
to:
```js
    PP.renderDashboard(state);
    PP.renderSnapshots(state);
    PP.renderSettings(state);
    if (markDirty) {
```

In `showApp(state)`, change:
```js
    PP.wireScurve(state, function () { PP.renderScurve(state); });
    PP.wireSnapshots(state, function () { refresh(state, true); });
```
to:
```js
    PP.wireScurve(state, function () { PP.renderScurve(state); });
    PP.wireSnapshots(state, function () { refresh(state, true); });
    PP.wireSettings(state, function () { refresh(state, true); });
```

Also update the `VIEW_IDS` array (used by `wireViewTabs` to decide which view `<div>` to un-hide when a tab is clicked) to include the new tab, or the Settings tab will click but never actually show its content. Change:
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view'];
```
to:
```js
  var VIEW_IDS = ['plan-view', 'gantt-view', 'scurve-view', 'dashboard-view', 'snapshots-view', 'settings-view'];
```

**Correction — this step was missing when this task was originally implemented.** Tasks 1-2 of this plan initially shipped their tab buttons/view containers without this `VIEW_IDS` update, so the Settings and Holidays tabs clicked but never displayed anything until Task 3's review caught the gap (Task 3 needed the analogous update for its own `reports-view` tab, and the implementer noticed and fixed all three missing entries — `settings-view`, `holidays-view`, `reports-view` — in one commit). This plan text has been corrected after the fact so a reader following it top-to-bottom doesn't reproduce the same gap; the actual shipped fix landed in Task 3's commit, not here.

- [ ] **Step 5: Register `settings.js` in `build.py`**

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
    "ui/scurve.js",
    "ui/dashboard.js",
    "ui/snapshots.js",
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
    "ui/settings.js",
    "ui/holidays.js",
    "ui/reports.js",
    "ui/app.js",
]
```
(Pre-registers `ui/holidays.js`/`ui/reports.js` for Tasks 2-3, same pattern used in every prior phase.)

- [ ] **Step 6: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/settings.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderSettings" dist/ProjectPlanner.html
node --test
```
Expected: syntax clean; build succeeds; grep prints `1`; all 92 tests still pass (this task adds no Node tests — pure DOM code, verified in Task 4).

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/js/ui/settings.js src/js/ui/app.js build.py
git commit -m "Add Settings view: theme toggle, PIC editor, rename, audit log, new-project reset"
```

---

### Task 2: Holidays view

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/js/ui/app.js`
- Create: `project-planner/src/js/ui/holidays.js`

**Interfaces:**
- Consumes: `state.project.holidays` (array of `{date, label}`), `state.project.tasks`, `PP.parseISO`/`PP.toISO`.
- Produces: `PP.renderHolidays(state)`, `PP.wireHolidays(state, onChanged)`. Adds `state.holidaysViewYear` (number or `null`) to the `state` shape.

- [ ] **Step 1: Add the Holidays view to `src/index.html`**

Right after the `#settings-view` block's closing `</div>` and before the final `</div>` that closes `#app`, add:
```html
  <div id="holidays-view" hidden>
    <div id="holidays-toolbar">
      <input id="new-holiday-date" type="date">
      <input id="new-holiday-label" type="text" placeholder="Label">
      <button id="add-holiday-button">Add</button>
      <span id="holiday-impact-banner"></span>
    </div>
    <div id="holidays-bulk">
      <textarea id="holidays-bulk-input" rows="3" placeholder="Paste rows: date&#9;label (one per line)"></textarea>
      <button id="holidays-bulk-import-button">Import</button>
    </div>
    <div id="holidays-year-nav">
      <button id="holidays-year-prev">&laquo; Prev Year</button>
      <span id="holidays-year-label"></span>
      <button id="holidays-year-next">Next Year &raquo;</button>
    </div>
    <div id="holidays-calendar"></div>
    <div id="holidays-table"></div>
  </div>
```

- [ ] **Step 2: Add Holidays CSS to `src/css/layout.css`**

Append:
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

- [ ] **Step 3: Create `src/js/ui/holidays.js`**

Create `project-planner/src/js/ui/holidays.js`:
```js
(function () {
  'use strict';

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function countTasksSpanningDate(tasks, dateISO) {
    return tasks.filter(function (t) {
      return t.plannedStart && t.plannedFinish && t.plannedStart <= dateISO && dateISO <= t.plannedFinish;
    }).length;
  }

  function weekdayName(dateISO) {
    var d = new Date(PP.parseISO(dateISO));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  }

  function renderHolidaysTable(state) {
    var container = document.getElementById('holidays-table');
    container.innerHTML = '';
    var sorted = state.project.holidays.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['Date', 'Day', 'Label', 'Tasks spanning', ''].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    sorted.forEach(function (h) {
      var tr = document.createElement('tr');
      [h.date, weekdayName(h.date), h.label, String(countTasksSpanningDate(state.project.tasks, h.date))].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      var actionTd = document.createElement('td');
      var removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'holiday-remove-btn';
      removeBtn.dataset.date = h.date;
      actionTd.appendChild(removeBtn);
      tr.appendChild(actionTd);
      table.appendChild(tr);
    });
    container.appendChild(table);
  }

  function renderCalendarStrip(state) {
    var container = document.getElementById('holidays-calendar');
    container.innerHTML = '';
    var year = state.holidaysViewYear || Number(state.project.meta.statusDate.slice(0, 4));
    document.getElementById('holidays-year-label').textContent = String(year);
    var holidaySet = new Set(state.project.holidays.map(function (h) { return h.date; }));

    for (var m = 0; m < 12; m++) {
      var monthDiv = document.createElement('div');
      monthDiv.className = 'holiday-month';
      var title = document.createElement('div');
      title.className = 'holiday-month-title';
      title.textContent = MONTH_NAMES[m] + ' ' + year;
      monthDiv.appendChild(title);

      var grid = document.createElement('div');
      grid.className = 'holiday-month-grid';
      var firstOfMonth = Date.UTC(year, m, 1);
      var daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      var startWeekday = new Date(firstOfMonth).getUTCDay();
      for (var pad = 0; pad < startWeekday; pad++) {
        grid.appendChild(document.createElement('span'));
      }
      for (var day = 1; day <= daysInMonth; day++) {
        var dateISO = PP.toISO(Date.UTC(year, m, day));
        var dow = new Date(Date.UTC(year, m, day)).getUTCDay();
        var cell = document.createElement('span');
        cell.className = 'holiday-day';
        cell.textContent = String(day);
        if (dow === 0 || dow === 6) cell.classList.add('holiday-day-weekend');
        if (holidaySet.has(dateISO)) cell.classList.add('holiday-day-holiday');
        grid.appendChild(cell);
      }
      monthDiv.appendChild(grid);
      container.appendChild(monthDiv);
    }
  }

  function renderHolidays(state) {
    renderHolidaysTable(state);
    renderCalendarStrip(state);
  }

  function showImpactBanner(state, dateISO) {
    var banner = document.getElementById('holiday-impact-banner');
    if (!dateISO) { banner.textContent = ''; return; }
    var count = countTasksSpanningDate(state.project.tasks, dateISO);
    banner.textContent = count > 0 ? count + ' task(s) span this date' : '';
  }

  function parseBulkLine(line) {
    var parts = line.split(/\t|,/).map(function (s) { return s.trim(); });
    if (parts.length < 2) return null;
    var date = parts[0];
    var label = parts.slice(1).join(' ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { date: date, label: label };
  }

  function wireHolidays(state, onChanged) {
    document.getElementById('new-holiday-date').addEventListener('input', function (e) {
      showImpactBanner(state, e.target.value);
    });

    document.getElementById('add-holiday-button').addEventListener('click', function () {
      var dateInput = document.getElementById('new-holiday-date');
      var labelInput = document.getElementById('new-holiday-label');
      var date = dateInput.value;
      if (!date) return;
      if (state.project.holidays.some(function (h) { return h.date === date; })) {
        window.alert('A holiday is already set for that date.');
        return;
      }
      state.project.holidays.push({ date: date, label: labelInput.value || '' });
      dateInput.value = '';
      labelInput.value = '';
      showImpactBanner(state, null);
      onChanged();
    });

    document.getElementById('holidays-table').addEventListener('click', function (e) {
      var btn = e.target.closest('.holiday-remove-btn');
      if (!btn) return;
      state.project.holidays = state.project.holidays.filter(function (h) { return h.date !== btn.dataset.date; });
      onChanged();
    });

    document.getElementById('holidays-bulk-import-button').addEventListener('click', function () {
      var textarea = document.getElementById('holidays-bulk-input');
      var lines = textarea.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var existing = new Set(state.project.holidays.map(function (h) { return h.date; }));
      var added = 0;
      var skipped = 0;
      lines.forEach(function (line) {
        var parsed = parseBulkLine(line);
        if (!parsed || existing.has(parsed.date)) { skipped++; return; }
        state.project.holidays.push(parsed);
        existing.add(parsed.date);
        added++;
      });
      textarea.value = '';
      window.alert('Imported ' + added + ' holiday(s), skipped ' + skipped + '.');
      onChanged();
    });

    document.getElementById('holidays-year-prev').addEventListener('click', function () {
      state.holidaysViewYear = (state.holidaysViewYear || Number(state.project.meta.statusDate.slice(0, 4))) - 1;
      renderCalendarStrip(state);
    });
    document.getElementById('holidays-year-next').addEventListener('click', function () {
      state.holidaysViewYear = (state.holidaysViewYear || Number(state.project.meta.statusDate.slice(0, 4))) + 1;
      renderCalendarStrip(state);
    });
  }

  window.PP = window.PP || {};
  window.PP.renderHolidays = renderHolidays;
  window.PP.wireHolidays = wireHolidays;
})();
```

- [ ] **Step 4: Wire it into `app.js`**

Change `refresh` from:
```js
    PP.renderSettings(state);
    if (markDirty) {
```
to:
```js
    PP.renderSettings(state);
    PP.renderHolidays(state);
    if (markDirty) {
```

In `showApp(state)`, change:
```js
    PP.wireSnapshots(state, function () { refresh(state, true); });
    PP.wireSettings(state, function () { refresh(state, true); });
```
to:
```js
    PP.wireSnapshots(state, function () { refresh(state, true); });
    PP.wireSettings(state, function () { refresh(state, true); });
    PP.wireHolidays(state, function () { refresh(state, true); });
```

Also add `'holidays-view'` to the `VIEW_IDS` array in `app.js` (same correction as Task 1 — see that task's note on this).

In `boot()`, add `holidaysViewYear: null,` to the `state` object literal, right after `snapshotCompareB: null,`.

- [ ] **Step 5: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/holidays.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderHolidays" dist/ProjectPlanner.html
node --test
```
Expected: syntax clean; build succeeds; grep prints `1`; all 92 tests pass (no new Node tests — verified in Task 4).

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/js/ui/holidays.js src/js/ui/app.js
git commit -m "Add Holidays view: table, bulk paste, year calendar strip, impact banner"
```

---

### Task 3: Reports view + print.css

**Files:**
- Modify: `project-planner/src/index.html`
- Modify: `project-planner/src/css/layout.css`
- Modify: `project-planner/src/js/ui/app.js`
- Create: `project-planner/src/css/print.css`
- Create: `project-planner/src/js/ui/reports.js`

**Interfaces:**
- Consumes: `state.calc.{computed,order,children,kpis,overall}`, `state.project.{tasks,snapshots,meta}`.
- Produces: `PP.renderReport(state)`, `PP.wireReports(state, onTemplateChanged)`.

- [ ] **Step 1: Add the Reports view to `src/index.html`**

Right after the `#holidays-view` block's closing `</div>` and before the final `</div>` that closes `#app`, add:
```html
  <div id="reports-view" hidden>
    <div id="reports-toolbar">
      <select id="report-template-select">
        <option value="weekly">Weekly Status Report</option>
        <option value="executive">Executive Dashboard</option>
        <option value="summary">Management Summary</option>
      </select>
      <button id="report-copy-image-button">Copy as Image</button>
      <button id="report-copy-table-button">Copy as Table</button>
    </div>
    <div id="report-panel-wrap">
      <div id="report-panel"></div>
    </div>
  </div>
```

- [ ] **Step 2: Add Reports CSS to `src/css/layout.css`**

Append:
```css
#reports-view { flex: 1; overflow: auto; padding: 12px 20px; }
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
(These use hardcoded hex colors, not the `--kpmg-blue`/`--surface` custom properties, deliberately — `#report-panel` must look identical regardless of the app's current light/dark theme, per this plan's Global Constraints.)

- [ ] **Step 3: Create `src/css/print.css`**

Create `project-planner/src/css/print.css`:
```css
@media print {
  body * { visibility: hidden; }
  #report-panel, #report-panel * { visibility: visible; }
  #report-panel { position: absolute; top: 0; left: 0; width: 100%; }
  #app-header, #toolbar, #view-tabs, #reports-toolbar, #name-picker, #context-menu, #scurve-tooltip { display: none !important; }
}
```

- [ ] **Step 4: Create `src/js/ui/reports.js`**

Create `project-planner/src/js/ui/reports.js`:
```js
(function () {
  'use strict';

  function pct(x) { return Math.round(x * 100) + '%'; }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function buildPhaseTable(state) {
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var roots = state.calc.children.get(null) || [];
    var table = el('table', { class: 'report-table' });
    table.appendChild(el('tr', {}, ['Phase', 'Plan %', 'Actual %', 'Status'].map(function (h) { return el('th', {}, [h]); })));
    roots.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      table.appendChild(el('tr', {}, [
        el('td', {}, [task.name]),
        el('td', {}, [pct(c.plannedPctToDate)]),
        el('td', {}, [pct(c.actualPct)]),
        el('td', {}, [c.status]),
      ]));
    });
    return table;
  }

  function buildDelayedList(state) {
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var ul = el('ul', { class: 'report-list' });
    var any = false;
    state.calc.order.forEach(function (id) {
      if ((state.calc.children.get(id) || []).length > 0) return;
      var c = state.calc.computed.get(id);
      if (c.status !== 'Delayed') return;
      any = true;
      var task = byId.get(id);
      ul.appendChild(el('li', {}, [task.name + ' — due ' + c.plannedFinish + (task.remarks ? ' (' + task.remarks + ')' : '')]));
    });
    if (!any) ul.appendChild(el('li', {}, ['None']));
    return ul;
  }

  function latestSnapshotDelta(state) {
    var snaps = state.project.snapshots;
    if (!snaps.length) return null;
    var latest = snaps[snaps.length - 1];
    return {
      note: latest.note,
      takenAt: (latest.takenAt || '').slice(0, 10),
      actualDeltaPct: Math.round((state.calc.kpis.actualPct - latest.overall.actualPct) * 100),
    };
  }

  function renderWeeklyReport(state) {
    var panel = el('div', { class: 'report-panel-inner' });
    panel.appendChild(el('h1', {}, [state.project.meta.name + ' — Weekly Status Report']));
    panel.appendChild(el('div', { class: 'report-meta' }, ['Status date: ' + state.project.meta.statusDate]));

    var kpis = state.calc.kpis;
    var kpiRow = el('div', { class: 'report-kpi-row' }, [
      el('div', { class: 'report-kpi' }, ['Actual: ' + pct(kpis.actualPct)]),
      el('div', { class: 'report-kpi' }, ['Plan: ' + pct(kpis.plannedPct)]),
      el('div', { class: 'report-kpi' }, ['Variance: ' + pct(kpis.variance)]),
    ]);
    panel.appendChild(kpiRow);

    var delta = latestSnapshotDelta(state);
    if (delta) {
      panel.appendChild(el('div', { class: 'report-meta' }, [
        'Since last snapshot (' + delta.takenAt + (delta.note ? ' — ' + delta.note : '') + '): ' +
        (delta.actualDeltaPct >= 0 ? '+' : '') + delta.actualDeltaPct + 'pp actual progress',
      ]));
    }

    panel.appendChild(el('h2', {}, ['Phase Progress']));
    panel.appendChild(buildPhaseTable(state));

    panel.appendChild(el('h2', {}, ['Delayed Items']));
    panel.appendChild(buildDelayedList(state));

    return panel;
  }

  function renderExecutiveReport(state) {
    var panel = el('div', { class: 'report-panel-inner' });
    panel.appendChild(el('h1', {}, [state.project.meta.name + ' — Executive Dashboard']));
    var kpis = state.calc.kpis;
    var kpiRow = el('div', { class: 'report-kpi-row' }, [
      ['Actual', pct(kpis.actualPct)], ['Plan', pct(kpis.plannedPct)],
      ['Delayed', String(kpis.delayedCount)], ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Milestones', kpis.milestonesComplete + '/' + kpis.milestonesTotal],
    ].map(function (pair) { return el('div', { class: 'report-kpi' }, [pair[0] + ': ' + pair[1]]); }));
    panel.appendChild(kpiRow);

    panel.appendChild(el('h2', {}, ['Phase RAG']));
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var roots = state.calc.children.get(null) || [];
    var ragList = el('ul', { class: 'report-list' });
    roots.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      ragList.appendChild(el('li', {}, [task.name + ': ' + c.status]));
    });
    panel.appendChild(ragList);

    panel.appendChild(el('h2', {}, ['Top Risks / Blocked']));
    var riskList = el('ul', { class: 'report-list' });
    var any = false;
    state.calc.order.forEach(function (id) {
      if ((state.calc.children.get(id) || []).length > 0) return;
      var c = state.calc.computed.get(id);
      if (c.status !== 'Delayed' && c.status !== 'Blocked') return;
      any = true;
      riskList.appendChild(el('li', {}, [byId.get(id).name + ': ' + c.status]));
    });
    if (!any) riskList.appendChild(el('li', {}, ['None']));
    panel.appendChild(riskList);

    return panel;
  }

  function renderSummaryReport(state) {
    var panel = el('div', { class: 'report-panel-inner' });
    panel.appendChild(el('h1', {}, [state.project.meta.name + ' — Management Summary']));
    panel.appendChild(el('div', { class: 'report-meta' }, ['Status date: ' + state.project.meta.statusDate]));

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var table = el('table', { class: 'report-table' });
    table.appendChild(el('tr', {}, ['WBS', 'Task', 'PIC', 'P-Start', 'P-Finish', '% Actual', 'Status'].map(function (h) { return el('th', {}, [h]); })));
    state.calc.order.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      table.appendChild(el('tr', {}, [
        el('td', {}, [c.wbs]), el('td', {}, [task.name]), el('td', {}, [task.pic || '']),
        el('td', {}, [c.plannedStart || '']), el('td', {}, [c.plannedFinish || '']),
        el('td', {}, [pct(c.actualPct)]), el('td', {}, [c.status]),
      ]));
    });
    panel.appendChild(table);
    return panel;
  }

  var TEMPLATES = { weekly: renderWeeklyReport, executive: renderExecutiveReport, summary: renderSummaryReport };

  function renderReport(state) {
    var panel = document.getElementById('report-panel');
    panel.innerHTML = '';
    var templateKey = document.getElementById('report-template-select').value;
    var renderFn = TEMPLATES[templateKey] || renderWeeklyReport;
    panel.appendChild(renderFn(state));
  }

  function collectAllStyles() {
    return Array.from(document.styleSheets).map(function (sheet) {
      try {
        return Array.from(sheet.cssRules).map(function (r) { return r.cssText; }).join('\n');
      } catch (e) {
        return '';
      }
    }).join('\n');
  }

  function panelToPngBlob(panelEl) {
    return new Promise(function (resolve, reject) {
      var rect = panelEl.getBoundingClientRect();
      var width = rect.width;
      var height = rect.height;
      var styleText = collectAllStyles();
      var xml = new XMLSerializer().serializeToString(panelEl);
      var svgData = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + styleText + '</style>' + xml + '</div>' +
        '</foreignObject></svg>';
      var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(svgBlob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        var ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null'));
        }, 'image/png');
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('failed to rasterize report panel'));
      };
      img.src = url;
    });
  }

  function copyPanelAsImage() {
    var panel = document.getElementById('report-panel').firstChild;
    if (!panel) return;
    panelToPngBlob(panel).then(function (blob) {
      return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }).catch(function (err) {
      window.alert('Copy as Image failed: ' + err.message);
    });
  }

  function copyPanelAsTable() {
    var table = document.querySelector('#report-panel table');
    if (!table) {
      window.alert('This report template has no table to copy.');
      return;
    }
    var html = table.outerHTML;
    var text = Array.from(table.querySelectorAll('tr')).map(function (tr) {
      return Array.from(tr.children).map(function (cell) { return cell.textContent; }).join('\t');
    }).join('\n');
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]).catch(function (err) {
      window.alert('Copy as Table failed: ' + err.message);
    });
  }

  function wireReports(state, onTemplateChanged) {
    document.getElementById('report-template-select').addEventListener('change', onTemplateChanged);
    document.getElementById('report-copy-image-button').addEventListener('click', copyPanelAsImage);
    document.getElementById('report-copy-table-button').addEventListener('click', copyPanelAsTable);
  }

  window.PP = window.PP || {};
  window.PP.renderReport = renderReport;
  window.PP.wireReports = wireReports;
})();
```

- [ ] **Step 5: Wire it into `app.js`**

Change `refresh` from:
```js
    PP.renderHolidays(state);
    if (markDirty) {
```
to:
```js
    PP.renderHolidays(state);
    PP.renderReport(state);
    if (markDirty) {
```

In `showApp(state)`, change:
```js
    PP.wireSettings(state, function () { refresh(state, true); });
    PP.wireHolidays(state, function () { refresh(state, true); });
```
to:
```js
    PP.wireSettings(state, function () { refresh(state, true); });
    PP.wireHolidays(state, function () { refresh(state, true); });
    PP.wireReports(state, function () { PP.renderReport(state); });
```
(Switching the report template dropdown doesn't need a full recalc — it just re-renders from the already-current `state.calc`.)

- [ ] **Step 6: Syntax-check, build, confirm nothing regressed**

Run:
```bash
cd "project-planner"
node --check src/js/ui/reports.js
node --check src/js/ui/app.js
python3 build.py
grep -c "function renderReport" dist/ProjectPlanner.html
grep -c "@media print" dist/ProjectPlanner.html
node --test
```
Expected: syntax clean; build succeeds; both greps print `1`; all 92 tests pass (no new Node tests — verified in Task 4).

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add src/index.html src/css/layout.css src/css/print.css src/js/ui/reports.js src/js/ui/app.js
git commit -m "Add Reports view: 3 templates with Copy-as-Image/Copy-as-Table, and print CSS"
```

---

### Task 4: End-to-end browser verification (controller-run, not a fresh subagent)

Same pattern as every prior plan's final task: the controller drives a real browser via the Playwright tools already in this session. This task specifically also needs the browser's Clipboard API (`navigator.clipboard.write`), which requires the action to originate from a genuine user-gesture-equivalent input event — use the Playwright browser tools' click actions (real dispatched input events) for the two Copy buttons, not a JS-evaluated `.click()` call, since script-triggered clicks are less reliable for satisfying the Clipboard API's activation requirement.

**Files:** none (verification only).

- [ ] **Step 1: Build and seed**

Run `cd "project-planner" && python3 build.py`. Temporarily edit `dist/ProjectPlanner.html`'s `#project-data` script content (only in the built artifact, never `src/`) to include: a phase with 2-3 leaf children (mixed statuses — at least one Complete, one Delayed), a `predecessors` link between two of them, at least one holiday already in `holidays`, and at least one entry in `picList`. Serve via `cd dist && python3 -m http.server <port>` (`file://` is blocked by this session's sandbox) and navigate to it.

- [ ] **Step 2: Verify Settings — theme toggle**

Complete the name-picker flow, click the "Settings" tab, click "Dark". Confirm via `getComputedStyle` (not just the DOM attribute — this project has hit a case before where an attribute was set correctly but the visual/computed result didn't match) that the page background actually changes to the dark theme's surface color. Click "Light" and confirm it reverts.

- [ ] **Step 3: Verify Settings — rename, PIC editor, audit log**

Type a new name into the project-rename field and blur/change it; switch to another tab and back to confirm the header's project name updated. Add a new PIC via the input+button; confirm it appears in the list and also now appears as an option in the Plan view's PIC filter dropdown (cross-view consistency, since `renderPicFilter` derives from the same `picList`). Remove it and confirm both places update. Make an edit to a task on the Plan tab (e.g. change `% Actual`), then check the Settings tab's Audit Log table shows a new row for that field change.

- [ ] **Step 4: Verify Settings — New Project reset**

Click "New Project (blank)", accept the confirm dialog, provide a name via the prompt dialog. Confirm: the Plan view now shows zero tasks; the KPI header shows all-zero values; the project name in the header matches what was typed. (Use the browser tools' dialog-handling capability to accept both the `confirm` and the `prompt`.)

- [ ] **Step 5: Verify Holidays — add, impact banner, bulk import, calendar, recalc effect**

Reload the seeded page fresh (re-seed if the New Project reset from Step 4 clobbered it in this same session) and go to the Holidays tab. Type a date that falls inside one of the seeded tasks' `plannedStart`/`plannedFinish` range into the "new holiday date" field and confirm the impact banner shows a count ≥ 1. Add it with a label, confirm it appears in the table and the calendar strip (that date's cell should now have the holiday styling). Use the bulk-paste textarea with 2 lines (`YYYY-MM-DD<TAB>Label`), one valid and one malformed, click Import, and confirm the alert reports 1 imported / 1 skipped. Switch to the Plan tab and confirm the task whose range includes the newly-added holiday now shows a duration one working day shorter than before the holiday was added (proving the holiday change triggered a real `recalc()`, not just a UI update). Delete a holiday and confirm the table/calendar update and the task's duration reverts.

- [ ] **Step 6: Verify Reports — all three templates render, copy-as-table works**

Go to the Reports tab. For each of the three template options, select it and confirm `#report-panel` renders distinct, non-empty content matching that template's sections (Weekly: KPI row + phase table + delayed list; Executive: KPI row + RAG list + risks list; Summary: full task table with WBS numbers). Click "Copy as Table" on the Summary template (guaranteed to have a `<table>`) using a real Playwright click (not JS `.click()`); confirm no `alert` dialog appeared (the code only alerts on failure) — if the browser tools can also read clipboard contents, additionally verify the clipboard has `text/html` content containing a `<table`.

- [ ] **Step 7: Verify Reports — copy-as-image**

Click "Copy as Image" using a real Playwright click. Confirm no `alert` dialog appeared. If the browser tools support reading clipboard image content, verify a `image/png` clipboard entry exists with non-zero byte length. If clipboard-read verification isn't practical in this session's tooling, at minimum confirm the click completes without a thrown/console error and without the failure `alert`, and note in your report that full pixel-level verification of the rasterized image wasn't performed (this is an accepted, disclosed limitation — the underlying `foreignObject`-to-canvas technique is a standard, well-understood browser capability, not custom risk logic).

- [ ] **Step 8: Check console errors and Node suite**

Confirm no uncaught JS errors were logged to the browser console during any of the above (check via the browser tools' console-message capability, across the whole session). Then run `cd "project-planner" && node --test` one more time and confirm all 92 tests still pass.

- [ ] **Step 9: Record the result**

If every check in Steps 2–8 passes, this plan is complete — no commit needed for this task (verification only). If any check fails, that is a real bug in Task 1, 2, or 3's code: fix it in the corresponding file, re-run `python3 build.py`, and repeat this task's verification from the relevant step before considering the plan done.

---

## Plan Complete

At the end of this plan: ProjectPlanner has all eight tabs the spec calls for (Plan, Gantt, S-Curve, Dashboard, Snapshots, Settings, Holidays, Reports) — every feature in the original design spec now exists, all built on the same six Foundation engines, the same `state`/`renderX`/`wireX` conventions established across four UI phases, and zero external dependencies anywhere in the shipped artifact.

**Known limitations, disclosed rather than silently accepted:**
- Cross-browser QA is Chromium-only in this project's verification environment (no Safari/Firefox available to the controller) — the CSS and JS used are all standard, broadly-supported APIs (`ClipboardItem`, `foreignObject`, `createElementNS`, CSS custom properties), but a genuine multi-browser pass has not been performed. Safari in particular has historically had the pickiest `ClipboardItem`/`navigator.clipboard.write` behavior of the major browsers and is the one most worth a manual check before relying on Copy-as-Image/Table in production use.
- Print output has not been visually verified in an actual print preview (only that `print.css`'s media rule and target selectors exist in the built file) — worth a manual "Print → Save as PDF" check in a real browser before relying on it for a real report handoff.
- Copy-as-Image's `foreignObject`-based rasterization is a real, standard technique but can occasionally miss very specific CSS features (some browsers are stricter about which stylesheets apply inside a serialized `foreignObject`) — if a pasted image ever looks visually wrong in a specific browser, that's the first place to look, not a sign of a logic bug in `panelToPngBlob` itself.
