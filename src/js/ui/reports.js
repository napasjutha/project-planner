(function () {
  'use strict';

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function buildTable(headers, rows, cellsFn) {
    var table = el('table', { class: 'report-table' });
    table.appendChild(el('tr', {}, headers.map(function (h) { return el('th', {}, [h]); })));
    rows.forEach(function (row) {
      table.appendChild(el('tr', {}, cellsFn(row).map(function (v) { return el('td', {}, [v || '']); })));
    });
    return table;
  }

  function renderTitlePage(data) {
    return el('section', { class: 'report-page report-page-title' }, [
      el('div', { class: 'report-title-project' }, [data.projectName]),
      el('h1', { class: 'report-title-heading' }, [data.subtitle]),
      el('div', { class: 'report-title-date' }, ['Status date: ' + data.statusDate]),
    ]);
  }

  function renderAgendaPage(data) {
    var list = el('ol', { class: 'report-agenda-list' }, data.items.map(function (item) {
      return el('li', {}, [item]);
    }));
    return el('section', { class: 'report-page report-page-agenda' }, [
      el('h2', { class: 'report-page-heading' }, ['Agenda']),
      list,
    ]);
  }

  function renderDividerPage(data) {
    return el('section', { class: 'report-page report-page-divider' }, [
      el('div', { class: 'report-divider-inner' }, [
        el('h1', { class: 'report-divider-title' }, [data.title]),
      ]),
    ]);
  }

  function renderProgressPage(data) {
    var chart = PP.buildScurveSvg(data.scurvePoints, data.statusDate, { width: 760, height: 480, padding: 36, interactive: false });
    var chartCol = el('div', { class: 'report-progress-chart' }, [chart]);

    var kpiRow = el('div', { class: 'report-kpi-row' }, data.kpis.map(function (tile) {
      return el('div', { class: 'report-kpi-tile' }, [
        el('div', { class: 'report-kpi-tile-label' }, [tile.label]),
        el('div', { class: 'report-kpi-tile-value' }, [tile.value]),
      ]);
    }));
    var delayedItems = data.delayedTasks.map(function (t) {
      return el('li', {}, [t.name + ' — due ' + (t.plannedFinish || '') + (t.remarks ? ' (' + t.remarks + ')' : '')]);
    });
    if (data.delayedMoreCount > 0) {
      delayedItems.push(el('li', { class: 'report-list-more' }, ['+' + data.delayedMoreCount + ' more']));
    }
    var delayedBody = data.delayedTasks.length
      ? el('ul', { class: 'report-list' }, delayedItems)
      : el('p', { class: 'report-empty-note' }, ['No delayed items.']);
    var sidebar = el('div', { class: 'report-progress-sidebar' }, [
      kpiRow,
      el('h3', { class: 'report-subheading' }, ['Delayed Items']),
      delayedBody,
    ]);

    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[0]]),
      el('div', { class: 'report-progress-body' }, [chartCol, sidebar]),
    ]);
  }

  function renderIssuesRisksPage(data) {
    var issuesBody = data.issues.length
      ? buildTable(
          ['Title', 'Description', 'Owner', 'Status', 'Date Raised', 'Date Resolved'],
          data.issues,
          function (i) { return [i.title, i.description, i.owner, i.status, i.dateRaised || '', i.dateResolved || '']; }
        )
      : el('p', { class: 'report-empty-note' }, ['No issues logged.']);
    var risksBody = data.risks.length
      ? buildTable(
          ['Title', 'Description', 'Likelihood', 'Impact', 'Mitigation', 'Owner', 'Status', 'Date Raised'],
          data.risks,
          function (r) { return [r.title, r.description, r.likelihood, r.impact, r.mitigation, r.owner, r.status, r.dateRaised || '']; }
        )
      : el('p', { class: 'report-empty-note' }, ['No risks logged.']);
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[1]]),
      el('h3', { class: 'report-subheading' }, ['Issues']),
      issuesBody,
      el('h3', { class: 'report-subheading' }, ['Risks']),
      risksBody,
    ]);
  }

  function renderDecisionsPage(data) {
    var body = data.decisions.length
      ? buildTable(
          ['Title', 'Description', 'Decision Needed By', 'Owner', 'Status', 'Decision Made'],
          data.decisions,
          function (d) { return [d.title, d.description, d.decisionNeededBy || '', d.owner, d.status, d.decisionMade || '']; }
        )
      : el('p', { class: 'report-empty-note' }, ['No decisions logged.']);
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[2]]),
      body,
    ]);
  }

  function renderCalendarMonth(year, month, activities) {
    var layout = PP.computeCalendarLayout(year, month, activities);

    var monthEl = el('div', { class: 'report-calendar-month' }, [
      el('div', { class: 'report-calendar-month-label' }, [MONTH_NAMES[month] + ' ' + year]),
    ]);
    var dayHeader = el('div', { class: 'report-calendar-day-header' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(function (l) {
      return el('span', {}, [l]);
    }));
    monthEl.appendChild(dayHeader);

    layout.weeks.forEach(function (week, weekIndex) {
      var weekEl = el('div', { class: 'report-calendar-week' });
      week.days.forEach(function (day, col) {
        var cell = el('div', { class: 'report-calendar-daynum' + (day ? '' : ' report-calendar-daynum-empty') });
        cell.style.gridColumn = String(col + 1);
        cell.style.gridRow = '1';
        if (day) {
          cell.appendChild(document.createTextNode(String(day.dayOfMonth)));
          if (day.keyDate) {
            cell.appendChild(el('span', { class: 'report-calendar-keydate-star' }, ['★']));
          }
        }
        weekEl.appendChild(cell);
      });
      layout.segments.filter(function (s) { return s.weekIndex === weekIndex; }).forEach(function (seg) {
        var chip = el('div', { class: 'report-calendar-chip report-calendar-chip-' + seg.activity.type }, [seg.activity.name]);
        chip.style.gridColumn = (seg.startCol + 1) + ' / ' + (seg.endCol + 2);
        chip.style.gridRow = String(seg.lane + 2);
        weekEl.appendChild(chip);
      });
      monthEl.appendChild(weekEl);
    });

    return monthEl;
  }

  function renderCalendarPage(data, activities) {
    var monthsRow = el('div', { class: 'report-calendar-months' }, data.months.map(function (m) {
      return renderCalendarMonth(m.year, m.month, activities);
    }));
    return el('section', { class: 'report-page report-page-content' }, [
      el('h2', { class: 'report-page-heading' }, [PP.SECTION_TITLES[3]]),
      monthsRow,
    ]);
  }

  function renderClosingPage(data) {
    return el('section', { class: 'report-page report-page-closing' }, [
      el('h1', { class: 'report-closing-heading' }, ['Thank You']),
      el('div', { class: 'report-closing-project' }, [data.projectName]),
    ]);
  }

  function renderPage(page, state) {
    if (page.type === 'title') return renderTitlePage(page.data);
    if (page.type === 'agenda') return renderAgendaPage(page.data);
    if (page.type === 'divider') return renderDividerPage(page.data);
    if (page.type === 'progress') return renderProgressPage(page.data);
    if (page.type === 'issuesRisks') return renderIssuesRisksPage(page.data);
    if (page.type === 'decisions') return renderDecisionsPage(page.data);
    if (page.type === 'calendar') return renderCalendarPage(page.data, state.project.activities);
    return renderClosingPage(page.data);
  }

  function renderReport(state) {
    var panel = document.getElementById('report-panel');
    panel.innerHTML = '';
    var pages = PP.buildReportPages(state.project, state.calc);
    pages.forEach(function (page) {
      panel.appendChild(renderPage(page, state));
    });
  }

  function wireReports(state) {
    document.getElementById('export-pdf-button').addEventListener('click', function () {
      window.print();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderReport = renderReport;
  window.PP.wireReports = wireReports;
})();
