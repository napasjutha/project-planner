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
  const { networkdays } = schedule;

  const TIERS = {
    CRITICAL: 'critical',
    NEAR_CRITICAL: 'near-critical',
    WATCH: 'watch',
    HEALTHY: 'healthy',
  };

  function tierFor(float) {
    if (float === 0) return TIERS.CRITICAL;
    if (float <= 2) return TIERS.NEAR_CRITICAL;
    if (float <= 5) return TIERS.WATCH;
    return TIERS.HEALTHY;
  }

  function computeCriticalPath(tasks, computed, overall, holidayDates) {
    const taskFloat = new Map();
    const criticalEdges = new Set();

    const eligible = tasks.filter(t => {
      const c = computed.get(t.id);
      return c && c.isLeaf && t.statusOverride !== 'Cancelled' && t.plannedStart && t.plannedFinish;
    });
    const eligibleIds = new Set(eligible.map(t => t.id));

    const successors = new Map();
    eligible.forEach(t => {
      (t.predecessors || []).forEach(predId => {
        if (!eligibleIds.has(predId)) return;
        if (!successors.has(predId)) successors.set(predId, []);
        successors.get(predId).push(t);
      });
    });

    eligible.forEach(t => {
      const succs = successors.get(t.id) || [];
      let float;
      if (succs.length) {
        float = Infinity;
        succs.forEach(s => {
          const edgeFloat = Math.max(0, networkdays(t.plannedFinish, s.plannedStart, holidayDates) - 2);
          if (edgeFloat === 0) criticalEdges.add(t.id + '->' + s.id);
          if (edgeFloat < float) float = edgeFloat;
        });
      } else if (overall && overall.plannedFinish) {
        float = Math.max(0, networkdays(t.plannedFinish, overall.plannedFinish, holidayDates) - 1);
      } else {
        float = 0;
      }
      taskFloat.set(t.id, { float, tier: tierFor(float) });
    });

    return { taskFloat, criticalEdges };
  }

  return { computeCriticalPath, TIERS };
});
