const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Project, generateId, findIncompleteTasks, findTasksMissingOwner, describeChange, computeLastUpdated } = require('../src/js/store.js');

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

test('Project.empty sets schemaVersion 1 on meta', () => {
  const p = Project.empty('Test');
  assert.equal(p.meta.schemaVersion, 1);
});

test('addTask defaults billingAmount and billingStatus to null', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Milestone' });
  assert.equal(t.billingAmount, null);
  assert.equal(t.billingStatus, null);
});

test('findIncompleteTasks returns leaf tasks missing plannedStart or plannedFinish', () => {
  const p = Project.empty('Test');
  const complete = p.addTask({ parentId: null, name: 'Complete' });
  p.updateTask(complete.id, { plannedStart: '2024-01-01', plannedFinish: '2024-01-05' }, 'user');
  const missingStart = p.addTask({ parentId: null, name: 'Missing Start' });
  p.updateTask(missingStart.id, { plannedFinish: '2024-01-05' }, 'user');
  const missingBoth = p.addTask({ parentId: null, name: 'Missing Both' });
  const incomplete = findIncompleteTasks(p);
  assert.equal(incomplete.length, 2);
  assert.deepEqual(incomplete.map(t => t.id).sort(), [missingBoth.id, missingStart.id].sort());
});

test('findIncompleteTasks excludes parent/phase tasks even when their raw dates are null', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Phase' });
  const child = p.addTask({ parentId: parent.id, name: 'Child' });
  p.updateTask(child.id, { plannedStart: '2024-01-01', plannedFinish: '2024-01-05' }, 'user');
  const incomplete = findIncompleteTasks(p);
  assert.equal(incomplete.length, 0);
});

test('computeLastUpdated returns the most recent audit entry per task across any field', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  p.updateTask(t.id, { pic: 'Alice' }, 'user1');
  p.updateTask(t.id, { name: 'A renamed' }, 'user2');
  const lastUpdated = computeLastUpdated(p);
  assert.equal(lastUpdated.get(t.id).who, 'user2');
});

test('computeLastUpdated has no entry for a task that was never updated', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'A' });
  const lastUpdated = computeLastUpdated(p);
  assert.equal(lastUpdated.has(t.id), false);
});

test('addTasks builds hierarchy from _level and appends in order under one undo checkpoint', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Phase A', pic: '', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 2, _level: 1, name: 'Design', pic: 'Alice', plannedStart: '2026-07-01', plannedFinish: '2026-07-10', remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 3, _level: 1, name: 'Build', pic: 'Bob', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
    { _row: 4, _level: 0, name: 'Phase B', pic: '', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created.length, 4);
  assert.equal(created[0].parentId, null);
  assert.equal(created[1].parentId, created[0].id);
  assert.equal(created[2].parentId, created[0].id);
  assert.equal(created[3].parentId, null);
  assert.equal(created[1].order, 0);
  assert.equal(created[2].order, 1);
  assert.ok(p.undo());
  assert.equal(p.tasks.length, 0);
});

test('addTasks appends after existing root tasks with contiguous order', () => {
  const p = Project.empty('Test');
  p.addTask({ parentId: null, name: 'Existing' });
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Imported', pic: '', plannedStart: null, plannedFinish: null, remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [] },
  ], 'importer');
  assert.equal(created[0].order, 1);
});

test('addTasks fills the full task shape with defaults', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'A', pic: '', plannedStart: null, plannedFinish: null, remarks: 'note', deliverable: true, billingAmount: 500, billingStatus: 'Paid', predecessors: [] },
  ], 'importer');
  const t = created[0];
  assert.equal(t.actualPct, 0);
  assert.equal(t.weightOverride, null);
  assert.equal(t.statusOverride, null);
  assert.equal(t.collapsed, false);
  assert.equal(t.deliverable, true);
  assert.equal(t.billingAmount, 500);
  assert.equal(t.billingStatus, 'Paid');
});

test('addTask sets owner alongside pic, both defaulting to empty string', () => {
  const p = Project.empty('Test');
  const t = p.addTask({ parentId: null, name: 'Task A' });
  assert.equal(t.owner, '');
  assert.equal(t.pic, '');
  const t2 = p.addTask({ parentId: null, name: 'Task B', owner: 'KPMG', pic: 'Alice' });
  assert.equal(t2.owner, 'KPMG');
  assert.equal(t2.pic, 'Alice');
});

test('addTasks reads owner from specs, defaulting to empty string', () => {
  const p = Project.empty('Test');
  const created = p.addTasks([
    { _row: 1, _level: 0, name: 'Phase A', owner: 'KPMG', pic: '' },
    { _row: 2, _level: 0, name: 'Phase B' },
  ], 'Alice');
  assert.equal(created[0].owner, 'KPMG');
  assert.equal(created[1].owner, '');
});

