# Resources — Capacity & Workload (V2 Sub-Project C) — Design Spec

**Date:** 2026-07-08
**Status:** Approved design (brainstorm complete)
**Scope:** V2 sub-project C ("Resource Leveling" on the original roadmap, scoped during brainstorm to **detect-and-visualize** overload, never auto-reschedule). Adds a new consolidated **"Resources" view tab** containing: PIC list management (moved out of Settings), a per-week FTE capacity planning table (W1…Wn), and a manday/FTE-based weekly workload grid with overload flagging. Zero external dependencies.

## 1. Purpose

Nothing in the app today answers "is anyone overbooked?" — the Dashboard's Workload-by-PIC section only counts total tasks per person, ignoring *when* those tasks overlap and how much of each person is actually available. And resource-related controls are scattered (PIC list lives in Settings). This adds a real week-by-week capacity model (Alice can be 1.0 FTE in W1–W8 and 0.5 in W9 only, or any per-week pattern), a demand-vs-capacity workload grid that flags overload, and one tab that owns everything resource-related.

## 2. Decisions Log

| Question | Decision |
|---|---|
| Leveling scope | **Detect + visualize only.** The app never moves task dates to resolve overload — user-as-scheduler, the same philosophy that shaped the planned-dates-based critical path. Auto-leveling explicitly rejected. |
| Overload measure | **Manday/FTE-based**, not naive concurrent-task counting. Every workday a leaf task is active demands 1 manday from its PIC (no partial-allocation field exists on tasks). |
| Capacity granularity | **Per-week, each week independent.** Setting Alice to 0.5 in the week of Sep 1 affects that week only; every other week keeps its own value. Default for any week never explicitly set: **1.0**. Rationale (user's): once all tasks are input, the full project length is known, so capacity is planned deliberately week-by-week across W1…Wn — a one-off dip (training week) is as easy as a lasting change (fill the later cells). |
| Capacity editing surface | **Directly in the Resources tab's capacity table** — a PIC × week grid (columns labeled `W1…Wn` with the week's Monday date), each cell an editable FTE number. Not chips in Settings, not dated effective-from entries. |
| Consolidation | **Everything resource-related moves to the new Resources tab**: the PIC add/remove list leaves Settings entirely; capacity table and workload grid live alongside it. Settings keeps Theme / Project / Audit Log only. |
| Weekly buckets | Monday-based weeks (same convention as the S-curve's weekly points), spanning from the earliest leaf planned start to the latest leaf planned finish. Labeled `W1…Wn` in project-relative order, with the Monday ISO date as a sub-label. |
| Overload rule | Load ratio = demand ÷ available. **> 1.0 = overloaded** (red tint). Exactly 1.0 = fully booked (yellow tint). Below = fine (neutral). `demand > available` covers the `available = 0` case (a 0-FTE week with assigned work is overloaded by definition). |
| Drill-down | Clicking a non-idle workload cell lists that PIC's active tasks for that week (WBS, name, planned dates) below the grids. |
| Task scope | Leaf tasks only, cancelled excluded — consistent with duration/weight/%actual/critical-path treatment of parents as non-schedulable rollups. Tasks with a blank PIC or missing planned dates contribute no demand. |

## 3. Data Model

`settings.picFte` — new optional map on the existing serialized `settings` object, keyed by PIC name → per-week overrides keyed by the week's Monday ISO:

```json
"settings": {
  "theme": "kpmg-light",
  "ganttZoom": "week",
  "picFte": {
    "Alice": { "2026-08-31": 0.5, "2026-09-07": 0.5 },
    "Bob":   { "2026-06-01": 0.8 }
  }
}
```

- Any (PIC, week) pair absent from the map = **1.0**.
- Setting a cell back to exactly `1` deletes the override key (keeps files minimal — the map stores only deviations from the default).
- **Backward compatibility is automatic**: existing saved `.json` files simply lack `picFte`; every PIC resolves to 1.0 everywhere. No migration, no schema-version bump. `picList` stays a plain string array; every current consumer (`renderPicFilter`, tree PIC cells, dashboard) is unchanged.
- Removing a PIC from the list also deletes their `picFte` entry.

## 4. Architecture

### 4.1 New file: `src/js/workload.js` (engine, pure logic, UMD-lite, Node-tested)

**`weekFteFor(picFte, picName, weekMondayISO)`** — returns the override in `picFte[picName][weekMondayISO]` if present, else `1.0`. Malformed values on read (negative, non-numeric — possible in a hand-edited file) clamp to `0`/`1.0` respectively; the engine never throws on bad capacity data.

**`computeWorkload(project, computed)`** — inputs: the raw project (tasks, holidays, `settings.picFte`) and `calc.js`'s computed Map (for `isLeaf`). Derives the week range from min leaf planned start → max leaf planned finish. Returns:

```js
{
  weeks: [ { index: 1, mondayISO: '2026-06-01' }, ... ],   // W1..Wn
  pics:  ['Alice', 'Bob', ...],                            // union of picList + every task.pic, sorted
  cells: Map<'pic|mondayISO', {
    demand: number,        // task-workdays assigned this week (holiday-aware)
    available: number,     // workdays in this week (holiday-aware) × weekFteFor(...)
    overloaded: boolean,   // demand > available
    taskIds: string[]      // leaf tasks active in this week for this PIC
  }>
}
```

Demand per cell: for each non-cancelled leaf task with this `pic` and both planned dates, count its active workdays intersecting the week (weekends/holidays excluded, existing `schedule.js` primitives). Available per cell: (workdays in the week, holiday-aware) × that week's FTE.

### 4.2 New file: `src/js/ui/resources.js` (UI, DOM-only)

**`PP.renderResources(state)`** / **`PP.wireResources(state, onChanged)`** — renders three stacked sections into `#resources-view`:

1. **PIC List** — the add/remove editor moved verbatim from Settings (same element ids so wiring is a move, not a rewrite: `#pic-list-editor`, `#new-pic-input`, `#add-pic-button`; markup relocates from the Settings view container to the Resources view container in `index.html`).
2. **Capacity (FTE) table** — sticky PIC-name first column; one column per week (`W3` header, `Jun 15` sub-label); each cell an `<input type="number" step="0.1" min="0">` prefilled with that week's FTE. On change: write/delete the `settings.picFte` override per the value-1.0-deletes rule, then `onChanged()` (undoable + autosaved like every other edit). Horizontal scroll for long projects, same `overflow-x` container pattern as the Plan tree.
3. **Workload grid** — same PIC rows × same week columns; each cell shows `demand/available` as a ratio to 1 decimal (`1.3`) or `–` when both are 0. Tinting reuses the status-pill rgba language: overloaded → delayed-red tint; demand = available exactly (and nonzero) → yellow tint (`--tier-watch`, the token sub-project B introduces — if C builds first, this token lands here instead); under → no tint. The `available = 0, demand > 0` cell renders the raw `4/0` form, red. Click any non-idle cell → drill-down task list below (WBS, name, planned dates — built with `textContent` per the standing XSS rule).

### 4.3 Settings changes (`src/index.html`, `src/js/ui/settings.js`)

The PIC List `.settings-section` block moves out of the Settings view markup into the Resources view; the wiring code for it moves from `settings.js` to `resources.js` unchanged. Settings retains Theme, Project (rename / New Project), and Audit Log.

### 4.4 New tab wiring

`index.html` gains `.view-tab[data-view="resources"]` and `<div id="resources-view" hidden>`, and `app.js`'s `VIEW_IDS` gains `'resources-view'` — all **three** places, per the documented gotcha that has bitten this project twice. `refresh()` calls `PP.renderResources(state)` alongside the other renderers; `showApp()` wires `PP.wireResources(state, ...)` once.

## 5. Data Flow

```
Resources tab → PIC List (add/remove people)
             → Capacity table: set FTE per PIC per week (that week only; blank/1.0 = default)
             → settings.picFte updated → refresh(state, true)
Workload grid → PP.computeWorkload(project, calc.computed)
             → demand/available ratio per PIC-week, red/yellow tinting
             → click cell → task drill-down below
User sees overload → manually reschedules/reassigns in Plan or Gantt → grid updates on refresh
```

## 6. Error Handling

- Malformed `picFte` values in a hand-edited file (negative, non-numeric, unknown week keys) are clamped/ignored on read — the engine never throws on bad capacity data; unknown week keys are simply never queried.
- A task whose PIC isn't in `picList` still appears in both grids (pics = union of list + task assignments), so demand can never silently vanish.
- A project with no dated leaf tasks renders the Resources tab with the PIC list only and an empty-range message for the two grids (no zero-width table).

## 7. Testing

`workload.js` is pure logic, fully Node-tested: `weekFteFor` (absent map/PIC/week → 1.0, present override, clamping of malformed values), `computeWorkload` demand counting (task spanning a week boundary splits correctly, holidays reduce both demand and available, cancelled/parent/blank-PIC/missing-date tasks excluded), a literal worked example (Alice overridden to 0.5 for one specific week, 4 demanded workdays in a 5-workday week → available 2.5, ratio 1.6, overloaded; adjacent weeks unaffected at 1.0), the `available = 0, demand > 0` overloaded case, and W-index/Monday alignment. UI (`resources.js`, tab wiring, Settings relocation) verified via controller-run real-browser session: seeded project with a deliberate overload, grid values/tints match hand-computed numbers, FTE cell edit immediately updates the workload grid and round-trips through Save/Load, drill-down lists the right tasks, PIC list works from its new home (and is gone from Settings), and the new tab actually renders (the VIEW_IDS gotcha check) in both themes.

## 8. Out of Scope

- Auto-leveling / auto-rescheduling of any kind — explicitly rejected.
- Per-task effort or %-allocation fields (a task demands its PIC's full day for every active workday).
- Multi-PIC assignment per task (`task.pic` stays a single string).
- Exporting the capacity/workload grids (Reports integration can come later if wanted).
