(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : globalThis.PP;
  const { parseISO, toISO } = schedule;

  const DAY_MS = 86400000;

  function mondayOnOrBefore(ms) {
    const dow = new Date(ms).getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    return ms - daysSinceMonday * DAY_MS;
  }

  function colOf(ms) {
    return new Date(ms).getUTCDay() - 1;
  }

  function computeCalendarLayout(year, month, activities) {
    const firstOfMonthMs = Date.UTC(year, month, 1);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lastOfMonthMs = Date.UTC(year, month, daysInMonth);

    const firstRowMondayMs = mondayOnOrBefore(firstOfMonthMs);
    const lastRowMondayMs = mondayOnOrBefore(lastOfMonthMs);
    const rawWeekCount = Math.round((lastRowMondayMs - firstRowMondayMs) / (7 * DAY_MS)) + 1;

    function rawWeekIndexOf(ms) {
      return Math.round((mondayOnOrBefore(ms) - firstRowMondayMs) / (7 * DAY_MS));
    }

    const rawWeeks = [];
    for (let w = 0; w < rawWeekCount; w++) rawWeeks.push({ days: [null, null, null, null, null] });

    for (let d = 1; d <= daysInMonth; d++) {
      const ms = Date.UTC(year, month, d);
      const dow = new Date(ms).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const w = rawWeekIndexOf(ms);
      const col = colOf(ms);
      rawWeeks[w].days[col] = { date: toISO(ms), dayOfMonth: d, keyDate: false };
    }

    let firstUsed = 0;
    while (firstUsed < rawWeeks.length && rawWeeks[firstUsed].days.every(c => c === null)) firstUsed++;
    let lastUsed = rawWeeks.length - 1;
    while (lastUsed >= firstUsed && rawWeeks[lastUsed].days.every(c => c === null)) lastUsed--;

    const weeks = rawWeeks.slice(firstUsed, lastUsed + 1);
    function trimmedWeekIndex(rawIndex) { return rawIndex - firstUsed; }

    const segments = [];
    const sortedActivities = activities.slice().sort((a, b) => {
      if (a.dateStart !== b.dateStart) return a.dateStart < b.dateStart ? -1 : 1;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    sortedActivities.forEach(function (activity) {
      if (!activity.dateStart || !activity.dateEnd) return;
      const startMs = Math.max(parseISO(activity.dateStart), firstOfMonthMs);
      const endMs = Math.min(parseISO(activity.dateEnd), lastOfMonthMs);
      if (startMs > endMs) return;

      let runStart = null, runWeek = null, runStartCol = null, prevCol = null;
      function flush(endCol) {
        segments.push({ activity, weekIndex: trimmedWeekIndex(runWeek), startCol: runStartCol, endCol });
      }

      for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
        const dow = new Date(ms).getUTCDay();
        if (dow === 0 || dow === 6) {
          if (runStart !== null) { flush(prevCol); runStart = null; }
          continue;
        }
        const w = rawWeekIndexOf(ms);
        const col = colOf(ms);
        if (activity.keyDate) {
          const cell = weeks[trimmedWeekIndex(w)].days[col];
          if (cell) cell.keyDate = true;
        }
        if (runStart === null) {
          runStart = ms; runWeek = w; runStartCol = col; prevCol = col;
        } else if (w !== runWeek) {
          flush(prevCol);
          runStart = ms; runWeek = w; runStartCol = col; prevCol = col;
        } else {
          prevCol = col;
        }
      }
      if (runStart !== null) flush(prevCol);
    });

    weeks.forEach(function (_, wIndex) {
      const rowSegments = segments
        .filter(s => s.weekIndex === wIndex)
        .sort((a, b) => a.startCol - b.startCol);
      const laneEndCols = [];
      rowSegments.forEach(function (seg) {
        let lane = laneEndCols.findIndex(endCol => endCol < seg.startCol);
        if (lane === -1) {
          lane = laneEndCols.length;
          laneEndCols.push(seg.endCol);
        } else {
          laneEndCols[lane] = seg.endCol;
        }
        seg.lane = lane;
      });
    });

    return { year, month, weeks, segments };
  }

  return { computeCalendarLayout };
});
