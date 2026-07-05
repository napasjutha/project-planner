# Foundation Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the build pipeline and the six pure calculation engines (schedule, status, calc, deps, store, snapshot) that power ProjectPlanner.html — no UI yet. Everything in this plan is testable under plain Node with zero installed dependencies.

**Architecture:** Each engine is a single `src/js/*.js` file wrapped in a tiny UMD shim so the exact same file runs under Node (`module.exports`) during tests and, unmodified, inside the browser once concatenated (attaches to `globalThis.PP`). `build.py` concatenates `src/css/*` and `src/js/*` (explicit, dependency-ordered file lists) into `src/index.html`'s markers to produce `dist/ProjectPlanner.html`. Dates are always `"YYYY-MM-DD"` strings; internal date arithmetic uses UTC millis via `Date.UTC` to avoid timezone bugs. `recalc()` never mutates `project.tasks` — it returns a separate computed structure; only `store.js` mutation methods change project state.

**Tech Stack:** Plain JavaScript (ES6 classes/functions), Python 3 (build script only), Node.js built-in `node:test` + `node:assert/strict` test runner — zero npm packages.

## Global Constraints

- Zero external dependencies, runtime or dev. No `npm install`, no bundler, no test framework package. Use Node's built-in `node:test`.
- Every `src/js/*.js` engine file uses this exact UMD wrapper (fill in the body and the returned object per task):
  ```js
  (function (root, factory) {
    if (typeof module === 'object' && module.exports) {
      module.exports = factory();
    } else {
      root.PP = root.PP || {};
      Object.assign(root.PP, factory());
    }
  })(globalThis, function () {
    'use strict';

    // ...engine code...

    return { /* exported names */ };
  });
  ```
- Dates are ISO `"YYYY-MM-DD"` strings everywhere in the data model and engine APIs. Never `Date` objects at module boundaries.
- No code comments except where a genuinely non-obvious rule needs explanation (e.g. citing the Excel formula a rule replicates). Never explain what code obviously does.
- File paths are exact — every task states `Create:` paths relative to `project-planner/`.
- This is a reusable planning tool for any project type/scale (implementation, PMO, change management). Nothing in engine code may hardcode phase names, task counts, company names, or the SDS/Salesforce example. Real workbook numbers are used only inside `tests/fixtures/` as verified truth-table data — never as shipped default content.

---

### Task 1: Build pipeline scaffold

**Files:**
- Create: `project-planner/build.py`
- Create: `project-planner/src/index.html`
- Create: `project-planner/package.json`
- Test: `project-planner/tests/build.test.js`

**Interfaces:**
- Produces: `build.py` — a script, run as `python3 build.py` from `project-planner/`, that reads `src/index.html`, inlines `src/css/*.css` (order: `theme.css`, `layout.css`, `print.css`, skipping any that don't yet exist) at the `/*__CSS__*/` marker and `src/js/*.js` (order: `schedule.js`, `status.js`, `calc.js`, `deps.js`, `store.js`, `snapshot.js`, skipping any that don't yet exist) at the `/*__JS__*/` marker, and writes `dist/ProjectPlanner.html`.
- Consumes: nothing from other tasks (this is the first task).

- [ ] **Step 1: Write the failing build test**

Create `project-planner/tests/build.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('build.py produces dist/ProjectPlanner.html with embedded data block', () => {
  execSync('python3 build.py', { cwd: ROOT });
  const outPath = path.join(ROOT, 'dist', 'ProjectPlanner.html');
  assert.ok(fs.existsSync(outPath), 'dist/ProjectPlanner.html should exist');
  const html = fs.readFileSync(outPath, 'utf8');
  assert.match(html, /<script type="application\/json" id="project-data">/);
  assert.doesNotMatch(html, /__CSS__|__JS__/);
  assert.match(html, /<title>ProjectPlanner<\/title>/);
});

test('build.py output embeds a valid, blank starter project', () => {
  const outPath = path.join(ROOT, 'dist', 'ProjectPlanner.html');
  const html = fs.readFileSync(outPath, 'utf8');
  const match = html.match(/<script type="application\/json" id="project-data">([\s\S]*?)<\/script>/);
  assert.ok(match, 'project-data block should be present');
  const data = JSON.parse(match[1]);
  assert.deepEqual(data.tasks, []);
  assert.deepEqual(data.holidays, []);
  assert.equal(typeof data.meta.id, 'string');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/build.test.js`
Expected: FAIL — `build.py` does not exist yet (`ENOENT` or non-zero exit from `execSync`).

- [ ] **Step 3: Write `build.py`**

Create `project-planner/build.py`:

```python
#!/usr/bin/env python3
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

CSS_ORDER = ["theme.css", "layout.css", "print.css"]
JS_ORDER = [
    "schedule.js",
    "status.js",
    "calc.js",
    "deps.js",
    "store.js",
    "snapshot.js",
]


def read(path):
    return path.read_text(encoding="utf-8")


def build():
    shell = read(SRC / "index.html")

    css_blocks = [read(SRC / "css" / name) for name in CSS_ORDER if (SRC / "css" / name).exists()]
    js_blocks = [read(SRC / "js" / name) for name in JS_ORDER if (SRC / "js" / name).exists()]

    css = "\n".join(css_blocks)
    js = "\n".join(js_blocks)

    if "/*__CSS__*/" not in shell:
        raise ValueError("src/index.html missing /*__CSS__*/ marker")
    if "/*__JS__*/" not in shell:
        raise ValueError("src/index.html missing /*__JS__*/ marker")

    output = shell.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)

    DIST.mkdir(exist_ok=True)
    out_path = DIST / "ProjectPlanner.html"
    out_path.write_text(output, encoding="utf-8")
    return out_path


if __name__ == "__main__":
    result = build()
    print(f"Built {result}")
```

- [ ] **Step 4: Write `src/index.html` shell**

Create `project-planner/src/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ProjectPlanner</title>
<style>
/*__CSS__*/
</style>
</head>
<body>
<div id="app">Loading…</div>
<script type="application/json" id="project-data">{"meta":{"id":"seed","name":"New Project","statusDate":"2026-01-01","revision":0,"savedBy":null,"savedAt":null,"createdAt":"2026-01-01T00:00:00.000Z"},"tasks":[],"holidays":[],"picList":[],"snapshots":[],"auditLog":[],"settings":{"theme":"kpmg-light","ganttZoom":"week"}}</script>
<script>
/*__JS__*/
</script>
</body>
</html>
```

- [ ] **Step 5: Add `package.json` for a convenience test script**

Create `project-planner/package.json`:

