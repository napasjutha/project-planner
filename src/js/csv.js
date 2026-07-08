(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Milestone', 'Billing Amount', 'Billing Status', 'Predecessors'];

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

  return { stripBom, parseCsvText, csvTemplateText, CSV_HEADERS };
});
