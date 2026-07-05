(function () {
  'use strict';

  var ZOOM_PX_PER_DAY = { day: 32, week: 10, month: 4, quarter: 1.6 };
  var ROW_HEIGHT = 28;
  var BAR_HEIGHT = 16;
  var HEADER_HEIGHT = 30;
  var DAY_MS = 86400000;

  function computeRange(overall) {
    var todayISO = new Date().toISOString().slice(0, 10);
    var start = overall.plannedStart || todayISO;
    var finish = overall.plannedFinish || todayISO;
    if (finish < start) finish = start;
    var startMs = PP.parseISO(start) - 7 * DAY_MS;
    var finishMs = PP.parseISO(finish) + 7 * DAY_MS;
    return { startISO: PP.toISO(startMs), finishISO: PP.toISO(finishMs), startMs: startMs, finishMs: finishMs };
  }

  function dateToX(dateISO, rangeStartMs, pxPerDay) {
    return (PP.parseISO(dateISO) - rangeStartMs) / DAY_MS * pxPerDay;
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function currentPxPerDay(state) {
    var zoom = state.project.settings.ganttZoom || 'week';
    return ZOOM_PX_PER_DAY[zoom] || ZOOM_PX_PER_DAY.week;
  }

  function renderGantt(state) {
    var body = document.getElementById('gantt-body');
    var labels = document.getElementById('gantt-labels');
    body.innerHTML = '';
    labels.innerHTML = '';

    var pxPerDay = currentPxPerDay(state);
    var range = computeRange(state.calc.overall);
    var totalDays = Math.round((range.finishMs - range.startMs) / DAY_MS);
    var width = Math.max(200, totalDays * pxPerDay);

    var rows = PP.computeVisibleRows(state.project, state.calc, state.filters, state.currentUser);
    var height = Math.max(60, HEADER_HEIGHT + rows.length * ROW_HEIGHT);

    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var svg = svgEl('svg', { width: width, height: height, style: 'display:block' });

    var d;
    for (d = 0; d <= totalDays; d++) {
      var dayMs = range.startMs + d * DAY_MS;
      var dow = new Date(dayMs).getUTCDay();
      var dateISO = PP.toISO(dayMs);
      var isHoliday = state.project.holidays.some(function (h) { return h.date === dateISO; });
      if (dow === 0 || dow === 6 || isHoliday) {
        svg.appendChild(svgEl('rect', {
          x: d * pxPerDay, y: 0, width: pxPerDay, height: height,
          fill: isHoliday ? '#e8f2fb' : '#f5f6f7',
        }));
      }
    }

    var monthSeen = null;
    for (d = 0; d <= totalDays; d++) {
      var dayMs2 = range.startMs + d * DAY_MS;
      var dt = new Date(dayMs2);
      var monthKey = dt.getUTCFullYear() + '-' + dt.getUTCMonth();
      if (monthKey !== monthSeen && dt.getUTCDate() <= 7) {
        monthSeen = monthKey;
        var label = svgEl('text', { x: d * pxPerDay + 4, y: 14, 'font-size': 11, fill: '#5b6470' });
        label.textContent = dt.toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        svg.appendChild(label);
        svg.appendChild(svgEl('line', {
          x1: d * pxPerDay, y1: 0, x2: d * pxPerDay, y2: height,
          stroke: '#e1e4e8', 'stroke-width': 1,
        }));
      }
    }

    rows.forEach(function (id, rowIndex) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
      if (!computed.plannedStart || !computed.plannedFinish) return;
      var x1 = dateToX(computed.plannedStart, range.startMs, pxPerDay);
      var x2 = dateToX(computed.plannedFinish, range.startMs, pxPerDay) + pxPerDay;
      var barWidth = Math.max(2, x2 - x1);

      if (computed.isMilestone) {
        var cx = x1 + barWidth / 2;
        var cy = y + BAR_HEIGHT / 2;
        var r = BAR_HEIGHT / 2;
        svg.appendChild(svgEl('polygon', {
          points: [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy].join(','),
          fill: 'var(--kpmg-blue)',
        }));
        return;
      }

      if (!computed.isLeaf) {
        var tickH = 6;
        var path = 'M ' + x1 + ' ' + (y + tickH) + ' L ' + x1 + ' ' + y + ' L ' + x2 + ' ' + y + ' L ' + x2 + ' ' + (y + tickH);
        svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
        return;
      }

      svg.appendChild(svgEl('rect', {
        x: x1, y: y, width: barWidth, height: BAR_HEIGHT, rx: 3,
        fill: '#dce6f5', stroke: 'var(--kpmg-blue)', 'stroke-width': 1,
        'data-id': id, class: 'gantt-bar',
      }));

      var fillWidth = barWidth * Math.max(0, Math.min(1, computed.actualPct));
      if (fillWidth > 0) {
        svg.appendChild(svgEl('rect', {
          x: x1, y: y, width: fillWidth, height: BAR_HEIGHT, rx: 3,
          fill: computed.status === 'Delayed' ? 'var(--status-delayed)' : 'var(--status-complete)',
          style: 'pointer-events:none',
        }));
      }

      svg.appendChild(svgEl('rect', {
        x: x2 - 6, y: y, width: 6, height: BAR_HEIGHT,
        fill: 'transparent', class: 'gantt-resize-handle', 'data-id': id, style: 'cursor:ew-resize',
      }));
    });

    rows.forEach(function (id, rowIndex) {
      var task = byId.get(id);
      if (!task.predecessors || !task.predecessors.length) return;
      var computed = state.calc.computed.get(id);
      if (!computed.plannedStart) return;
      var thisY = HEADER_HEIGHT + rowIndex * ROW_HEIGHT + BAR_HEIGHT / 2;
      var thisX = dateToX(computed.plannedStart, range.startMs, pxPerDay);

      task.predecessors.forEach(function (predId) {
        var predIndex = rows.indexOf(predId);
        if (predIndex === -1) return;
        var predComputed = state.calc.computed.get(predId);
        if (!predComputed || !predComputed.plannedFinish) return;
        var predY = HEADER_HEIGHT + predIndex * ROW_HEIGHT + BAR_HEIGHT / 2;
        var predX = dateToX(predComputed.plannedFinish, range.startMs, pxPerDay) + pxPerDay;
        var midX = predX + 8;
        var pathD = 'M ' + predX + ' ' + predY + ' L ' + midX + ' ' + predY + ' L ' + midX + ' ' + thisY + ' L ' + thisX + ' ' + thisY;
        svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 1 }));
        svg.appendChild(svgEl('polygon', {
          points: [thisX, thisY, thisX - 6, thisY - 3, thisX - 6, thisY + 3].join(','),
          fill: '#9aa5b1',
        }));
      });
    });

    var todayISO = new Date().toISOString().slice(0, 10);
    if (todayISO >= range.startISO && todayISO <= range.finishISO) {
      var tx = dateToX(todayISO, range.startMs, pxPerDay);
      svg.appendChild(svgEl('line', { x1: tx, y1: 0, x2: tx, y2: height, stroke: 'var(--kpmg-blue-light)', 'stroke-width': 2 }));
    }
    var statusISO = state.project.meta.statusDate;
    if (statusISO >= range.startISO && statusISO <= range.finishISO) {
      var sx = dateToX(statusISO, range.startMs, pxPerDay);
      svg.appendChild(svgEl('line', { x1: sx, y1: 0, x2: sx, y2: height, stroke: 'var(--status-delayed)', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
    }

    body.appendChild(svg);

    var spacer = document.createElement('div');
    spacer.style.height = HEADER_HEIGHT + 'px';
    labels.appendChild(spacer);
    rows.forEach(function (id) {
      var task = byId.get(id);
      var computed = state.calc.computed.get(id);
      var row = document.createElement('div');
      row.className = 'gantt-label-row';
      row.style.height = ROW_HEIGHT + 'px';
      row.style.paddingLeft = (computed.depth * 16) + 'px';
      row.textContent = task.name;
      labels.appendChild(row);
    });
  }

  function computeForwardPassPatches(state, movedTaskId) {
    var holidayDates = state.project.holidays.map(function (h) { return h.date; });
    var result = PP.forwardPass(state.project.tasks, movedTaskId, holidayDates);
    var byId = new Map(state.project.tasks.map(function (t) { return [t.id, t]; }));
    var patches = [];
    result.forEach(function (updated) {
      if (updated.id === movedTaskId) return;
      var original = byId.get(updated.id);
      if (original.plannedStart !== updated.plannedStart || original.plannedFinish !== updated.plannedFinish) {
        patches.push({
          id: updated.id,
          patch: { plannedStart: updated.plannedStart, plannedFinish: updated.plannedFinish },
        });
      }
    });
    return patches;
  }

  function wireGantt(state, onChanged) {
    var container = document.getElementById('gantt-body');
    var drag = null;

    container.addEventListener('mousedown', function (e) {
      var handle = e.target.closest('.gantt-resize-handle');
      var bar = e.target.closest('.gantt-bar');
      var pxPerDay = currentPxPerDay(state);
      if (handle) {
        drag = { mode: 'resize', id: handle.dataset.id, startClientX: e.clientX, pxPerDay: pxPerDay };
      } else if (bar) {
        drag = {
          mode: 'move', id: bar.dataset.id, startClientX: e.clientX, pxPerDay: pxPerDay,
          el: bar, origX: parseFloat(bar.getAttribute('x')),
        };
      } else {
        return;
      }
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      if (e.buttons === 0) {
        // The mouse button was released outside the page (browser chrome,
        // another app after alt-tab, another monitor, etc.) so no `mouseup`
        // ever reached `document`. Abandon the stale drag now instead of
        // letting some unrelated future mouseup wrongly finalize it.
        drag = null;
        return;
      }
      drag.deltaPx = e.clientX - drag.startClientX;
      if (drag.mode === 'move' && drag.el) {
        drag.el.setAttribute('x', drag.origX + drag.deltaPx);
      }
    });

    window.addEventListener('blur', function () {
      // The window losing focus (e.g. alt-tab) is a more immediate signal
      // than waiting for the next mousemove to notice the button is up.
      drag = null;
    });

    document.addEventListener('mouseup', function () {
      if (!drag) return;
      var deltaDays = Math.round((drag.deltaPx || 0) / drag.pxPerDay);
      if (deltaDays !== 0) {
        var task = state.project.tasks.find(function (t) { return t.id === drag.id; });
        if (task && task.plannedStart && task.plannedFinish) {
          var dragPatch;
          if (drag.mode === 'move') {
            var newStart = PP.toISO(PP.parseISO(task.plannedStart) + deltaDays * DAY_MS);
            var newFinish = PP.toISO(PP.parseISO(task.plannedFinish) + deltaDays * DAY_MS);
            dragPatch = { id: drag.id, patch: { plannedStart: newStart, plannedFinish: newFinish } };
          } else {
            var candidateFinish = PP.toISO(PP.parseISO(task.plannedFinish) + deltaDays * DAY_MS);
            if (candidateFinish < task.plannedStart) candidateFinish = task.plannedStart;
            dragPatch = { id: drag.id, patch: { plannedFinish: candidateFinish } };
          }
          // Applied as its own batch first so `PP.forwardPass` (called next)
          // sees the dragged task's NEW dates when deciding whether
          // successors need to shift. This is checkpoint 1 of at most 2 for
          // this drag (was previously 1 + N separate updateTask checkpoints).
          state.project.updateTasks([dragPatch], state.currentUser);
          var successorPatches = computeForwardPassPatches(state, drag.id);
          if (successorPatches.length) {
            // Checkpoint 2: every cascading successor shift lands in a single
            // atomic undo step, instead of one updateTask call (and one
            // undo checkpoint) per successor.
            state.project.updateTasks(successorPatches, state.currentUser);
          }
          onChanged();
        }
      } else if (drag.mode === 'move' && drag.el) {
        // A sub-threshold movement already nudged the bar's visual position
        // during mousemove; snap it back so it doesn't look offset.
        drag.el.setAttribute('x', drag.origX);
      }
      drag = null;
    });
  }

  window.PP = window.PP || {};
  window.PP.renderGantt = renderGantt;
  window.PP.wireGantt = wireGantt;
})();
