# Dependency UI + Critical Path (V2 Sub-Project B) — Design Spec

**Date:** 2026-07-08
**Status:** Approved design (brainstorm complete)
**Scope:** V2 sub-project B. Adds an in-app UI for setting a task's predecessors (currently only settable via raw JSON or the CSV importer) and a schedule-based critical-path indicator on Gantt bars/arrows. Zero external dependencies.

## 1. Purpose

`Task.predecessors`, cycle detection (`PP.wouldCreateCycle`), the drag-cascade forward pass (`PP.forwardPass`), and Gantt dependency arrows already exist and work — but nothing in the app lets a user actually *set* a predecessor link by clicking around in the Plan tree, and nothing tells a user which tasks are at schedule risk if they slip. This closes both gaps.

## 2. Decisions Log

| Question | Decision |
|---|---|
| Predecessor-setting UI | A searchable multi-select picklist (reconsidered from an earlier, unrelated session note that rejected a picklist for this — that rejection predates actually building this feature and no longer applies). Click the Predecessors cell → popover with a search box + checkbox list of other tasks (by WBS + name) → toggle to add/remove links. |
| Critical path definition | **Based on the project's actual planned dates**, not a textbook CPM earliest-start recompute. Question answered: "which tasks will delay *this* plan if they slip?" — not "which tasks would be critical in a hypothetical from-scratch schedule?" A deliberately-scheduled gap between a task and its successor is real slack, not something to be flattened away. |
| Float formula | `float = networkdays(task.plannedFinish, successor.plannedStart, holidayDates) − 2`, clamped to a minimum of 0. Confirmed via worked example: predecessor finishes Mon, successor starts the very next workday (Tue) → float = 0 (fully critical, no slack at all); float only grows once there's at least one full workday gap. |
| Multi-successor tasks | A task's float = the **minimum** float across all of its successor edges (its tightest relationship governs, standard critical-path principle). |
| Tasks with no successors | Float is relative to the project's current overall planned end (`overall.plannedFinish`, already computed in `calc.js`): `float = networkdays(task.plannedFinish, overallEnd, holidayDates) − 1`. Zero if this task's finish *is* the current latest finish (clamped at 0 minimum too). |
| Leaf-only | Only leaf tasks participate in float/criticality. Parent/phase rows are rollups, never schedulable nodes — consistent with how every other computed field (duration, weight, % actual) already treats parents. |
| Classification | 4 tiers by float (workdays): **Critical** = 0, **Near-Critical** = 1–2, **Watch** = 3–5, **Healthy** = >5. |
| Visual treatment | Gantt bars get a colored **border/outline** per tier (red/orange/yellow; Healthy = today's normal border) — layered on top of the existing status-color fill (Delayed/Complete/In-Progress), not replacing it. Dependency arrows along zero-float (critical) edges specifically thicken and turn red; non-critical edges stay as today. Plan tree gets no separate badge (Gantt-only, per earlier confirmation) — but does get the new Predecessors column itself, since that's the input surface. |

## 3. Architecture

### 3.1 New file: `src/js/criticalpath.js` (engine, pure logic, UMD-lite, Node-tested)

Mirrors `deps.js`'s separate-concern convention.

**`computeCriticalPath(tasks, computed, overall, holidayDates)`** — `tasks` is `project.tasks` (raw), `computed` is `calc.js`'s per-task computed Map (for `isLeaf`/`plannedFinish`/`plannedStart`), `overall` is `calc.js`'s overall rollup object. Returns `{ taskFloat: Map<taskId, { float: number, tier: string }>, criticalEdges: Set<string> }`:
- For each non-cancelled leaf task, find its successors (other leaf tasks whose `predecessors` array includes this task's id). If it has successors, compute `networkdays(thisTask.plannedFinish, successor.plannedStart, holidayDates) - 2` for each, take the minimum (clamped ≥ 0) as this task's float; also add `"<thisId>-><succId>"` to `criticalEdges` for each successor whose *own* edge float is exactly 0 (not just the task's overall minimum — a task can be non-critical via one successor but still have one specific critical edge to another).
- If it has no successors, float = `networkdays(thisTask.plannedFinish, overall.plannedFinish, holidayDates) - 1`, clamped ≥ 0.
- `tier` = `'critical'` if float `=== 0`, `'near-critical'` if `1 <= float <= 2`, `'watch'` if `3 <= float <= 5`, else `'healthy'`.

### 3.2 New file: `src/js/ui/predecessor-picker.js` (UI, DOM-only, no Node coverage)

**`PP.openPredecessorPicker(state, taskId, anchorEl, onCommitted)`** — renders a popover positioned near `anchorEl` (same fixed-position + viewport-clamping pattern already used by `showContextMenu` in `tree.js`): a text search input filtering the list below by name/WBS, and a scrollable checkbox list of every other non-descendant leaf task (using `PP.wouldCreateCycle(state.project.tasks, taskId, candidateId)` to exclude any candidate that would create a cycle — those are simply left out of the list entirely, not shown-disabled, since a task depending on its own descendant is never meaningful here). Each checkbox toggle immediately updates a local pending-selection set (no separate Save button — closing the popover, via a click outside it, commits). On close: if the pending set differs from the task's current `predecessors`, call `state.project.updateTask(taskId, { predecessors: Array.from(pendingSet) }, state.currentUser)` and invoke `onCommitted()`; if unchanged, no-op (no spurious undo checkpoint / audit entry for a picker opened-then-closed without changes).

### 3.3 `src/js/ui/tree.js` changes

- New 18th Plan-tree column, `.col-predecessors`, inserted after Billing Status (last column). Displays the task's current predecessors as comma-joined WBS numbers (e.g. `1.1, 1.3`), computed by looking up each predecessor id's `computed.wbs`. Read-only display text on parent rows (blank, like Billing); on leaf rows, dblclick opens `PP.openPredecessorPicker` directly (a new branch in `wireTree`'s dblclick handler, checked *before* the generic `.cell`/`data-field` dispatch, since this isn't a text/date/select edit) rather than going through `beginEdit`.
- `layout.css`'s Plan-tree `grid-template-columns` grows from 17 to 18 tracks (existing 1695px width + one more column, e.g. 140px for the Predecessors column — width chosen to comfortably fit a few comma-joined WBS numbers like `1.1, 1.3, 2.4`).

### 3.4 `src/js/ui/gantt.js` changes

- After computing `state.calc` per the existing pattern, also call `PP.computeCriticalPath(state.project.tasks, state.calc.computed, state.calc.overall, holidayDates)` once per render.
- Each leaf task's bar (`rect.gantt-bar`) gets its `stroke` attribute set from the tier (`critical` → `var(--status-delayed)` at full strength with a thicker `stroke-width: 2`, `near-critical` → an orange token — new `--tier-near-critical: #ff9500` added to `theme.css`, `watch` → a yellow token — new `--tier-watch: #ffcc00`, `healthy` → unchanged `var(--kpmg-blue)` at `stroke-width: 1`, today's default). The progress-fill overlay rect is unaffected — it already draws its own `Delayed`/`Complete` fill on top and is unrelated to the border.
- Each dependency arrow (`path` + arrowhead `polygon` in the predecessor-drawing loop) checks `criticalEdges.has(predId + '->' + thisId)`: if present, `stroke`/`fill` become `var(--status-delayed)` with `stroke-width: 2` (arrows), else the existing `var(--text-tertiary)` / `stroke-width: 1` from the earlier chart-color-token pass.

## 4. Data Flow

```
Plan tree → dblclick Predecessors cell (leaf row)
  → PP.openPredecessorPicker(state, taskId, cell, onCommitted)
  → popover: search + checkbox list (cycle-creating candidates excluded)
  → click outside → commit if changed → state.project.updateTask(..., { predecessors }, who)
  → onCommitted() → refresh(state, true)

Gantt render → state.calc already computed → PP.computeCriticalPath(...)
  → per-bar stroke color/width by tier, per-arrow stroke/fill by criticalEdges membership
```

## 5. Error Handling

- A candidate that would create a cycle is simply never shown in the picker's list — there is no error state to surface, since the invalid choice never becomes selectable.
- `computeCriticalPath` assumes an acyclic graph (guaranteed by the picker never allowing a cycle to be created) but, matching `forwardPass`'s existing defensive pattern, its successor-walk is bounded and does not infinite-loop even if a corrupted/hand-edited project file contains a cyclic `predecessors` array directly.
- A leaf task with a `predecessors` entry pointing at an id that no longer exists (e.g. the predecessor was deleted) is silently skipped when building the successor lookup — matches how `forwardPass`/Gantt's existing arrow-drawing already handle a missing predecessor (`if (predIndex === -1) return;`).

## 6. Testing

`criticalpath.js` is pure logic, fully Node-tested via `node:test`: the float formula's exact fencepost (predecessor finishes Monday, successor starts the very next workday Tuesday → float 0, the confirmed worked example, asserted literally so this boundary can never silently drift; predecessor finishes Monday, successor starts Wednesday — one full workday, Tuesday, sitting unused in between → float 1), the min-across-successors rule, the sink-task-relative-to-overall-end rule, tier boundaries (0/1/2/3/5/6+ workdays each land in the right tier), and `criticalEdges` correctly identifying only the zero-float edges (not every edge touching a task whose overall float happens to be 0, when that task has multiple successors and only one of them is the tight one). `predecessor-picker.js`/`tree.js`/`gantt.js` changes are DOM/File-API code with no Node-testable surface, verified via a controller-run real-browser session same as every prior plan's final task: open the picker on a real task, confirm cycle-creating candidates are absent from the list, set/change predecessors, confirm the Plan tree's new column updates, confirm Gantt bar borders and arrow colors match the expected tier for a small hand-built dependency chain with a mix of tight and slack gaps.

## 7. Out of Scope

- The "Theoretical CPM" (duration-only, ignoring actual dates) alternate mode — explicitly proposed and explicitly deferred; can be added later as an optional toggle without changing this plan's default behavior if ever actually requested.
- A Plan-tree badge/column duplicating the critical-path tier visually (Gantt-only per the confirmed decision) — the new Predecessors column is about *input*, not about displaying criticality.
- Resource Leveling (sub-project C) — separate spec, brainstormed next.
