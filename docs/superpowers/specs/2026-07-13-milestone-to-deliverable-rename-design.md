# Milestone → Deliverable Rename — Design Spec

**Date:** 2026-07-13
**Status:** Approved design (brainstorm complete)
**Scope:** Rename the existing "Milestone" concept to "Deliverable" throughout the app — same underlying concept, same visual marker, new name. First of five planned sub-projects (Issues/Risks+Decisions tab, Deliverable/Billing tab rework, Activities/calendar tab, and a Reports overhaul all follow as separate specs); this one is foundational since the Deliverable/Billing rework depends on this vocabulary.

## 1. Purpose

`task.milestone` is a boolean flag set via the Plan tree's right-click context menu, rendered as a ♦ diamond marker in the tree and as a diamond shape on the Gantt chart, and used to compute "Milestones complete" KPIs and filter the tree to only milestone tasks. The user wants this renamed to "Deliverable" everywhere — same concept, same behavior, same visuals — as groundwork for an upcoming Deliverable/Billing tab rework (a future spec) that will attach billing to groups of deliverables.

## 2. Decisions Log

| Question | Decision |
|---|---|
| Same concept or new one? | Same concept, renamed. One boolean flag; no new field, no coexistence with a separate "milestone" concept. |
| Rename the underlying field, or just relabel the UI? | Full rename: `task.milestone` → `task.deliverable` everywhere (data field, computed fields, filter keys, CSV header, CSS class), not just display text. |
| Visual marker (♦ diamond) | Unchanged. Same glyph in the tree row and same diamond shape on the Gantt bar. Only the tooltip/label text changes from "Milestone" to "Deliverable". |
| Backward compatibility with saved files | Required. Existing saved JSON projects and the two UAT deliverable files (`ProjectPlanner_UAT.html`, `TCEBPlanner.html`) have tasks with `milestone: true` baked into their seed data and must keep working unmodified after this ships. |

## 3. Field Rename Scope

`task.milestone` (boolean) becomes `task.deliverable` (boolean). Every reference across the codebase is renamed to match:

- **`store.js`**: `Project` constructor gains a migration (see §4). `addTask`'s default (`milestone: false` → `deliverable: false`) and `addTasks`' per-spec field (`milestone: !!spec.milestone` → `deliverable: !!spec.deliverable`) are renamed.
- **`calc.js`**: the per-task computed field `isMilestone` → `isDeliverable`. The project-level KPI fields `milestonesTotal`/`milestonesComplete` → `deliverablesTotal`/`deliverablesComplete`.
- **`filters.js`**: the filter key `onlyMilestone` → `onlyDeliverable`; the check against `task.milestone` becomes `task.deliverable`.
- **`csv.js`**: the `CSV_HEADERS` column literal `'Milestone'` → `'Deliverable'` (same column position). The `MILESTONE_TRUE` truthy-value constant → `DELIVERABLE_TRUE`. The parsed row's `milestone` local variable and the field name written into the created task → `deliverable`.
- **`tree.js`**: the context-menu action label `'Mark as Milestone'` → `'Mark as Deliverable'`, and the toggle-state label `'✓ Milestone (click to unset)'` → `'✓ Deliverable (click to unset)'` (same click handler, now writing `deliverable`). The row marker's tooltip text `"Milestone"` → `"Deliverable"`; its CSS class `milestone-marker` → `deliverable-marker`.
- **`gantt.js`**: the `computed.isMilestone` check that decides whether to render the diamond shape → `computed.isDeliverable`.
- **`billing.js`**: mechanical field-name update only (`t.milestone` → `t.deliverable`; the empty-state copy `"No milestone tasks yet — billing only applies to tasks flagged as milestones."` → `"No deliverable tasks yet — billing only applies to tasks flagged as deliverables."`). The tab's actual data-model rework (many deliverables rolling up to one billing milestone) is a separate future spec — out of scope here.
- **`dashboard.js`**: the section heading `'Upcoming Milestones (14 days)'` → `'Upcoming Deliverables (14 days)'`; the `task.milestone` checks (both the upcoming-list filter and the billing-amount check) → `task.deliverable`.
- **`reports.js`** and **`app.js`**: the KPI row label `'Milestones'` (rendered as `kpis.milestonesComplete + '/' + kpis.milestonesTotal`) → `'Deliverables'` using the renamed KPI fields.
- **`index.html`**: the filter checkbox `id="only-milestone-filter"` → `id="only-deliverable-filter"`; its label text `"Only milestones"` → `"Only deliverables"`.
- **`app.js`**: the checkbox's change-listener (`document.getElementById('only-milestone-filter')`) and the `filters` state's default (`onlyMilestone: false`) both follow the renamed id/key.
- **`layout.css`**: the `.milestone-marker` rule → `.deliverable-marker` (identical styling, selector renamed only).
- **Tests**: every test file currently referencing `milestone`/`isMilestone`/`onlyMilestone`/`milestonesTotal`/`milestonesComplete` (`store.test.js`, `calc.test.js`, `filters.test.js`, `csv.test.js`, `criticalpath.test.js`, `workload.test.js`) and the `fixtures/vision-phase.js` fixture are updated to the renamed field/keys, preserving identical test coverage under the new names.