```json
{
  "name": "project-planner",
  "version": "0.1.0",
  "private": true,
  "description": "Single-file HTML project planning application",
  "scripts": {
    "build": "python3 build.py",
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/build.test.js`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
cd "project-planner"
git add build.py src/index.html package.json tests/build.test.js
git commit -m "Add build pipeline scaffold producing dist/ProjectPlanner.html"
```

---

### Task 2: Schedule engine (`schedule.js`)

**Files:**
- Create: `project-planner/src/js/schedule.js`
- Create: `project-planner/tests/fixtures/holidays-2024.js`
- Test: `project-planner/tests/schedule.test.js`

**Interfaces:**
- Consumes: nothing (first engine, no dependencies).
- Produces (used by `calc.js`, `deps.js` in later tasks):
  - `networkdays(startISO, endISO, holidayDates = [])` → integer. Inclusive workday count between two `"YYYY-MM-DD"` strings, excluding Sat/Sun and any date string present in `holidayDates`. Negative if `endISO < startISO`. Returns `0` if either argument is falsy.
  - `addWorkdays(startISO, n, holidayDates = [])` → `"YYYY-MM-DD"` string. The date reached by stepping `n` workdays forward (or backward if `n < 0`) from `startISO`, skipping weekends/holidays. `startISO` itself is never counted as one of the `n` steps.
  - `remainingWorkdays(statusISO, finishISO, holidayDates = [])` → integer ≥ 0. `networkdays(statusISO, finishISO, holidayDates)` unless `statusISO >= finishISO`, in which case `0`.
  - `parseISO(dateISO)` → UTC millis (`number`). `toISO(utcMillis)` → `"YYYY-MM-DD"` string. `isWeekend(utcMillis)` → boolean. These three are exposed for reuse in `calc.js`.

- [ ] **Step 1: Write the holiday fixture**

Create `project-planner/tests/fixtures/holidays-2024.js`:

```js
module.exports = [
  '2024-01-01', '2024-02-26', '2024-04-08', '2024-04-15', '2024-04-16',
  '2024-05-01', '2024-05-22', '2024-06-03', '2024-07-22', '2024-07-29',
  '2024-08-12', '2024-10-14', '2024-10-23', '2024-12-05', '2024-12-30', '2024-12-31',
];
```

- [ ] **Step 2: Write the failing test**

Create `project-planner/tests/schedule.test.js`. Every expected number below is taken directly from the reference workbook's computed (not formula) values, cross-checked by hand — see the comment on each case:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { networkdays, addWorkdays, remainingWorkdays } = require('../src/js/schedule.js');
const HOLIDAYS_2024 = require('./fixtures/holidays-2024.js');

test('networkdays: same-week span, no holiday (workbook row 8: 2024-01-15 Mon to 2024-01-16 Tue)', () => {
  assert.equal(networkdays('2024-01-15', '2024-01-16', []), 2);
});

test('networkdays: spans one weekend, no holiday (workbook row 9: 2024-01-16 to 2024-01-26)', () => {
  assert.equal(networkdays('2024-01-16', '2024-01-26', []), 9);
});

test('networkdays: full workweek (workbook row 10: 2024-01-22 Mon to 2024-01-26 Fri)', () => {
  assert.equal(networkdays('2024-01-22', '2024-01-26', []), 5);
});

test('networkdays: single day (workbook row 11: 2024-02-21 to 2024-02-21)', () => {
  assert.equal(networkdays('2024-02-21', '2024-02-21', []), 1);
});

test('networkdays: excludes a holiday that falls inside the range (workbook row 17: 2024-02-23 to 2024-03-04, holiday 2024-02-26 excluded -> 6, not 7)', () => {
  assert.equal(networkdays('2024-02-23', '2024-03-04', HOLIDAYS_2024), 6);
});

test('networkdays: same range without the holiday list counts the holiday as a workday -> 7', () => {
  assert.equal(networkdays('2024-02-23', '2024-03-04', []), 7);
});

test('networkdays: reversed order returns a negative count', () => {
  assert.equal(networkdays('2024-01-16', '2024-01-15', []), -2);
});

test('networkdays: missing arguments return 0', () => {
  assert.equal(networkdays(null, '2024-01-01', []), 0);
  assert.equal(networkdays('2024-01-01', null, []), 0);
});

test('addWorkdays: 5 workdays from 2024-02-23 skipping the 2024-02-26 holiday lands on 2024-03-04', () => {
  assert.equal(addWorkdays('2024-02-23', 5, HOLIDAYS_2024), '2024-03-04');
});

test('addWorkdays: 0 workdays returns the same date', () => {
  assert.equal(addWorkdays('2024-01-15', 0, []), '2024-01-15');
});

test('remainingWorkdays: status date before finish counts the working days between (2024-03-01 Fri to 2024-03-04 Mon)', () => {
  assert.equal(remainingWorkdays('2024-03-01', '2024-03-04', []), 2);
});

test('remainingWorkdays: status date equal to finish returns 0', () => {
  assert.equal(remainingWorkdays('2024-03-04', '2024-03-04', []), 0);
});

test('remainingWorkdays: status date past finish returns 0', () => {
  assert.equal(remainingWorkdays('2024-03-05', '2024-03-04', []), 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/schedule.test.js`
Expected: FAIL — `Cannot find module '../src/js/schedule.js'`

- [ ] **Step 4: Write `schedule.js`**

Create `project-planner/src/js/schedule.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const DAY_MS = 86400000;

  function parseISO(dateISO) {
    const [y, m, d] = dateISO.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function toISO(utcMillis) {
    const d = new Date(utcMillis);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isWeekend(utcMillis) {
    const day = new Date(utcMillis).getUTCDay();
    return day === 0 || day === 6;
  }

  function isWorkday(utcMillis, holidaySet) {
    return !isWeekend(utcMillis) && !holidaySet.has(toISO(utcMillis));
  }

  function networkdays(startISO, endISO, holidayDates) {
    if (!startISO || !endISO) return 0;
    const holidaySet = new Set(holidayDates || []);
    let start = parseISO(startISO);
    let end = parseISO(endISO);
    let sign = 1;
    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
      sign = -1;
    }
    let count = 0;
    for (let t = start; t <= end; t += DAY_MS) {
      if (isWorkday(t, holidaySet)) count++;
    }
    return count * sign;
  }

  function addWorkdays(startISO, n, holidayDates) {
    const holidaySet = new Set(holidayDates || []);
    let t = parseISO(startISO);
    const step = n >= 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      t += step * DAY_MS;
      if (isWorkday(t, holidaySet)) remaining--;
    }
    return toISO(t);
  }

  function remainingWorkdays(statusISO, finishISO, holidayDates) {
    if (!statusISO || !finishISO) return 0;
    if (parseISO(statusISO) >= parseISO(finishISO)) return 0;
    return networkdays(statusISO, finishISO, holidayDates);
  }

  return { networkdays, addWorkdays, remainingWorkdays, parseISO, toISO, isWeekend };
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/schedule.test.js`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/js/schedule.js tests/schedule.test.js tests/fixtures/holidays-2024.js
git commit -m "Add schedule engine (networkdays/addWorkdays) with workbook-verified truth table"
```

---

### Task 3: Status engine (`status.js`)

**Files:**
- Create: `project-planner/src/js/status.js`
- Test: `project-planner/tests/status.test.js`

**Interfaces:**
- Consumes: nothing (dates compared as ISO strings, no dependency on `schedule.js`).
- Produces (used by `calc.js` in Task 5):
  - `STATUS` — object of string constants: `COMPLETE`, `NOT_START`, `IN_PROGRESS`, `DELAYED`, `BLOCKED`, `CANCELLED`.
  - `deriveStatus({ actualPct, plannedStart, plannedFinish, statusDate, statusOverride })` → one of the `STATUS` values. Rule, replicating the workbook's column L formula `=IF(M=100%,"Complete",IF(statusDate<start,"Not Start",IF(AND(statusDate>=start,statusDate<=finish),"In Progress","Delay")))`, extended with manual overrides checked first:
    1. `statusOverride === 'Blocked'` → `BLOCKED`
    2. `statusOverride === 'Cancelled'` → `CANCELLED`
    3. `actualPct >= 1` → `COMPLETE`
    4. no `plannedStart`, or `statusDate < plannedStart` → `NOT_START`
    5. `plannedFinish` exists and `plannedStart <= statusDate <= plannedFinish` → `IN_PROGRESS`
    6. otherwise → `DELAYED`

- [ ] **Step 1: Write the failing test**

Create `project-planner/tests/status.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, deriveStatus } = require('../src/js/status.js');

test('Blocked override wins regardless of dates/progress', () => {
  assert.equal(deriveStatus({
    actualPct: 1, plannedStart: '2024-01-01', plannedFinish: '2024-01-05',
    statusDate: '2024-01-10', statusOverride: 'Blocked',
  }), STATUS.BLOCKED);
});

test('Cancelled override wins regardless of dates/progress', () => {
  assert.equal(deriveStatus({
    actualPct: 0, plannedStart: '2024-01-01', plannedFinish: '2024-01-05',
    statusDate: '2024-01-01', statusOverride: 'Cancelled',
  }), STATUS.CANCELLED);
});

test('actualPct 100% is Complete even if status date is before finish (workbook rows 8-19 pattern)', () => {
  assert.equal(deriveStatus({
    actualPct: 1, plannedStart: '2024-01-15', plannedFinish: '2024-01-16',
    statusDate: '2024-01-15', statusOverride: null,
  }), STATUS.COMPLETE);
});

test('status date before planned start is Not Start', () => {
  assert.equal(deriveStatus({
    actualPct: 0.5, plannedStart: '2024-02-01', plannedFinish: '2024-02-20',
    statusDate: '2024-01-01', statusOverride: null,
  }), STATUS.NOT_START);
});

test('status date within [start, finish] is In Progress', () => {
  assert.equal(deriveStatus({
    actualPct: 0.5, plannedStart: '2024-02-01', plannedFinish: '2024-02-20',
    statusDate: '2024-02-10', statusOverride: null,
  }), STATUS.IN_PROGRESS);
});