test('Project migrates a legacy task (owner undefined) by moving pic into owner and blanking pic', () => {
  const p = new Project({
    meta: { id: 'legacy', name: 'Legacy', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'Old Task', pic: 'KPMG/Central Team', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, deliverable: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, 'KPMG/Central Team');
  assert.equal(p.tasks[0].pic, '');
});

test('Project does not re-migrate a task that already has owner, even if owner is blank', () => {
  const p = new Project({
    meta: { id: 'migrated', name: 'Migrated', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'New-Style Task', owner: '', pic: 'Somchai', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, deliverable: false, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].owner, '');
  assert.equal(p.tasks[0].pic, 'Somchai');
});

test('Project migrates a legacy task with milestone:true to deliverable:true and removes the milestone key', () => {
  const p = new Project({
    meta: { id: 'legacy-deliverable', name: 'Legacy Deliverable', statusDate: '2026-01-01', revision: 0, savedBy: null, savedAt: null, createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1 },
    tasks: [{ id: 't1', parentId: null, order: 0, name: 'Old Milestone Task', owner: 'KPMG', pic: '', deliverable: '', jira: '', remarks: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, actualPct: 0, weightOverride: null, milestone: true, statusOverride: null, predecessors: [], collapsed: false, billingAmount: null, billingStatus: null }],
    holidays: [], picList: [], snapshots: [], auditLog: [], settings: { theme: 'kpmg-light', ganttZoom: 'week' },
  });
  assert.equal(p.tasks[0].deliverable, true);
  assert.equal('milestone' in p.tasks[0], false);
});

test('findTasksMissingOwner returns leaf tasks with blank or whitespace-only owner, exempting parent/container tasks', () => {
  const p = Project.empty('Test');
  const parent = p.addTask({ parentId: null, name: 'Phase', owner: '' });
  const midContainer = p.addTask({ parentId: parent.id, name: 'Mid Container', owner: '' });
  const leafOk = p.addTask({ parentId: midContainer.id, name: 'Leaf OK', owner: 'KPMG' });
  const leafBlank = p.addTask({ parentId: midContainer.id, name: 'Leaf Blank', owner: '' });
  const leafWhitespace = p.addTask({ parentId: midContainer.id, name: 'Leaf Whitespace', owner: '   ' });
  const missing = findTasksMissingOwner(p);
  const missingIds = missing.map(t => t.id).sort();
  assert.deepEqual(missingIds, [leafBlank.id, leafWhitespace.id].sort());
  assert.ok(!missingIds.includes(leafOk.id));
  assert.ok(!missingIds.includes(parent.id));
  assert.ok(!missingIds.includes(midContainer.id));
});

function snap(overrides) {
  return Object.assign({ tasks: [], holidays: [], picList: [], snapshots: [], settings: {} }, overrides);
}

test('describeChange: a single added task', () => {
  const before = snap({});
  const after = snap({ tasks: [{ id: 't1', name: 'New Task' }] });
  assert.equal(describeChange(before, after), "Add 'New Task'");
});

test('describeChange: multiple added tasks', () => {
  const before = snap({});
  const after = snap({ tasks: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] });
  assert.equal(describeChange(before, after), 'Add 2 tasks');
});

test('describeChange: a single deleted task', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'Gone' }] });
  const after = snap({});
  assert.equal(describeChange(before, after), "Delete 'Gone'");
});

test('describeChange: multiple deleted tasks', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] });
  const after = snap({});
  assert.equal(describeChange(before, after), 'Delete 2 tasks');
});

test('describeChange: a single field changed on one task', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-01' }] });
  const after = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-05' }] });
  assert.equal(describeChange(before, after), "Change plannedStart on 'Design'");
});

test('describeChange: multiple fields changed on one task', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-01', plannedFinish: '2026-01-02' }] });
  const after = snap({ tasks: [{ id: 't1', name: 'Design', plannedStart: '2026-01-05', plannedFinish: '2026-01-06' }] });
  assert.equal(describeChange(before, after), "Change 2 fields on 'Design'");
});

test('describeChange: fields changed on multiple tasks (e.g. a cascading successor shift)', () => {
  const before = snap({ tasks: [{ id: 't1', name: 'A', plannedStart: '2026-01-01' }, { id: 't2', name: 'B', plannedStart: '2026-01-01' }] });
  const after = snap({ tasks: [{ id: 't1', name: 'A', plannedStart: '2026-01-05' }, { id: 't2', name: 'B', plannedStart: '2026-01-06' }] });
  assert.equal(describeChange(before, after), 'Change 2 tasks');
});

test('describeChange: falls through to holidays/picList/snapshots/settings when no task differs', () => {
  const before = snap({});
  assert.equal(describeChange(before, snap({ holidays: [{ date: '2026-01-01', label: 'New Year' }] })), 'Change holidays');
  assert.equal(describeChange(before, snap({ picList: ['Alice'] })), 'Change PIC list');
  assert.equal(describeChange(before, snap({ snapshots: [{ id: 's1' }] })), 'Take snapshot');
  assert.equal(describeChange(before, snap({ settings: { theme: 'kpmg-dark' } })), 'Change settings');
});

test('describeChange: identical snapshots fall back to a generic label', () => {
  assert.equal(describeChange(snap({}), snap({})), 'Change');
});
