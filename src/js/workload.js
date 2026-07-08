(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.PP);
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory(root.PP));
  }
})(globalThis, function (PP) {
  'use strict';

  const schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : PP;
  const { parseISO, toISO, isWeekend } = schedule;

  const DAY_MS = 86400000;

  function weekFteFor(picFte, picName, weekMondayISO) {
    if (!picFte || !picFte[picName]) return 1;
    const v = picFte[picName][weekMondayISO];
    if (v === undefined || v === null) return 1;
    const n = Number(v);
    if (!isFinite(n)) return 1;
    return n < 0 ? 0 : n;
  }

  function mondayOf(dateISO) {
    let ms = parseISO(dateISO);
    const dow = new Date(ms).getUTCDay();
    const back = dow === 0 ? 6 : dow - 1;
    return ms - back * DAY_MS;
  }

  function computeWorkload(project, computed) {
    const picFte = (project.settings && project.settings.picFte) || {};
    const holidaySet = new Set(project.holidays.map(h => h.date));

    const leaves = project.tasks.filter(t => {
      const c = computed.get(t.id);
      return c && c.isLeaf && t.statusOverride !== 'Cancelled';
    });
    const dated = leaves.filter(t => t.pic && t.plannedStart && t.plannedFinish);

    const picSet = new Set(project.picList || []);
    project.tasks.forEach(t => { if (t.pic) picSet.add(t.pic); });
    const pics = Array.from(picSet).sort();

    if (!dated.length) return { weeks: [], pics, cells: new Map() };

    let minStart = null;
    let maxFinish = null;
    dated.forEach(t => {
      if (minStart === null || t.plannedStart < minStart) minStart = t.plannedStart;
      if (maxFinish === null || t.plannedFinish > maxFinish) maxFinish = t.plannedFinish;
    });

    const weeks = [];
    const firstMonday = mondayOf(minStart);
    const endMs = parseISO(maxFinish);
    let index = 1;
    for (let ms = firstMonday; ms <= endMs; ms += 7 * DAY_MS) {
      weeks.push({ index: index++, mondayISO: toISO(ms) });
    }

    const cells = new Map();
    weeks.forEach(week => {
      const weekStartMs = parseISO(week.mondayISO);
      const workdayMs = [];
      for (let d = 0; d < 7; d++) {
        const ms = weekStartMs + d * DAY_MS;
        if (!isWeekend(ms) && !holidaySet.has(toISO(ms))) workdayMs.push(ms);
      }
      pics.forEach(pic => {
        const fte = weekFteFor(picFte, pic, week.mondayISO);
        let demand = 0;
        const taskIds = [];
        dated.forEach(t => {
          if (t.pic !== pic) return;
          const s = parseISO(t.plannedStart);
          const f = parseISO(t.plannedFinish);
          let active = 0;
          workdayMs.forEach(ms => { if (ms >= s && ms <= f) active++; });
          if (active > 0) {
            demand += active;
            taskIds.push(t.id);
          }
        });
        const available = workdayMs.length * fte;
        cells.set(pic + '|' + week.mondayISO, {
          demand,
          available,
          overloaded: demand > available,
          taskIds,
        });
      });
    });

    return { weeks, pics, cells };
  }

  return { weekFteFor, computeWorkload };
});