test('status date past finish with actualPct < 100% is Delayed', () => {
  assert.equal(deriveStatus({
    actualPct: 0.5, plannedStart: '2024-02-01', plannedFinish: '2024-02-20',
    statusDate: '2024-03-01', statusOverride: null,
  }), STATUS.DELAYED);
});

test('missing plannedStart is Not Start', () => {
  assert.equal(deriveStatus({
    actualPct: 0, plannedStart: null, plannedFinish: null,
    statusDate: '2024-01-01', statusOverride: null,
  }), STATUS.NOT_START);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/status.test.js`
Expected: FAIL — `Cannot find module '../src/js/status.js'`

- [ ] **Step 3: Write `status.js`**

Create `project-planner/src/js/status.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const STATUS = {
    COMPLETE: 'Complete',
    NOT_START: 'Not Start',
    IN_PROGRESS: 'In Progress',
    DELAYED: 'Delayed',
    BLOCKED: 'Blocked',
    CANCELLED: 'Cancelled',
  };

  function deriveStatus({ actualPct, plannedStart, plannedFinish, statusDate, statusOverride }) {
    if (statusOverride === 'Blocked') return STATUS.BLOCKED;
    if (statusOverride === 'Cancelled') return STATUS.CANCELLED;
    if (actualPct >= 1) return STATUS.COMPLETE;
    if (!plannedStart || statusDate < plannedStart) return STATUS.NOT_START;
    if (plannedFinish && statusDate >= plannedStart && statusDate <= plannedFinish) return STATUS.IN_PROGRESS;
    return STATUS.DELAYED;
  }

  return { STATUS, deriveStatus };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/status.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/status.js tests/status.test.js
git commit -m "Add status derivation engine matching workbook column L logic"
```

---

### Task 4: Dependency engine (`deps.js`)

**Files:**
- Create: `project-planner/src/js/deps.js`
- Test: `project-planner/tests/deps.test.js`

**Interfaces:**
- Consumes: `networkdays`, `addWorkdays` from `src/js/schedule.js` (Task 2).
- Produces (used by the Gantt UI plan, and by Task 8's integration test):
  - `wouldCreateCycle(tasks, taskId, newPredecessorId)` → boolean. `tasks` is an array of `{ id, predecessors: string[] }`-shaped objects (full `Task` objects also satisfy this). Returns `true` if adding `newPredecessorId` as a predecessor of `taskId` would create a cycle.
  - `forwardPass(tasks, movedTaskId, holidayDates = [])` → new array of task objects (shallow-cloned, same shape as input) with any successor whose `plannedStart` now overlaps `movedTaskId`'s new `plannedFinish` pushed forward (preserving each successor's own duration), recursively through the dependency chain. Does not mutate the input array or its objects.

- [ ] **Step 1: Write the failing test**

Create `project-planner/tests/deps.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wouldCreateCycle, forwardPass } = require('../src/js/deps.js');

function task(id, parentId, plannedStart, plannedFinish, predecessors = []) {
  return { id, parentId, plannedStart, plannedFinish, predecessors };
}

test('wouldCreateCycle: direct cycle detected (A depends on B, adding B depends on A)', () => {
  const tasks = [
    task('A', null, '2024-01-01', '2024-01-02', ['B']),
    task('B', null, '2024-01-03', '2024-01-04', []),
  ];
  assert.equal(wouldCreateCycle(tasks, 'B', 'A'), true);
});

test('wouldCreateCycle: transitive cycle detected (A->B->C, adding C->A)', () => {
  const tasks = [
    task('A', null, '2024-01-01', '2024-01-02', ['B']),
    task('B', null, '2024-01-03', '2024-01-04', ['C']),
    task('C', null, '2024-01-05', '2024-01-06', []),
  ];
  assert.equal(wouldCreateCycle(tasks, 'C', 'A'), true);
});

test('wouldCreateCycle: unrelated link is not a cycle', () => {
  const tasks = [
    task('A', null, '2024-01-01', '2024-01-02', []),
    task('B', null, '2024-01-03', '2024-01-04', []),
  ];
  assert.equal(wouldCreateCycle(tasks, 'B', 'A'), false);
});

test('forwardPass: successor starting before predecessor finishes gets pushed to the next workday', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
  ];
  const result = forwardPass(tasks, 'A', []);
  const b = result.find(t => t.id === 'B');
  assert.equal(b.plannedStart, '2024-01-17');
  assert.equal(b.plannedFinish, '2024-01-18');
});

test('forwardPass: successor already starting after predecessor finishes is untouched', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-02-01', '2024-02-02', ['A']),
  ];
  const result = forwardPass(tasks, 'A', []);
  const b = result.find(t => t.id === 'B');
  assert.equal(b.plannedStart, '2024-02-01');
  assert.equal(b.plannedFinish, '2024-02-02');
});

test('forwardPass: chain shifts recursively (A pushes B pushes C)', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-17', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
    task('C', null, '2024-01-17', '2024-01-18', ['B']),
  ];
  const result = forwardPass(tasks, 'A', []);
  const b = result.find(t => t.id === 'B');
  const c = result.find(t => t.id === 'C');
  assert.equal(b.plannedStart, '2024-01-18');
  assert.equal(b.plannedFinish, '2024-01-19');
  assert.equal(c.plannedStart, '2024-01-22');
});

test('forwardPass does not mutate the input array', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
  ];
  forwardPass(tasks, 'A', []);
  assert.equal(tasks.find(t => t.id === 'B').plannedStart, '2024-01-15');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/deps.test.js`
Expected: FAIL — `Cannot find module '../src/js/deps.js'`

- [ ] **Step 3: Write `deps.js`**

Create `project-planner/src/js/deps.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.PP);
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory(root.PP));
  }
})(globalThis, function (PP) {
  'use strict';

  const schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : PP;
  const { networkdays, addWorkdays } = schedule;

  function wouldCreateCycle(tasks, taskId, newPredecessorId) {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const stack = [newPredecessorId];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (cur === taskId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const t = byId.get(cur);
      if (t && t.predecessors) stack.push(...t.predecessors);
    }
    return false;
  }

  function forwardPass(tasks, movedTaskId, holidayDates) {
    const byId = new Map(tasks.map(t => [t.id, { ...t }]));
    const queue = [movedTaskId];
    const visited = new Set();
    while (queue.length) {
      const curId = queue.shift();
      const cur = byId.get(curId);
      for (const t of byId.values()) {
        if (t.predecessors && t.predecessors.includes(curId)) {
          const minStart = addWorkdays(cur.plannedFinish, 1, holidayDates);
          if (!t.plannedStart || t.plannedStart < minStart) {
            const duration = networkdays(t.plannedStart, t.plannedFinish, holidayDates);
            const shift = duration > 1 ? duration - 1 : 0;
            t.plannedStart = minStart;
            t.plannedFinish = shift > 0 ? addWorkdays(minStart, shift, holidayDates) : minStart;
            if (!visited.has(t.id)) {
              visited.add(t.id);
              queue.push(t.id);
            }
          }
        }
      }
    }
    return Array.from(byId.values());
  }

  return { wouldCreateCycle, forwardPass };
});
```

Note: the UMD wrapper here differs slightly from Task 2/3 because `deps.js` depends on `schedule.js`. In Node it `require`s it directly; in the browser build both files are concatenated in `JS_ORDER` (`schedule.js` before `deps.js`), so `PP.networkdays`/`PP.addWorkdays` already exist on `globalThis.PP` by the time this factory runs.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/deps.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/deps.js tests/deps.test.js
git commit -m "Add dependency engine: cycle detection and finish-to-start forward pass"
```

---

### Task 5: Calculation engine (`calc.js`)

**Files:**
- Create: `project-planner/src/js/calc.js`
- Create: `project-planner/tests/fixtures/vision-phase.js`
- Test: `project-planner/tests/calc.test.js`

**Interfaces:**
- Consumes:
  - `networkdays`, `remainingWorkdays`, `parseISO`, `toISO` from `src/js/schedule.js` (Task 2)
  - `deriveStatus` from `src/js/status.js` (Task 3)
