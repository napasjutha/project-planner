(function () {
  'use strict';

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function renderScurve(state) {
    var container = document.getElementById('scurve-body');
    container.innerHTML = '';
    var points = state.calc.scurve;
    if (!points.length) {
      container.textContent = 'No data yet — add tasks with planned dates.';
      return;
    }

    var width = 800, height = 320, padding = 40;
    var svg = svgEl('svg', { width: width, height: height, style: 'display:block' });
    var plotW = width - padding * 2;
    var plotH = height - padding * 2;

    function xAt(i) { return padding + (i / Math.max(1, points.length - 1)) * plotW; }
    function yAt(pct) { return padding + (1 - Math.max(0, Math.min(1, pct))) * plotH; }

    for (var g = 0; g <= 4; g++) {
      var gy = padding + (g / 4) * plotH;
      svg.appendChild(svgEl('line', { x1: padding, y1: gy, x2: width - padding, y2: gy, stroke: '#e1e4e8', 'stroke-width': 1 }));
      var label = svgEl('text', { x: 4, y: gy + 4, 'font-size': 10, fill: '#5b6470' });
      label.textContent = Math.round((1 - g / 4) * 100) + '%';
      svg.appendChild(label);
    }

    function pathFor(key) {
      return points.map(function (p, i) {
        return (i === 0 ? 'M ' : 'L ') + xAt(i) + ' ' + yAt(p[key]);
      }).join(' ');
    }

    svg.appendChild(svgEl('path', { d: pathFor('plannedCum'), fill: 'none', stroke: 'var(--kpmg-blue)', 'stroke-width': 2 }));
    svg.appendChild(svgEl('path', { d: pathFor('actualCum'), fill: 'none', stroke: 'var(--status-complete)', 'stroke-width': 2 }));

    var overlayId = state.scurveOverlaySnapshotId;
    if (overlayId) {
      var snap = state.project.snapshots.find(function (s) { return s.id === overlayId; });
      if (snap && snap.scurve && snap.scurve.length) {
        var overlayPath = snap.scurve.map(function (p, i) {
          return (i === 0 ? 'M ' : 'L ') + xAt(Math.min(i, points.length - 1)) + ' ' + yAt(p.actualCum);
        }).join(' ');
        svg.appendChild(svgEl('path', { d: overlayPath, fill: 'none', stroke: '#9aa5b1', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
      }
    }

    points.forEach(function (p, i) {
      svg.appendChild(svgEl('circle', {
        cx: xAt(i), cy: yAt(p.actualCum), r: 3, fill: 'var(--status-complete)',
        'data-index': i, class: 'scurve-dot',
      }));
    });

    container.appendChild(svg);

    var tooltip = document.getElementById('scurve-tooltip');
    svg.querySelectorAll('.scurve-dot').forEach(function (dot) {
      dot.addEventListener('mouseenter', function (e) {
        var i = Number(dot.dataset.index);
        var p = points[i];
        tooltip.hidden = false;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY + 12) + 'px';
        tooltip.textContent = p.periodDate + ' — Plan ' + Math.round(p.plannedCum * 100) + '% / Actual ' + Math.round(p.actualCum * 100) + '%';
      });
      dot.addEventListener('mouseleave', function () { tooltip.hidden = true; });
    });
  }

  function renderScurveOverlaySelect(state) {
    var select = document.getElementById('scurve-overlay-select');
    var current = select.value;
    select.innerHTML = '';
    var noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    select.appendChild(noneOption);
    state.project.snapshots.forEach(function (snap) {
      var option = document.createElement('option');
      option.value = snap.id;
      option.textContent = (snap.takenAt || '').slice(0, 10) + (snap.note ? ' — ' + snap.note : '');
      select.appendChild(option);
    });
    select.value = current;
  }

  function wireScurve(state, onOverlayChanged) {
    document.getElementById('scurve-overlay-select').addEventListener('change', function (e) {
      state.scurveOverlaySnapshotId = e.target.value || null;
      onOverlayChanged();
    });
  }

  window.PP = window.PP || {};
  window.PP.renderScurve = renderScurve;
  window.PP.renderScurveOverlaySelect = renderScurveOverlaySelect;
  window.PP.wireScurve = wireScurve;
})();
