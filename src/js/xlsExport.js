(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var COLUMNS = ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', 'A-Start', 'A-Finish', 'Duration', 'Weight', '% Plan', '% Actual', 'Status', 'Remarks'];
  var COL_WIDTHS = [50, 320, 100, 100, 80, 80, 80, 80, 60, 60, 60, 60, 90, 220];

  var STATUS_TINTS = {
    'Delayed': '#fdeaea',
    'Blocked': '#fdf0e0',
    'Complete': '#e8f7ec',
    'Cancelled': '#f0f0f0',
  };

  function buildExportXlsHtml(project, calc) {
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));

    var cols = COL_WIDTHS.map(function (w) { return '<col style="width:' + w + 'px">'; }).join('');

    var headerCells = COLUMNS.map(function (label) {
      return '<th style="background:#00338D;color:#ffffff;font-weight:bold;padding:6px 8px;text-align:left;">' + escapeHtml(label) + '</th>';
    }).join('');
    var headerRow = '<tr>' + headerCells + '</tr>';

    var bodyRows = calc.order.map(function (id) {
      var task = byId.get(id);
      var c = calc.computed.get(id);
      var hasChildren = (calc.children.get(id) || []).length > 0;
      var rowStyle = hasChildren ? 'background:#f7f7f8;font-weight:bold;' : (STATUS_TINTS[c.status] ? 'background:' + STATUS_TINTS[c.status] + ';' : '');
      var nameStyle = 'padding-left:' + (c.depth * 16 + 8) + 'px;';

      var values = [
        c.wbs, task.name, task.owner || '', task.pic || '',
        task.plannedStart || '', task.plannedFinish || '',
        task.actualStart || '', task.actualFinish || '',
        c.duration, Math.round(c.weight * 100) + '%',
        Math.round(c.plannedPctToDate * 100) + '%', Math.round(c.actualPct * 100) + '%',
        c.status, task.remarks || '',
      ];

      var cells = values.map(function (v, i) {
        var extraStyle = i === 1 ? nameStyle : '';
        return '<td style="padding:4px 8px;border-bottom:1px solid #e5e5ea;' + extraStyle + '">' + escapeHtml(v) + '</td>';
      }).join('');

      return '<tr style="' + rowStyle + '">' + cells + '</tr>';
    }).join('');

    return '<html><head><meta charset="utf-8"></head><body>' +
      '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">' +
      cols + headerRow + bodyRows +
      '</table></body></html>';
  }

  return { buildExportXlsHtml: buildExportXlsHtml };
});