- Produces (used by `snapshot.js` in Task 7, by Task 8's integration test, and by every later UI plan):
  - `buildTree(tasks)` → `{ byId: Map<id, Task>, children: Map<parentId|null, id[]>, order: id[], depth: Map<id, number>, wbs: Map<id, string> }`. `order` is DFS pre-order; `wbs` is dotted numbering (`"1"`, `"1.2"`, `"3.2.4"`) computed from sibling position, 1-indexed.
  - `planPctToDate(plannedStart, plannedFinish, atDate, duration, holidayDates)` → number in `[0, 1]`.
  - `actualPctAt(task, atDate)` → number in `[0, 1]`. `task` needs `{ actualStart, actualFinish, actualPct }`.
  - `computeScurve(leaves, overall, statusDate, holidayDates)` → `Array<{ weekEndDate, plannedCum, actualCum }>`. `leaves` is an array of merged task+computed objects each needing `{ weight, plannedStart, plannedFinish, duration, actualStart, actualFinish, actualPct }`.
  - `recalc(project)` → `{ computed: Map<id, TaskComputed>, order: id[], children: Map, wbs: Map, overall: OverallComputed, kpis: KpiSummary, scurve: ScurvePoint[] }` where:
    - `TaskComputed = { id, wbs, depth, isLeaf, plannedStart, plannedFinish, actualStart, actualFinish, duration, weight, plannedPctToDate, actualPct, status, isMilestone }`
    - `OverallComputed = { plannedStart, plannedFinish, duration, weight, plannedPctToDate, actualPct, status }`
    - `KpiSummary = { actualPct, plannedPct, variance, delayedCount, completeCount, totalCount, milestonesTotal, milestonesComplete, remainingWorkdays }`
    - `project` must have `{ tasks: Task[], holidays: {date}[], meta: { statusDate } }`. `recalc` never mutates `project.tasks`.

- [ ] **Step 1: Write the fixture**

Create `project-planner/tests/fixtures/vision-phase.js`. This is 12 real leaf tasks taken verbatim from the reference workbook (`SFDC_Detailed plan (V4.0)`, rows 8–19) — used here purely as a truth-table fixture to verify the engine, not as shipped product content:

```js
function leaf(id, name, pic, plannedStart, plannedFinish, actualPct) {
  return {
    id, parentId: 'phase-1', order: Number(id.split('-')[1]),
    name, pic, deliverable: '', jira: '', remarks: '',
    plannedStart, plannedFinish, actualStart: plannedStart, actualFinish: plannedFinish,
    actualPct, weightOverride: null, milestone: false, statusOverride: null,
    predecessors: [], collapsed: false,
  };
}

const phase = {
  id: 'phase-1', parentId: null, order: 0,
  name: 'Vision & Validate', pic: '', deliverable: '', jira: '', remarks: '',
  plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null,
  actualPct: 0, weightOverride: null, milestone: false, statusOverride: null,
  predecessors: [], collapsed: false,
};

const tasks = [
  phase,
  leaf('t-1', 'Request related BP document', 'KPMG_BA', '2024-01-15', '2024-01-16', 1),
  leaf('t-2', 'Review As-Is BP document from SAP', 'KPMG_BA', '2024-01-16', '2024-01-26', 1),
  leaf('t-3', 'Prepare project plan and organization', 'KPMG_BA', '2024-01-22', '2024-01-26', 1),
  leaf('t-4', 'Project plan approval and signoff', 'KPMG_BA', '2024-02-21', '2024-02-21', 1),
  leaf('t-5', 'Field service design thinking workshop', 'KPMG_BA', '2024-01-25', '2024-01-25', 1),
  leaf('t-6', 'Finalize Kick-off deck', 'KPMG_PM', '2024-01-29', '2024-01-31', 1),
  leaf('t-7', 'Initial 1st draft customer journey', 'KPMG_BA', '2024-02-15', '2024-02-23', 1),
  leaf('t-8', 'Confirm kick-off agenda', 'KPMG_BA', '2024-01-29', '2024-01-31', 1),
  leaf('t-9', 'Conduct kick-off meeting', 'KPMG_BA', '2024-02-02', '2024-02-02', 1),
  leaf('t-10', 'Review customer journey workshop', 'KPMG_BA', '2024-02-23', '2024-03-04', 1),
  leaf('t-11', 'Confirm customer journey', 'KPMG_BA', '2024-02-27', '2024-03-04', 1),
  leaf('t-12', 'Confirm customer journey document submission', 'KPMG_BA', '2024-03-04', '2024-03-04', 1),
];

// Durations verified against the workbook's computed column I (NETWORKDAYS with
// 2024 holidays applied): 2, 9, 5, 1, 1, 3, 7, 3, 1, 6, 5, 1 -- sum = 45.
const EXPECTED_DURATIONS = { 't-1': 2, 't-2': 9, 't-3': 5, 't-4': 1, 't-5': 1, 't-6': 3, 't-7': 7, 't-8': 3, 't-9': 1, 't-10': 6, 't-11': 5, 't-12': 1 };
const TOTAL_DURATION = 45;

module.exports = { tasks, phase, EXPECTED_DURATIONS, TOTAL_DURATION };
```

- [ ] **Step 2: Write the failing test**

Create `project-planner/tests/calc.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc, buildTree, planPctToDate } = require('../src/js/calc.js');
const HOLIDAYS_2024 = require('./fixtures/holidays-2024.js');
const { tasks, EXPECTED_DURATIONS, TOTAL_DURATION } = require('./fixtures/vision-phase.js');

function project(overrides = {}) {
  return {
    meta: { statusDate: '2024-03-04' },
    tasks,
    holidays: HOLIDAYS_2024.map(date => ({ date })),
    ...overrides,
  };
}

test('buildTree assigns dotted WBS numbers by sibling order', () => {
  const { wbs, depth } = buildTree(tasks);
  assert.equal(wbs.get('phase-1'), '1');
  assert.equal(wbs.get('t-1'), '1.1');
  assert.equal(wbs.get('t-12'), '1.12');
  assert.equal(depth.get('phase-1'), 0);
  assert.equal(depth.get('t-1'), 1);
});

test('planPctToDate is 1 once the status date reaches the planned finish', () => {
  assert.equal(planPctToDate('2024-01-01', '2024-01-10', '2024-01-10', 8, []), 1);
  assert.equal(planPctToDate('2024-01-01', '2024-01-10', '2024-02-01', 8, []), 1);
});

test('planPctToDate is 0 before the planned start', () => {
  assert.equal(planPctToDate('2024-01-10', '2024-01-20', '2024-01-01', 8, []), 0);
});

test('recalc: each leaf duration matches the workbook truth table', () => {
  const { computed } = recalc(project());
  for (const [id, expected] of Object.entries(EXPECTED_DURATIONS)) {
    assert.equal(computed.get(id).duration, expected, `duration mismatch for ${id}`);
  }
});

test('recalc: leaf weights are duration / total duration and sum to 1', () => {
  const { computed } = recalc(project());
  let sum = 0;
  for (const id of Object.keys(EXPECTED_DURATIONS)) {
    const c = computed.get(id);
    assert.ok(Math.abs(c.weight - EXPECTED_DURATIONS[id] / TOTAL_DURATION) < 1e-9);
    sum += c.weight;
  }
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('recalc: a manual weightOverride is honored and the rest renormalize around it', () => {
  const overridden = tasks.map(t => (t.id === 't-1' ? { ...t, weightOverride: 0.5 } : t));
  const { computed } = recalc(project({ tasks: overridden }));
  assert.equal(computed.get('t-1').weight, 0.5);
  const autoDurationSum = TOTAL_DURATION - EXPECTED_DURATIONS['t-1'];
  const expectedT2 = 0.5 * (EXPECTED_DURATIONS['t-2'] / autoDurationSum);
  assert.ok(Math.abs(computed.get('t-2').weight - expectedT2) < 1e-9);
});

test('recalc: a Cancelled task drops out of weight and rollup math entirely', () => {
  const cancelled = tasks.map(t => (t.id === 't-1' ? { ...t, statusOverride: 'Cancelled' } : t));
  const { computed } = recalc(project({ tasks: cancelled }));
  assert.equal(computed.get('t-1').weight, 0);
  assert.equal(computed.get('t-1').status, 'Cancelled');
  const remainingDuration = TOTAL_DURATION - EXPECTED_DURATIONS['t-1'];
  assert.ok(Math.abs(computed.get('t-2').weight - EXPECTED_DURATIONS['t-2'] / remainingDuration) < 1e-9);
});

test('recalc: phase rollup is 100% complete when every child is 100% complete and status date is at/after the last finish', () => {
  const { computed, overall } = recalc(project());
  assert.equal(computed.get('phase-1').status, 'Complete');
  assert.ok(Math.abs(computed.get('phase-1').actualPct - 1) < 1e-9);
  assert.ok(Math.abs(overall.actualPct - 1) < 1e-9);
  assert.equal(overall.status, 'Complete');
  assert.equal(overall.plannedStart, '2024-01-15');
  assert.equal(overall.plannedFinish, '2024-03-04');
});

test('recalc: KPIs count complete/delayed leaves and milestones', () => {
  const { kpis } = recalc(project());
  assert.equal(kpis.totalCount, 12);
  assert.equal(kpis.completeCount, 12);
  assert.equal(kpis.delayedCount, 0);
  assert.ok(Math.abs(kpis.variance) < 1e-9);
});

test('recalc: scurve planned and actual cumulative both reach 1 by the last week bucket', () => {
  const { scurve } = recalc(project());
  assert.ok(scurve.length > 0);
  const last = scurve[scurve.length - 1];
  assert.ok(Math.abs(last.plannedCum - 1) < 1e-9);
  assert.ok(Math.abs(last.actualCum - 1) < 1e-9);
});

test('recalc: scurve first bucket (project start week) has near-zero actual for a task that has not started yet', () => {
  const notStarted = tasks.map(t => (t.id === 't-12'
    ? { ...t, actualStart: null, actualFinish: null, actualPct: 0 }
    : t));
  const { scurve } = recalc(project({ tasks: notStarted }));
  const first = scurve[0];
  assert.ok(first.actualCum < 1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: FAIL — `Cannot find module '../src/js/calc.js'`

- [ ] **Step 4: Write `calc.js`**

Create `project-planner/src/js/calc.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : globalThis.PP;
  const statusEngine = (typeof module === 'object' && module.exports)
    ? require('./status.js')
    : globalThis.PP;
  const { networkdays, remainingWorkdays, parseISO, toISO } = schedule;
  const { deriveStatus } = statusEngine;

  const DAY_MS = 86400000;

  function buildTree(tasks) {
    const byId = new Map();
    for (const t of tasks) byId.set(t.id, t);

    const children = new Map();
    children.set(null, []);
    for (const t of tasks) {
      if (!children.has(t.parentId)) children.set(t.parentId, []);
      children.get(t.parentId).push(t.id);
    }
    for (const ids of children.values()) {
      ids.sort((a, b) => byId.get(a).order - byId.get(b).order);
    }

    const order = [];
    const depth = new Map();
    const wbs = new Map();

    function visit(parentId, parentWbs, parentDepth) {
      const kids = children.get(parentId) || [];
      kids.forEach((id, i) => {
        const num = parentWbs ? `${parentWbs}.${i + 1}` : `${i + 1}`;
        order.push(id);
        depth.set(id, parentDepth);
        wbs.set(id, num);
        visit(id, num, parentDepth + 1);
      });
    }
    visit(null, '', 0);

    return { byId, children, order, depth, wbs };
  }

  function planPctToDate(plannedStart, plannedFinish, atDate, duration, holidayDates) {
    if (!plannedStart || !plannedFinish || duration <= 0) return 0;
    if (atDate >= plannedFinish) return 1;
    if (atDate < plannedStart) return 0;
    const pct = networkdays(plannedStart, atDate, holidayDates) / duration;
    return Math.max(0, Math.min(1, pct));
  }

  function actualPctAt(task, atDate) {
    if (!task.actualStart || atDate < task.actualStart) return 0;
    return task.actualPct;
  }

  function computeScurve(leaves, overall, statusDate, holidayDates) {
    if (!overall.plannedStart) return [];
    const endBound = !overall.plannedFinish || statusDate > overall.plannedFinish ? statusDate : overall.plannedFinish;
    const points = [];
    let cursor = parseISO(overall.plannedStart);
    const finish = parseISO(endBound);
    while (cursor <= finish) {
      const weekEndISO = toISO(cursor);
      let plannedCum = 0;
      let actualCum = 0;
      for (const leaf of leaves) {
        plannedCum += leaf.weight * planPctToDate(leaf.plannedStart, leaf.plannedFinish, weekEndISO, leaf.duration, holidayDates);
        actualCum += leaf.weight * actualPctAt(leaf, weekEndISO);
      }
      points.push({ weekEndDate: weekEndISO, plannedCum, actualCum });
      cursor += 7 * DAY_MS;
    }
    return points;
  }

  function recalc(project) {
    const { tasks, holidays, meta } = project;
    const holidayDates = holidays.map(h => h.date);
    const statusDate = meta.statusDate;
    const { byId, children, order, depth, wbs } = buildTree(tasks);
    const leafIds = order.filter(id => (children.get(id) || []).length === 0);

    const isCancelled = (id) => byId.get(id).statusOverride === 'Cancelled';

    const computed = new Map();

    for (const id of leafIds) {
      const t = byId.get(id);
      const duration = (t.plannedStart && t.plannedFinish)
        ? networkdays(t.plannedStart, t.plannedFinish, holidayDates)
        : 0;
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: true,
        plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        actualStart: t.actualStart, actualFinish: t.actualFinish,
        duration, weight: 0, plannedPctToDate: 0, actualPct: t.actualPct,
        status: null, isMilestone: !!t.milestone,
      });
    }

    const overriddenLeaves = leafIds.filter(id => !isCancelled(id) && byId.get(id).weightOverride != null);
    const autoLeaves = leafIds.filter(id => !isCancelled(id) && byId.get(id).weightOverride == null);
    const overrideSum = overriddenLeaves.reduce((s, id) => s + byId.get(id).weightOverride, 0);
    const autoDurationSum = autoLeaves.reduce((s, id) => s + computed.get(id).duration, 0);
    const autoPool = Math.max(0, 1 - overrideSum);

    for (const id of overriddenLeaves) {
      computed.get(id).weight = byId.get(id).weightOverride;
    }
    for (const id of autoLeaves) {
      const c = computed.get(id);
      c.weight = autoDurationSum > 0 ? autoPool * (c.duration / autoDurationSum) : 0;
    }

    for (const id of leafIds) {
      const t = byId.get(id);
      const c = computed.get(id);
      c.plannedPctToDate = planPctToDate(t.plannedStart, t.plannedFinish, statusDate, c.duration, holidayDates);
      c.status = deriveStatus({
        actualPct: t.actualPct, plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        statusDate, statusOverride: t.statusOverride,
      });
    }

    const parentIds = [...order].reverse().filter(id => (children.get(id) || []).length > 0);
    for (const id of parentIds) {
      const kidIds = children.get(id).filter(cid => !isCancelled(cid));
      const kidComputed = kidIds.map(cid => computed.get(cid));
      const weight = kidComputed.reduce((s, c) => s + c.weight, 0);
      const starts = kidComputed.map(c => c.plannedStart).filter(Boolean);
      const finishes = kidComputed.map(c => c.plannedFinish).filter(Boolean);
      const plannedStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      const plannedFinish = finishes.length ? finishes.reduce((a, b) => (a > b ? a : b)) : null;
      const duration = (plannedStart && plannedFinish) ? networkdays(plannedStart, plannedFinish, holidayDates) : 0;
      const weightedPlan = kidComputed.reduce((s, c) => s + c.weight * c.plannedPctToDate, 0);
      const weightedActual = kidComputed.reduce((s, c) => s + c.weight * c.actualPct, 0);
      const plannedPctToDate = weight > 0 ? weightedPlan / weight : 0;
      const actualPct = weight > 0 ? weightedActual / weight : 0;
      const status = deriveStatus({
        actualPct, plannedStart, plannedFinish, statusDate, statusOverride: byId.get(id).statusOverride,
      });
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: false,
        plannedStart, plannedFinish, actualStart: null, actualFinish: null,
        duration, weight, plannedPctToDate, actualPct, status, isMilestone: false,
      });
    }

    const rootIds = children.get(null).filter(id => !isCancelled(id));
    const rootComputed = rootIds.map(id => computed.get(id));
    const overallWeight = rootComputed.reduce((s, c) => s + c.weight, 0);
    const overallStarts = rootComputed.map(c => c.plannedStart).filter(Boolean);
    const overallFinishes = rootComputed.map(c => c.plannedFinish).filter(Boolean);
    const overall = {
      plannedStart: overallStarts.length ? overallStarts.reduce((a, b) => (a < b ? a : b)) : null,
      plannedFinish: overallFinishes.length ? overallFinishes.reduce((a, b) => (a > b ? a : b)) : null,
      weight: overallWeight,
      plannedPctToDate: overallWeight > 0 ? rootComputed.reduce((s, c) => s + c.weight * c.plannedPctToDate, 0) / overallWeight : 0,
      actualPct: overallWeight > 0 ? rootComputed.reduce((s, c) => s + c.weight * c.actualPct, 0) / overallWeight : 0,
    };
    overall.duration = (overall.plannedStart && overall.plannedFinish)
      ? networkdays(overall.plannedStart, overall.plannedFinish, holidayDates) : 0;
    overall.status = deriveStatus({
      actualPct: overall.actualPct, plannedStart: overall.plannedStart, plannedFinish: overall.plannedFinish,
      statusDate, statusOverride: null,
    });

    const leafStatuses = leafIds.filter(id => !isCancelled(id)).map(id => computed.get(id).status);
    const kpis = {
      actualPct: overall.actualPct,
      plannedPct: overall.plannedPctToDate,
      variance: overall.actualPct - overall.plannedPctToDate,
      delayedCount: leafStatuses.filter(s => s === 'Delayed').length,
      completeCount: leafStatuses.filter(s => s === 'Complete').length,
      totalCount: leafStatuses.length,
      milestonesTotal: leafIds.filter(id => byId.get(id).milestone).length,
      milestonesComplete: leafIds.filter(id => byId.get(id).milestone && computed.get(id).status === 'Complete').length,
      remainingWorkdays: overall.plannedFinish ? remainingWorkdays(statusDate, overall.plannedFinish, holidayDates) : 0,
    };

    const scurveLeaves = leafIds
      .filter(id => !isCancelled(id))
      .map(id => ({ ...byId.get(id), ...computed.get(id) }));
    const scurve = computeScurve(scurveLeaves, overall, statusDate, holidayDates);

    return { computed, order, children, wbs, overall, kpis, scurve };
  }

  return { recalc, buildTree, planPctToDate, actualPctAt, computeScurve };
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/calc.test.js`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add src/js/calc.js tests/calc.test.js tests/fixtures/vision-phase.js
git commit -m "Add calculation engine: weights, rollups, KPIs, live S-curve"
```

