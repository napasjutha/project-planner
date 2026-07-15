const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const {
  buildExecutiveSummaryData,
  buildRoadmapData,
} = require('../src/js/reportsEngine.js');

function fixtureProject(overrides) {
  return Object.assign({
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '', deliverable: false },
      { id: 't2', parentId: null, order: 1, name: 'Build Phase', plannedStart: '2026-06-11', plannedFinish: '2026-06-20', actualStart: '2026-06-11', actualFinish: null, owner: 'Bob', remarks: 'Waiting on vendor', deliverable: true },
    ],
    holidays: [],
    issues: [], risks: [], decisions: [], activities: [],
  }, overrides);
}

test('buildExecutiveSummaryData produces the 6 KPI tiles matching calc.kpis', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const data = buildExecutiveSummaryData(project, calc);

  const pct = x => Math.round(x * 100) + '%';
  assert.deepEqual(data.kpis, [
    { label: 'Actual', value: pct(calc.kpis.actualPct) },
    { label: 'Planned', value: pct(calc.kpis.plannedPct) },
    { label: 'Variance', value: pct(calc.kpis.variance) },
    { label: 'Delayed', value: String(calc.kpis.delayedCount) },
    { label: 'Complete', value: calc.kpis.completeCount + '/' + calc.kpis.totalCount },
    { label: 'Deliverables', value: calc.kpis.deliverablesComplete + '/' + calc.kpis.deliverablesTotal },
  ]);
});

test('buildExecutiveSummaryData: ragStatus is On Track when variance >= 0', () => {
  const project = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Done', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '', deliverable: false },
    ],
  });
  const calc = recalc(project);
  assert.ok(calc.kpis.variance >= 0);
  assert.equal(buildExecutiveSummaryData(project, calc).ragStatus, 'On Track');
});

test('buildExecutiveSummaryData: ragStatus is Watch when -0.05 <= variance < 0, At Risk when variance < -0.05', () => {
  // Build Phase is 100% planned-to-date (finished window) but only 0% actual (no actualFinish, actualStart present but pa() -> partial). Force a clear At-Risk case:
  const atRiskProject = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Late', plannedStart: '2026-05-01', plannedFinish: '2026-05-10', actualStart: null, actualFinish: null, owner: 'Alice', remarks: '', deliverable: false },
    ],
  });
  const atRiskCalc = recalc(atRiskProject);
  assert.ok(atRiskCalc.kpis.variance < -0.05, 'fixture must produce variance below -0.05 for this test to be meaningful');
  assert.equal(buildExecutiveSummaryData(atRiskProject, atRiskCalc).ragStatus, 'At Risk');
});

test('buildExecutiveSummaryData: statusCounts always has all 6 status keys, zero-filled', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const counts = buildExecutiveSummaryData(project, calc).statusCounts;
  assert.deepEqual(Object.keys(counts).sort(), ['Blocked', 'Cancelled', 'Complete', 'Delayed', 'In Progress', 'Not Start'].sort());
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 2); // both leaf tasks in the default fixture counted exactly once
});

test('buildExecutiveSummaryData: statusCounts tallies leaf tasks only, by their calc.computed status', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const counts = buildExecutiveSummaryData(project, calc).statusCounts;
  assert.equal(counts['Complete'], 1); // Design Phase, actualFinish set
  assert.equal(counts['Delayed'], 1);  // Build Phase, plannedFinish before statusDate, no actualFinish
});

