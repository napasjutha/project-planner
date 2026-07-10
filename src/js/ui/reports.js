(function () {
  'use strict';

  function pct(x) { return Math.round(x * 100) + '%'; }

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

  function buildPhaseTable(state) {
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var roots = state.calc.children.get(null) || [];
    var table = el('table', { class: 'report-table' });
    table.appendChild(el('tr', {}, ['Phase', 'Plan %', 'Actual %', 'Status'].map(function (h) { return el('th', {}, [h]); })));
    roots.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      table.appendChild(el('tr', {}, [
        el('td', {}, [task.name]),
        el('td', {}, [pct(c.plannedPctToDate)]),
        el('td', {}, [pct(c.actualPct)]),
        el('td', {}, [c.status]),
      ]));
    });
    return table;
  }

  function buildDelayedList(state) {
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var ul = el('ul', { class: 'report-list' });
    var any = false;
    state.calc.order.forEach(function (id) {
      if ((state.calc.children.get(id) || []).length > 0) return;
      var c = state.calc.computed.get(id);
      if (c.status !== 'Delayed') return;
      any = true;
      var task = byId.get(id);
      ul.appendChild(el('li', {}, [task.name + ' — due ' + c.plannedFinish + (task.remarks ? ' (' + task.remarks + ')' : '')]));
    });
    if (!any) ul.appendChild(el('li', {}, ['None']));
    return ul;
  }

  function latestSnapshotDelta(state) {
    var snaps = state.project.snapshots;
    if (!snaps.length) return null;
    var latest = snaps[snaps.length - 1];
    return {
      note: latest.note,
      takenAt: (latest.takenAt || '').slice(0, 10),
      actualDeltaPct: Math.round((state.calc.kpis.actualPct - latest.overall.actualPct) * 100),
    };
  }

  function renderWeeklyReport(state) {
    var panel = el('div', { class: 'report-panel-inner' });
    panel.appendChild(el('h1', {}, [state.project.meta.name + ' — Weekly Status Report']));
    panel.appendChild(el('div', { class: 'report-meta' }, ['Status date: ' + state.project.meta.statusDate]));

    var kpis = state.calc.kpis;
    var kpiRow = el('div', { class: 'report-kpi-row' }, [
      el('div', { class: 'report-kpi' }, ['Actual: ' + pct(kpis.actualPct)]),
      el('div', { class: 'report-kpi' }, ['Plan: ' + pct(kpis.plannedPct)]),
      el('div', { class: 'report-kpi' }, ['Variance: ' + pct(kpis.variance)]),
    ]);
    panel.appendChild(kpiRow);

    var delta = latestSnapshotDelta(state);
    if (delta) {
      panel.appendChild(el('div', { class: 'report-meta' }, [
        'Since last snapshot (' + delta.takenAt + (delta.note ? ' — ' + delta.note : '') + '): ' +
        (delta.actualDeltaPct >= 0 ? '+' : '') + delta.actualDeltaPct + 'pp actual progress',
      ]));
    }

    panel.appendChild(el('h2', {}, ['Phase Progress']));
    panel.appendChild(buildPhaseTable(state));

    panel.appendChild(el('h2', {}, ['Delayed Items']));
    panel.appendChild(buildDelayedList(state));

    return panel;
  }

  function renderExecutiveReport(state) {
    var panel = el('div', { class: 'report-panel-inner' });
    panel.appendChild(el('h1', {}, [state.project.meta.name + ' — Executive Dashboard']));
    var kpis = state.calc.kpis;
    var kpiRow = el('div', { class: 'report-kpi-row' }, [
      ['Actual', pct(kpis.actualPct)], ['Plan', pct(kpis.plannedPct)],
      ['Delayed', String(kpis.delayedCount)], ['Complete', kpis.completeCount + '/' + kpis.totalCount],
      ['Milestones', kpis.milestonesComplete + '/' + kpis.milestonesTotal],
    ].map(function (pair) { return el('div', { class: 'report-kpi' }, [pair[0] + ': ' + pair[1]]); }));
    panel.appendChild(kpiRow);

    panel.appendChild(el('h2', {}, ['Phase RAG']));
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var roots = state.calc.children.get(null) || [];
    var ragList = el('ul', { class: 'report-list' });
    roots.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      ragList.appendChild(el('li', {}, [task.name + ': ' + c.status]));
    });
    panel.appendChild(ragList);

    panel.appendChild(el('h2', {}, ['Top Risks / Blocked']));
    var riskList = el('ul', { class: 'report-list' });
    var any = false;
    state.calc.order.forEach(function (id) {
      if ((state.calc.children.get(id) || []).length > 0) return;
      var c = state.calc.computed.get(id);
      if (c.status !== 'Delayed' && c.status !== 'Blocked') return;
      any = true;
      riskList.appendChild(el('li', {}, [byId.get(id).name + ': ' + c.status]));
    });
    if (!any) riskList.appendChild(el('li', {}, ['None']));
    panel.appendChild(riskList);

    return panel;
  }

  function renderSummaryReport(state) {
    var panel = el('div', { class: 'report-panel-inner' });
    panel.appendChild(el('h1', {}, [state.project.meta.name + ' — Management Summary']));
    panel.appendChild(el('div', { class: 'report-meta' }, ['Status date: ' + state.project.meta.statusDate]));

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var table = el('table', { class: 'report-table' });
    table.appendChild(el('tr', {}, ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', '% Actual', 'Status'].map(function (h) { return el('th', {}, [h]); })));
    state.calc.order.forEach(function (id) {
      var task = byId.get(id);
      var c = state.calc.computed.get(id);
      table.appendChild(el('tr', {}, [
        el('td', {}, [c.wbs]), el('td', {}, [task.name]), el('td', {}, [task.owner || '']), el('td', {}, [task.pic || '']),
        el('td', {}, [c.plannedStart || '']), el('td', {}, [c.plannedFinish || '']),
        el('td', {}, [pct(c.actualPct)]), el('td', {}, [c.status]),
      ]));
    });
    panel.appendChild(table);
    return panel;
  }

  var TEMPLATES = { weekly: renderWeeklyReport, executive: renderExecutiveReport, summary: renderSummaryReport };

  function renderReport(state) {
    var panel = document.getElementById('report-panel');
    panel.innerHTML = '';
    var templateKey = document.getElementById('report-template-select').value;
    var renderFn = TEMPLATES[templateKey] || renderWeeklyReport;
    panel.appendChild(renderFn(state));
  }

  function copyPanelAsImage() {
    PP.copyElementAsImage(document.getElementById('report-panel'));
  }

  function copyPanelAsTable() {
    var table = document.querySelector('#report-panel table');
    if (!table) {
      window.alert('This report template has no table to copy.');
      return;
    }
    var html = table.outerHTML;
    var text = Array.from(table.querySelectorAll('tr')).map(function (tr) {
      return Array.from(tr.children).map(function (cell) { return cell.textContent; }).join('\t');
    }).join('\n');
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]).catch(function (err) {
      window.alert('Copy as Table failed: ' + err.message);
    });
  }

  function wireReports(state, onTemplateChanged) {
    document.getElementById('report-template-select').addEventListener('change', onTemplateChanged);
    document.getElementById('report-copy-image-button').addEventListener('click', copyPanelAsImage);
    document.getElementById('report-copy-table-button').addEventListener('click', copyPanelAsTable);
  }

  window.PP = window.PP || {};
  window.PP.renderReport = renderReport;
  window.PP.wireReports = wireReports;
})();
