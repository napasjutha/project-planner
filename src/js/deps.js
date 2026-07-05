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
  const { networkdays, addWorkdays } = schedule;

  function wouldCreateCycle(tasks, taskId, newPredecessorId) {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const stack = [newPredecessorId];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (cur === taskId) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const t = byId.get(cur);
      if (t && t.predecessors) stack.push(...t.predecessors);
    }
    return false;
  }

  function forwardPass(tasks, movedTaskId, holidayDates) {
    const byId = new Map(tasks.map(t => [t.id, { ...t }]));
    const queue = [movedTaskId];
    // Safety net only: forwardPass assumes an acyclic predecessors graph
    // (normally guaranteed by wouldCreateCycle at link-creation time), but
    // nothing stops a corrupted/hand-edited project file from feeding in a
    // cyclic or self-referencing predecessors array directly, which would
    // otherwise make the re-enqueue below loop forever. This cap is sized
    // generously so it never trips on any legitimate acyclic graph of
    // realistic project size, but always trips on a genuine cycle.
    const maxIterations = tasks.length * tasks.length;
    let iterations = 0;
    while (queue.length) {
      if (++iterations > maxIterations) break;
      const curId = queue.shift();
      const cur = byId.get(curId);
      for (const t of byId.values()) {
        if (t.predecessors && t.predecessors.includes(curId)) {
          const minStart = addWorkdays(cur.plannedFinish, 1, holidayDates);
          if (!t.plannedStart || t.plannedStart < minStart) {
            const duration = networkdays(t.plannedStart, t.plannedFinish, holidayDates);
            const shift = duration > 1 ? duration - 1 : 0;
            t.plannedStart = minStart;
            t.plannedFinish = shift > 0 ? addWorkdays(minStart, shift, holidayDates) : minStart;
            // Always re-enqueue: the graph is acyclic (wouldCreateCycle prevents
            // cycles at link time) and dates only ever move forward, so a task
            // may need to re-propagate to its successors multiple times as
            // different predecessor branches (e.g. diamond dependencies) push
            // its own dates later. Gating on a "visited once" set would let an
            // earlier, stale propagation reach a successor before a later,
            // final update arrives.
            queue.push(t.id);
          }
        }
      }
    }
    return Array.from(byId.values());
  }

  return { wouldCreateCycle, forwardPass };
});
