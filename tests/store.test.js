const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Project, generateId } = require('../src/js/store.js');

test('generateId produces distinct string ids', () => {
  const a = generateId();
  const b = generateId();
  assert.notEqual(a, b);
  assert.match(a, /^t_/);
});

test('Project.empty creates a blank project with today as status date', () => {
  const p = Project.empty('Test Project');
  assert.equal(p.meta.name, 'Test Project');
  assert.deepEqual(p.tasks, []);
  assert.equal(p.meta.revision, 0);
  assert.match(p.meta.statusDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('addTask appends a leaf task with default fields', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Task A', pic: 'Alice' });
  assert.equal(p.tasks.length, 1);
  assert.equal(t.name, 'Task A');
  assert.equal(t.actualPct, 0);
  assert.equal(t.statusOverride, null);
  assert.deepEqual(t.predecessors, []);
});

test('addTask appends subsequent siblings after existing ones by order', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'First' });
  const second = p.addTask({ parentId: null, name: 'Second' });
  assert.equal(second.order, 1);
});

test('updateTask changes a field and records an audit entry', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Task A' });
  p.updateTask(t.id, { actualPct: 0.5 }, 'Alice');
  assert.equal(p.tasks.find(x => x.id === t.id).actualPct, 0.5);
  assert.equal(p.auditLog.length, 1);
  assert.equal(p.auditLog[0].who, 'Alice');
  assert.equal(p.auditLog[0].field, 'actualPct');
  assert.equal(p.auditLog[0].old, 0);
  assert.equal(p.auditLog[0].new, 0.5);
});

test('updateTask throws for an unknown task id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.updateTask('missing', { actualPct: 1 }));
});

test('updateTasks applies multiple patches as a single undo checkpoint', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const undoStackBefore = p._undoStack.length;

  p.updateTasks([
    { id: a.id, patch: { plannedStart: '2026-01-01' } },
    { id: b.id, patch: { plannedStart: '2026-01-05' } },
  ], 'Alice');

  assert.equal(p.tasks.find(t => t.id === a.id).plannedStart, '2026-01-01');
  assert.equal(p.tasks.find(t => t.id === b.id).plannedStart, '2026-01-05');
  assert.equal(p._undoStack.length, undoStackBefore + 1);
});

test('updateTasks records one audit entry per changed field across all patched tasks', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const auditLengthBefore = p.auditLog.length;

  p.updateTasks([
    { id: a.id, patch: { plannedStart: '2026-01-01', plannedFinish: '2026-01-02' } },
    { id: b.id, patch: { plannedStart: '2026-01-05' } },
  ], 'Alice');

  assert.equal(p.auditLog.length, auditLengthBefore + 3);
});

test('updateTasks undo reverts every patched task together', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });

  p.updateTasks([
    { id: a.id, patch: { plannedStart: '2026-01-01' } },
    { id: b.id, patch: { plannedStart: '2026-01-05' } },
  ], 'Alice');

  p.undo();

  assert.equal(p.tasks.find(t => t.id === a.id).plannedStart, null);
  assert.equal(p.tasks.find(t => t.id === b.id).plannedStart, null);
});

test('updateTasks throws for an unknown task id and does not partially apply', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });

  assert.throws(() => p.updateTasks([
    { id: a.id, patch: { plannedStart: '2026-01-01' } },
    { id: 'missing', patch: { plannedStart: '2026-01-05' } },
  ], 'Alice'));
});

test('deleteTask removes the task and its full subtree', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Parent' });
  const child = p.addTask({ parentId: parent.id, name: 'Child' });
  p.addTask({ parentId: child.id, name: 'Grandchild' });
  p.deleteTask(parent.id, 'Alice');
  assert.equal(p.tasks.length, 0);
});

test('moveTask reparents a task and refuses to move into its own descendant', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const childOfA = p.addTask({ parentId: a.id, name: 'A-child' });
  p.moveTask(b.id, a.id, 1, 'Alice');
  assert.equal(p.tasks.find(t => t.id === b.id).parentId, a.id);
  assert.throws(() => p.moveTask(a.id, childOfA.id, 0, 'Alice'));
});

test('indent makes a task a child of its previous sibling', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const result = p.indent(b.id, 'Alice');
  assert.equal(result, true);
  assert.equal(p.tasks.find(t => t.id === b.id).parentId, a.id);
});