---

### Task 6: Store engine (`store.js`)

**Files:**
- Create: `project-planner/src/js/store.js`
- Test: `project-planner/tests/store.test.js`

**Interfaces:**
- Consumes: nothing directly (operates on plain `Task`/`Project` shaped objects; does not call `calc.js`).
- Produces (used by Task 7 `snapshot.js`, and by every later UI plan):
  - `generateId()` → string, format `"t_" + 8 random base36 chars"`.
  - `class Project`:
    - `constructor(data)` — `data` matches the §4.1 project-root shape.
    - `static empty(name)` → new blank `Project` with `tasks: []`, generated `meta.id`, `meta.name = name`, `meta.statusDate` = today (`toISOString().slice(0,10)`), `meta.revision = 0`.
    - `static fromJSON(json)` — `json` is a string or already-parsed object; returns a `Project`.
    - `toJSON()` → plain object matching §4.1 (no class instance methods/undo stacks included).
    - `serialize()` → JSON string; increments `meta.revision` as a side effect.
    - `addTask({ parentId, name, pic })` → appends a new leaf `Task` (shape per §4.2, defaults: `actualPct: 0`, `weightOverride: null`, `milestone: false`, `statusOverride: null`, `predecessors: []`, `collapsed: false`) at the end of its siblings; returns the created task.
    - `updateTask(id, patch, who)` → applies `patch` fields onto the task, records one audit entry per changed field, throws if `id` not found.
    - `deleteTask(id, who)` → removes the task and its full subtree (recursive via `parentId`), records one audit entry.
    - `moveTask(id, newParentId, newOrder, who)` → reparents/reorders a task; throws if `newParentId` is inside `id`'s own subtree (no cycles in the tree).
    - `indent(id, who)` → makes the task a child of its immediately preceding sibling; returns `false` (no-op) if it's already the first sibling.
    - `outdent(id, who)` → moves the task to be a sibling of its parent, positioned right after it; returns `false` (no-op) if already at root.
    - `undo()` / `redo()` → boolean, `true` if a state was restored. Undo stack capped at 50 entries.
    - All mutating methods push an undo checkpoint (`_pushUndo`) before changing state, and clear the redo stack.

