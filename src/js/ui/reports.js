(function () {
  'use strict';

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

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
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

  function sectionHeader(title, getSectionEl) {
    var btn = el('button', { class: 'report-copy-btn' }, ['Copy as Image']);
    btn.addEventListener('click', function () { PP.copyElementAsImage(getSectionEl()); });
    return el('div', { class: 'report-section-header' }, [el('h2', {}, [title]), btn]);
  }

  function renderSummarySection(data) {
    var section = el('section', { class: 'report-section report-section-summary' });
    var ragClass = 'report-rag-' + data.ragStatus.replace(/\s+/g, '');
    var ragBadge = el('span', { class: 'report-rag-badge ' + ragClass }, [data.ragStatus]);
    var header = sectionHeader('Executive Summary', function () { return section; });
    header.querySelector('h2').appendChild(ragBadge);
    section.appendChild(header);

    var kpiRow = el('div', { class: 'report-kpi-row' }, data.kpis.map(function (tile) {
      return el('div', { class: 'report-kpi-tile' }, [
        el('div', { class: 'report-kpi-tile-label' }, [tile.label]),
        el('div', { class: 'report-kpi-tile-value' }, [tile.value]),
      ]);
    }));
    section.appendChild(kpiRow);

    var statusRow = el('div', { class: 'report-status-counts' }, Object.keys(data.statusCounts).map(function (status) {
      return el('div', { class: 'report-status-count-item' }, [
        el('span', { class: 'report-status-count-label' }, [status]),
        el('span', { class: 'report-status-count-value' }, [String(data.statusCounts[status])]),
      ]);
    }));
    section.appendChild(statusRow);

    return section;
  }

  function renderRoadmapSection(data) {
    var section = el('section', { class: 'report-section report-section-roadmap' });
    section.appendChild(sectionHeader('Progress Roadmap', function () { return section; }));

    if (!data.rangeStart) {
      section.appendChild(el('p', { class: 'report-empty-note' }, ['No tasks with planned dates to chart.']));
      return section;
    }

    var LW = 160, HH = 40, RH = 60;
    var width = 1200;
    var height = HH + data.lanes.length * RH;
    var plotW = width - LW;

    var startMs = new Date(data.rangeStart + 'T00:00:00Z').getTime();
    var endMs = new Date(data.rangeEnd + 'T00:00:00Z').getTime();
    var span = Math.max(1, endMs - startMs);
    function xAt(dateISO) {
      var ms = new Date(dateISO + 'T00:00:00Z').getTime();
      return LW + ((ms - startMs) / span) * plotW;
    }

    var svg = svgEl('svg', { width: '100%', viewBox: '0 0 ' + width + ' ' + height, style: 'display:block' });

    data.weeks.forEach(function (week) {
      var x = xAt(week.start);
      svg.appendChild(svgEl('line', { x1: x, y1: HH, x2: x, y2: height, stroke: 'var(--border)', 'stroke-width': 1 }));
      var label = svgEl('text', { x: x + 4, y: HH - 8, 'font-size': 11, fill: 'var(--text-secondary)' });
      label.textContent = week.label;
      svg.appendChild(label);
    });

    data.lanes.forEach(function (lane, laneIndex) {
      var y = HH + laneIndex * RH;
      svg.appendChild(svgEl('rect', { x: 0, y: y, width: LW, height: RH, fill: 'var(--kpmg-blue)' }));
      var label = svgEl('text', { x: 10, y: y + RH / 2 + 4, fill: '#ffffff', 'font-size': 13, 'font-weight': 600 });
      label.textContent = lane.name;
      svg.appendChild(label);
      svg.appendChild(svgEl('rect', { x: LW, y: y, width: plotW, height: RH - 1, fill: laneIndex % 2 === 0 ? '#ffffff' : '#f7f7f8' }));
    });

    var tooltip = document.getElementById('scurve-tooltip');
    data.items.forEach(function (item) {
      var laneIndex = data.lanes.findIndex(function (l) { return l.id === item.laneId; });
      if (laneIndex === -1) return;
      var y = HH + laneIndex * RH + 6 + item.slot * 16;
      var x1 = Math.max(LW + 1, xAt(item.plannedStart));
      var x2 = Math.min(width - 1, xAt(item.plannedFinish) + 4);
      var color = item.isMeeting ? '#7c4dff' : (item.deliverable ? '#c00000' : 'var(--kpmg-blue-light)');

      var shape;
      if (item.deliverable) {
        var cx = x2;
        shape = svgEl('polygon', { points: (cx - 6) + ',' + (y + 12) + ' ' + (cx + 6) + ',' + (y + 12) + ' ' + cx + ',' + y, fill: color });
      } else {
        shape = svgEl('rect', { x: x1, y: y, width: Math.max(4, x2 - x1), height: 10, rx: 2, fill: color });
      }
      shape.addEventListener('mouseenter', function (e) {
        tooltip.hidden = false;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
        tooltip.textContent = item.name + ' — ' + item.owner + ' — ' + item.plannedStart + ' to ' + item.plannedFinish;
      });
      shape.addEventListener('mouseleave', function () { tooltip.hidden = true; });
      svg.appendChild(shape);
    });

    if (data.statusDate >= data.rangeStart && data.statusDate <= data.rangeEnd) {
      var sx = xAt(data.statusDate);
      svg.appendChild(svgEl('line', { x1: sx, y1: HH, x2: sx, y2: height, stroke: 'var(--status-delayed)', 'stroke-width': 2, 'stroke-dasharray': '5 3' }));
    }

    section.appendChild(svg);
    return section;
  }

  function renderWeeklySection(data) {
    var section = el('section', { class: 'report-section report-section-weekly' });
    section.appendChild(sectionHeader('Weekly Actions', function () { return section; }));

    var body = el('div', { class: 'report-two-col' }, [
      el('div', {}, [
        el('h3', { class: 'report-subheading' }, ['Completed (Last 7 Days)']),
        data.completedPrior7Days.length
          ? el('ul', { class: 'report-list' }, data.completedPrior7Days.map(function (t) { return el('li', {}, [t.name + ' — ' + t.actualFinish]); }))
          : el('p', { class: 'report-empty-note' }, ['Nothing completed in the last 7 days.']),
      ]),
      el('div', {}, [
        el('h3', { class: 'report-subheading' }, ['Next 14 Days']),
        data.next14Days.length
          ? el('ul', { class: 'report-list' }, data.next14Days.map(function (t) { return el('li', {}, [t.plannedStart + ' — ' + t.name]); }))
          : el('p', { class: 'report-empty-note' }, ['Nothing planned in the next 14 days.']),
      ]),
    ]);
    section.appendChild(body);
    return section;
  }

  function renderRisksSection(data) {
    var section = el('section', { class: 'report-section report-section-risks' });
    section.appendChild(sectionHeader('Risks & Detail', function () { return section; }));

    section.appendChild(el('h3', { class: 'report-subheading' }, ['Delayed / Blocked']));
    section.appendChild(
      data.delayedBlocked.length
        ? el('ul', { class: 'report-list' }, data.delayedBlocked.map(function (t) { return el('li', {}, [t.name + ' (' + t.status + ') — due ' + (t.plannedFinish || '')]); }))
        : el('p', { class: 'report-empty-note' }, ['No delayed or blocked tasks.'])
    );

    section.appendChild(el('h3', { class: 'report-subheading' }, ['Decisions']));
    section.appendChild(
      data.decisions.length
        ? buildTable(['Title', 'Description', 'Needed By', 'Owner', 'Status'], data.decisions, function (d) { return [d.title, d.description, d.decisionNeededBy || '', d.owner, d.status]; })
        : el('p', { class: 'report-empty-note' }, ['No open decisions.'])
    );

    section.appendChild(el('h3', { class: 'report-subheading' }, ['Near-Term Detail']));
    section.appendChild(
      data.nearTermDetail.length
        ? buildTable(['Task', 'Owner', 'Start', 'Finish', 'Status'], data.nearTermDetail, function (t) { return [t.name, t.owner, t.plannedStart, t.plannedFinish, t.status]; })
        : el('p', { class: 'report-empty-note' }, ['No near-term tasks.'])
    );

    return section;
  }

  function renderSection(section) {
    if (section.type === 'summary') return renderSummarySection(section.data);
    if (section.type === 'roadmap') return renderRoadmapSection(section.data);
    if (section.type === 'weekly') return renderWeeklySection(section.data);
    return renderRisksSection(section.data);
  }

  function renderReport(state) {
    var panel = document.getElementById('report-panel');
    panel.innerHTML = '';
    var sections = PP.buildReportSections(state.project, state.calc);
    sections.forEach(function (section) {
      panel.appendChild(renderSection(section));
    });
  }

  function wireReports() {
    // no toolbar-level wiring needed — each section's Copy as Image button is wired inline when rendered.
  }

  window.PP = window.PP || {};
  window.PP.renderReport = renderReport;
  window.PP.wireReports = wireReports;
})();
