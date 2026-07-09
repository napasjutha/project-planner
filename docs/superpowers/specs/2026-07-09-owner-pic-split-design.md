# Owner / PIC Split — Design Spec

**Date:** 2026-07-09
**Status:** Approved design (brainstorm complete)
**Scope:** Add a second responsibility field to tasks. Touches `store.js`, `csv.js`, `filters.js` (engines, all Node-tested) and `tree.js`, `app.js`, `reports.js`, `index.html`, `layout.css` (UI, browser-verified). Resources/workload/capacity is explicitly untouched.

## 1. Purpose

Real project data (the RAM UAT import) shows the existing `pic` field is populated with team/committee names (e.g. `"KPMG/คณะทำงานกลาง/คณะบริหารงานโครงการ"`), not individual people — despite "PIC" meaning Person In Charge. This conflates two genuinely different levels of responsibility: the team/department accountable for a task, and the specific person actually doing it. This spec splits that into two fields: `owner` (team/committee — inherits today's values) and `pic` (individual person — new, starts blank).

## 2. Decisions Log

| Question | Decision |
|---|---|
| Field shape | Two independent flat string fields per task: `owner` and `pic`. Not a hierarchy/lookup, not a managed Owner roster — both are plain text, `pic` already has a managed roster (Resources view), `owner` does not. |
| Existing data migration | Automatic, on load, one-time, per-task: if `task.owner === undefined`, set `owner = pic || ''` then `pic = ''`. No `meta.schemaVersion` bump — that field isn't used for branching anywhere in this codebase; the per-task `undefined` check is self-describing and idempotent (a task that's already been migrated always has `owner` defined, even if `''`, so the check never re-fires). |
| Resources / workload / capacity grouping | Stays keyed on `pic` exactly as today — unchanged. Owner gets no capacity/FTE modeling and no managed add/remove list. This is a deliberate, known tradeoff: most tasks won't have an individual `pic` filled in yet, so the workload grid will show few/no rows until that data is entered — same as today's existing "blank PIC contributes no demand" behavior (already covered by `workload.test.js`), not a new edge case. |
| "Only mine" filter | Stays matched against `pic === currentUser` (individual-level) — unaffected by this spec. |
| Plan tree column order | New "Owner" column immediately **before** "PIC" — reads Task → Owner (team) → PIC (individual) → dates, broadest to narrowest. |
| Toolbar filter | New "Owner" filter dropdown added next to the existing PIC filter dropdown, populated the same way the PIC filter already is (union of distinct values found on tasks — no managed list to also union in, since Owner has none). |
| CSV import/template column order | New "Owner" column inserted between "Task Name" and "PIC": `Row, Level, Task Name, Owner, PIC, Planned Start, Planned Finish, Remarks, Milestone, Billing Amount, Billing Status, Predecessors`. |
| Reports (Weekly/Executive/Summary tables) | Add an Owner column alongside the existing PIC column in every report table that currently shows PIC. |
| Duplicate action (right-click menu) | Copies `owner` alongside `pic`, matching the existing duplicate behavior for `pic`. |
| Owner required? | Yes — every task (leaf and parent/phase rows alike) must have a non-blank `owner`. Enforced the same way planned dates are today: not blocked while typing/adding tasks, but blocked at Save time with an alert, and rejected per-row on CSV import. Unlike planned dates, this check is **not** restricted to leaf tasks — `owner` is plain free text with no parent/child roll-up, so there's no reason a phase row should be exempt. |
| PIC required? | No — stays optional, by design. Resource capacity planning (`workload.js`) only ever concerns KPMG's own staff, since that's the only side of the engagement whose capacity is being managed; client-side or not-yet-assigned tasks legitimately have no individual PIC. This is a usage convention, not a new mechanical "KPMG-only" validation rule — no company/client field is introduced. |

## 3. Data Model

### 3.1 Task shape (`store.js`)

Every task gains one new field, `owner` (string, default `''`), alongside the existing `pic`:

