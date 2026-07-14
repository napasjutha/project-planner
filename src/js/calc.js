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
  const statusEngine = (typeof module === 'object' && module.exports)
    ? require('./status.js')
    : globalThis.PP;
  const { networkdays, remainingWorkdays, parseISO, toISO } = schedule;
  const { deriveStatus } = statusEngine;

  const DAY_MS = 86400000;

  function buildTree(tasks) {
    const byId = new Map();
    for (const t of tasks) byId.set(t.id, t);

    const children = new Map();
    children.set(null, []);
    for (const t of tasks) {
      if (!children.has(t.parentId)) children.set(t.parentId, []);
      children.get(t.parentId).push(t.id);
    }
    for (const ids of children.values()) {
      ids.sort((a, b) => byId.get(a).order - byId.get(b).order);
    }

    const order = [];
    const depth = new Map();
    const wbs = new Map();

    function visit(parentId, parentWbs, parentDepth) {
      const kids = children.get(parentId) || [];
      kids.forEach((id, i) => {
        const num = parentWbs ? `${parentWbs}.${i + 1}` : `${i + 1}`;
        order.push(id);
        depth.set(id, parentDepth);
        wbs.set(id, num);
        visit(id, num, parentDepth + 1);
      });
    }
    visit(null, '', 0);

    return { byId, children, order, depth, wbs };
  }

  function planPctToDate(plannedStart, plannedFinish, atDate, duration, holidayDates) {
    if (!plannedStart || !plannedFinish || duration <= 0) return 0;
    if (atDate >= plannedFinish) return 1;
    if (atDate < plannedStart) return 0;
    const pct = networkdays(plannedStart, atDate, holidayDates) / duration;
    return Math.max(0, Math.min(1, pct));
  }

  function actualPctToDate(actualStart, actualFinish, statusDate, plannedDuration, holidayDates) {
    if (!actualStart) return null;
    if (actualFinish && statusDate >= actualFinish) return 1;
    if (plannedDuration <= 0) return actualFinish ? 1 : null;
    const elapsed = networkdays(actualStart, statusDate, holidayDates);
    return Math.max(0, Math.min(0.99, elapsed / plannedDuration));
  }

  function actualPctAt(task, atDate, holidayDates) {
    const pct = actualPctToDate(task.actualStart, task.actualFinish, atDate, task.duration, holidayDates);
    return pct == null ? 0 : pct;
  }

  function computeScurve(leaves, overall, statusDate, holidayDates) {
    if (!overall.plannedStart) return [];
    const endBound = !overall.plannedFinish || statusDate > overall.plannedFinish ? statusDate : overall.plannedFinish;
    const points = [];
    let cursor = parseISO(overall.plannedStart);
    const finish = parseISO(endBound);
    while (cursor <= finish) {
      const periodISO = toISO(cursor);
      let plannedCum = 0;
      let actualCum = 0;
      for (const leaf of leaves) {
        plannedCum += leaf.weight * planPctToDate(leaf.plannedStart, leaf.plannedFinish, periodISO, leaf.duration, holidayDates);
        actualCum += leaf.weight * actualPctAt(leaf, periodISO, holidayDates);
      }
      points.push({ periodDate: periodISO, plannedCum, actualCum });
      cursor += 7 * DAY_MS;
    }
    // The fixed 7-day step above won't necessarily land exactly on endBound
    // when the span isn't an exact multiple of 7 days, which would otherwise
    // leave the curve's last visible point short of the true end-of-range
    // state. Add one final point pinned to endBound so the curve always
    // reaches its actual completion percentage.
    if (!points.length || points[points.length - 1].periodDate !== endBound) {
      let plannedCum = 0;
      let actualCum = 0;
      for (const leaf of leaves) {
        plannedCum += leaf.weight * planPctToDate(leaf.plannedStart, leaf.plannedFinish, endBound, leaf.duration, holidayDates);
        actualCum += leaf.weight * actualPctAt(leaf, endBound, holidayDates);
      }
      points.push({ periodDate: endBound, plannedCum, actualCum });
    }
    return points;
  }

  function recalc(project) {
    const { tasks, holidays, meta } = project;
    const holidayDates = holidays.map(h => h.date);
    const statusDate = meta.statusDate;
    const { byId, children, order, depth, wbs } = buildTree(tasks);
    const leafIds = order.filter(id => (children.get(id) || []).length === 0);

    const isCancelled = (id) => byId.get(id).statusOverride === 'Cancelled';

    const computed = new Map();

    for (const id of leafIds) {
      const t = byId.get(id);
      const duration = (t.plannedStart && t.plannedFinish)
        ? networkdays(t.plannedStart, t.plannedFinish, holidayDates)
        : 0;
      const actualPct = actualPctToDate(t.actualStart, t.actualFinish, statusDate, duration, holidayDates) || 0;
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: true,
        plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        actualStart: t.actualStart, actualFinish: t.actualFinish,
        duration, weight: 0, plannedPctToDate: 0, actualPct,
        status: null, isDeliverable: !!t.deliverable,
      });
    }

    const overriddenLeaves = leafIds.filter(id => !isCancelled(id) && byId.get(id).weightOverride != null);
    const autoLeaves = leafIds.filter(id => !isCancelled(id) && byId.get(id).weightOverride == null);
    const overrideSum = overriddenLeaves.reduce((s, id) => s + byId.get(id).weightOverride, 0);
    const autoDurationSum = autoLeaves.reduce((s, id) => s + computed.get(id).duration, 0);
    const autoPool = Math.max(0, 1 - overrideSum);

    for (const id of overriddenLeaves) {
      computed.get(id).weight = byId.get(id).weightOverride;
    }
    for (const id of autoLeaves) {
      const c = computed.get(id);
      c.weight = autoDurationSum > 0 ? autoPool * (c.duration / autoDurationSum) : 0;
    }

    for (const id of leafIds) {
      const t = byId.get(id);
      const c = computed.get(id);
      c.plannedPctToDate = planPctToDate(t.plannedStart, t.plannedFinish, statusDate, c.duration, holidayDates);
      c.status = deriveStatus({
        actualPct: c.actualPct, plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
        statusDate, statusOverride: t.statusOverride,
      });
    }

    const parentIds = [...order].reverse().filter(id => (children.get(id) || []).length > 0);
    for (const id of parentIds) {
      const kidIds = children.get(id).filter(cid => !isCancelled(cid));
      const kidComputed = kidIds.map(cid => computed.get(cid));
      const weight = kidComputed.reduce((s, c) => s + c.weight, 0);
      const starts = kidComputed.map(c => c.plannedStart).filter(Boolean);
      const finishes = kidComputed.map(c => c.plannedFinish).filter(Boolean);
      const plannedStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      const plannedFinish = finishes.length ? finishes.reduce((a, b) => (a > b ? a : b)) : null;
      const duration = (plannedStart && plannedFinish) ? networkdays(plannedStart, plannedFinish, holidayDates) : 0;
      const actualStarts = kidComputed.map(c => c.actualStart).filter(Boolean);
      const actualFinishes = kidComputed.map(c => c.actualFinish).filter(Boolean);
      const actualStart = actualStarts.length ? actualStarts.reduce((a, b) => (a < b ? a : b)) : null;
      const actualFinish = actualFinishes.length ? actualFinishes.reduce((a, b) => (a > b ? a : b)) : null;
      const weightedPlan = kidComputed.reduce((s, c) => s + c.weight * c.plannedPctToDate, 0);
      const weightedActual = kidComputed.reduce((s, c) => s + c.weight * c.actualPct, 0);
      const plannedPctToDate = weight > 0 ? weightedPlan / weight : 0;
      const actualPct = weight > 0 ? weightedActual / weight : 0;
      const status = deriveStatus({
        actualPct, plannedStart, plannedFinish, statusDate, statusOverride: byId.get(id).statusOverride,
      });
      computed.set(id, {
        id, wbs: wbs.get(id), depth: depth.get(id), isLeaf: false,
        plannedStart, plannedFinish, actualStart, actualFinish,
        duration, weight, plannedPctToDate, actualPct, status, isDeliverable: false,
      });
    }

    const rootIds = children.get(null).filter(id => !isCancelled(id));
    const rootComputed = rootIds.map(id => computed.get(id));
    const overallWeight = rootComputed.reduce((s, c) => s + c.weight, 0);
    const overallStarts = rootComputed.map(c => c.plannedStart).filter(Boolean);
    const overallFinishes = rootComputed.map(c => c.plannedFinish).filter(Boolean);
    const overallActualStarts = rootComputed.map(c => c.actualStart).filter(Boolean);
    const overallActualFinishes = rootComputed.map(c => c.actualFinish).filter(Boolean);
    const overall = {
      plannedStart: overallStarts.length ? overallStarts.reduce((a, b) => (a < b ? a : b)) : null,
      plannedFinish: overallFinishes.length ? overallFinishes.reduce((a, b) => (a > b ? a : b)) : null,
      actualStart: overallActualStarts.length ? overallActualStarts.reduce((a, b) => (a < b ? a : b)) : null,
      actualFinish: overallActualFinishes.length ? overallActualFinishes.reduce((a, b) => (a > b ? a : b)) : null,
      weight: overallWeight,
      plannedPctToDate: overallWeight > 0 ? rootComputed.reduce((s, c) => s + c.weight * c.plannedPctToDate, 0) / overallWeight : 0,
      actualPct: overallWeight > 0 ? rootComputed.reduce((s, c) => s + c.weight * c.actualPct, 0) / overallWeight : 0,
    };
    overall.duration = (overall.plannedStart && overall.plannedFinish)
      ? networkdays(overall.plannedStart, overall.plannedFinish, holidayDates) : 0;
    overall.status = deriveStatus({
      actualPct: overall.actualPct, plannedStart: overall.plannedStart, plannedFinish: overall.plannedFinish,
      statusDate, statusOverride: null,
    });

    const leafStatuses = leafIds.filter(id => !isCancelled(id)).map(id => computed.get(id).status);
    const kpis = {
      actualPct: overall.actualPct,
      plannedPct: overall.plannedPctToDate,
      variance: overall.actualPct - overall.plannedPctToDate,
      delayedCount: leafStatuses.filter(s => s === 'Delayed').length,
      completeCount: leafStatuses.filter(s => s === 'Complete').length,
      totalCount: leafStatuses.length,
      deliverablesTotal: leafIds.filter(id => !isCancelled(id) && byId.get(id).deliverable).length,
      deliverablesComplete: leafIds.filter(id => byId.get(id).deliverable && computed.get(id).status === 'Complete').length,
      remainingWorkdays: overall.plannedFinish ? remainingWorkdays(statusDate, overall.plannedFinish, holidayDates) : 0,
    };

    const scurveLeaves = leafIds
      .filter(id => !isCancelled(id))
      .map(id => ({ ...byId.get(id), ...computed.get(id) }));
    const scurve = computeScurve(scurveLeaves, overall, statusDate, holidayDates);

    return { computed, order, children, wbs, overall, kpis, scurve };
  }

  return { recalc, buildTree, planPctToDate, actualPctAt, computeScurve, actualPctToDate };
});