- [ ] **Step 1: Write the failing test**

Create `project-planner/tests/store.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Project, generateId } = require('../src/js/store.js');

test('generateId produces distinct string ids', () => {
  const a = generateId();
  const b = generateId();
  assert.notEqual(a, b);
  assert.match(a, /^t_/);
});

test('Project.empty creates a blank project with today as status date', () => {
  const p = Project.empty('Test Project');
  assert.equal(p.meta.name, 'Test Project');
  assert.deepEqual(p.tasks, []);
  assert.equal(p.meta.revision, 0);
  assert.match(p.meta.statusDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('addTask appends a leaf task with default fields', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Task A', pic: 'Alice' });
  assert.equal(p.tasks.length, 1);
  assert.equal(t.name, 'Task A');
  assert.equal(t.actualPct, 0);
  assert.equal(t.statusOverride, null);
  assert.deepEqual(t.predecessors, []);
});

test('addTask appends subsequent siblings after existing ones by order', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'First' });
  const second = p.addTask({ parentId: null, name: 'Second' });
  assert.equal(second.order, 1);
});

test('updateTask changes a field and records an audit entry', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Task A' });
  p.updateTask(t.id, { actualPct: 0.5 }, 'Alice');
  assert.equal(p.tasks.find(x => x.id === t.id).actualPct, 0.5);
  assert.equal(p.auditLog.length, 1);
  assert.equal(p.auditLog[0].who, 'Alice');
  assert.equal(p.auditLog[0].field, 'actualPct');
  assert.equal(p.auditLog[0].old, 0);
  assert.equal(p.auditLog[0].new, 0.5);
});

test('updateTask throws for an unknown task id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateTask('missing', { actualPct: 1 }));
});

test('deleteTask removes the task and its full subtree', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Parent' });
  const child = p.addTask({ parentId: parent.id, name: 'Child' });
  p.addTask({ parentId: child.id, name: 'Grandchild' });
  p.deleteTask(parent.id, 'Alice');
  assert.equal(p.tasks.length, 0);
});

test('moveTask reparents a task and refuses to move into its own descendant', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const childOfA = p.addTask({ parentId: a.id, name: 'A-child' });
  p.moveTask(b.id, a.id, 1, 'Alice');
  assert.equal(p.tasks.find(t => t.id === b.id).parentId, a.id);
  assert.throws(() => p.moveTask(a.id, childOfA.id, 0, 'Alice'));
});

test('indent makes a task a child of its previous sibling', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const result = p.indent(b.id, 'Alice');
  assert.equal(result, true);
  assert.equal(p.tasks.find(t => t.id === b.id).parentId, a.id);
});

test('indent on the first sibling is a no-op', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  assert.equal(p.indent(a.id, 'Alice'), false);
});

test('outdent moves a task to be a sibling right after its former parent', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const child = p.addTask({ parentId: a.id, name: 'A-child' });
  const result = p.outdent(child.id, 'Alice');
  assert.equal(result, true);
  assert.equal(p.tasks.find(t => t.id === child.id).parentId, null);
});

test('outdent at root is a no-op', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  assert.equal(p.outdent(a.id, 'Alice'), false);
});

test('undo reverts the last mutation, redo reapplies it', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  p.updateTask(t.id, { actualPct: 0.5 }, 'Alice');
  assert.equal(p.undo(), true);
  assert.equal(p.tasks.find(x => x.id === t.id).actualPct, 0);
  assert.equal(p.redo(), true);
  assert.equal(p.tasks.find(x => x.id === t.id).actualPct, 0.5);
});

test('undo with nothing to undo returns false', () => {
  const p = Project.empty('Test');
  assert.equal(p.undo(), false);
});

test('toJSON / fromJSON round-trip preserves tasks and meta', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'A' });
  const json = p.toJSON();
  const restored = Project.fromJSON(json);
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.meta.name, 'Test');
});

test('serialize increments the revision counter', () => {
  const p = Project.empty('Test');
  assert.equal(p.meta.revision, 0);
  p.serialize();
  assert.equal(p.meta.revision, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: FAIL — `Cannot find module '../src/js/store.js'`

- [ ] **Step 3: Write `store.js`**

Create `project-planner/src/js/store.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  function generateId() {
    return 't_' + Math.random().toString(36).slice(2, 10);
  }

  class Project {
    constructor(data) {
      this.meta = data.meta;
      this.tasks = data.tasks;
      this.holidays = data.holidays;
      this.picList = data.picList;
      this.snapshots = data.snapshots;
      this.auditLog = data.auditLog;
      this.settings = data.settings;
      this._undoStack = [];
      this._redoStack = [];
    }

    static empty(name) {
      const now = new Date().toISOString();
      return new Project({
        meta: {
          id: generateId(), name, statusDate: now.slice(0, 10),
          revision: 0, savedBy: null, savedAt: null, createdAt: now,
        },
        tasks: [],
        holidays: [],
        picList: [],
        snapshots: [],
        auditLog: [],
        settings: { theme: 'kpmg-light', ganttZoom: 'week' },
      });
    }

    static fromJSON(json) {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      return new Project(data);
    }

    toJSON() {
      return {
        meta: this.meta,
        tasks: this.tasks,
        holidays: this.holidays,
        picList: this.picList,
        snapshots: this.snapshots,
        auditLog: this.auditLog,
        settings: this.settings,
      };
    }

    serialize() {
      this.meta.revision += 1;
      return JSON.stringify(this.toJSON());
    }

    _snapshotState() {
      return JSON.parse(JSON.stringify(this.toJSON()));
    }

    _pushUndo() {
      this._undoStack.push(this._snapshotState());
      if (this._undoStack.length > 50) this._undoStack.shift();
      this._redoStack = [];
    }

    _applyState(state) {
      this.meta = state.meta;
      this.tasks = state.tasks;
      this.holidays = state.holidays;
      this.picList = state.picList;
      this.snapshots = state.snapshots;
      this.auditLog = state.auditLog;
      this.settings = state.settings;
    }

    undo() {
      if (this._undoStack.length === 0) return false;
      this._redoStack.push(this._snapshotState());
      this._applyState(this._undoStack.pop());
      return true;
    }

    redo() {
      if (this._redoStack.length === 0) return false;
      this._undoStack.push(this._snapshotState());
      this._applyState(this._redoStack.pop());
      return true;
    }

    _subtreeIds(id) {
      const ids = new Set([id]);
      let added = true;
      while (added) {
        added = false;
        for (const t of this.tasks) {
          if (ids.has(t.parentId) && !ids.has(t.id)) {
            ids.add(t.id);
            added = true;
          }
        }
      }
      return ids;
    }

    _audit(who, taskId, field, oldValue, newValue) {
      this.auditLog.push({
        when: new Date().toISOString(), who: who || 'unknown',
        taskId, field, old: oldValue, new: newValue,
      });
      if (this.auditLog.length > 2000) this.auditLog.shift();
    }

    addTask({ parentId = null, name = 'New Task', pic = '' }) {
      this._pushUndo();
      const siblings = this.tasks.filter(t => t.parentId === parentId);
      const task = {
        id: generateId(), parentId, order: siblings.length, name, pic,
        deliverable: '', jira: '', remarks: '',
        plannedStart: null, plannedFinish: null,
        actualStart: null, actualFinish: null,
        actualPct: 0, weightOverride: null, milestone: false,
        statusOverride: null, predecessors: [], collapsed: false,
      };
      this.tasks.push(task);
      return task;
    }

    updateTask(id, patch, who) {
      this._pushUndo();
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      for (const [field, value] of Object.entries(patch)) {
        const old = task[field];
        task[field] = value;
        this._audit(who, id, field, old, value);
      }
      return task;
    }

    deleteTask(id, who) {
      this._pushUndo();
      const toDelete = this._subtreeIds(id);
      this.tasks = this.tasks.filter(t => !toDelete.has(t.id));
      this._audit(who, id, 'deleted', null, true);
    }

    moveTask(id, newParentId, newOrder, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (newParentId != null && this._subtreeIds(id).has(newParentId)) {
        throw new Error('Cannot move a task into its own descendant');
      }
      this._pushUndo();
      const oldParentId = task.parentId;
      task.parentId = newParentId;
      const siblings = this.tasks
        .filter(t => t.parentId === newParentId && t.id !== id)
        .sort((a, b) => a.order - b.order);
      siblings.splice(newOrder, 0, task);
      siblings.forEach((t, i) => { t.order = i; });
      this._audit(who, id, 'parentId', oldParentId, newParentId);
    }

    indent(id, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const siblings = this.tasks
        .filter(t => t.parentId === task.parentId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex(t => t.id === id);
      if (idx <= 0) return false;
      const newParent = siblings[idx - 1];
      const newParentChildCount = this.tasks.filter(t => t.parentId === newParent.id).length;
      this.moveTask(id, newParent.id, newParentChildCount, who);
      return true;
    }

    outdent(id, who) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (task.parentId === null) return false;
      const parent = this.tasks.find(t => t.id === task.parentId);
      const grandParentId = parent ? parent.parentId : null;
      const newOrder = parent ? parent.order + 1 : 0;
      this.moveTask(id, grandParentId, newOrder, who);
      return true;
    }
  }

  return { Project, generateId };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/store.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/store.js tests/store.test.js
