(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const DAY_MS = 86400000;

  function parseISO(dateISO) {
    const [y, m, d] = dateISO.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function toISO(utcMillis) {
    const d = new Date(utcMillis);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isWeekend(utcMillis) {
    const day = new Date(utcMillis).getUTCDay();
    return day === 0 || day === 6;
  }

  function isWorkday(utcMillis, holidaySet) {
    return !isWeekend(utcMillis) && !holidaySet.has(toISO(utcMillis));
  }

  function networkdays(startISO, endISO, holidayDates) {
    if (!startISO || !endISO) return 0;
    const holidaySet = new Set(holidayDates || []);
    let start = parseISO(startISO);
    let end = parseISO(endISO);
    let sign = 1;
    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
      sign = -1;
    }
    let count = 0;
    for (let t = start; t <= end; t += DAY_MS) {
      if (isWorkday(t, holidaySet)) count++;
    }
    return count * sign;
  }

  function addWorkdays(startISO, n, holidayDates) {
    const holidaySet = new Set(holidayDates || []);
    let t = parseISO(startISO);
    const step = n >= 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      t += step * DAY_MS;
      if (isWorkday(t, holidaySet)) remaining--;
    }
    return toISO(t);
  }


  function addCalendarDays(dateISO, n) {
    return toISO(parseISO(dateISO) + n * DAY_MS);
  }

  function remainingWorkdays(statusISO, finishISO, holidayDates) {
    if (!statusISO || !finishISO) return 0;
    if (parseISO(statusISO) >= parseISO(finishISO)) return 0;
    return networkdays(statusISO, finishISO, holidayDates);
  }

  return { networkdays, addWorkdays, remainingWorkdays, parseISO, toISO, isWeekend, addCalendarDays };
});
