# Issues, Risks & Key Decisions Tab — Design Spec

**Date:** 2026-07-13
**Status:** Approved design (brainstorm complete)
**Scope:** A new tab holding three separate, independently-structured lists — Issues, Risks, and Key Decisions Needed — matching the reference report's two parallel sections (ประเด็นปัญหาและความเสี่ยง / Issues & Risks, and ประเด็นเพื่อหารือ / Discussion & Decisions). Fully independent of every other piece in this batch; no dependency on the rename or billing rework.

## 1. Purpose

The project currently has no place to track issues, risks, or decisions the steering/working teams need to make. The user wants one tab covering all three, added as the project progresses, later feeding two sections of the Reports overhaul (a separate spec).

## 2. Data Model

Three new top-level collections on `Project`, each a plain array of records:

```js
project.issues = [
  { id, title, description, owner, status /* 'Open' | 'Resolved' */, dateRaised, dateResolved }
]
project.risks = [
  { id, title, description, likelihood /* 'Low'|'Medium'|'High' */, impact /* 'Low'|'Medium'|'High' */,
    mitigation, owner, status /* 'Open'|'Mitigated'|'Closed' */, dateRaised }
]
project.decisions = [
  { id, title, description, decisionNeededBy /* date */, owner,
    status /* 'Pending'|'Decided' */, decisionMade /* text, filled once Decided */, dateDecided }
]
```

Each collection is independent — no shared "type" field, no cross-linking to tasks. `owner` is a free-text field, same as `task.owner` (not a strict picklist like `task.pic`).

## 3. Tab UI

One tab, three stacked sections (same page, scrollable — not sub-tabs), each with its own "+ Add" button and table:

- **Issues**: table columns Title, Description, Owner, Status, Date Raised, Date Resolved. Status is a dropdown; Date Resolved only becomes editable/relevant once Status = Resolved.
- **Risks**: table columns Title, Description, Likelihood, Impact, Mitigation, Owner, Status, Date Raised. Likelihood/Impact are dropdowns.
- **Key Decisions Needed**: table columns Title, Description, Decision Needed By, Owner, Status, Decision Made. Decision Made is a free-text field that only becomes relevant once Status = Decided.

All three tables follow the existing inline-cell-edit pattern already used in `tree.js` (double-click a cell to edit, Enter to commit, Escape to cancel) rather than introducing a new editing paradigm.

## 4. Testing

- `store.js`: Node tests for whatever `Project` methods are added (add/update/delete for each of the three collections), following the same shape as existing `addTask`/`updateTask`/`deleteTask`.
- UI (new `issues.js` or similar): controller-run Playwright checks — add one entry to each of the three lists, edit a field inline on each, delete one, confirm counts/rows update correctly and nothing leaks across the three tables.

## 5. Out of Scope

- Linking an issue/risk/decision to a specific task — these are project-level records, not task-level.
- Any notification/reminder mechanism for approaching `decisionNeededBy` dates.
- How these feed the Reports overhaul (separate spec) — this spec only defines the data and the tab's own CRUD UI.