```js
{
  id, parentId, order, name,
  owner: '',   // NEW — team/committee, e.g. "KPMG/คณะทำงานกลาง/คณะบริหารงานโครงการ"
  pic: '',     // unchanged shape, new semantic meaning — individual person
  deliverable, jira, remarks,
  plannedStart, plannedFinish,
  actualStart, actualFinish,
  actualPct, weightOverride, milestone,
  statusOverride, predecessors, collapsed,
  billingAmount, billingStatus,
}
```

`addTask({ parentId, name, pic })` gains a matching `owner = ''` parameter (default empty, like `pic` defaults to `''` today). `addTasks(taskSpecs, who)` reads `spec.owner || ''` the same way it reads `spec.pic || ''` today.

### 3.2 Migration on load

In `Project`'s constructor, after assigning `this.tasks = data.tasks`, run a one-time per-task migration pass:

```js
this.tasks.forEach(t => {
  if (t.owner === undefined) {
    t.owner = t.pic || '';
    t.pic = '';
  }
});
```

This runs on every `new Project(data)` call (both `Project.fromJSON` and the app's boot-time load from `localStorage`/the embedded `#project-data` script), so it's automatic and requires no user action. Because it checks `owner === undefined` (not falsy), a task that's already been migrated — even one where `owner` was subsequently cleared back to `''` by a user — is never re-migrated (`''` is defined, not `undefined`), so this is safe to run unconditionally on every load, forever.

### 3.3 Owner-required validation (`store.js`, `app.js`)

A new function alongside the existing `findIncompleteTasks(project)` (which checks only *leaf* tasks for missing planned dates):

```js
function findTasksMissingOwner(project) {
  return project.tasks.filter(t => !t.owner || !t.owner.trim());
}
```

Unlike `findIncompleteTasks`, this checks **every** task — no leaf/parent distinction, since `owner` isn't a computed/rolled-up value the way parent dates are. The `.trim()` check catches whitespace-only owner values (`"   "`) that would otherwise pass a bare truthiness check while being visually blank — the stored value itself is left as the user typed it (not force-trimmed), matching this codebase's existing convention of not auto-trimming other free-text fields (`name`, `remarks`); only the *required-ness check* accounts for whitespace.

`handleSave` (`app.js`) checks both and combines them into one alert, so a user fixing one problem doesn't get blocked a second time by the other on their next Save attempt:

```js
var missingDates = PP.findIncompleteTasks(state.project);
var missingOwner = PP.findTasksMissingOwner(state.project);
if (missingDates.length || missingOwner.length) {
  var msgs = [];
  if (missingDates.length) msgs.push('missing planned dates on: ' + missingDates.map(function (t) { return t.name; }).join(', '));
  if (missingOwner.length) msgs.push('missing Owner on: ' + missingOwner.map(function (t) { return t.name; }).join(', '));
  window.alert('Cannot save — ' + msgs.join('; '));
  return;
}
```

### 3.4 Filters engine (`filters.js`)

`taskMatches` gains an `owner` check parallel to the existing `pic` check:

```js
if (filters.owner && task.owner !== filters.owner) return false;
```

`hasActiveFilter` includes `filters.owner` in its OR-chain. `filters.search`'s haystack (`task.name`, `task.remarks`, `task.jira`) is **not** extended to include `owner` — search stays scoped to free-text descriptive fields; `owner`/`pic` already have their own dedicated dropdown filters, matching the existing convention that `pic` isn't part of the search haystack either.

### 3.5 CSV (`csv.js`)

`CSV_HEADERS` becomes:
```js
['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Milestone', 'Billing Amount', 'Billing Status', 'Predecessors']
```
Every fixed-index column read in `validateCsvRows` shifts by one from index 3 onward (today's `c[3]` PIC → `c[4]`; today's `c[4..10]` → `c[5..11]`). The new `c[3]` (Owner) **is required**, same style as the existing Task Name check: `if (!c[3] || !c[3].trim()) errors.push('Row ' + rowNum + ': Owner is required');` — matching the `.trim()`-aware check from §3.3, so a whitespace-only cell is rejected the same way a truly empty one is. This error message follows the exact bare `'Row ' + rowNum + ': ...'` format every other error in this function already uses (no task-name context is added, since none of the existing errors — including the pre-existing Task Name check itself — include it either; a one-off richer format here would be inconsistent with the rest of this function). The new `c[4]` (PIC) keeps the old PIC column's validation — none; any string, including empty, is valid. `specs.push({...})` gains `owner: c[3]` alongside `pic: c[4]`.

## 4. UI Components

1. **Plan tree** (`tree.js`, `index.html`, `layout.css`) — new "Owner" grid column immediately before "PIC" (19th column overall). Same rendering pattern as PIC: `<span class="cell col-owner" data-field="owner">...</span>`, same inline dblclick-to-edit text behavior via the existing `beginEdit()` generic text-field path (no new editor type needed — `owner` behaves exactly like `pic` does today for editing purposes). `grid-template-columns` and the shared `min-width` literal both grow to fit the new column.
2. **Toolbar filter** (`app.js`, `index.html`) — new `<select id="owner-filter">` next to `#pic-filter`, wired the same way `renderPicFilter`/`#pic-filter`'s change handler already are, including its existing `Array.from(set).sort()` alphabetical ordering — but sourcing distinct values purely from `task.owner` across all tasks (no managed list to union in, unlike PIC's `picList`). Matching is exact-string, case-sensitive, same as the existing PIC filter (`task.pic !== filters.pic`) — no new case-normalization behavior is introduced for either field.
3. **CSV template/import** — covered in §3.4; the "Download CSV Template" button's output and the import validation/mapping both follow the new header order.
4. **Reports** (`reports.js`) — every report table that renders a PIC column (Weekly Status, Executive Dashboard, Management Summary — wherever `task.pic` is read today) gains an adjacent Owner column reading `task.owner`.
5. **Duplicate action** (`tree.js`'s context menu) — the `Duplicate` handler's `state.project.addTask({ parentId: task.parentId, name: ..., pic: task.pic })` call gains `owner: task.owner` alongside it.
6. **Resources view, workload, capacity** — **no changes**. `workload.js`, `resources.js` keep reading `task.pic` exactly as today.

## 5. Testing

- `store.test.js`: new tests for the migration pass (a task loaded with only `pic` set gets `owner` populated and `pic` cleared; a task that already has `owner` — including `owner: ''` — is left untouched by the migration; `addTask`/`addTasks` correctly set `owner`); new tests for `findTasksMissingOwner` (returns tasks — leaf and parent alike — with blank `owner`, excludes tasks with a non-blank `owner`).
- `filters.test.js`: new tests for the `owner` filter (matches, non-matches, combined with existing filters, `hasActiveFilter` includes it).
- `csv.test.js`: update existing fixtures/tests for the new column order and index shift; new tests for Owner column parsing (present, blank → row rejected with "Owner is required", combined with existing validation errors) and for PIC staying optional at its new index.
- UI files (`tree.js`, `app.js`, `reports.js`) have no automated test coverage by this project's standing convention (no jsdom) — verified via controller-run Playwright checks: Owner column renders/edits correctly in the Plan tree, Owner filter dropdown populates and filters correctly, CSV template downloads with the new header and a round-trip import (export template → fill Owner+PIC → import) produces tasks with both fields set correctly, Save is blocked with a combined alert when a task is missing Owner and/or planned dates and succeeds once fixed, Reports tables show both columns, Duplicate copies both fields, Resources/workload/capacity are visually unchanged.
- Regression: existing 147 tests must all still pass (none of them assert against the previous CSV column indices in a way that would silently pass with shifted data — this must be confirmed, not assumed, since shifted-but-still-parseable data is exactly the kind of bug that survives a naive test run).

## 6. Guardrail

`owner` is a display-text field, same as `pic`, `remarks`, `name` — never a lookup key or identifier. No future code should branch on a specific owner string (e.g. `if (task.owner === 'KPMG')`); anything needing that kind of structured distinction is a different field/feature, not a special case bolted onto this one.

## 7. Out of Scope

- No managed "Owner list" / roster (add/remove UI), no per-Owner capacity or FTE modeling.
- No changes to `workload.js`'s grouping key, "Only mine" filter semantics, or Resources view structure.
- No `meta.schemaVersion` bump (not used for branching anywhere in this codebase; the per-task `owner === undefined` check is the migration gate).
- No retroactive backfill of individual `pic` values — they start blank for every migrated task, to be filled in by users over time.
