const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taskMatches, visibleIds, hasActiveFilter, computeVisibleRows } = require('../src/js/filters.js');

function task(id, parentId, name, pic, remarks, jira) {
  return { id, parentId, name, pic: pic || '', remarks: remarks || '', jira: jira || '' };
}

test('taskMatches: search matches name case-insensitively', () => {
  const t = task('t1', null, 'Review As-Is Document', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'as-is' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'nomatch' }, null), false);
});

test('taskMatches: search also matches remarks and jira', () => {
  const t = task('t1', null, 'Task', 'Alice', 'blocked on vendor', 'SFDC-42');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'vendor' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'sfdc-42' }, null), true);
});

test('taskMatches: pic filter is an exact match', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { pic: 'Alice' }, null), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { pic: 'Bob' }, null), false);
});

test('taskMatches: status filter is an exact match against computed status', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { status: 'Delayed' }, null), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { status: 'Delayed' }, null), false);
});

test('taskMatches: onlyDelayed requires Delayed status', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { onlyDelayed: true }, null), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { onlyDelayed: true }, null), false);
});

test('taskMatches: onlyMine requires pic === currentUser', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyMine: true }, 'Alice'), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyMine: true }, 'Bob'), false);
});

test('taskMatches: filters compose with AND', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { pic: 'Alice', onlyDelayed: true }, null), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { pic: 'Alice', onlyDelayed: true }, null), false);
});

test('visibleIds: no active filters returns every id in order', () => {
  const project = { tasks: [task('t1', null, 'A'), task('t2', 't1', 'B')] };
  const computedMap = new Map([['t1', { status: 'In Progress' }], ['t2', { status: 'In Progress' }]]);
  const result = visibleIds(project, computedMap, ['t1', 't2'], {}, null);
  assert.deepEqual([...result].sort(), ['t1', 't2']);
});

test('visibleIds: a matching leaf pulls in its full ancestor chain but not unrelated siblings', () => {
  const project = {
    tasks: [
      task('phase', null, 'Phase'),
      task('leaf', 'phase', 'Target Task', 'Alice'),
      task('other', 'phase', 'Other Task', 'Bob'),
    ],
  };
  const computedMap = new Map([
    ['phase', { status: 'In Progress' }],
    ['leaf', { status: 'In Progress' }],
    ['other', { status: 'In Progress' }],
  ]);
  const result = visibleIds(project, computedMap, ['phase', 'leaf', 'other'], { search: 'target' }, null);
  assert.deepEqual([...result].sort(), ['leaf', 'phase']);
});

test('visibleIds: a matching parent is visible even if no child matches', () => {
  const project = {
    tasks: [
      task('phase', null, 'Special Phase'),
      task('leaf', 'phase', 'Ordinary Task', 'Alice'),
    ],
  };
  const computedMap = new Map([
    ['phase', { status: 'In Progress' }],
    ['leaf', { status: 'In Progress' }],
  ]);
  const result = visibleIds(project, computedMap, ['phase', 'leaf'], { search: 'special' }, null);
  assert.deepEqual([...result].sort(), ['phase']);
});

test('hasActiveFilter is false for an all-default filter object and true when any field is set', () => {
  assert.equal(hasActiveFilter({ search: '', pic: '', status: '', onlyDelayed: false, onlyMine: false }), false);
  assert.equal(hasActiveFilter({ search: 'x' }), true);
  assert.equal(hasActiveFilter({ onlyMine: true }), true);
});

test('computeVisibleRows returns every id in order when nothing is collapsed and no filter is active', () => {
  const project = {
    tasks: [
      { id: 'phase', parentId: null, name: 'Phase', pic: '', remarks: '', jira: '', collapsed: false },
      { id: 'leaf1', parentId: 'phase', name: 'Leaf One', pic: 'Alice', remarks: '', jira: '', collapsed: false },
      { id: 'leaf2', parentId: 'phase', name: 'Leaf Two', pic: 'Bob', remarks: '', jira: '', collapsed: false },
    ],
  };
  const calc = {
    order: ['phase', 'leaf1', 'leaf2'],
    computed: new Map([
      ['phase', { status: 'In Progress' }],
      ['leaf1', { status: 'In Progress' }],
      ['leaf2', { status: 'In Progress' }],
    ]),
  };
  assert.deepEqual(computeVisibleRows(project, calc, {}, null), ['phase', 'leaf1', 'leaf2']);
});

test('computeVisibleRows hides descendants of a collapsed ancestor when no filter is active', () => {
  const project = {
    tasks: [
      { id: 'phase', parentId: null, name: 'Phase', pic: '', remarks: '', jira: '', collapsed: true },
      { id: 'leaf1', parentId: 'phase', name: 'Leaf One', pic: 'Alice', remarks: '', jira: '', collapsed: false },
    ],
  };
  const calc = {
    order: ['phase', 'leaf1'],
    computed: new Map([
      ['phase', { status: 'In Progress' }],
      ['leaf1', { status: 'In Progress' }],
    ]),
  };
  assert.deepEqual(computeVisibleRows(project, calc, {}, null), ['phase']);
});

test('computeVisibleRows reveals a matching descendant even under a collapsed ancestor when a filter is active', () => {
  const project = {
    tasks: [
      { id: 'phase', parentId: null, name: 'Phase', pic: '', remarks: '', jira: '', collapsed: true },
      { id: 'leaf1', parentId: 'phase', name: 'FindMe', pic: 'Alice', remarks: '', jira: '', collapsed: false },
    ],
  };
  const calc = {
    order: ['phase', 'leaf1'],
    computed: new Map([
      ['phase', { status: 'In Progress' }],
      ['leaf1', { status: 'In Progress' }],
    ]),
  };
  assert.deepEqual(computeVisibleRows(project, calc, { search: 'findme' }, null), ['phase', 'leaf1']);
});
