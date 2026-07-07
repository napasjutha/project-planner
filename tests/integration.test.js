const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const { Project } = require('../src/js/store.js');
const { takeSnapshot, compareSnapshots } = require('../src/js/snapshot.js');
const HOLIDAYS_2024 = require('./fixtures/holidays-2024.js');
const { tasks: visionTasks } = require('./fixtures/vision-phase.js');

test('full lifecycle: build a project via the store, recalc, snapshot, edit, recalc again, compare', () => {
  const project = Project.empty('Reference Example Project');
  project.holidays = HOLIDAYS_2024.map(date => ({ date }));
  project.tasks = JSON.parse(JSON.stringify(visionTasks));
  project.meta.statusDate = '2024-03-04';

  const firstPass = recalc(project);
  assert.equal(firstPass.overall.status, 'Complete');
  assert.ok(Math.abs(firstPass.kpis.actualPct - 1) < 1e-9);

  const snap1 = takeSnapshot(project, firstPass, 'Baseline', 'Alice');
  assert.equal(project.snapshots.length, 1);

  project.updateTask('t-12', { plannedFinish: '2024-03-11', actualFinish: null }, 'Bob');
  const secondPass = recalc(project);
  assert.equal(secondPass.overall.status, 'In Progress');
  assert.ok(secondPass.kpis.actualPct < 1);

  const snap2 = takeSnapshot(project, secondPass, 'After slip', 'Bob');
  const diff = compareSnapshots(snap1, snap2);
  assert.equal(diff.slipped.length, 1);
  assert.equal(diff.slipped[0].id, 't-12');
  assert.ok(diff.overallDelta.actualPct < 0);
});

test('project serializes to JSON and restores to an identical, re-computable state', () => {
  const project = Project.empty('Round Trip Test');
  project.holidays = HOLIDAYS_2024.map(date => ({ date }));
  project.tasks = JSON.parse(JSON.stringify(visionTasks));
  project.meta.statusDate = '2024-03-04';
  const before = recalc(project);

  const json = project.serialize();
  const restored = Project.fromJSON(json);
  const after = recalc(restored);

  assert.equal(after.overall.status, before.overall.status);
  assert.ok(Math.abs(after.kpis.actualPct - before.kpis.actualPct) < 1e-9);
  assert.equal(restored.meta.revision, 1);
});
