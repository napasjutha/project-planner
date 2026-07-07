# V2 Round 1: External JSON Save/Load + Data Quality & Display — Design Spec

**Date:** 2026-07-06
**Status:** Approved design (brainstorm complete)
**Covers:** two of the five V2 sub-projects scoped in this session, built in this order per the user's confirmed sequencing — **Part I: External JSON Save/Load** (sub-project E, builds first since it changes the persistence model everything else sits on), **Part II: Data Quality & Display** (sub-project A). Both were fully brainstormed and clarified in the same session, hence one combined spec.

**Deferred to future specs (scoped/ordered, not yet clarified in detail):** sub-project B (Dependency UI + critical path), sub-project C (Resource Leveling), sub-project D (CSV Import). Build order after this spec ships: B → C → D.

**Supersedes:** the save model described in `2026-07-05-project-planner-design.md` §3.3 ("Save button downloads updated copy of the file with data embedded"). Part I of this spec replaces that mechanism; everything else in the original spec (engines, calc rules, other views) is unaffected except where Part II explicitly extends the data model/Plan view.

---

# Part I: External JSON Save/Load

## 1. Purpose

ProjectPlanner is meant to be copied once and reused across many independent projects (Salesforce implementations, PMO tracking, change programs, etc.) — the same HTML file, handed to whoever needs it, dropped into a new sharedrive folder, and used to plan a completely separate project. Today's save model (Save → downloads a new full HTML with data re-embedded) works, but ties the shareable-app-file and the project-data together in one growing artifact, which:

- makes the file bigger and noisier to diff/version every save (the whole ~110KB app re-downloads even though only the data changed)
- means "the app" and "this specific project's data" are the same file, which fights against reusing one HTML across many unrelated projects

