(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  var SECTION_TITLES = [
    '01 ผลการดำเนินงาน',
    '02 ประเด็นปัญหาและความเสี่ยง',
    '03 ประเด็นเพื่อหารือ',
    '04 การดำเนินการลำดับถัดไป',
  ];

  function pct(x) { return Math.round(x * 100) + '%'; }

  function buildTitlePageData(project) {
    return {
      projectName: project.meta.name,
      subtitle: 'Progress Meeting',
      statusDate: project.meta.statusDate,
    };
  }

  function buildAgendaPageData() {
    return { items: SECTION_TITLES.slice() };
  }

  function buildProgressPageData(project, calc) {
    var kpis = calc.kpis;
    var tiles = [
      { label: 'Actual', value: pct(kpis.actualPct) },
      { label: 'Planned', value: pct(kpis.plannedPct) },
      { label: 'Variance', value: pct(kpis.variance) },
      { label: 'Delayed', value: String(kpis.delayedCount) },
      { label: 'Complete', value: kpis.completeCount + '/' + kpis.totalCount },
      { label: 'Deliverables', value: kpis.deliverablesComplete + '/' + kpis.deliverablesTotal },
    ];

    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));
    var delayedTasks = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var c = calc.computed.get(id);
      if (c.status !== 'Delayed') return;
      var task = byId.get(id);
      delayedTasks.push({ name: task.name, plannedFinish: c.plannedFinish, remarks: task.remarks || '' });
    });

    var MAX_DELAYED_SHOWN = 8;
    var delayedMoreCount = delayedTasks.length > MAX_DELAYED_SHOWN ? delayedTasks.length - MAX_DELAYED_SHOWN : 0;

    return {
      kpis: tiles,
      delayedTasks: delayedTasks.slice(0, MAX_DELAYED_SHOWN),
      delayedMoreCount: delayedMoreCount,
      scurvePoints: calc.scurve,
      statusDate: project.meta.statusDate,
    };
  }

  function buildIssuesRisksPageData(project) {
    return {
      issues: project.issues.map(function (i) {
        return { id: i.id, title: i.title, description: i.description, owner: i.owner, status: i.status, dateRaised: i.dateRaised, dateResolved: i.dateResolved };
      }),
      risks: project.risks.map(function (r) {
        return { id: r.id, title: r.title, description: r.description, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation, owner: r.owner, status: r.status, dateRaised: r.dateRaised };
      }),
    };
  }

  function buildDecisionsPageData(project) {
    return {
      decisions: project.decisions.map(function (d) {
        return { id: d.id, title: d.title, description: d.description, decisionNeededBy: d.decisionNeededBy, owner: d.owner, status: d.status, decisionMade: d.decisionMade };
      }),
    };
  }

  function monthsFromStatusDate(statusDate) {
    var year = Number(statusDate.slice(0, 4));
    var month = Number(statusDate.slice(5, 7)) - 1;
    var nextYear = year;
    var nextMonth = month + 1;
    if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
    return [{ year: year, month: month }, { year: nextYear, month: nextMonth }];
  }

  function buildNextStepsCalendarPageData(project) {
    return { months: monthsFromStatusDate(project.meta.statusDate) };
  }

  function buildClosingPageData(project) {
    return { projectName: project.meta.name };
  }

  function buildReportPages(project, calc) {
    return [
      { type: 'title', data: buildTitlePageData(project) },
      { type: 'agenda', data: buildAgendaPageData() },
      { type: 'divider', data: { title: SECTION_TITLES[0] } },
      { type: 'progress', data: buildProgressPageData(project, calc) },
      { type: 'divider', data: { title: SECTION_TITLES[1] } },
      { type: 'issuesRisks', data: buildIssuesRisksPageData(project) },
      { type: 'divider', data: { title: SECTION_TITLES[2] } },
      { type: 'decisions', data: buildDecisionsPageData(project) },
      { type: 'divider', data: { title: SECTION_TITLES[3] } },
      { type: 'calendar', data: buildNextStepsCalendarPageData(project) },
      { type: 'closing', data: buildClosingPageData(project) },
    ];
  }

  return {
    SECTION_TITLES: SECTION_TITLES,
    buildTitlePageData: buildTitlePageData,
    buildAgendaPageData: buildAgendaPageData,
    buildProgressPageData: buildProgressPageData,
    buildIssuesRisksPageData: buildIssuesRisksPageData,
    buildDecisionsPageData: buildDecisionsPageData,
    buildNextStepsCalendarPageData: buildNextStepsCalendarPageData,
    buildClosingPageData: buildClosingPageData,
    buildReportPages: buildReportPages,
  };
});