## 4. Migration

`Project`'s constructor already has a precedent for exactly this kind of rename — the existing owner/pic migration (`src/js/store.js:50-55`):

```js
this.tasks.forEach(t => {
  if (t.owner === undefined) {
    t.owner = t.pic || '';
    t.pic = '';
  }
});
```

This spec adds a second migration block in the same `forEach`, following the same pattern:

```js
this.tasks.forEach(t => {
  if (t.owner === undefined) {
    t.owner = t.pic || '';
    t.pic = '';
  }
  if (t.milestone !== undefined) {
    t.deliverable = !!t.milestone;
    delete t.milestone;
  }
});
```

This runs on every `new Project(data)` call (including `Project.fromJSON`, which is how saved/loaded/imported projects are constructed), so any file — hand-authored, previously saved, or one of the existing UAT deliverables — that still has `milestone: true`/`false` on its tasks is transparently upgraded to `deliverable` on load, with no user-visible disruption and no re-save required to keep working.

## 5. Testing

- All renamed fields/keys get full Node test coverage under their new names in the existing test files listed in §3 — this is a rename, not new behavior, so no new test *cases* are added beyond the migration itself.
- New test: `store.test.js` gets one test for the migration — constructing a `Project` from raw data containing `{ milestone: true }` on a task and asserting the resulting task has `deliverable === true` and no `milestone` key.
- Regression: total test count changes by exactly the one new migration test; every existing test keeps passing under its renamed assertions.
- UI files (`tree.js`, `gantt.js`, `billing.js`, `dashboard.js`, `reports.js`, `app.js`) have no automated coverage by this project's standing convention — verified via controller-run Playwright checks: the diamond marker still renders identically on a task flagged via the (renamed) context-menu action, the Gantt diamond shape still renders for that task, the "Only deliverables" filter still isolates flagged tasks, the Dashboard's "Upcoming Deliverables" section and KPI count still populate correctly, the CSV template's header row reads "Deliverable" and a round-trip export/import preserves the flag, and loading one of the two existing UAT files (which still contain raw `milestone: true` task data) renders with those tasks correctly marked as deliverables — confirming the migration works against real, previously-authored data.

## 6. Out of Scope

- The Deliverable/Billing tab's actual data-model rework (many deliverables rolling up to one billing milestone) — separate future spec.
- The Issues/Risks + Key Decisions tab, the Activities/calendar tab, and the Reports-tab overhaul — three more separate future specs.
- Any change to the visual marker glyph, color, or shape — stays the ♦ diamond exactly as it renders today.
- Rebuilding the two UAT HTML deliverables is a mechanical post-merge step (same as every prior feature this session), not a design decision — the migration in §4 is what makes their embedded `milestone: true` seed data continue to work unmodified.
