(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  function taskMatches(task, computed, filters) {
    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
      const haystack = `${task.name} ${task.remarks} ${task.jira}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.owner && task.owner !== filters.owner) return false;
    if (filters.pic && task.pic !== filters.pic) return false;
    if (filters.status && computed.status !== filters.status) return false;
    if (filters.onlyDelayed && computed.status !== 'Delayed') return false;
    if (filters.onlyDeliverable && !task.deliverable) return false;
    return true;
  }

  function hasActiveFilter(filters) {
    return !!(filters.search || filters.owner || filters.pic || filters.status || filters.onlyDelayed || filters.onlyDeliverable);
  }

  function visibleIds(project, computedMap, order, filters) {
    if (!hasActiveFilter(filters)) return new Set(order);

    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const matched = new Set();
    for (const id of order) {
      const task = byId.get(id);
      const computed = computedMap.get(id);
      if (taskMatches(task, computed, filters)) matched.add(id);
    }

    const visible = new Set();
    for (const id of matched) {
      let cur = id;
      while (cur != null && !visible.has(cur)) {
        visible.add(cur);
        const t = byId.get(cur);
        cur = t ? t.parentId : null;
      }
    }
    return visible;
  }

  function computeVisibleRows(project, calc, filters) {
    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const visible = visibleIds(project, calc.computed, calc.order, filters);
    const filterActive = hasActiveFilter(filters);
    const suppressed = new Set();
    const rows = [];
    for (const id of calc.order) {
      const task = byId.get(id);
      const parentSuppressed = !filterActive && task.parentId != null && suppressed.has(task.parentId);
      if (parentSuppressed || !visible.has(id)) {
        if (!filterActive) suppressed.add(id);
        continue;
      }
      rows.push(id);
      if (!filterActive && task.collapsed) suppressed.add(id);
    }
    return rows;
  }

  return { taskMatches, visibleIds, hasActiveFilter, computeVisibleRows };
});