This spec splits them: **the HTML file is a stable, reusable app shell** (identical everywhere it's copied, never carries live project data past its blank starter state), and **all project data lives in a separate, small, versioned `.json` file** that Save produces and a new "Load Project" action reads back in.

## 2. Decisions Log

| Question | Decision |
|---|---|
| What does Save produce? | A `.json` file only — `project.toJSON()`, versioned as `<project-slug>_rev<N>_<date>.json` (same naming convention already shipped for the old HTML save). No more full-HTML cloning/download. |
| Does the HTML ever carry live data? | No, by design. The shipped/copied HTML's embedded `#project-data` block is always the blank starter template. Live data only ever exists in-memory, in `localStorage` (as today, for crash/reload recovery), or in an externally saved/loaded `.json` file. |
| How does data get back into the app? | A new "Load Project" button opens a native file picker (`<input type="file" accept=".json">`), reads the picked file, validates its shape, and replaces `state.project`. |
| Standalone full-HTML export (today's behavior) kept as a fallback? | No. Confirmed with the user: HTML is always identical; only the JSON differs per project. No secondary "export standalone copy" path. |
| Does localStorage autosave/restore still work? | Yes, unchanged — keyed by `project.meta.id`, same revision-based "restore unsaved work?" prompt on reopen. This is orthogonal to the json save/load mechanism; it's the same-machine/same-session crash-recovery safety net Save/Load already assumed. |
| Multi-user/multi-session collaboration model | Same as before: last-write-wins, no merge. Whoever has the latest `.json` (by rev number) is the source of truth; a colleague loads it, edits, saves the next revision. Two json files with different rev numbers are far easier to eyeball-diff than two full HTML files were. |

## 3. Architecture

### 3.1 What changes in `src/js/ui/app.js`

**`handleSave` (replaced):**
```js
function handleSave(state) {
  state.project.meta.savedBy = state.currentUser;
  state.project.meta.savedAt = new Date().toISOString();
  var json = state.project.serialize();

  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var dateStr = state.project.meta.savedAt.slice(0, 10);
  a.download = slugifyProjectName(state.project.meta.name) + '_rev' + state.project.meta.revision + '_' + dateStr + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  state.dirty = false;
  document.getElementById('dirty-indicator').textContent = '';
  localStorage.setItem(storageKey(state.project.meta.id), json);
}
```
No more `document.documentElement.cloneNode`, no more `#project-data`/`#dirty-indicator`/`#app`/`#name-picker` DOM surgery — none of that is needed once Save only ever produces a data file, not a full page. `slugifyProjectName` is reused unchanged from the existing implementation.

**`handleLoadProject` (new):**
```js
function handleLoadProject(state, file) {
  if (state.dirty && !window.confirm('Unsaved changes will be lost — load anyway?')) return;
  var reader = new FileReader();
  reader.onload = function () {
    var parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (e) {
      window.alert('That file is not valid JSON.');
      return;
    }
    if (!parsed || !parsed.meta || !Array.isArray(parsed.tasks)) {
      window.alert('That file does not look like a ProjectPlanner project (missing meta/tasks).');
      return;
    }
    state.project = new PP.Project(parsed);
    state.dirty = false;
    state.scurveOverlaySnapshotId = null;
    state.snapshotCompareA = null;
    state.snapshotCompareB = null;
    state.holidaysViewYear = null;
    refresh(state, false);
  };
  reader.onerror = function () {
    window.alert('Failed to read that file.');
  };
  reader.readAsText(file);
}
```
Wired to a hidden `<input type="file" accept="application/json">` triggered by a visible "Load Project" button, same pattern every file-picker UI uses.

**`index.html`:** header gets a "Load Project" button next to Save. `#project-data`'s embedded seed stays exactly the blank-project JSON it already is (`{"tasks":[],...}`) — no change needed there, since it was already generic per the original spec's genericization pass.

### 3.2 What does NOT change

- Every engine (`calc.js`, `store.js`, `schedule.js`, etc.) — completely unaffected, this is a UI/persistence-layer change only.
- `localStorage` autosave-on-edit and the revision-based restore-prompt in `boot()` — unchanged.
- The name-picker flow, undo/redo, audit log, every other tab — unaffected.
- The versioned-filename convention (`slug_rev_date`) — reused as-is, just with a `.json` extension instead of `.html`.

## 4. Data Flow

```
Copy ProjectPlanner.html → new sharedrive folder
  → open in browser → boots blank (or restores localStorage if same machine/session)
  → plan (add tasks, edit dates, etc.) — in-memory + localStorage-backed, same as today
  → click Save → downloads myproject_rev1_2026-07-06.json
  → [next session, possibly different person] open the same html → click "Load Project" → pick that json → state restored
  → keep editing → click Save again → myproject_rev2_2026-07-07.json
```

## 5. Error Handling

- Loading a non-JSON or malformed file → clear `alert`, no crash, current project untouched.
- Loading valid JSON that doesn't look like a ProjectPlanner project (`meta`/`tasks` missing) → clear `alert`, current project untouched.
- Loading while there are unsaved changes → `confirm()` guard before replacing state, same pattern as the existing New-Project-reset flow in Settings.
- `beforeunload` dirty-guard unchanged.

## 6. Testing

Same split used throughout this project: `handleSave`/`handleLoadProject` are DOM/File-API code with no Node-testable surface (zero-dependency constraint blocks jsdom) — verified via controller-run real-browser Playwright: save a project, reload the blank shell, use Load Project to bring the json back in, confirm data matches exactly (task list, dates, KPIs). The JSON-shape validation check (`!parsed.meta || !Array.isArray(parsed.tasks)`) is simple enough to stay inline; no separate pure-function extraction needed for this scope.

## 7. Out of Scope (Part I)

- Auto-detecting/loading a sibling `.json` file next to the HTML without a manual file-picker click (would require the File System Access API, Chrome/Edge only — rejected per this project's standing cross-browser requirement).
- Any merge/conflict resolution between two people's saved json revisions — still last-write-wins, unchanged from today.
- Sub-projects B (Dependency UI + critical path), C (Resource Leveling), D (CSV Import) — each gets its own spec once Parts I and II ship.

---

# Part II: Data Quality & Display

## 8. Purpose

A bundle of small, mostly-independent Plan-view improvements: enforce that every task has planned dates, show who last touched a task, visually distinguish parent/phase rows from leaf rows, add the originally-spec'd-but-never-shipped Actual Start/Actual Finish/Remarks columns, auto-derive `% Actual` from those actual dates instead of free-typing it, and add billing-specific fields to milestone tasks.

## 9. Decisions Log

| Question | Decision |
|---|---|
| Required fields | `plannedStart` and `plannedFinish` are mandatory on every **leaf** task (no children). **Save is blocked** if `plannedFinish`/`plannedStart` is missing on any leaf task; the Save action shows which task(s) are incomplete rather than silently failing. |
| New tasks default | `addTask` still creates with `plannedStart`/`plannedFinish` as `null` (unchanged) — the block only fires at Save time, not at task-creation time, so a user can create several tasks in a row and fill in dates before saving, without being interrupted per-task. |
| Parent/phase date fields | Parent/phase tasks (any row with children) never have raw, user-entered `plannedStart`/`plannedFinish`/`actualStart`/`actualFinish`/`% Actual` — those are always **computed rollups** (min start / max finish across children, weighted `% Actual` across children), never required at Save time, and rendered read-only in the Plan tree. Already shipped ahead of this spec (`calc.js`/`tree.js`, commit `231ae65` on `main`) — confirmed with the user directly; this section documents the existing behavior so Part II's required-field validation and new Actual Start/Finish columns build on it correctly rather than re-deriving it. |
| Last-updated-by | New "Updated By" + "Updated At" columns in the Plan tree, populated from the same per-field audit write path `updateTask` already uses — shows the most recent edit to *any* field on that task, not just dates. |
| Parent vs child styling | Parent/phase rows (any row with children) render bold with a slightly darker row background; leaf rows unchanged. Indentation already conveys depth — this is a one-level visual distinction (parent vs not), not a per-depth color ramp. |
| Missing columns from original spec | Add Actual Start, Actual Finish, Remarks. (Deliverable and Jira were also originally spec'd and never shipped — explicitly deferred, not part of this bundle, per the user's answer.) |
| `% Actual` semantics | **Changes from user-editable to fully computed.** Locked formula (see §11) — no more manual entry; the editable fields become Actual Start/Actual Finish dates instead. |
| Billing Milestone | Milestone tasks (`task.milestone === true`) gain two optional new fields: `billingAmount` (number) and `billingStatus` (`"Not Billed"` \| `"Invoiced"` \| `"Paid"`). Dashboard gets a new "Billing Summary" section (total billable / invoiced / paid) alongside its existing sections. |

## 10. Required-Field Validation

**Data model:** no change — `plannedStart`/`plannedFinish` already exist and are already nullable; this is enforcement at the UI boundary, not a schema change.

**Enforcement point:** `handleSave` (both the existing full flow and Part I's new json-only flow — this validation must run before either produces a download). Before serializing, only **leaf** tasks (no children) are checked — parent/phase tasks are computed rollups (see the Decisions Log row above) and are never required:
```js
function findIncompleteTasks(project) {
  var parentIds = new Set(project.tasks.map(function (t) { return t.parentId; }).filter(Boolean));
  return project.tasks.filter(function (t) {
    if (parentIds.has(t.id)) return false; // parent/phase row: dates are a computed rollup, never required
    return !t.plannedStart || !t.plannedFinish;
  });
}
```
If the list is non-empty: block the save, show an alert (or a small inline panel) listing the incomplete tasks by name, and do not download anything. The user fixes the dates on the Plan tab and tries Save again.

**Why block rather than warn-and-allow:** confirmed directly with the user — every task must always have both dates; this is enforced at the moment of saving/sharing the file, which is the natural checkpoint (you can work with incomplete data mid-session, you can't hand off a file with holes in it).

## 11. Auto-Derived `% Actual` — Locked Formula

This replaces the current free-typed `actualPct` field entirely. Confirmed with the user via two worked examples (Jan 1→Jan 20 actual range, "now" Jan 10 → 50%; and the general rule restated back correctly), counting **working days only** (reuses `schedule.js`'s `networkdays`, exactly like `plannedPctToDate` already does for the Plan side):

```js
function actualPctToDate(actualStart, actualFinish, statusDate, plannedDuration, holidayDates) {
  if (!actualStart) return null;                       // blank until actual work has started
  if (actualFinish && statusDate >= actualFinish) return 1;   // done
  if (plannedDuration <= 0) return actualFinish ? 1 : null;
  var elapsed = networkdays(actualStart, statusDate, holidayDates);
  return Math.max(0, Math.min(0.99, elapsed / plannedDuration));  // ramping, paced by the PLANNED duration
}
```
- No Actual Start yet → `null` (displayed as blank, not `0%`).
- Actual Start set, no Actual Finish yet → ramps from 0 toward 0.99, using **elapsed workdays since Actual Start ÷ the task's planned duration** as the pacing reference (there is no "actual duration" to divide by until the task is actually finished, so the planned duration is the only meaningful denominator available while work is in progress).
- Actual Finish set and reached → exactly `1` (100%), regardless of how the ramp was tracking beforehand.
- Capped at `0.99` (deliberately never `1`) so a task running long (past its planned finish, still without an Actual Finish) shows 99%-pending rather than an invalid >100% **and** never silently reads as "Complete" — `deriveStatus`'s `actualPct >= 1` check can only be satisfied by a genuinely reached `actualFinish`. (Decided after final review flagged that capping at exactly `1` let an overdue-but-unfinished task auto-flip to Complete and drop out of the Delayed view — confirmed with the user, who chose to require a real Actual Finish.)

**Cascading effects (all contained, since every downstream consumer already reads the *computed* `actualPct` field, never the raw stored one):**
- `status.js`'s `deriveStatus` still checks `actualPct >= 1` for `"Complete"` — this can now ONLY be true once `actualFinish` is genuinely set and reached (the ramp itself can never reach `1`), which is a **data-integrity improvement** over today (today a user could type `100` without ever setting an actual finish date).
- S-curve, Dashboard bars, Gantt fill, Reports, Snapshots — all already consume `computed.actualPct`; none need to change.
- The Plan tree's `% Actual` cell becomes **read-only** (no more double-click-to-edit); the editable cells become the new Actual Start / Actual Finish date columns instead.
- **Migration note for existing saved projects:** any project saved under the old model has `task.actualPct` as a raw user-typed value that may not agree with that task's `actualStart`/`actualFinish`. Once loaded under the new engine, the displayed `% Actual` will be silently recomputed from dates and may visibly change from what was previously shown. This is an accepted, intentional behavior change — flagged here so it isn't mistaken for a bug when it's first noticed on an old project file.

## 12. Billing Milestone

**Data model addition** — two new optional fields on the `Task` shape (only meaningful when `milestone: true`, but not enforced/hidden for non-milestones — harmless if unset):
```json
{ "billingAmount": null, "billingStatus": null }
```
`billingStatus` is one of `null`, `"Not Billed"`, `"Invoiced"`, `"Paid"`.

**UI:** the Plan tree's context menu gets a "Billing Milestone" toggle-adjacent flow (or, simplest: once `milestone` is checked, two additional cells become visible/editable on that row — amount and status dropdown). Exact placement is an implementation-plan detail, not a design constraint — the data model and Dashboard rollup are the only things locked here.

**Dashboard addition:** new "Billing Summary" section — total `billingAmount` across all billing milestones, broken down by `billingStatus` (e.g. "Invoiced: $50,000 · Paid: $30,000 · Not Billed: $20,000"). Same hand-built HTML/CSS pattern as the existing Dashboard sections, no new library.

## 13. Out of Scope (Part II)

- Deliverable and Jira columns (spec'd originally, still not shipped — explicitly deferred again by the user's answer, not part of this bundle).
- Any billing invoicing/accounting integration beyond tracking amount+status on the milestone itself.
- Sub-projects B, C, D — unchanged from Part I's out-of-scope note.
