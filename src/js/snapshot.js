(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  function takeSnapshot(project, computed, note, takenBy) {
    const snapshot = {
      id: 'snap_' + Math.random().toString(36).slice(2, 10),
      takenAt: new Date().toISOString(),
      takenBy: takenBy || 'unknown',
      note: note || '',
      statusDate: project.meta.statusDate,
      tasks: JSON.parse(JSON.stringify(project.tasks)),
      overall: JSON.parse(JSON.stringify(computed.overall)),
      kpis: JSON.parse(JSON.stringify(computed.kpis)),
      scurve: JSON.parse(JSON.stringify(computed.scurve)),
    };
    project.snapshots.push(snapshot);
    return snapshot;
  }

  function compareSnapshots(a, b) {
    const overallDelta = {
      actualPct: b.overall.actualPct - a.overall.actualPct,
      plannedPct: b.overall.plannedPctToDate - a.overall.plannedPctToDate,
    };
    const byIdA = new Map(a.tasks.map(t => [t.id, t]));
    const byIdB = new Map(b.tasks.map(t => [t.id, t]));
    const added = [...byIdB.keys()].filter(id => !byIdA.has(id));
    const removed = [...byIdA.keys()].filter(id => !byIdB.has(id));
    const slipped = [];
    for (const [id, taskB] of byIdB) {
      const taskA = byIdA.get(id);
      if (taskA && taskA.plannedFinish && taskB.plannedFinish && taskB.plannedFinish > taskA.plannedFinish) {
        slipped.push({ id, from: taskA.plannedFinish, to: taskB.plannedFinish });
      }
    }
    return { overallDelta, added, removed, slipped };
  }

  return { takeSnapshot, compareSnapshots };
});
