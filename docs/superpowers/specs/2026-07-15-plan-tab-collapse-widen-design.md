# Plan Tab: Collapse/Expand All + Wider Task Column — Design Spec

**Date:** 2026-07-15
**Status:** Approved design (brainstorm complete)
**Scope:** Two small, independent UX additions to the Plan tab's tree view (`src/js/ui/tree.js`, `src/css/layout.css`). No data model changes. Independent of the Reports v2, Activities CSV, and Excel export specs written alongside this one.

## 1. Collapse All / Expand All

Every parent task already has a persisted `collapsed` boolean (visible in `Project`'s task objects, toggled today one row at a time via the ▸/▾ disclosure triangle in `tree.js`, backed by `Project#toggleCollapse(id)` in `store.js:326-330`). This adds a bulk version.

**Existing convention this must match:** `toggleCollapse` mutates `task.collapsed` directly with **no** `_pushUndo()` and **no** `_audit()` call — collapse state is treated as view-state, not undo-tracked data, even though it happens to live on the task object. `setAllCollapsed` must follow the same convention (a first draft of this spec incorrectly assumed collapse was undo-tracked and specified an undo/audit call — that was wrong; do not add undo/audit here, since `toggleCollapse` has none and consistency matters more than symmetry with unrelated bulk methods like `addTasks`).

**`store.js`:** new method on `Project`:
```js
setAllCollapsed(collapsed) {
  this.tasks.forEach(t => { if (this.tasks.some(c => c.parentId === t.id)) t.collapsed = collapsed; });
}
```
Only tasks that actually have children are touched (leaf tasks don't carry a meaningful `collapsed` value). No undo step is created — clicking Collapse All then Expand All is how you "undo" it, exactly like the existing per-row toggle.

**UI:** two buttons ("Collapse All", "Expand All") in the Plan tab's toolbar, next to the existing `+ Add Task` / search / filter controls. Click calls `state.project.setAllCollapsed(true|false)` then `onChanged()`.

## 2. Wider Task column

`layout.css`'s `#tree-header, .tree-row` grid (`layout.css:48`) currently allocates `220px` to the Task-name column (the second value in `grid-template-columns: 40px 220px 90px 90px 95px 95px 95px 95px 70px 65px 65px 65px 90px 100px 140px 160px 140px`). This project's real task names run long (see the RAM dataset — many names exceed 100 characters), so 220px truncates almost every row. Widen to `360px`. No other column changes — the grid still fits inside the tree panel's existing horizontal scroll container, it just scrolls a bit further right, which is an acceptable trade for readable names in the column that matters most.

## 3. Testing

- `store.js`: Node test for `setAllCollapsed` — collapses all parents in one call, leaf tasks are untouched, calling with `false` after `true` expands everything back (no undo involved, matching `toggleCollapse`'s existing no-undo behavior).
- UI: no Node coverage (tree.js is a UI file, existing convention) — controller-run Playwright check: click Collapse All, confirm every parent row shows ▸ and its children are hidden; click Expand All, confirm the reverse.

## 4. Out of Scope

- Per-branch collapse ("collapse this task and its descendants only", as opposed to all-or-nothing) — not requested.
- Persisting collapse state separately from the task record (e.g. a view-only preference) — collapse state is already a task field, this spec doesn't change that.
