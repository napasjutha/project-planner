const { test } = require('node:test');
const assert = require('node:assert/strict');
const { takeSnapshot, compareSnapshots } = require('../src/js/snapshot.js');

function fakeProject() {
  return {
    meta: { statusDate: '2024-01-01' },
    tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }],
    snapshots: [],
  };
}

function fakeComputed() {
  return {
    overall: { actualPct: 0.5, plannedPctToDate: 0.4 },
    kpis: { actualPct: 0.5, plannedPct: 0.4, variance: 0.1 },
    scurve: [{ weekEndDate: '2024-01-01', plannedCum: 0.4, actualCum: 0.5 }],
  };
}

test('takeSnapshot deep-clones project state and pushes it onto project.snapshots', () => {
  const project = fakeProject();
  const snap = takeSnapshot(project, fakeComputed(), 'Week 1', 'Alice');
  assert.equal(project.snapshots.length, 1);
  assert.equal(snap.note, 'Week 1');
  assert.equal(snap.takenBy, 'Alice');
  assert.equal(snap.tasks[0].id, 't-1');
  snap.tasks[0].plannedFinish = '2099-01-01';
  assert.equal(project.tasks[0].plannedFinish, '2024-01-10');
});

test('compareSnapshots reports overall progress delta', () => {
  const a = { overall: { actualPct: 0.4, plannedPctToDate: 0.4 }, tasks: [] };
  const b = { overall: { actualPct: 0.6, plannedPctToDate: 0.5 }, tasks: [] };
  const diff = compareSnapshots(a, b);
  assert.ok(Math.abs(diff.overallDelta.actualPct - 0.2) < 1e-9);
  assert.ok(Math.abs(diff.overallDelta.plannedPct - 0.1) < 1e-9);
});

test('compareSnapshots detects added and removed tasks', () => {
  const a = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }] };
  const b = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-2', plannedFinish: '2024-01-10' }] };
  const diff = compareSnapshots(a, b);
  assert.deepEqual(diff.added, ['t-2']);
  assert.deepEqual(diff.removed, ['t-1']);
});

test('compareSnapshots detects a slipped finish date', () => {
  const a = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }] };
  const b = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-20' }] };
  const diff = compareSnapshots(a, b);
  assert.equal(diff.slipped.length, 1);
  assert.equal(diff.slipped[0].id, 't-1');
  assert.equal(diff.slipped[0].from, '2024-01-10');
  assert.equal(diff.slipped[0].to, '2024-01-20');
});

test('compareSnapshots does not report a task as slipped if its finish date held or improved', () => {
  const a = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-20' }] };
  const b = { overall: { actualPct: 0, plannedPctToDate: 0 }, tasks: [{ id: 't-1', plannedFinish: '2024-01-10' }] };
  const diff = compareSnapshots(a, b);
  assert.equal(diff.slipped.length, 0);
});
