# CSV Import (V2 Sub-Project D) — Design Spec

**Date:** 2026-07-08
**Status:** Approved design (brainstorm complete)
**Scope:** V2 sub-project D — the last of the five sub-projects scoped in the original V2 brainstorm (E → A → B → C → D order), reordered to build now at the user's request, ahead of B/C. Adds a "Download CSV Template" button and a "Import CSV" flow that bulk-creates tasks (with hierarchy and predecessor links) from a hand-written CSV parser — zero external dependencies, no CSV library.

## 1. Purpose

Users maintaining a project plan in Excel (a common workflow, and the source of the earlier garbled-Thai-text sample) need a way to bulk-load an initial task list into ProjectPlanner instead of typing each task by hand in the Plan tree. This adds: (1) a downloadable blank CSV template with the correct headers, and (2) an import flow that parses a filled-in CSV, validates it fully, and appends the resulting tasks (with parent/child nesting and predecessor links) to the currently open project.

## 2. Decisions Log

| Question | Decision |
|---|---|
| Import method | File upload via a picker (`<input type="file" accept=".csv">`), matching Load Project's existing pattern — not a paste-into-textarea flow like Holidays bulk-import. |
| Import behavior | **Adds** the CSV's rows as new tasks to whatever project is currently open. Does not replace/wipe the existing task list (unlike Load Project's full-JSON replace). |
| Hierarchy encoding | A **Level** column (0-based indent depth) plus a **Row** column (plain sequential integer, 1-based). Each row becomes a child of the nearest preceding row whose Level is exactly one less. Row order in the file *is* the tree order — no separate ordering field needed. |
| Dependency encoding | The same **Row** numbers double as the join key for a **Predecessors** column: a semicolon-separated list of Row #s this task depends on (e.g. `2;3`). Semicolon, not comma, so a multi-predecessor cell never collides with the CSV field separator. The importer resolves Row # → real generated task ID after all rows are created. |
| Template fields | `Row, Level, Task Name, PIC, Planned Start, Planned Finish, Remarks, Milestone, Billing Amount, Billing Status, Predecessors`. Excludes Deliverable/Jira (not shown anywhere in the shipped UI), Actual Start/Finish (importing a plan before work starts, not progress), Weight Override and Status Override (rare/advanced, auto-default is fine). |
| Malformed-row handling | **Block the entire import** and list every error found (row + field + reason) in one alert. Nothing is added until every row validates — matches the existing required-field Save validation's all-or-nothing feel, not the Holidays bulk-import's skip-and-report style. |
| Encoding | Read the file via `FileReader.readAsText(file, 'UTF-8')` explicitly, and strip a leading UTF-8 BOM (`﻿`) if present. This is the fix for the earlier garbled-Thai-text sample: Excel's "CSV UTF-8" export adds a BOM that corrupts the first cell of the first row if not stripped before parsing. |

## 3. Architecture

### 3.1 New file: `src/js/csv.js` (engine, pure logic, UMD-lite, Node-tested)

Mirrors the project's existing `calc.js`/`schedule.js` convention: no DOM, `module.exports` for Node / `globalThis.PP` for browser.

**`stripBom(text)`** — returns `text` with a leading `﻿` removed if present, else `text` unchanged.

**`parseCsvText(text)`** — hand-written RFC4180-style parser. Splits into rows on unquoted newlines; within a row, splits into cells on unquoted commas; a cell wrapped in `"..."` may contain commas/newlines/embedded `""`-escaped quotes. Returns `string[][]` (array of rows, each an array of cell strings), including the header row as `rows[0]`.

