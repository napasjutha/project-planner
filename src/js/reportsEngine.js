(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

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

  return {
    buildExecutiveSummaryData: buildExecutiveSummaryData,
  };
});
