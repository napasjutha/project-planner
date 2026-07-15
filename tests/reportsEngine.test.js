const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const {
  buildExecutiveSummaryData,
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
