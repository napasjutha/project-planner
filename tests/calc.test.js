const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc, buildTree, planPctToDate } = require('../src/js/calc.js');
const HOLIDAYS_2024 = require('./fixtures/holidays-2024.js');
const { tasks, EXPECTED_DURATIONS, TOTAL_DURATION } = require('./fixtures/vision-phase.js');

function project(overrides = {}) {
  return {
    meta: { statusDate: '2024-03-04' },
    tasks,
    holidays: HOLIDAYS_2024.map(date => ({ date })),
    ...overrides,
  };
}

test('buildTree assigns dotted WBS numbers by sibling order', () => {
  const { wbs, depth } = buildTree(tasks);
  assert.equal(wbs.get('phase-1'), '1');
  assert.equal(wbs.get('t-1'), '1.1');
  assert.equal(wbs.get('t-12'), '1.12');
  assert.equal(depth.get('phase-1'), 0);
  assert.equal(depth.get('t-1'), 1);
});

test('planPctToDate is 1 once the status date reaches the planned finish', () => {
  assert.equal(planPctToDate('2024-01-01', '2024-01-10', '2024-01-10', 8, []), 1);
  assert.equal(planPctToDate('2024-01-01', '2024-01-10', '2024-02-01', 8, []), 1);
});

test('planPctToDate is 0 before the planned start', () => {
  assert.equal(planPctToDate('2024-01-10', '2024-01-20', '2024-01-01', 8, []), 0);
});

test('recalc: each leaf duration matches the workbook truth table', () => {
  const { computed } = recalc(project());
  for (const [id, expected] of Object.entries(EXPECTED_DURATIONS)) {
    assert.equal(computed.get(id).duration, expected, `duration mismatch for ${id}`);
  }
});

test('recalc: leaf weights are duration / total duration and sum to 1', () => {
  const { computed } = recalc(project());
  let sum = 0;
  for (const id of Object.keys(EXPECTED_DURATIONS)) {
    const c = computed.get(id);
    assert.ok(Math.abs(c.weight - EXPECTED_DURATIONS[id] / TOTAL_DURATION) < 1e-9);
    sum += c.weight;
  }
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('recalc: a manual weightOverride is honored and the rest renormalize around it', () => {
  const overridden = tasks.map(t => (t.id === 't-1' ? { ...t, weightOverride: 0.5 } : t));
  const { computed } = recalc(project({ tasks: overridden }));
  assert.equal(computed.get('t-1').weight, 0.5);
  const autoDurationSum = TOTAL_DURATION - EXPECTED_DURATIONS['t-1'];
  const expectedT2 = 0.5 * (EXPECTED_DURATIONS['t-2'] / autoDurationSum);
  assert.ok(Math.abs(computed.get('t-2').weight - expectedT2) < 1e-9);
});

test('recalc: a Cancelled task drops out of weight and rollup math entirely', () => {
  const cancelled = tasks.map(t => (t.id === 't-1' ? { ...t, statusOverride: 'Cancelled' } : t));
  const { computed } = recalc(project({ tasks: cancelled }));
  assert.equal(computed.get('t-1').weight, 0);
  assert.equal(computed.get('t-1').status, 'Cancelled');
  const remainingDuration = TOTAL_DURATION - EXPECTED_DURATIONS['t-1'];
  assert.ok(Math.abs(computed.get('t-2').weight - EXPECTED_DURATIONS['t-2'] / remainingDuration) < 1e-9);
});

test('recalc: phase rollup is 100% complete when every child is 100% complete and status date is at/after the last finish', () => {
  const { computed, overall } = recalc(project());
  assert.equal(computed.get('phase-1').status, 'Complete');
  assert.ok(Math.abs(computed.get('phase-1').actualPct - 1) < 1e-9);
  assert.ok(Math.abs(overall.actualPct - 1) < 1e-9);
  assert.equal(overall.status, 'Complete');
  assert.equal(overall.plannedStart, '2024-01-15');
  assert.equal(overall.plannedFinish, '2024-03-04');
});

test('recalc: KPIs count complete/delayed leaves and milestones', () => {
  const { kpis } = recalc(project());
  assert.equal(kpis.totalCount, 12);
  assert.equal(kpis.completeCount, 12);
  assert.equal(kpis.delayedCount, 0);
  assert.ok(Math.abs(kpis.variance) < 1e-9);
});

test('recalc: scurve planned and actual cumulative both reach 1 by the last week bucket', () => {
  const { scurve } = recalc(project());
  assert.ok(scurve.length > 0);
  const last = scurve[scurve.length - 1];
  assert.ok(Math.abs(last.plannedCum - 1) < 1e-9);
  assert.ok(Math.abs(last.actualCum - 1) < 1e-9);
});

test('recalc: scurve first bucket (project start week) has near-zero actual for a task that has not started yet', () => {
  const notStarted = tasks.map(t => (t.id === 't-12'
    ? { ...t, actualStart: null, actualFinish: null, actualPct: 0 }
    : t));
  const { scurve } = recalc(project({ tasks: notStarted }));
  const first = scurve[0];
  assert.ok(first.actualCum < 1);
});
