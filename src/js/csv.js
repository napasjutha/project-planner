(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PP = root.PP || {};
    Object.assign(root.PP, factory());
  }
})(globalThis, function () {
  'use strict';

  const CSV_HEADERS = ['Row', 'Level', 'Task Name', 'Owner', 'PIC', 'Planned Start', 'Planned Finish', 'Remarks', 'Deliverable', 'Predecessors'];

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

      const predecessors = [];
      if (c[9]) {
        c[9].split(';').forEach(part => {
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
        remarks: c[7], deliverable, predecessors,
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

  const ACTIVITIES_CSV_HEADERS = ['type', 'name', 'dateStart', 'dateEnd', 'timeStart', 'timeEnd', 'groupIds', 'keyDate', 'remarks'];
  const KEYDATE_TRUE = ['true', 'yes', '1'];
  const KEYDATE_FALSE = ['false', 'no', '0', ''];
  const ACTIVITY_TYPES = ['Meeting', 'Workshop'];

  function activitiesCsvTemplateText() {
    return ACTIVITIES_CSV_HEADERS.join(',') + '\n' +
      'Meeting,Steering Review,2026-08-03,2026-08-03,9:30,10:30,,true,Example meeting row\n' +
      'Workshop,Discovery Workshop,2026-08-10,2026-08-12,,,,, Example workshop row\n';
  }

  function parseActivitiesCsv(rows, activityGroups) {
    const errors = [];
    if (!rows.length || rows[0].map(c => c.trim()).join(',') !== ACTIVITIES_CSV_HEADERS.join(',')) {
      errors.push('Header row must be exactly: ' + ACTIVITIES_CSV_HEADERS.join(','));
      return { errors, activities: [] };
    }
    const groupByName = new Map(activityGroups.map(g => [g.name, g.id]));
    const dataRows = rows.slice(1);
    const activities = [];

    dataRows.forEach((cells, idx) => {
      const label = 'Row ' + (idx + 2); // +2: 1-indexed and header row already consumed
      if (cells.length !== ACTIVITIES_CSV_HEADERS.length) {
        errors.push(label + ': expected ' + ACTIVITIES_CSV_HEADERS.length + ' columns, found ' + cells.length);
        return;
      }
      const c = cells.map(v => v.trim());
      const [typeRaw, name, dateStart, dateEndRaw, timeStart, timeEnd, groupIdsRaw, keyDateRaw, remarks] = c;

      const typeNormalized = ACTIVITY_TYPES.find(t => t.toLowerCase() === typeRaw.toLowerCase());
      if (!typeNormalized) {
        errors.push(label + ": type '" + typeRaw + "' must be Meeting or Workshop");
      }
      if (!name) errors.push(label + ': name is required');
      if (!DATE_RE.test(dateStart)) errors.push(label + ": dateStart '" + dateStart + "' is not a valid date (expected YYYY-MM-DD)");
      const dateEnd = dateEndRaw || dateStart;
      if (dateEndRaw && !DATE_RE.test(dateEndRaw)) errors.push(label + ": dateEnd '" + dateEndRaw + "' is not a valid date (expected YYYY-MM-DD)");
      else if (DATE_RE.test(dateStart) && DATE_RE.test(dateEnd) && dateEnd < dateStart) errors.push(label + ': end date cannot be before start date');

      const groupIds = [];
      if (groupIdsRaw) {
        groupIdsRaw.split(';').map(s => s.trim()).filter(Boolean).forEach(gname => {
          if (groupByName.has(gname)) groupIds.push(groupByName.get(gname));
          else errors.push(label + ": unknown participant group '" + gname + "'");
        });
      }

      const keyDateLower = keyDateRaw.toLowerCase();
      let keyDate = false;
      if (KEYDATE_TRUE.indexOf(keyDateLower) !== -1) keyDate = true;
      else if (KEYDATE_FALSE.indexOf(keyDateLower) === -1) errors.push(label + ": keyDate '" + keyDateRaw + "' must be true/false/yes/no/1/0");

      activities.push({
        type: typeNormalized || typeRaw, name, dateStart, dateEnd,
        timeStart: timeStart || null, timeEnd: timeEnd || null,
        groupIds, keyDate, remarks,
      });
    });

    return errors.length ? { errors, activities: [] } : { errors: [], activities };
  }

  const ESTIMATOR_CSV_HEADERS = ['Requirement', 'Cloud', 'Feature', 'Solution Type', 'Complexity', 'MoSCoW', 'Release Phase'];
  const VALID_CLOUDS = ['Sales', 'Service', 'Marketing', 'Community', 'Experience', 'CPQ', 'Integration', 'Migration'];
  const VALID_SOLUTION_TYPES = ['OOTB', 'Configuration', 'Customization', 'Integration', 'Migration'];
  const VALID_COMPLEXITIES = ['Low', 'Medium', 'High'];
  const VALID_MOSCOW = ['Must Have', 'Should Have', 'Could Have', 'Won\'t Have'];

  function estimatorCsvTemplateText(params) {
    var paramsLine = '';
    if (params) {
      paramsLine = '# PARAMS: ' +
        'contingency=' + (params.contingencyPct * 100) + ',' +
        'confidence=' + (params.confidencePct * 100) + ',' +
        'changeManagement=' + (params.changeManagementPct * 100) + ',' +
        'projectManagement=' + (params.projectManagementPct * 100) + ',' +
        'integrations=' + params.integrationsCount + ',' +
        'migrations=' + params.migrationsCount + '\n';
    }
    return paramsLine +
      ESTIMATOR_CSV_HEADERS.join(',') + '\n' +
      'Account Management,Sales,Objects,Configuration,Medium,Must Have,Phase 1\n' +
      'Case Assignment Rules,Service,Business Logic,Configuration,Low,Must Have,Phase 1\n';
  }

  function parseEstimatorCsv(rows) {
    const errors = [];
    let params = null;
    let headerRowIndex = 0;

    // Check for params line
    if (rows.length > 0 && rows[0][0] && rows[0][0].startsWith('# PARAMS:')) {
      const paramsStr = rows[0][0].substring(9).trim();
      params = {};
      paramsStr.split(',').forEach(function (pair) {
        const parts = pair.split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const value = parseFloat(parts[1].trim());
          if (key === 'integrations' || key === 'migrations') {
            params[key + 'Count'] = value;
          } else {
            params[key + 'Pct'] = value / 100;
          }
        }
      });
      headerRowIndex = 1;
    }

    if (rows.length <= headerRowIndex || rows[headerRowIndex].map(c => c.trim()).join(',') !== ESTIMATOR_CSV_HEADERS.join(',')) {
      errors.push('Header row must be exactly: ' + ESTIMATOR_CSV_HEADERS.join(','));
      return { errors, requirements: [], params: null };
    }
    const dataRows = rows.slice(headerRowIndex + 1);
    const requirements = [];

    dataRows.forEach((cells, idx) => {
      const label = 'Row ' + (idx + 2);
      if (cells.length !== ESTIMATOR_CSV_HEADERS.length) {
        errors.push(label + ': expected ' + ESTIMATOR_CSV_HEADERS.length + ' columns, found ' + cells.length);
        return;
      }
      const c = cells.map(v => v.trim());
      const [name, cloud, feature, solutionType, complexity, moscow, releasePhase] = c;

      if (!name) errors.push(label + ': Requirement is required');

      if (cloud && VALID_CLOUDS.indexOf(cloud) === -1) {
        errors.push(label + ": Cloud '" + cloud + "' must be one of: " + VALID_CLOUDS.join(', '));
      }

      if (solutionType && VALID_SOLUTION_TYPES.indexOf(solutionType) === -1) {
        errors.push(label + ": Solution Type '" + solutionType + "' must be one of: " + VALID_SOLUTION_TYPES.join(', '));
      }

      if (complexity && VALID_COMPLEXITIES.indexOf(complexity) === -1) {
        errors.push(label + ": Complexity '" + complexity + "' must be one of: " + VALID_COMPLEXITIES.join(', '));
      }

      if (moscow && VALID_MOSCOW.indexOf(moscow) === -1) {
        errors.push(label + ": MoSCoW '" + moscow + "' must be one of: " + VALID_MOSCOW.join(', '));
      }

      requirements.push({
        name: name,
        cloud: cloud || '',
        feature: feature || '',
        solutionType: solutionType || '',
        complexity: complexity || '',
        moscow: moscow || '',
        releasePhase: releasePhase || ''
      });
    });

    return errors.length ? { errors, requirements: [], params: null } : { errors: [], requirements, params };
  }

  return {
    stripBom, parseCsvText, csvTemplateText, validateCsvRows, CSV_HEADERS,
    escapeCsvField, buildExportCsv, EXPORT_HEADERS,
    parseActivitiesCsv, activitiesCsvTemplateText,
    estimatorCsvTemplateText, parseEstimatorCsv, ESTIMATOR_CSV_HEADERS
  };
});
