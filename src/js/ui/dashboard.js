(function () {
  'use strict';

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  var STATUS_COLORS = {
    'Not Start': 'var(--status-not-start)', 'In Progress': 'var(--status-in-progress)', 'Delayed': 'var(--status-delayed)',
    'Complete': 'var(--status-complete)', 'Blocked': 'var(--status-blocked)', 'Cancelled': 'var(--status-cancelled)',
  };

  function donutPath(cx, cy, r, startFrac, endFrac) {
    var startAngle = startFrac * 2 * Math.PI - Math.PI / 2;
    var endAngle = endFrac * 2 * Math.PI - Math.PI / 2;
    var x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    var x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
    var largeArc = (endFrac - startFrac) > 0.5 ? 1 : 0;
    return 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z';
  }

  function renderDonut(computed, order, children) {
    var counts = {};
    order.forEach(function (id) {
      if ((children.get(id) || []).length > 0) return;
      var status = computed.get(id).status;
      counts[status] = (counts[status] || 0) + 1;
    });
    var total = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0);
    var svg = svgEl('svg', { width: 160, height: 160, viewBox: '0 0 160 160' });
    if (total === 0) return svg;
    var statusKeys = Object.keys(counts);
    if (statusKeys.length === 1) {
      svg.appendChild(svgEl('circle', { cx: 80, cy: 80, r: 70, fill: STATUS_COLORS[statusKeys[0]] || '#ccc' }));
    } else {
      var acc = 0;
      statusKeys.forEach(function (status) {
        var frac = counts[status] / total;
        svg.appendChild(svgEl('path', { d: donutPath(80, 80, 70, acc, acc + frac), fill: STATUS_COLORS[status] || '#ccc' }));
        acc += frac;
      });
    }
    svg.appendChild(svgEl('circle', { cx: 80, cy: 80, r: 40, fill: 'var(--surface)' }));
    return svg;
  }

  function renderDashboard(state) {
    var container = document.getElementById('dashboard-body');
    container.innerHTML = '';
    var calc = state.calc;
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));

    var donutSection = document.createElement('div');
    donutSection.className = 'dashboard-section';
    var donutTitle = document.createElement('h3');
    donutTitle.textContent = 'Status Breakdown';
    donutSection.appendChild(donutTitle);
    donutSection.appendChild(renderDonut(calc.computed, calc.order, calc.children));
    container.appendChild(donutSection);

    var phaseSection = document.createElement('div');
    phaseSection.className = 'dashboard-section';
    var phaseTitle = document.createElement('h3');
    phaseTitle.textContent = 'Progress by Phase';
    phaseSection.appendChild(phaseTitle);
    var roots = calc.children.get(null) || [];
    roots.forEach(function (id) {
      var task = byId.get(id);
      var computed = calc.computed.get(id);
      var row = document.createElement('div');
      row.className = 'dashboard-bar-row';
      var label = document.createElement('span');
      label.className = 'dashboard-bar-label';
      label.textContent = task.name;
      var barWrap = document.createElement('span');
      barWrap.className = 'dashboard-bar-wrap';
      var planBar = document.createElement('span');
      planBar.className = 'dashboard-bar plan';
      planBar.style.width = Math.round(computed.plannedPctToDate * 100) + '%';
      var actualBar = document.createElement('span');
      actualBar.className = 'dashboard-bar actual';
      actualBar.style.width = Math.round(computed.actualPct * 100) + '%';
      barWrap.appendChild(planBar);
      barWrap.appendChild(actualBar);
      row.appendChild(label);
      row.appendChild(barWrap);
      phaseSection.appendChild(row);
    });
    container.appendChild(phaseSection);

    var picSection = document.createElement('div');
    picSection.className = 'dashboard-section';
    var picTitle = document.createElement('h3');
    picTitle.textContent = 'Workload by PIC';
    picSection.appendChild(picTitle);
    var picCounts = {};
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var task = byId.get(id);
      if (!task.pic) return;
      picCounts[task.pic] = (picCounts[task.pic] || 0) + 1;
    });
    var picNames = Object.keys(picCounts);
    var maxCount = picNames.reduce(function (m, k) { return Math.max(m, picCounts[k]); }, 1);
    picNames.sort().forEach(function (pic) {
      var row = document.createElement('div');
      row.className = 'dashboard-bar-row';
      var label = document.createElement('span');
      label.className = 'dashboard-bar-label';
      label.textContent = pic + ' (' + picCounts[pic] + ')';
      var barWrap = document.createElement('span');
      barWrap.className = 'dashboard-bar-wrap';
      var bar = document.createElement('span');
      bar.className = 'dashboard-bar pic';
      bar.style.width = Math.round((picCounts[pic] / maxCount) * 100) + '%';
      barWrap.appendChild(bar);
      row.appendChild(label);
      row.appendChild(barWrap);
      picSection.appendChild(row);
    });
    container.appendChild(picSection);

    var milestoneSection = document.createElement('div');
    milestoneSection.className = 'dashboard-section';
    var milestoneTitle = document.createElement('h3');
    milestoneTitle.textContent = 'Upcoming Milestones (14 days)';
    milestoneSection.appendChild(milestoneTitle);
    var statusDate = state.project.meta.statusDate;
    var horizonISO = PP.toISO(PP.parseISO(statusDate) + 14 * 86400000);
    var upcomingList = document.createElement('ul');
    upcomingList.className = 'dashboard-list';
    calc.order.forEach(function (id) {
      var task = byId.get(id);
      if (!task.milestone) return;
      var computed = calc.computed.get(id);
      if (!computed.plannedFinish) return;
      if (computed.plannedFinish >= statusDate && computed.plannedFinish <= horizonISO) {
        var li = document.createElement('li');
        li.textContent = computed.plannedFinish + ' — ' + task.name;
        upcomingList.appendChild(li);
      }
    });
    if (!upcomingList.children.length) {
      var none = document.createElement('li');
      none.textContent = 'None in range';
      upcomingList.appendChild(none);
    }
    milestoneSection.appendChild(upcomingList);
    container.appendChild(milestoneSection);

    var delayedSection = document.createElement('div');
    delayedSection.className = 'dashboard-section dashboard-section-wide';
    var delayedTitle = document.createElement('h3');
    delayedTitle.textContent = 'Top Delayed Tasks';
    delayedSection.appendChild(delayedTitle);
    var delayedRows = [];
    calc.order.forEach(function (id) {
      if ((calc.children.get(id) || []).length > 0) return;
      var computed = calc.computed.get(id);
      if (computed.status !== 'Delayed') return;
      delayedRows.push({ task: byId.get(id), computed: computed });
    });
    delayedRows.sort(function (a, b) { return a.computed.plannedFinish < b.computed.plannedFinish ? -1 : 1; });
    var table = document.createElement('table');
    table.className = 'dashboard-table';
    var thead = document.createElement('tr');
    ['Task', 'PIC', 'P-Finish', '% Actual', 'Remarks'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    delayedRows.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.task.name, r.task.pic || '', r.computed.plannedFinish, Math.round(r.computed.actualPct * 100) + '%', r.task.remarks || ''].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    delayedSection.appendChild(table);
    container.appendChild(delayedSection);

    var billingSection = document.createElement('div');
    billingSection.className = 'dashboard-section';
    var billingTitle = document.createElement('h3');
    billingTitle.textContent = 'Billing Summary';
    billingSection.appendChild(billingTitle);
    var billingTotals = { 'Not Billed': 0, 'Invoiced': 0, 'Paid': 0 };
    var grandTotal = 0;
    state.project.tasks.forEach(function (t) {
      if (!t.milestone || t.billingAmount == null) return;
      var key = t.billingStatus || 'Not Billed';
      billingTotals[key] = (billingTotals[key] || 0) + t.billingAmount;
      grandTotal += t.billingAmount;
    });
    var billingList = document.createElement('ul');
    billingList.className = 'dashboard-list';
    var totalLi = document.createElement('li');
    totalLi.textContent = 'Total: $' + grandTotal.toLocaleString();
    billingList.appendChild(totalLi);
    ['Not Billed', 'Invoiced', 'Paid'].forEach(function (key) {
      var li = document.createElement('li');
      li.textContent = key + ': $' + (billingTotals[key] || 0).toLocaleString();
      billingList.appendChild(li);
    });
    billingSection.appendChild(billingList);
    container.appendChild(billingSection);
  }

  window.PP = window.PP || {};
  window.PP.renderDashboard = renderDashboard;
})();