git commit -m "Add store engine: task CRUD, tree operations, undo/redo, audit log"
```

---

### Task 7: Snapshot engine (`snapshot.js`)

**Files:**
- Create: `project-planner/src/js/snapshot.js`
- Test: `project-planner/tests/snapshot.test.js`

**Interfaces:**
- Consumes: nothing at the module level (works on plain data passed in by the caller — the UI layer will pass it the result of `calc.recalc()`).
- Produces (used by the Snapshots-view and Reports-view UI plans):
  - `takeSnapshot(project, computed, note, takenBy)` → `Snapshot` object `{ id, takenAt, takenBy, note, statusDate, tasks, overall, kpis, scurve }`, a full deep clone, and pushes it onto `project.snapshots`.
  - `compareSnapshots(a, b)` → `{ overallDelta: { actualPct, plannedPct }, added: id[], removed: id[], slipped: Array<{ id, from, to }> }`. `added`/`removed` are task ids present in one snapshot's `tasks` but not the other. `slipped` lists tasks whose `plannedFinish` moved later from `a` to `b`.

- [ ] **Step 1: Write the failing test**

Create `project-planner/tests/snapshot.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { takeSnapshot, compareSnapshots } = require('../src/js/snapshot.js');

function fakeProject() {
  return {
    meta: { statusDate: '2024-01-01' },
    tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }],
    snapshots: [],
  };
}

function fakeComputed() {
  return {
    overall: { actualPct: 0.5, plannedPctToDate: 0.4 },
    kpis: { actualPct: 0.5, plannedPct: 0.4, variance: 0.1 },
    scurve: [{ weekEndDate: '2024-01-01', plannedCum: 0.4, actualCum: 0.5 }],
  };
}

test('takeSnapshot deep-clones project state and pushes it onto project.snapshots', () => {
  const project = fakeProject();
  const snap = takeSnapshot(project, fakeComputed(), 'Week 1', 'Alice');
  assert.equal(project.snapshots.length, 1);
  assert.equal(snap.note, 'Week 1');
  assert.equal(snap.takenBy, 'Alice');
  assert.equal(snap.tasks[0].id, 't-1');
  snap.tasks[0].plannedFinish = '2099-01-01';
  assert.equal(project.tasks[0].plannedFinish, '2024-01-10');
});

test('compareSnapshots reports overall progress delta', () => {
  const a = { overall: { actualPct: 0.4, plannedPctToDate: 0.4 }, tasks: [] };
  const b = { overall: { actualPct: 0.6, plannedPctToDate: 0.5 }, tasks: [] };
  const diff = compareSnapshots(a, b);
  assert.ok(Math.abs(diff.overallDelta.actualPct - 0.2) < 1e-9);
  assert.ok(Math.abs(diff.overallDelta.plannedPct - 0.1) < 1e-9);
});

test('compareSnapshots detects added and removed tasks', () => {
  const a = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }] };
  const b = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-2', plannedFinish: '2024-01-10' }] };
  const diff = compareSnapshots(a, b);
  assert.deepEqual(diff.added, ['t-2']);
  assert.deepEqual(diff.removed, ['t-1']);
});

