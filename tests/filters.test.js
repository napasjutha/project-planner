const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taskMatches, visibleIds, hasActiveFilter, computeVisibleRows } = require('../src/js/filters.js');

function task(id, parentId, name, pic, remarks, jira) {
  return { id, parentId, name, pic: pic || '', remarks: remarks || '', jira: jira || '' };
}

test('taskMatches: search matches name case-insensitively', () => {
  const t = task('t1', null, 'Review As-Is Document', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'as-is' }), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'nomatch' }), false);
});

test('taskMatches: search also matches remarks and jira', () => {
  const t = task('t1', null, 'Task', 'Alice', 'blocked on vendor', 'SFDC-42');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'vendor' }), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { search: 'sfdc-42' }), true);
});

test('taskMatches: pic filter is an exact match', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'In Progress' }, { pic: 'Alice' }), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { pic: 'Bob' }), false);
});

test('taskMatches: status filter is an exact match against computed status', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { status: 'Delayed' }), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { status: 'Delayed' }), false);
});

test('taskMatches: onlyDelayed requires Delayed status', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { onlyDelayed: true }), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { onlyDelayed: true }), false);
});

test('taskMatches: onlyMilestone requires milestone flag', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: '', pic: 'Alice', remarks: '', jira: '', milestone: true };
  const nonMilestone = { id: 't2', parentId: null, name: 'Task', owner: '', pic: 'Alice', remarks: '', jira: '', milestone: false };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { onlyMilestone: true }), true);
  assert.equal(taskMatches(nonMilestone, { status: 'In Progress' }, { onlyMilestone: true }), false);
});

test('taskMatches: filters compose with AND', () => {
  const t = task('t1', null, 'Task', 'Alice');
  assert.equal(taskMatches(t, { status: 'Delayed' }, { pic: 'Alice', onlyDelayed: true }), true);
  assert.equal(taskMatches(t, { status: 'Complete' }, { pic: 'Alice', onlyDelayed: true }), false);
});

test('visibleIds: no active filters returns every id in order', () => {
  const project = { tasks: [task('t1', null, 'A'), task('t2', 't1', 'B')] };
  const computedMap = new Map([['t1', { status: 'In Progress' }], ['t2', { status: 'In Progress' }]]);
  const result = visibleIds(project, computedMap, ['t1', 't2'], {});
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
  const result = visibleIds(project, computedMap, ['phase', 'leaf', 'other'], { search: 'target' });
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
  const result = visibleIds(project, computedMap, ['phase', 'leaf'], { search: 'special' });
  assert.deepEqual([...result].sort(), ['phase']);
});

test('taskMatches: owner filter is an exact match', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: 'KPMG', pic: 'Alice', remarks: '', jira: '' };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'KPMG' }), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'Client Team' }), false);
});

test('taskMatches: owner and pic filters compose with AND', () => {
  const t = { id: 't1', parentId: null, name: 'Task', owner: 'KPMG', pic: 'Alice', remarks: '', jira: '' };
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'KPMG', pic: 'Alice' }), true);
  assert.equal(taskMatches(t, { status: 'In Progress' }, { owner: 'KPMG', pic: 'Bob' }), false);
});

test('hasActiveFilter is true when only owner is set', () => {
  assert.equal(hasActiveFilter({ search: '', owner: '', pic: '', status: '', onlyDelayed: false }), false);
  assert.equal(hasActiveFilter({ owner: 'KPMG' }), true);
});

test('hasActiveFilter is true when only onlyMilestone is set', () => {
  assert.equal(hasActiveFilter({ onlyMilestone: false }), false);
  assert.equal(hasActiveFilter({ onlyMilestone: true }), true);
});

test('hasActiveFilter is false for an all-default filter object and true when any field is set', () => {
  assert.equal(hasActiveFilter({ search: '', pic: '', status: '', onlyDelayed: false }), false);
  assert.equal(hasActiveFilter({ search: 'x' }), true);
  assert.equal(hasActiveFilter({ onlyDelayed: true }), true);
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
  assert.deepEqual(computeVisibleRows(project, calc, {}), ['phase', 'leaf1', 'leaf2']);
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
  assert.deepEqual(computeVisibleRows(project, calc, {}), ['phase']);
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
  assert.deepEqual(computeVisibleRows(project, calc, { search: 'findme' }), ['phase', 'leaf1']);
});
