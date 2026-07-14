const { test } = require('node:test');
const assert = require('node:assert/strict');
const { weekFteFor, computeWorkload } = require('../src/js/workload.js');

function leaf(id, pic, plannedStart, plannedFinish) {
  return {
    id, parentId: null, order: 0, name: id, pic,
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, deliverable: false,
    statusOverride: null, predecessors: [], collapsed: false,
  };
}

function project(tasks, picFte, holidays, picList) {
  return {
    tasks,
    holidays: (holidays || []).map(d => ({ date: d })),
    picList: picList || [],
    settings: { theme: 'kpmg-light', ganttZoom: 'week', picFte: picFte || {} },
  };
}

function computedFor(tasks) {
  const m = new Map();
  tasks.forEach(t => m.set(t.id, { isLeaf: true }));
  return m;
}

test('weekFteFor defaults to 1.0 for absent map, PIC, or week', () => {
  assert.equal(weekFteFor(undefined, 'Alice', '2026-07-06'), 1);
  assert.equal(weekFteFor({}, 'Alice', '2026-07-06'), 1);
  assert.equal(weekFteFor({ Alice: {} }, 'Alice', '2026-07-06'), 1);
});

test('weekFteFor returns the override and clamps malformed values', () => {
  assert.equal(weekFteFor({ Alice: { '2026-07-06': 0.5 } }, 'Alice', '2026-07-06'), 0.5);
  assert.equal(weekFteFor({ Alice: { '2026-07-06': -3 } }, 'Alice', '2026-07-06'), 0);
  assert.equal(weekFteFor({ Alice: { '2026-07-06': 'x' } }, 'Alice', '2026-07-06'), 1);
});

// 2026-07-06 is a Monday.

test('computeWorkload buckets Monday weeks W1..Wn across the leaf date span', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-08', '2026-07-21')]; // Wed W1 .. Tue W3
  const { weeks } = computeWorkload(project(tasks), computedFor(tasks));
  assert.deepEqual(weeks.map(w => w.mondayISO), ['2026-07-06', '2026-07-13', '2026-07-20']);
  assert.deepEqual(weeks.map(w => w.index), [1, 2, 3]);
});

test('demand splits across week boundaries and weekends are excluded', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-08', '2026-07-14')]; // Wed..next Tue
  const { cells } = computeWorkload(project(tasks), computedFor(tasks));
  assert.equal(cells.get('Alice|2026-07-06').demand, 3);  // Wed,Thu,Fri
  assert.equal(cells.get('Alice|2026-07-13').demand, 2);  // Mon,Tue
});

test('the locked worked example: 0.5 FTE week, 4 demanded workdays -> 1.6 overloaded, neighbors untouched', () => {
  const tasks = [
    leaf('t1', 'Alice', '2026-07-06', '2026-07-09'),  // Mon-Thu W1: 4 days
    leaf('t2', 'Alice', '2026-07-13', '2026-07-16'),  // Mon-Thu W2: 4 days
  ];
  const picFte = { Alice: { '2026-07-06': 0.5 } };
  const { cells } = computeWorkload(project(tasks, picFte), computedFor(tasks));
  const w1 = cells.get('Alice|2026-07-06');
  assert.equal(w1.demand, 4);
  assert.equal(w1.available, 2.5);
  assert.equal(w1.overloaded, true);
  const w2 = cells.get('Alice|2026-07-13');
  assert.equal(w2.available, 5);
  assert.equal(w2.overloaded, false);
});

test('holidays reduce both demand and available', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-06', '2026-07-10')];
  const { cells } = computeWorkload(project(tasks, {}, ['2026-07-08']), computedFor(tasks));
  const w1 = cells.get('Alice|2026-07-06');
  assert.equal(w1.demand, 4);
  assert.equal(w1.available, 4);
});

test('zero-FTE week with demand is overloaded', () => {
  const tasks = [leaf('a', 'Alice', '2026-07-06', '2026-07-10')];
  const picFte = { Alice: { '2026-07-06': 0 } };
  const { cells } = computeWorkload(project(tasks, picFte), computedFor(tasks));
  const w1 = cells.get('Alice|2026-07-06');
  assert.equal(w1.available, 0);
  assert.equal(w1.overloaded, true);
});

test('cancelled, parent, blank-PIC and dateless tasks contribute no demand; pics = union sorted', () => {
  const tasks = [
    leaf('a', 'Alice', '2026-07-06', '2026-07-10'),
    Object.assign(leaf('x', 'Alice', '2026-07-06', '2026-07-10'), { statusOverride: 'Cancelled' }),
    leaf('noPic', '', '2026-07-06', '2026-07-10'),
    leaf('noDates', 'Bob', null, null),
  ];
  const computed = computedFor(tasks);
  const parentTask = leaf('parent1', 'Carol', '2026-07-06', '2026-07-10');
  tasks.push(parentTask);
  computed.set('parent1', { isLeaf: false });
  const { cells, pics } = computeWorkload(project(tasks, {}, [], ['Zed']), computed);
  assert.equal(cells.get('Alice|2026-07-06').demand, 5);
  assert.deepEqual(pics, ['Alice', 'Bob', 'Carol', 'Zed']);
  assert.equal(cells.get('Carol|2026-07-06').demand, 0);
});

test('a project with no dated leaf tasks returns empty weeks', () => {
  const tasks = [leaf('noDates', 'Bob', null, null)];
  const { weeks } = computeWorkload(project(tasks), computedFor(tasks));
  assert.deepEqual(weeks, []);
});

test('taskIds lists the active tasks per cell', () => {
  const tasks = [
    leaf('t1', 'Alice', '2026-07-06', '2026-07-07'),
    leaf('t2', 'Alice', '2026-07-09', '2026-07-10'),
  ];
  const { cells } = computeWorkload(project(tasks), computedFor(tasks));
  assert.deepEqual(cells.get('Alice|2026-07-06').taskIds.sort(), ['t1', 't2']);
});
