const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const {
  SECTION_TITLES,
  buildTitlePageData,
  buildAgendaPageData,
  buildProgressPageData,
  buildIssuesRisksPageData,
  buildDecisionsPageData,
  buildNextStepsCalendarPageData,
  buildClosingPageData,
  buildReportPages,
} = require('../src/js/reportsEngine.js');

function fixtureProject(overrides) {
  return Object.assign({
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '' },
      { id: 't2', parentId: null, order: 1, name: 'Build Phase', plannedStart: '2026-06-11', plannedFinish: '2026-06-20', actualStart: '2026-06-11', actualFinish: null, owner: 'Bob', remarks: 'Waiting on vendor' },
    ],
    holidays: [],
    issues: [
      { id: 'i1', title: 'Server outage', description: 'Prod outage in Bangkok region', owner: 'Somchai', status: 'Open', dateRaised: '2026-07-01', dateResolved: null },
    ],
    risks: [
      { id: 'r1', title: 'Vendor delay', description: 'Vendor missed a milestone', likelihood: 'High', impact: 'Medium', mitigation: 'Add backup vendor', owner: 'Bob', status: 'Open', dateRaised: '2026-07-01' },
    ],
    decisions: [
      { id: 'd1', title: 'Choose cloud provider', description: 'Pick primary hosting provider', decisionNeededBy: '2026-08-01', owner: 'Alice', status: 'Pending', decisionMade: '', dateDecided: null },
    ],
    activities: [
      { id: 'a1', type: 'Meeting', name: 'Steering Review', dateStart: '2026-07-09', dateEnd: '2026-07-09', timeStart: '14:30', timeEnd: '15:30', groupIds: [], keyDate: true, remarks: '' },
      { id: 'a2', type: 'Workshop', name: 'Discovery Workshop', dateStart: '2026-07-27', dateEnd: '2026-08-03', timeStart: null, timeEnd: null, groupIds: [], keyDate: false, remarks: '' },
    ],
  }, overrides);
}

test('SECTION_TITLES has exactly 4 titles matching the reference PDF structure', () => {
  assert.equal(SECTION_TITLES.length, 4);
  assert.equal(SECTION_TITLES[0], '01 ผลการดำเนินงาน');
  assert.equal(SECTION_TITLES[1], '02 ประเด็นปัญหาและความเสี่ยง');
  assert.equal(SECTION_TITLES[2], '03 ประเด็นเพื่อหารือ');
  assert.equal(SECTION_TITLES[3], '04 การดำเนินการลำดับถัดไป');
});

test('buildTitlePageData pulls project name, fixed subtitle, and status date from project.meta', () => {
  const data = buildTitlePageData(fixtureProject());
  assert.deepEqual(data, { projectName: 'RAM Modernization', subtitle: 'Progress Meeting', statusDate: '2026-07-09' });
});

test('buildAgendaPageData returns the four section titles as agenda items, in order', () => {
  const data = buildAgendaPageData();
  assert.deepEqual(data.items, SECTION_TITLES);
});

test('buildClosingPageData carries the project name only', () => {
  assert.deepEqual(buildClosingPageData(fixtureProject()), { projectName: 'RAM Modernization' });
});

test('buildProgressPageData produces 6 KPI tiles (Actual/Planned/Variance/Delayed/Complete/Deliverables) matching calc.kpis, and lists exactly the delayed leaf task', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);

  const pct = x => Math.round(x * 100) + '%';
  assert.deepEqual(data.kpis, [
    { label: 'Actual', value: pct(calc.kpis.actualPct) },
    { label: 'Planned', value: pct(calc.kpis.plannedPct) },
    { label: 'Variance', value: pct(calc.kpis.variance) },
    { label: 'Delayed', value: String(calc.kpis.delayedCount) },
    { label: 'Complete', value: calc.kpis.completeCount + '/' + calc.kpis.totalCount },
    { label: 'Deliverables', value: calc.kpis.deliverablesComplete + '/' + calc.kpis.deliverablesTotal },
  ]);

  assert.equal(data.delayedTasks.length, 1);
  assert.deepEqual(data.delayedTasks[0], { name: 'Build Phase', plannedFinish: '2026-06-20', remarks: 'Waiting on vendor' });
});

test('buildProgressPageData returns an empty delayedTasks array when nothing is delayed', () => {
  const project = fixtureProject({
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Design Phase', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', owner: 'Alice', remarks: '' },
    ],
  });
  const calc = recalc(project);
  const data = buildProgressPageData(project, calc);
  assert.deepEqual(data.delayedTasks, []);
});

test('buildIssuesRisksPageData passes through project.issues and project.risks with the full field set', () => {
  const project = fixtureProject();
  const data = buildIssuesRisksPageData(project);
  assert.deepEqual(data.issues, [
    { id: 'i1', title: 'Server outage', description: 'Prod outage in Bangkok region', owner: 'Somchai', status: 'Open', dateRaised: '2026-07-01', dateResolved: null },
  ]);
  assert.deepEqual(data.risks, [
    { id: 'r1', title: 'Vendor delay', description: 'Vendor missed a milestone', likelihood: 'High', impact: 'Medium', mitigation: 'Add backup vendor', owner: 'Bob', status: 'Open', dateRaised: '2026-07-01' },
  ]);
});

test('buildIssuesRisksPageData returns empty arrays when the project has none', () => {
  const data = buildIssuesRisksPageData(fixtureProject({ issues: [], risks: [] }));
  assert.deepEqual(data.issues, []);
  assert.deepEqual(data.risks, []);
});

test('buildDecisionsPageData passes through project.decisions, excluding dateDecided (not a displayed field)', () => {
  const project = fixtureProject();
  const data = buildDecisionsPageData(project);
  assert.deepEqual(data.decisions, [
    { id: 'd1', title: 'Choose cloud provider', description: 'Pick primary hosting provider', decisionNeededBy: '2026-08-01', owner: 'Alice', status: 'Pending', decisionMade: '' },
  ]);
});

test('buildNextStepsCalendarPageData resolves the current and next calendar month from meta.statusDate', () => {
  const data = buildNextStepsCalendarPageData(fixtureProject());
  assert.deepEqual(data.months, [{ year: 2026, month: 6 }, { year: 2026, month: 7 }]);
});

test('buildNextStepsCalendarPageData rolls the year over when the status date is in December', () => {
  const project = fixtureProject({ meta: { name: 'RAM Modernization', statusDate: '2026-12-05' } });
  const data = buildNextStepsCalendarPageData(project);
  assert.deepEqual(data.months, [{ year: 2026, month: 11 }, { year: 2027, month: 0 }]);
});

test('buildReportPages assembles all 11 pages in the exact spec order with matching divider titles', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const pages = buildReportPages(project, calc);

  assert.equal(pages.length, 11);
  assert.deepEqual(pages.map(p => p.type), [
    'title', 'agenda', 'divider', 'progress', 'divider', 'issuesRisks',
    'divider', 'decisions', 'divider', 'calendar', 'closing',
  ]);

  const dividerTitles = pages.filter(p => p.type === 'divider').map(p => p.data.title);
  assert.deepEqual(dividerTitles, SECTION_TITLES);

  assert.equal(pages[0].data.projectName, 'RAM Modernization');
  assert.equal(pages[10].data.projectName, 'RAM Modernization');
  assert.equal(pages[5].data.issues.length, 1);
  assert.equal(pages[5].data.risks.length, 1);
  assert.equal(pages[7].data.decisions.length, 1);
  assert.deepEqual(pages[9].data.months, [{ year: 2026, month: 6 }, { year: 2026, month: 7 }]);
});
