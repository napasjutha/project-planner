# Activities Calendar Tab — Design Spec

**Date:** 2026-07-13
**Status:** Approved design (brainstorm complete)
**Scope:** A new "Activities" tab where Workshop and Meeting entries are logged and rendered as a monthly calendar, matching the reference PDF's "การดำเนินการลำดับถัดไป" (Next Steps) calendar page: a month grid with colored event chips by type, participant-group color tags, multi-day banner bars, and gold-star key dates. Independent of the rename/billing pieces; the Reports overhaul (separate spec) reuses this tab's calendar-rendering code.

## 1. Reference

The user supplied a screenshot of the target calendar (July 2569 / 2026 example): a 5-column (Mon–Fri) month grid, a legend distinguishing event **type** (Meeting = light blue, Workshop = purple) from **participant group** (three colored square tags: steering committee / management committee / working team), single-day events rendered as small time-stamped chips inside a day cell (e.g. "Internal Meeting 14:30–15:30"), multi-day events rendered as a banner bar spanning the full date range across multiple day-columns (e.g. "Gather required information..." spanning 5 days, "Discovery Workshop" spanning 2 days), and a gold star ★ on specific key dates overlaid on the day number.

## 2. Data Model

```js
project.activityGroups = [
  { id, name: 'คณะอำนวยการโครงการ', color: '#0b1f6b' }
]
project.activities = [
  {
    id, type /* 'Meeting' | 'Workshop' */, name,
    dateStart, dateEnd /* same as dateStart for a single-day activity */,
    timeStart, timeEnd /* optional free text, e.g. '9:30', or null for an all-day banner item */,
    groupIds /* array of activityGroups ids — which participant groups attend */,
    keyDate /* boolean — overlays the gold star */,
    remarks,
  }
]
```

`activityGroups` is project-level and configurable (same pattern as `picList`), not hardcoded to the three KPMG committee names shown in the reference — a project can define its own groups and colors.

## 3. Tab UI

- **Add Activity form**: type (Meeting/Workshop dropdown), name, date start, date end (defaults to date start if left blank — i.e. single-day), time start/end (optional text inputs), participant groups (multi-select checkboxes sourced from `activityGroups`), key-date checkbox, remarks.
- **Manage participant groups**: a small inline editor (name + color picker) to add/rename/recolor entries in `activityGroups`, same spot/pattern as the Holidays tab manages holiday labels.
- **Calendar grid**: month view, Mon–Fri columns (weekends collapsed/omitted, matching the reference), with `‹ Prev Month` / `Next Month ›` navigation (same interaction pattern as the Holidays tab's `« Prev Year` / `Next Year »`, one level down).
  - Single-day activities render as a compact chip inside their day cell: name + time range, background color by `type` (Meeting/Workshop per the legend), small colored square(s) alongside for each linked `groupIds` entry's color.
  - Multi-day activities (`dateEnd > dateStart`) render as one banner bar spanning the day columns it covers, same coloring rules.
  - `keyDate` entries get a ★ badge on the day-number corner, independent of type.
  - Hovering a chip/bar shows a tooltip with the full name, time range, and participant groups (same lightweight tooltip pattern as the Gantt chart's dependency-hover, no new mechanism).

## 4. Testing

- `store.js`: Node tests for `Project` methods managing `activityGroups` and `activities` (add/update/delete), plus a pure calendar-layout helper function (given a month + activities, compute which day cells each activity/banner occupies) — this layout function is what the Reports overhaul reuses, so it must be a standalone, Node-testable function in an engine file (not buried in the UI file).
- UI (new `activities.js`): controller-run Playwright checks — add a single-day Meeting and a multi-day Workshop spanning a weekend gap, confirm both render in the correct cells/banner span, confirm a key-date star renders, confirm month navigation works, confirm a participant-group color add/edit reflects on existing chips.

## 5. Out of Scope

- Recurring activities (weekly standing meetings) — every activity is a one-off entry.
- Any conflict/overlap detection between activities on the same day.
- The Reports overhaul's specific print layout of this calendar — this spec only guarantees the underlying layout-computation function is reusable; the separate Reports spec covers how it's embedded in the printed page.