**`validateCsvRows(rows, existingTaskCount)`** — takes the parsed rows (header + data), returns `{ errors: string[], tasks: object[] }`:
- `errors` is empty only if every row is fully valid; each entry is a human-readable `"Row 5: Planned Start 'next tuesday' is not a valid date (expected YYYY-MM-DD)"`-style string.
- If `errors` is non-empty, `tasks` is `[]` (nothing partially built).
- If `errors` is empty, `tasks` is an array of plain task objects (matching the `Task` shape from `store.js`'s `addTask`, with `predecessors` already resolved to placeholder Row-keyed markers — see 3.2) ready for `Project.addTask`-style insertion, in file order.

Validation rules per row: `Row` unique across the file and a positive integer; `Level` a non-negative integer, and never more than 1 greater than the previous row's Level (prevents an impossible depth jump like 0 → 2); `Task Name` non-empty; `Planned Start`/`Planned Finish` each either blank or `YYYY-MM-DD`; `Milestone` case-insensitive `Y`/`YES`/`TRUE`/`1` → `true`, anything else (including blank) → `false`; `Billing Amount` blank or a valid number; `Billing Status` blank or exactly one of `Not Billed`/`Invoiced`/`Paid`; `Predecessors` blank or a semicolon-separated list of Row #s, each of which must exist somewhere in the file (forward references allowed, e.g. row 2 can depend on row 5).

**`csvTemplateText()`** — returns the literal header-only string `'Row,Level,Task Name,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors\n'`.

### 3.2 `src/js/ui/app.js` additions (UI wiring, no Node coverage)

**`handleDownloadCsvTemplate()`** — `Blob([PP.csvTemplateText()], {type: 'text/csv'})` → download, same `URL.createObjectURL`/anchor-click pattern as `handleSave`, filename literal `project-planner-template.csv` (no project-name slug — it's a generic template, not project-specific data).

**`handleImportCsv(state, file)`** — mirrors `handleLoadProject`'s shape: `FileReader.readAsText(file, 'UTF-8')`; on load, `PP.stripBom` then `PP.parseCsvText`; if the file has fewer than 2 rows (header only or empty), alert "CSV has no data rows" and stop; else `PP.validateCsvRows`; if `errors.length`, `window.alert('Cannot import — ' + errors.length + ' error(s):\n' + errors.join('\n'))` and stop (nothing added, current project untouched); else, for each returned task object, resolve its `predecessors` (currently holding Row #s) to the real `id` each `Project.addTask` call just generated, then commit all tasks via **`Project.addTasks(taskSpecs, who)`** (see 3.3) as one undo checkpoint, then `refresh(state, true)`.

Wired the same way as Load Project: a hidden `<input type="file" accept=".csv">` triggered by a visible "Import CSV" button, both added to Settings (`src/index.html`, in the existing "Project" `.settings-section` alongside "New Project (blank)"), plus a "Download CSV Template" button in the same section.

### 3.3 `src/js/store.js` addition

**`Project.addTasks(taskSpecs, who)`** — new method, sibling to the existing `addTask`/`updateTasks`. Takes an array of `{ parentId, name, pic, plannedStart, plannedFinish, remarks, milestone, billingAmount, billingStatus, predecessors, _row, _level }` specs already in the CSV's file order (parents always precede children given the Level-jump validation rule), generates a real `id` for each via the existing `generateId()`, assigns `parentId` by resolving `_level` against the ids generated so far in the same call (the nearest-preceding row whose `_level` is strictly less than this row's — for a `_level: 0` row, there is no such preceding row, so `parentId: null`), assigns `order` as the sibling count at insertion time (same logic `addTask` already uses), and pushes them into `this.tasks` inside a **single** `_pushUndo()` checkpoint — mirroring `updateTasks`' one-checkpoint-for-many-changes pattern already established for the Gantt drag/forward-pass batch. Returns the array of created tasks (with real ids), so `handleImportCsv` can build the Row→id map before resolving `predecessors` into the tasks now sitting in `this.tasks`.

## 4. Data Flow

```
Settings tab → "Download CSV Template" → project-planner-template.csv
  → user fills it in Excel (Row/Level/Task Name/PIC/dates/Remarks/Milestone/Billing/Predecessors)
  → saves as CSV UTF-8
Settings tab → "Import CSV" → file picker → pick the filled-in file
  → FileReader.readAsText(file, 'UTF-8') → stripBom → parseCsvText → validateCsvRows
  → [any error] → alert listing every error, nothing added, current project untouched
  → [all valid] → Project.addTasks(...) as one undo checkpoint → refresh(state, true)
  → new tasks appear in the Plan tree, nested per Level, linked per Predecessors
```

## 5. Error Handling

- Malformed CSV structure (unterminated quote, ragged row) → `parseCsvText` still returns whatever it can parse; `validateCsvRows` catches the resulting missing/misaligned cells as ordinary per-row validation errors (e.g. "Row 3: expected 11 columns, found 9") rather than needing a separate parse-failure path.
- Empty file / header-only file → explicit early check in `handleImportCsv`, distinct message ("CSV has no data rows"), not folded into the row-error list.
- A Predecessors reference to a Row # that doesn't exist anywhere in the file → validation error naming the bad reference.
- A Level-column jump greater than +1 → validation error naming the row and the jump ("Row 6: Level 2 skips from the previous row's Level 0 — indent one level at a time").
- Everything above is checked **before** any task is created — the current project is never left partially modified by a failed import.

## 6. Testing

`csv.js` is pure logic — fully Node-tested via `node:test`, same as `calc.js`/`schedule.js`: `stripBom` (with/without BOM), `parseCsvText` (plain rows, quoted commas, embedded escaped quotes, quoted newlines within a cell), `validateCsvRows` (every validation rule above, both the all-valid and each-specific-failure cases), and `Project.addTasks` (hierarchy resolution from Level, order assignment, single undo checkpoint, predecessor Row→id resolution). `handleDownloadCsvTemplate`/`handleImportCsv` are DOM/File-API code with no Node-testable surface, verified via a controller-run real-browser session same as every prior plan's final task: download the template, fill in a small real CSV (including at least one Thai-text cell to directly re-verify the original garbling issue is fixed), import it, confirm the resulting tasks/hierarchy/predecessors/dark-mode-styled dialog all render correctly, confirm a deliberately-broken CSV is fully rejected with the right error list and zero tasks added.

## 7. Out of Scope

- Exporting the current project's tasks back out to CSV (only template-download and import are in scope; a full CSV *export* of live data is a distinct, unrequested feature).
- Updating/matching existing tasks by name or ID from a re-imported CSV (every import is pure append of new tasks — no upsert/merge logic).
- Deliverable/Jira columns (still not shipped anywhere in the UI, consistent with every prior deferral).
- Sub-projects B (Dependency UI + critical path) and C (Resource Leveling) — separate specs, brainstormed next.
