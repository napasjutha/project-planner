# Activities Calendar Drag-to-Move — Design Spec

**Date:** 2026-07-15
**Status:** Approved design (brainstorm complete)
**Scope:** Drag a chip on the Activities tab's calendar grid to a different day cell to move that activity (`dateStart`/`dateEnd` shift together, duration unchanged). No resize. Independent of the Reports S-Curve/divider spec (separate tab, unrelated code).

## 1. New date helper

`src/js/schedule.js` gains a plain calendar-day arithmetic helper, distinct from the existing workday-skipping `addWorkdays` (activities can legitimately span weekends today, per `computeCalendarLayout`'s existing weekend-splitting behavior):

```js
function addCalendarDays(dateISO, n) {
  return toISO(parseISO(dateISO) + n * 86400000);
}
```

Add to the module's return statement: `return { networkdays, addWorkdays, remainingWorkdays, parseISO, toISO, isWeekend, addCalendarDays };`

## 2. Day cells expose their date

`renderActivitiesCalendar` in `src/js/ui/activities.js` (the `week.days.forEach` loop, ~line 127) sets `cell.dataset.date = day.date` for non-empty cells (day objects from `computeCalendarLayout` already carry `.date`, an ISO string — confirmed in `calendar.js`'s existing contract). Empty/padding cells get no `data-date`, so they're never valid drop targets.

## 3. Drag interaction

Add to `wireActivities` in `activities.js`, container-level delegation on `#activities-calendar` (mirrors `gantt.js`'s existing mousedown/mousemove/mouseup pattern at `gantt.js:224-300`, adapted from continuous pixel math to discrete cell hit-testing):

```js
var calDrag = null;

document.getElementById('activities-calendar').addEventListener('mousedown', function (e) {
  var chip = e.target.closest('.calendar-chip');
  if (!chip) return;
  var activity = state.project.activities.find(function (a) { return a.id === chip.dataset.activityId; });
  if (!activity) return;
  calDrag = { activityId: activity.id, origDateStart: activity.dateStart, origDateEnd: activity.dateEnd, targetCell: null };
  chip.classList.add('is-dragging');
});

document.addEventListener('mousemove', function (e) {
  if (!calDrag) return;
  if (calDrag.targetCell) calDrag.targetCell.classList.remove('calendar-daynum-drop-target');
  var el = document.elementFromPoint(e.clientX, e.clientY);
  var cell = el && el.closest('.calendar-daynum[data-date]');
  calDrag.targetCell = cell || null;
  if (cell) cell.classList.add('calendar-daynum-drop-target');
});

document.addEventListener('mouseup', function () {
  if (!calDrag) return;
  var drag = calDrag;
  calDrag = null;
  document.querySelectorAll('.calendar-chip.is-dragging').forEach(function (c) { c.classList.remove('is-dragging'); });
  if (drag.targetCell) drag.targetCell.classList.remove('calendar-daynum-drop-target');
  if (!drag.targetCell) return;
  var targetDate = drag.targetCell.dataset.date;
  if (targetDate === drag.origDateStart) return;
  var deltaDays = Math.round((PP.parseISO(targetDate) - PP.parseISO(drag.origDateStart)) / 86400000);
  var newDateStart = PP.addCalendarDays(drag.origDateStart, deltaDays);
  var newDateEnd = PP.addCalendarDays(drag.origDateEnd, deltaDays);
  state.project.updateActivity(drag.activityId, { dateStart: newDateStart, dateEnd: newDateEnd });
  onChanged();
});
```

`mousemove`/`mouseup` are bound on `document` (not the calendar container) so a drag that briefly leaves the grid and comes back still tracks — same reasoning as `gantt.js`'s existing container-vs-document split (see the stale-drag-abandon comment at `gantt.js:244-250`; that guard is Gantt-specific SVG cleanup and does not need to be replicated here since this drag has no cloned/repositioned DOM element to abandon).

Undo/redo: free. `updateActivity` (`store.js:491-497`) already calls `_pushUndo()` before mutating.

## 4. Styling

`layout.css` additions:
```css
.calendar-chip { cursor: grab; }
.calendar-chip.is-dragging { opacity: 0.5; }
.calendar-daynum-drop-target { background: rgba(0,145,218,0.25); outline: 2px dashed var(--kpmg-blue-light); outline-offset: -2px; }
```

## 5. Out of scope

- Resize (dragging a chip's edge to change only `dateStart` or only `dateEnd`) — user explicitly chose move-only over the Gantt-style move+resize split.
- Cross-month dragging — dropping outside the currently rendered grid (including on the prev/next-month nav buttons) is a no-op; the activity keeps its original dates.
- Any change to the Reports tab's static (non-interactive) calendar rendering, which reuses `computeCalendarLayout` but never wires drag handlers.

## 6. Testing

- `tests/schedule.test.js`: new tests for `addCalendarDays` — positive delta, negative delta, zero delta (no-op), month rollover (e.g. `2026-07-30` + 3 → `2026-08-02`), year rollover.
- Controller-run Playwright (no Node coverage for `activities.js`, per existing convention): drag a single-day Meeting chip to a different day in the same week row, confirm both list and calendar reflect the new date; drag a multi-day Workshop banner to a different week row, confirm `dateStart` and `dateEnd` both shift by the same delta (duration preserved); mousedown+mouseup on the same cell (no actual move), confirm no-op (no undo entry created); drag and release outside the calendar grid, confirm no change; confirm one Undo reverts the move.
