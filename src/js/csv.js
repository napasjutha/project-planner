(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Deliverable', 'Billing Amount', 'Billing Status', 'Predecessors'];

  function stripBom(text) {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  function csvTemplateText() {
    return CSV_HEADERS.join(',') + '\n';
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            inQuotes = false;
            i += 1;
          }
        } else {
          cell += ch;
          i += 1;
        }
      } else if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
        i += 1;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 2;
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 1;
      } else {
        cell += ch;
        i += 1;
      }
    }
    if (cell !== '' || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DELIVERABLE_TRUE = ['y', 'yes', 'true', '1'];
  const BILLING_STATUSES = ['Not Billed', 'Invoiced', 'Paid'];

  function validateCsvRows(rows) {
    const errors = [];
    if (!rows.length || rows[0].map(c => c.trim()).join(',') !== CSV_HEADERS.join(',')) {
      errors.push("Header row must be exactly: " + CSV_HEADERS.join(','));
      return { errors, tasks: [] };
    }
    const dataRows = rows.slice(1);
    const seenRowNums = new Set();
    const specs = [];

    dataRows.forEach((cells, idx) => {
      const label = 'Row ' + (cells[0] !== undefined ? cells[0].trim() || '#' + (idx + 1) : '#' + (idx + 1));
      if (cells.length !== CSV_HEADERS.length) {
        errors.push(label + ': expected ' + CSV_HEADERS.length + ' columns, found ' + cells.length);
        return;
      }
      const c = cells.map(v => v.trim());
      const rowNum = Number(c[0]);
      if (!Number.isInteger(rowNum) || rowNum < 1) {
        errors.push(label + ": Row number '" + c[0] + "' must be a positive integer");
        return;
      }
      if (seenRowNums.has(rowNum)) {
        errors.push('Row ' + rowNum + ': duplicate Row number');
        return;
      }
      seenRowNums.add(rowNum);

      const level = Number(c[1]);
      if (!Number.isInteger(level) || level < 0) {
        errors.push('Row ' + rowNum + ": Level '" + c[1] + "' must be a non-negative integer");
      } else {
        const prevLevel = specs.length ? specs[specs.length - 1]._level : -1;
        if (level > prevLevel + 1) {
          errors.push('Row ' + rowNum + ': Level ' + level + ' skips from the previous row\'s Level ' + (specs.length ? prevLevel : 'none') + ' — indent one level at a time');
        }
      }

      if (!c[2]) errors.push('Row ' + rowNum + ': Task Name is required');
      if (!c[3] || !c[3].trim()) errors.push('Row ' + rowNum + ': Owner is required');
      if (c[5] && !DATE_RE.test(c[5])) errors.push('Row ' + rowNum + ": Planned Start '" + c[5] + "' is not a valid date (expected YYYY-MM-DD)");
      if (c[6] && !DATE_RE.test(c[6])) errors.push('Row ' + rowNum + ": Planned Finish '" + c[6] + "' is not a valid date (expected YYYY-MM-DD)");

      const deliverable = DELIVERABLE_TRUE.indexOf(c[8].toLowerCase()) !== -1;

      let billingAmount = null;
      if (c[9]) {
        billingAmount = Number(c[9]);
        if (!isFinite(billingAmount)) {
          errors.push('Row ' + rowNum + ": Billing Amount '" + c[9] + "' is not a number");
          billingAmount = null;
        }
      }

      let billingStatus = null;
      if (c[10]) {
        if (BILLING_STATUSES.indexOf(c[10]) === -1) {
          errors.push('Row ' + rowNum + ": Billing Status '" + c[10] + "' must be one of: " + BILLING_STATUSES.join(', '));
        } else {
          billingStatus = c[10];
        }
      }

      const predecessors = [];
      if (c[11]) {
        c[11].split(';').forEach(part => {
          const p = Number(part.trim());
          if (!Number.isInteger(p) || p < 1) {
            errors.push('Row ' + rowNum + ": Predecessor '" + part.trim() + "' must be a Row number");
          } else if (p === rowNum) {
            errors.push('Row ' + rowNum + ': a task cannot depend on itself');
          } else {
            predecessors.push(p);
          }
        });
      }

      specs.push({
        _row: rowNum, _level: Number.isInteger(level) && level >= 0 ? level : 0,
        name: c[2], owner: c[3], pic: c[4],
        plannedStart: c[5] || null, plannedFinish: c[6] || null,
        remarks: c[7], deliverable,
        billingAmount, billingStatus, predecessors,
      });
    });

    const allRowNums = new Set(specs.map(s => s._row));
    specs.forEach(s => {
      s.predecessors.forEach(p => {
        if (!allRowNums.has(p)) {
          errors.push('Row ' + s._row + ': Predecessor ' + p + ' does not exist in this file');
        }
      });
    });

    return errors.length ? { errors, tasks: [] } : { errors: [], tasks: specs };
  }

  function escapeCsvField(value) {
    var s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  var EXPORT_HEADERS = ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', 'A-Start', 'A-Finish', 'Duration', 'Weight', '%Plan', '%Actual', 'Status', 'Updated By', 'Updated At', 'Remarks', 'Predecessors'];

  function buildExportCsv(project, calc, lastUpdated) {
    var byId = new Map(project.tasks.map(function (t) { return [t.id, t]; }));
    var rows = [EXPORT_HEADERS.map(escapeCsvField).join(',')];
    calc.order.forEach(function (id) {
      var task = byId.get(id);
      var c = calc.computed.get(id);
      var lu = lastUpdated.get(id);
      var predText = (task.predecessors || [])
        .map(function (pid) { var pc = calc.computed.get(pid); return pc ? pc.wbs : null; })
        .filter(Boolean)
        .join(', ');
      var fields = [
        c.wbs, task.name, task.owner || '', task.pic || '',
        task.plannedStart || '', task.plannedFinish || '',
        task.actualStart || '', task.actualFinish || '',
        c.duration, Math.round(c.weight * 100) + '%',
        Math.round(c.plannedPctToDate * 100) + '%', Math.round(c.actualPct * 100) + '%',
        c.status, lu ? lu.who : '', lu ? lu.when.slice(0, 16).replace('T', ' ') : '',
        task.remarks || '', predText,
      ];
      rows.push(fields.map(escapeCsvField).join(','));
    });
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  return { stripBom, parseCsvText, csvTemplateText, validateCsvRows, CSV_HEADERS, escapeCsvField, buildExportCsv, EXPORT_HEADERS };
});
