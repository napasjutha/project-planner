(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  var schedule = (typeof module === 'object' && module.exports)
    ? require('./schedule.js')
    : globalThis.PP;
  var parseISO = schedule.parseISO;
  var toISO = schedule.toISO;
  var DAY_MS = 86400000;

  function pct(x) { return Math.round(x * 100) + '%'; }

  var STATUS_KEYS = ['Not Start', 'In Progress', 'Delayed', 'Complete', 'Blocked', 'Cancelled'];

  function buildExecutiveSummaryData(project, calc) {
    var kpis = calc.kpis;
    var tiles = [
      { label: 'Actual', value: pct(kpis.actualPct) },
      { label: 'Planned', value: pct(kpis.plannedPct) },
      { label: 'Variance', value: pct(kpis.variance) },
      { label: 'Delayed', value: String(kpis.delayedCount) },
      { label: 'Complete', value: kpis.completeCount + '/' + kpis.totalCount },
      { label: 'Deliverables', value: kpis.deliverablesComplete + '/' + kpis.deliverablesTotal },
    ];

    var ragStatus = kpis.variance >= 0 ? 'On Track' : (kpis.variance >= -0.05 ? 'Watch' : 'At Risk');

    var statusCounts = {};
    STATUS_KEYS.forEach(function (k) { statusCounts[k] = 0; });
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var status = calc.computed.get(id).status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { ragStatus: ragStatus, kpis: tiles, statusCounts: statusCounts };
  }

  var MEETING_RE = /workshop|meeting|ประชุม|สัมมนา/i;

  function topLevelAncestorId(task, byId) {
    while (task.parentId != null) {
      var parent = byId.get(task.parentId);
      if (!parent) break;
      task = parent;
    }
    return task.id;
  }

  function buildRoadmapData(project, calc) {
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var qualifying = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      if (task.statusOverride === 'Cancelled') return;
      if (!task.plannedStart || !task.plannedFinish) return;
      qualifying.push(task);
    });

    var lanes = project.tasks
      .filter(function (t) { return t.parentId == null; })
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (t) { return { id: t.id, name: t.name }; });

    if (!qualifying.length) {
      return { rangeStart: null, rangeEnd: null, statusDate: project.meta.statusDate, weeks: [], lanes: lanes, items: [] };
    }

    var rangeStartMs = Math.min.apply(null, qualifying.map(function (t) { return parseISO(t.plannedStart); }));
    var rangeEndMs = Math.max.apply(null, qualifying.map(function (t) { return parseISO(t.plannedFinish); }));

    var weeks = [];
    var w = 0;
    for (var ms = rangeStartMs; ms <= rangeEndMs; ms += 7 * DAY_MS) {
      var endMs = Math.min(ms + 6 * DAY_MS, rangeEndMs);
      weeks.push({ start: toISO(ms), end: toISO(endMs), label: 'W' + w });
      w++;
    }

    var items = qualifying.map(function (task) {
      return {
        taskId: task.id, name: task.name, owner: task.owner || '',
        plannedStart: task.plannedStart, plannedFinish: task.plannedFinish,
        laneId: topLevelAncestorId(task, byId),
        deliverable: !!task.deliverable,
        isMeeting: MEETING_RE.test(task.name),
        slot: 0,
      };
    });

    lanes.forEach(function (lane) {
      var laneItems = items.filter(function (i) { return i.laneId === lane.id; })
        .sort(function (a, b) { return a.plannedStart < b.plannedStart ? -1 : 1; });
      var slotEndDates = [];
      laneItems.forEach(function (item) {
        var slot = slotEndDates.findIndex(function (endDate) { return endDate < item.plannedStart; });
        if (slot === -1) {
          slot = slotEndDates.length;
          slotEndDates.push(item.plannedFinish);
        } else {
          slotEndDates[slot] = item.plannedFinish;
        }
        item.slot = slot;
      });
    });

    return { rangeStart: toISO(rangeStartMs), rangeEnd: toISO(rangeEndMs), statusDate: project.meta.statusDate, weeks: weeks, lanes: lanes, items: items };
  }

  return {
    buildExecutiveSummaryData: buildExecutiveSummaryData,
    buildRoadmapData: buildRoadmapData,
  };
});
