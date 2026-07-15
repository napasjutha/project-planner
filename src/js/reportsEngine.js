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

  function buildWeeklyActionsData(project, calc) {
    var statusDate = project.meta.statusDate;
    var priorMs = parseISO(statusDate) - 7 * DAY_MS;
    var nextMs = parseISO(statusDate) + 14 * DAY_MS;
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var completed = [];
    var upcoming = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      if (task.actualFinish && parseISO(task.actualFinish) >= priorMs && parseISO(task.actualFinish) <= parseISO(statusDate)) {
        completed.push({ name: task.name, actualFinish: task.actualFinish });
      }
      if (task.plannedStart && parseISO(task.plannedStart) >= parseISO(statusDate) && parseISO(task.plannedStart) <= nextMs) {
        upcoming.push({ name: task.name, plannedStart: task.plannedStart });
      }
    });

    completed.sort(function (a, b) { return a.actualFinish < b.actualFinish ? -1 : 1; });
    upcoming.sort(function (a, b) { return a.plannedStart < b.plannedStart ? -1 : 1; });

    return { completedPrior7Days: completed, next14Days: upcoming };
  }

  function buildRisksDetailData(project, calc) {
    var statusDate = project.meta.statusDate;
    var nearMs = parseISO(statusDate) + 45 * DAY_MS;
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var delayedBlocked = [];
    var nearTermDetail = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      var c = calc.computed.get(id);
      if (c.status === 'Delayed' || c.status === 'Blocked') {
        delayedBlocked.push({ name: task.name, status: c.status, plannedFinish: c.plannedFinish });
      }
      if (task.plannedStart && parseISO(task.plannedStart) >= parseISO(statusDate) && parseISO(task.plannedStart) <= nearMs) {
        nearTermDetail.push({ name: task.name, owner: task.owner || '', plannedStart: task.plannedStart, plannedFinish: c.plannedFinish, status: c.status });
      }
    });

    nearTermDetail.sort(function (a, b) { return a.plannedStart < b.plannedStart ? -1 : 1; });

    var decisions = project.decisions.map(function (d) {
      return { id: d.id, title: d.title, description: d.description, decisionNeededBy: d.decisionNeededBy, owner: d.owner, status: d.status, decisionMade: d.decisionMade };
    });

    return { delayedBlocked: delayedBlocked, decisions: decisions, nearTermDetail: nearTermDetail };
  }

  function buildReportSections(project, calc) {
    return [
      { type: 'summary', data: buildExecutiveSummaryData(project, calc) },
      { type: 'roadmap', data: buildRoadmapData(project, calc) },
      { type: 'weekly', data: buildWeeklyActionsData(project, calc) },
      { type: 'risks', data: buildRisksDetailData(project, calc) },
    ];
  }

  return {
    buildExecutiveSummaryData: buildExecutiveSummaryData,
    buildRoadmapData: buildRoadmapData,
    buildWeeklyActionsData: buildWeeklyActionsData,
    buildRisksDetailData: buildRisksDetailData,
    buildReportSections: buildReportSections,
  };
});
