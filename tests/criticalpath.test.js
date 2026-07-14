const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCriticalPath, TIERS } = require('../src/js/criticalpath.js');

function leaf(id, plannedStart, plannedFinish, predecessors) {
  return {
    id, parentId: null, order: 0, name: id, pic: '',
    plannedStart, plannedFinish, actualStart: null, actualFinish: null,
    actualPct: 0, weightOverride: null, deliverable: false,
    statusOverride: null, predecessors: predecessors || [], collapsed: false,
  };
}

function computedFor(tasks) {
  const m = new Map();
  tasks.forEach(t => m.set(t.id, {
    isLeaf: true, plannedStart: t.plannedStart, plannedFinish: t.plannedFinish,
  }));
  return m;
}

// 2026-07-06 is a Monday. No holidays unless stated.

test('back-to-back successor gives float 0 (the locked fencepost)', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),          // finishes Mon
    leaf('b', '2026-07-07', '2026-07-10', ['a']),   // starts Tue, very next workday
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-10' }, []);
  assert.equal(taskFloat.get('a').float, 0);
  assert.equal(taskFloat.get('a').tier, TIERS.CRITICAL);
});

test('one idle workday between finish and successor start gives float 1', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),          // finishes Mon
    leaf('b', '2026-07-08', '2026-07-10', ['a']),   // starts Wed; Tue idle
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-10' }, []);
  assert.equal(taskFloat.get('a').float, 1);
  assert.equal(taskFloat.get('a').tier, TIERS.NEAR_CRITICAL);
});

test('a weekend between finish and successor start adds no float', () => {
  const tasks = [
    leaf('a', '2026-07-06', '2026-07-10'),          // finishes Fri
    leaf('b', '2026-07-13', '2026-07-17', ['a']),   // starts Mon
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-17' }, []);
  assert.equal(taskFloat.get('a').float, 0);
});

test('a holiday in the gap does not count as float', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    leaf('b', '2026-07-08', '2026-07-10', ['a']),   // Tue 07-07 is a holiday
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-10' }, ['2026-07-07']);
  assert.equal(taskFloat.get('a').float, 0);
});

test('multi-successor task takes the minimum edge float, and only zero-float edges are critical', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    leaf('b', '2026-07-07', '2026-07-10', ['a']),   // tight edge: float 0
    leaf('c', '2026-07-20', '2026-07-24', ['a']),   // slack edge
  ];
  const { taskFloat, criticalEdges } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-24' }, []);
  assert.equal(taskFloat.get('a').float, 0);
  assert.ok(criticalEdges.has('a->b'));
  assert.ok(!criticalEdges.has('a->c'));
});

test('a task with no successors floats against the overall project end', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    leaf('z', '2026-07-13', '2026-07-17'),
  ];
  const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-17' }, []);
  assert.equal(taskFloat.get('z').float, 0);   // its finish IS the project end
  assert.equal(taskFloat.get('a').float, networkdaysFloat('2026-07-06', '2026-07-17'));
});
function networkdaysFloat(f, e) {
  const { networkdays } = require('../src/js/schedule.js');
  return Math.max(0, networkdays(f, e, []) - 1);
}

test('tier boundaries land correctly', () => {
  // floats 0,1,2,3,5,6 via sink tasks against a fixed overall end 2026-07-17 (Fri)
  const cases = [
    ['2026-07-17', 0, TIERS.CRITICAL],
    ['2026-07-16', 1, TIERS.NEAR_CRITICAL],
    ['2026-07-15', 2, TIERS.NEAR_CRITICAL],
    ['2026-07-14', 3, TIERS.WATCH],
    ['2026-07-10', 5, TIERS.WATCH],
    ['2026-07-09', 6, TIERS.HEALTHY],
  ];
  cases.forEach(([finish, expectFloat, expectTier]) => {
    const tasks = [leaf('t', '2026-07-01', finish)];
    const { taskFloat } = computeCriticalPath(tasks, computedFor(tasks), { plannedFinish: '2026-07-17' }, []);
    assert.equal(taskFloat.get('t').float, expectFloat, finish);
    assert.equal(taskFloat.get('t').tier, expectTier, finish);
  });
});

test('cancelled tasks, parents, and dateless tasks are excluded; dangling predecessors ignored', () => {
  const tasks = [
    leaf('a', '2026-07-01', '2026-07-06'),
    Object.assign(leaf('x', '2026-07-07', '2026-07-10', ['a', 'ghost']), { statusOverride: 'Cancelled' }),
    leaf('nodates', null, null),
  ];
  const computed = computedFor(tasks);
  computed.set('parent1', { isLeaf: false, plannedStart: '2026-07-01', plannedFinish: '2026-07-10' });
  const { taskFloat } = computeCriticalPath(tasks, computed, { plannedFinish: '2026-07-10' }, []);
  assert.ok(!taskFloat.has('x'));
  assert.ok(!taskFloat.has('nodates'));
  assert.ok(!taskFloat.has('parent1'));
  assert.ok(taskFloat.has('a'));
});
