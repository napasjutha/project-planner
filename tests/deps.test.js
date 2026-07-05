const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wouldCreateCycle, forwardPass } = require('../src/js/deps.js');

function task(id, parentId, plannedStart, plannedFinish, predecessors = []) {
  return { id, parentId, plannedStart, plannedFinish, predecessors };
}

test('wouldCreateCycle: direct cycle detected (A depends on B, adding B depends on A)', () => {
  const tasks = [
    task('A', null, '2024-01-01', '2024-01-02', ['B']),
    task('B', null, '2024-01-03', '2024-01-04', []),
  ];
  assert.equal(wouldCreateCycle(tasks, 'B', 'A'), true);
});

test('wouldCreateCycle: transitive cycle detected (A->B->C, adding C->A)', () => {
  const tasks = [
    task('A', null, '2024-01-01', '2024-01-02', ['B']),
    task('B', null, '2024-01-03', '2024-01-04', ['C']),
    task('C', null, '2024-01-05', '2024-01-06', []),
  ];
  assert.equal(wouldCreateCycle(tasks, 'C', 'A'), true);
});

test('wouldCreateCycle: unrelated link is not a cycle', () => {
  const tasks = [
    task('A', null, '2024-01-01', '2024-01-02', []),
    task('B', null, '2024-01-03', '2024-01-04', []),
  ];
  assert.equal(wouldCreateCycle(tasks, 'B', 'A'), false);
});

test('forwardPass: successor starting before predecessor finishes gets pushed to the next workday', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
  ];
  const result = forwardPass(tasks, 'A', []);
  const b = result.find(t => t.id === 'B');
  assert.equal(b.plannedStart, '2024-01-17');
  assert.equal(b.plannedFinish, '2024-01-18');
});

test('forwardPass: successor already starting after predecessor finishes is untouched', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-02-01', '2024-02-02', ['A']),
  ];
  const result = forwardPass(tasks, 'A', []);
  const b = result.find(t => t.id === 'B');
  assert.equal(b.plannedStart, '2024-02-01');
  assert.equal(b.plannedFinish, '2024-02-02');
});

test('forwardPass: chain shifts recursively (A pushes B pushes C)', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-17', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
    task('C', null, '2024-01-17', '2024-01-18', ['B']),
  ];
  const result = forwardPass(tasks, 'A', []);
  const b = result.find(t => t.id === 'B');
  const c = result.find(t => t.id === 'C');
  assert.equal(b.plannedStart, '2024-01-18');
  assert.equal(b.plannedFinish, '2024-01-19');
  assert.equal(c.plannedStart, '2024-01-22');
});

test('forwardPass: diamond dependency graph re-propagates final dates regardless of array order (X->Z, X->W, W->Z, Z->V)', () => {
  const tasks = [
    task('X', null, '2024-01-15', '2024-01-16', []),
    task('Z', null, '2024-01-15', '2024-01-16', ['X', 'W']),
    task('W', null, '2024-01-15', '2024-01-16', ['X']),
    task('V', null, '2024-01-15', '2024-01-16', ['Z']),
  ];
  const result = forwardPass(tasks, 'X', []);
  const x = result.find(t => t.id === 'X');
  const z = result.find(t => t.id === 'Z');
  const w = result.find(t => t.id === 'W');
  const v = result.find(t => t.id === 'V');

  // Z and W must each individually respect finish-to-start against X.
  assert.ok(z.plannedStart > x.plannedFinish, 'Z must start after X finishes');
  assert.ok(w.plannedStart > x.plannedFinish, 'W must start after X finishes');

  // The core regression: V must be scheduled against Z's FINAL finish date
  // (after Z has been updated by both X and W), not a stale intermediate one.
  assert.ok(v.plannedStart > z.plannedFinish, 'V must start strictly after Z\'s final finish date');
});

test('forwardPass: a cyclic predecessors graph (bypassing wouldCreateCycle) still returns instead of hanging', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', ['B']),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
  ];
  const result = forwardPass(tasks, 'A', []);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2);
});

test('forwardPass does not mutate the input array', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
  ];
  forwardPass(tasks, 'A', []);
  assert.equal(tasks.find(t => t.id === 'B').plannedStart, '2024-01-15');
});