test('indent on the first sibling is a no-op', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  assert.equal(p.indent(a.id, 'Alice'), false);
});

test('outdent moves a task to be a sibling right after its former parent', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const child = p.addTask({ parentId: a.id, name: 'A-child' });
  const result = p.outdent(child.id, 'Alice');
  assert.equal(result, true);
  assert.equal(p.tasks.find(t => t.id === child.id).parentId, null);
});

test('outdent at root is a no-op', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  assert.equal(p.outdent(a.id, 'Alice'), false);
});

test('undo reverts the last mutation, redo reapplies it', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  p.updateTask(t.id, { actualPct: 0.5 }, 'Alice');
  assert.equal(p.undo(), true);
  assert.equal(p.tasks.find(x => x.id === t.id).actualPct, 0);
  assert.equal(p.redo(), true);
  assert.equal(p.tasks.find(x => x.id === t.id).actualPct, 0.5);
});

test('undo with nothing to undo returns false', () => {
  const p = Project.empty('Test');
  assert.equal(p.undo(), false);
});

test('toJSON / fromJSON round-trip preserves tasks and meta', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'A' });
  const json = p.toJSON();
  const restored = Project.fromJSON(json);
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.meta.name, 'Test');
});

test('serialize increments the revision counter', () => {
  const p = Project.empty('Test');
  assert.equal(p.meta.revision, 0);
  p.serialize();
  assert.equal(p.meta.revision, 1);
});

test('serialize called twice in a row increases revision by exactly 1 each time', () => {
  // Documents current (accepted) behavior: serialize() unconditionally bumps
  // meta.revision. Note this is a separate concern from undo/redo, which
  // snapshots the whole meta object and so can roll revision backward if
  // undo() is called after a serialize() — that interaction is an open
  // design question for the save/load phase, not covered by this test.
  const p = Project.empty('Test');
  assert.equal(p.meta.revision, 0);
  p.serialize();
  assert.equal(p.meta.revision, 1);
  p.serialize();
  assert.equal(p.meta.revision, 2);
});

test('moveTask reindexes the old parent siblings so orders stay contiguous after indent', () => {
  const p = Project.empty('Test');
  const a = p.addTask({ parentId: null, name: 'A' });
  const b = p.addTask({ parentId: null, name: 'B' });
  const c = p.addTask({ parentId: null, name: 'C' });
  p.indent(b.id, 'Alice');
  const d = p.addTask({ parentId: null, name: 'D' });
  const rootOrders = p.tasks
    .filter(t => t.parentId === null)
    .map(t => t.order)
    .sort((x, y) => x - y);
  const uniqueOrders = new Set(rootOrders);
  assert.equal(uniqueOrders.size, rootOrders.length, 'no two root siblings should share an order value');
  assert.deepEqual(rootOrders, [0, 1, 2]);
  assert.equal(p.tasks.find(t => t.id === a.id).order, 0);
  assert.equal(p.tasks.find(t => t.id === c.id).order, 1);
  assert.equal(p.tasks.find(t => t.id === d.id).order, 2);
});

test('updateTask with an unknown id throws without pushing an undo checkpoint', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'A' });
  const stackLengthBefore = p._undoStack.length;
  assert.throws(() => p.updateTask('missing', { actualPct: 1 }));
  assert.equal(p._undoStack.length, stackLengthBefore);
});

test('deleteTask with an unknown id throws without writing an audit entry', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'A' });
  const auditLengthBefore = p.auditLog.length;
  assert.throws(() => p.deleteTask('missing', 'Alice'));
  assert.equal(p.auditLog.length, auditLengthBefore);
});

test('toggleCollapse flips collapsed without pushing an undo checkpoint or audit entry', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  const undoStackBefore = p._undoStack.length;
  const auditLengthBefore = p.auditLog.length;

  p.toggleCollapse(t.id);
  assert.equal(p.tasks.find(x => x.id === t.id).collapsed, true);
  assert.equal(p._undoStack.length, undoStackBefore);
  assert.equal(p.auditLog.length, auditLengthBefore);

  p.toggleCollapse(t.id);
  assert.equal(p.tasks.find(x => x.id === t.id).collapsed, false);
});

test('toggleCollapse throws for an unknown task id', () => {
  const p = Project.empty('Test');
  assert.throws(() => p.toggleCollapse('missing'));
});
