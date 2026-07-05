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

test('forwardPass does not mutate the input array', () => {
  const tasks = [
    task('A', null, '2024-01-15', '2024-01-16', []),
    task('B', null, '2024-01-15', '2024-01-16', ['A']),
  ];
  forwardPass(tasks, 'A', []);
  assert.equal(tasks.find(t => t.id === 'B').plannedStart, '2024-01-15');
});