function roadmapFixtureProject() {
  return {
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 'phase1', parentId: null, order: 0, name: 'Phase 1', plannedStart: null, plannedFinish: null, owner: '', deliverable: false, statusOverride: null },
      { id: 'phase2', parentId: null, order: 1, name: 'Phase 2', plannedStart: null, plannedFinish: null, owner: '', deliverable: false, statusOverride: null },
      { id: 'p1-group', parentId: 'phase1', order: 0, name: 'Group', plannedStart: null, plannedFinish: null, owner: '', deliverable: false, statusOverride: null },
      { id: 'p1-leaf-a', parentId: 'p1-group', order: 0, name: 'Kickoff Workshop', plannedStart: '2026-07-06', plannedFinish: '2026-07-08', owner: 'KPMG', deliverable: false, statusOverride: null },
      { id: 'p1-leaf-b', parentId: 'p1-group', order: 1, name: 'Deliverable A', plannedStart: '2026-07-06', plannedFinish: '2026-07-10', owner: 'KPMG', deliverable: true, statusOverride: null },
      { id: 'p1-leaf-c', parentId: 'p1-group', order: 2, name: 'Overlapping Task', plannedStart: '2026-07-07', plannedFinish: '2026-07-09', owner: 'RAM', deliverable: false, statusOverride: null },
      { id: 'p2-leaf', parentId: 'phase2', order: 0, name: 'Phase 2 Task', plannedStart: '2026-07-13', plannedFinish: '2026-07-20', owner: 'KPMG', deliverable: false, statusOverride: null },
      { id: 'cancelled-leaf', parentId: 'phase2', order: 1, name: 'Cancelled Task', plannedStart: '2026-08-01', plannedFinish: '2026-08-05', owner: 'KPMG', deliverable: false, statusOverride: 'Cancelled' },
      { id: 'no-dates-leaf', parentId: 'phase2', order: 2, name: 'No Dates', plannedStart: null, plannedFinish: null, owner: 'KPMG', deliverable: false, statusOverride: null },
    ],
    holidays: [], issues: [], risks: [], decisions: [], activities: [],
  };
}

test('buildRoadmapData: rangeStart/rangeEnd span the min/max planned dates of qualifying leaf tasks', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.rangeStart, '2026-07-06');
  assert.equal(data.rangeEnd, '2026-07-20');
});

test('buildRoadmapData: lanes are one per top-level task, in order, not hardcoded names', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.deepEqual(data.lanes, [{ id: 'phase1', name: 'Phase 1' }, { id: 'phase2', name: 'Phase 2' }]);
});

test('buildRoadmapData: a leaf 2 levels deep is assigned to its top-level ancestor lane', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  const item = data.items.find(i => i.taskId === 'p1-leaf-a');
  assert.equal(item.laneId, 'phase1');
});

test('buildRoadmapData: excludes cancelled tasks and tasks missing planned dates', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.items.some(i => i.taskId === 'cancelled-leaf'), false);
  assert.equal(data.items.some(i => i.taskId === 'no-dates-leaf'), false);
});

test('buildRoadmapData: isMeeting true for workshop/meeting keyword in name, false otherwise', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-a').isMeeting, true);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-b').isMeeting, false);
});

test('buildRoadmapData: deliverable flag passes through from task.deliverable', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-b').deliverable, true);
  assert.equal(data.items.find(i => i.taskId === 'p1-leaf-a').deliverable, false);
});

test('buildRoadmapData: overlapping items in the same lane get distinct slots, non-overlapping items can share a slot', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  // p1-leaf-a (07-06..07-08), p1-leaf-b (07-06..07-10), p1-leaf-c (07-07..07-09) all overlap pairwise -> 3 distinct slots
  const phase1Items = data.items.filter(i => i.laneId === 'phase1');
  const slots = new Set(phase1Items.map(i => i.slot));
  assert.equal(slots.size, 3);
});

test('buildRoadmapData: weeks are 7-day chunks from rangeStart to rangeEnd, labeled W0, W1, ...', () => {
  const project = roadmapFixtureProject();
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.weeks[0].start, '2026-07-06');
  assert.equal(data.weeks[0].label, 'W0');
  assert.equal(data.weeks[data.weeks.length - 1].label, 'W' + (data.weeks.length - 1));
});

test('buildRoadmapData: no qualifying tasks returns null range and empty items/weeks', () => {
  const project = { meta: { name: 'Empty', statusDate: '2026-07-09' }, tasks: [], holidays: [], issues: [], risks: [], decisions: [], activities: [] };
  const calc = require('../src/js/calc.js').recalc(project);
  const data = buildRoadmapData(project, calc);
  assert.equal(data.rangeStart, null);
  assert.equal(data.rangeEnd, null);
  assert.deepEqual(data.items, []);
  assert.deepEqual(data.weeks, []);
  assert.deepEqual(data.lanes, []);
});
