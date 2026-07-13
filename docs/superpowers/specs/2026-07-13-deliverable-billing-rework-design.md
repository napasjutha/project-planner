# Deliverable/Billing Tab Rework — Design Spec

**Date:** 2026-07-13
**Status:** Approved design (brainstorm complete)
**Scope:** Replace the current Billing tab (which lists individually-flagged milestone/deliverable tasks with per-task `billingAmount`/`billingStatus`) with a "Deliverable/Billing" tab built around a new **Billing Milestone** entity that many deliverable tasks can roll up into. Depends on the Milestone→Deliverable rename (separate, prior spec) for the `task.deliverable` field.

## 1. Purpose

Today, billing amount/status live directly on any task flagged `milestone` (soon `deliverable`) — one amount per flagged task, no grouping. The user wants a real many-to-one relationship: several deliverables can belong to one billable milestone (e.g. "Phase 1 Sign-off" bills once, but is backed by 5 separate deliverable tasks completing first).

## 2. Data Model

New top-level collection on `Project`, alongside `holidays`/`picList`/`snapshots`:

```js
project.billingMilestones = [
  { id: 'bm_xxx', name: 'Phase 1 Sign-off', amount: 500000, status: 'Not Billed' }
]
```

`task.billingMilestoneId` (nullable string) replaces the old `task.billingAmount`/`task.billingStatus` fields on individual tasks — it's only meaningful when `task.deliverable === true`, pointing at one entry in `project.billingMilestones`. A billing milestone can have zero, one, or many deliverable tasks pointing at it (many-to-one); a deliverable task points at at most one billing milestone (or none, if not yet assigned).

`billingStatus` values stay the same set already in use today (`'Not Billed'`, `'Invoiced'`, `'Paid'`, or whatever the current billing.js dropdown offers) — this rework changes *where* status/amount live, not the status vocabulary.

## 3. Migration

Existing saved projects (including the two UAT deliverables) have per-task `billingAmount`/`billingStatus` today. `Project`'s constructor gains a third migration block (alongside owner/pic and milestone/deliverable): for every task where `billingAmount != null || billingStatus != null`, create one new `billingMilestones` entry (`name` = the task's own name, `amount`/`status` copied across), set that task's `billingMilestoneId` to the new entry's id, then delete the task's `billingAmount`/`billingStatus` fields. This is 1:1 today (each previously-flagged task becomes its own billing milestone with itself as the sole linked deliverable) — the tab then lets the user consolidate multiple deliverables under one milestone going forward. No existing billing data is lost.

## 4. Tab UI

- **Billing Milestones list** (primary view): each row shows name (editable text), amount (editable number), status (dropdown, same options as today), and the list of currently-linked deliverable task names underneath. A "+ Add Billing Milestone" button creates a new blank entry.
- **Assigning deliverables**: clicking a billing milestone row opens a picker (same UI pattern as the existing predecessor-picker.js — a searchable checklist) listing every task where `deliverable === true`, letting the user check/uncheck which deliverables link to this milestone. Checking a deliverable elsewhere unlinks it from any other milestone it was previously assigned to (a deliverable belongs to at most one billing milestone).
- **Unassigned deliverables**: a second, smaller section lists deliverable tasks with no `billingMilestoneId` yet, so nothing accidentally falls through the cracks.
- Deleting a billing milestone clears `billingMilestoneId` on every task that pointed to it (they become unassigned again, not deleted).

## 5. Testing

- `store.js`: Node tests for the new migration (per-task billing fields → a billing milestone + `billingMilestoneId`, old fields removed), and for whatever new `Project` methods are added to create/update/delete billing milestones and to (re)assign a deliverable's `billingMilestoneId`.
- UI (`billing.js` rewrite): controller-run Playwright checks — create a billing milestone, assign 3 deliverables to it via the picker, confirm all 3 show as linked and none show as unassigned; reassign one to a second milestone and confirm it moves (not duplicates); delete a milestone and confirm its deliverables become unassigned, not deleted.

## 6. Out of Scope

- Any change to how a task becomes `deliverable` in the first place (that's the rename spec).
- Billing totals/rollups feeding into the Dashboard or S-Curve — not requested; the tab itself is the only consumer of this data for now.