test('compareSnapshots detects a slipped finish date', () => {
  const a = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }] };
  const b = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-20' }] };
  const diff = compareSnapshots(a, b);
  assert.equal(diff.slipped.length, 1);
  assert.equal(diff.slipped[0].id, 't-1');
  assert.equal(diff.slipped[0].from, '2024-01-10');
  assert.equal(diff.slipped[0].to, '2024-01-20');
});

test('compareSnapshots does not report a task as slipped if its finish date held or improved', () => {
  const a = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-20' }] };
  const b = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }] };
  const diff = compareSnapshots(a, b);
  assert.equal(diff.slipped.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "project-planner" && node --test tests/snapshot.test.js`
Expected: FAIL — `Cannot find module '../src/js/snapshot.js'`

- [ ] **Step 3: Write `snapshot.js`**

Create `project-planner/src/js/snapshot.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  function takeSnapshot(project, computed, note, takenBy) {
    const snapshot = {
      id: 'snap_' + Math.random().toString(36).slice(2, 10),
      takenAt: new Date().toISOString(),
      takenBy: takenBy || 'unknown',
      note: note || '',
      statusDate: project.meta.statusDate,
      tasks: JSON.parse(JSON.stringify(project.tasks)),
      overall: JSON.parse(JSON.stringify(computed.overall)),
      kpis: JSON.parse(JSON.stringify(computed.kpis)),
      scurve: JSON.parse(JSON.stringify(computed.scurve)),
    };
    project.snapshots.push(snapshot);
    return snapshot;
  }

  function compareSnapshots(a, b) {
    const overallDelta = {
      actualPct: b.overall.actualPct - a.overall.actualPct,
      plannedPct: b.overall.plannedPctToDate - a.overall.plannedPctToDate,
    };
    const byIdA = new Map(a.tasks.map(t => [t.id, t]));
    const byIdB = new Map(b.tasks.map(t => [t.id, t]));
    const added = [...byIdB.keys()].filter(id => !byIdA.has(id));
    const removed = [...byIdA.keys()].filter(id => !byIdB.has(id));
    const slipped = [];
    for (const [id, taskB] of byIdB) {
      const taskA = byIdA.get(id);
      if (taskA && taskA.plannedFinish && taskB.plannedFinish && taskB.plannedFinish > taskA.plannedFinish) {
        slipped.push({ id, from: taskA.plannedFinish, to: taskB.plannedFinish });
      }
    }
    return { overallDelta, added, removed, slipped };
  }

  return { takeSnapshot, compareSnapshots };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "project-planner" && node --test tests/snapshot.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd "project-planner"
git add src/js/snapshot.js tests/snapshot.test.js
git commit -m "Add snapshot engine: full-state capture and comparison diff"
```

---

### Task 8: Integration — full build with all engines, end-to-end fixture

**Files:**
- Modify: `project-planner/tests/build.test.js`
- Create: `project-planner/tests/integration.test.js`

**Interfaces:**
- Consumes: `recalc` from `calc.js`, `Project` from `store.js`, `takeSnapshot`/`compareSnapshots` from `snapshot.js`, the `vision-phase.js` and `holidays-2024.js` fixtures (Tasks 5, 2).
- Produces: nothing new — this task only verifies everything built in Tasks 1–7 works together and that `dist/ProjectPlanner.html` now contains all six engines concatenated in the right order.

- [ ] **Step 1: Extend the build test to assert every engine is present in the built file**

Edit `project-planner/tests/build.test.js`, add a new test at the end of the file:

```js
test('build.py output includes every engine in dependency order', () => {
  execSync('python3 build.py', { cwd: ROOT });
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'ProjectPlanner.html'), 'utf8');
  const markers = ['function networkdays', 'function deriveStatus', 'function recalc', 'function forwardPass', 'class Project', 'function takeSnapshot'];
  let lastIndex = -1;
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    assert.ok(idx > lastIndex, `expected "${marker}" to appear after the previous engine`);
    lastIndex = idx;
  }
});
```

- [ ] **Step 2: Run the extended build test to verify it fails**

Run: `cd "project-planner" && node --test tests/build.test.js`
Expected: FAIL at the new test — at this point in history (before Step 3 re-runs the build with all six `src/js/*.js` files present), it should actually PASS already since all engines were committed in Tasks 2–7. Confirm by running it; if it unexpectedly fails, check `build.py`'s `JS_ORDER` list against the actual file names in `src/js/`.

- [ ] **Step 3: Write the end-to-end integration test**

Create `project-planner/tests/integration.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const { Project } = require('../src/js/store.js');
const { takeSnapshot, compareSnapshots } = require('../src/js/snapshot.js');
const HOLIDAYS_2024 = require('./fixtures/holidays-2024.js');
const { tasks: visionTasks } = require('./fixtures/vision-phase.js');

test('full lifecycle: build a project via the store, recalc, snapshot, edit, recalc again, compare', () => {
  const project = Project.empty('Reference Example Project');
  project.holidays = HOLIDAYS_2024.map(date => ({ date }));
  project.tasks = JSON.parse(JSON.stringify(visionTasks));
  project.meta.statusDate = '2024-03-04';

  const firstPass = recalc(project);
  assert.equal(firstPass.overall.status, 'Complete');
  assert.ok(Math.abs(firstPass.kpis.actualPct - 1) < 1e-9);

  const snap1 = takeSnapshot(project, firstPass, 'Baseline', 'Alice');
  assert.equal(project.snapshots.length, 1);

  project.updateTask('t-12', { plannedFinish: '2024-03-11', actualPct: 0.5 }, 'Bob');
  const secondPass = recalc(project);
  assert.equal(secondPass.overall.status, 'In Progress');
  assert.ok(secondPass.kpis.actualPct < 1);

  const snap2 = takeSnapshot(project, secondPass, 'After slip', 'Bob');
  const diff = compareSnapshots(snap1, snap2);
  assert.equal(diff.slipped.length, 1);
  assert.equal(diff.slipped[0].id, 't-12');
  assert.ok(diff.overallDelta.actualPct < 0);
});

test('project serializes to JSON and restores to an identical, re-computable state', () => {
  const project = Project.empty('Round Trip Test');
  project.holidays = HOLIDAYS_2024.map(date => ({ date }));
  project.tasks = JSON.parse(JSON.stringify(visionTasks));
  project.meta.statusDate = '2024-03-04';
  const before = recalc(project);

  const json = project.serialize();
  const restored = Project.fromJSON(json);
  const after = recalc(restored);

  assert.equal(after.overall.status, before.overall.status);
  assert.ok(Math.abs(after.kpis.actualPct - before.kpis.actualPct) < 1e-9);
  assert.equal(restored.meta.revision, 1);
});
```

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `cd "project-planner" && node --test tests/`
Expected: PASS — all tests across `build.test.js`, `schedule.test.js`, `status.test.js`, `deps.test.js`, `calc.test.js`, `store.test.js`, `snapshot.test.js`, `integration.test.js`.

- [ ] **Step 5: Rebuild the artifact and manually confirm it opens**

Run: `cd "project-planner" && python3 build.py && open dist/ProjectPlanner.html`
Expected: browser opens a blank page with `Loading…` text (no UI wired up yet — that's the next plan). No console errors about `__CSS__`/`__JS__` markers or JSON parse failures. Open the browser dev console and run `PP.recalc` — it should be `undefined` because engines currently only expose functions inside the module scope returned to `factory()`; confirm instead that `document.getElementById('project-data').textContent` parses as valid JSON via `JSON.parse(document.getElementById('project-data').textContent)`.

- [ ] **Step 6: Commit**

```bash
cd "project-planner"
git add tests/build.test.js tests/integration.test.js
git commit -m "Add end-to-end integration test covering full project lifecycle"
```

---

## Plan Complete

At the end of this plan: six pure, Node-tested calculation engines exist (`schedule`, `status`, `calc`, `deps`, `store`, `snapshot`), a build script produces `dist/ProjectPlanner.html` with them concatenated in dependency order, and an integration test proves they compose correctly end-to-end using real workbook numbers as the accuracy fixture. No UI exists yet — that is the next plan (Plan view: tree grid, inline edit, save/load cycle, KPI header), to be written after this one is implemented and reviewed.
