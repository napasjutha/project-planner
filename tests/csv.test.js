const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripBom, parseCsvText, csvTemplateText, validateCsvRows, escapeCsvField, buildExportCsv } = require('../src/js/csv.js');

test('stripBom removes a leading BOM and leaves clean text alone', () => {
  assert.equal(stripBom('﻿Row,Level'), 'Row,Level');
  assert.equal(stripBom('Row,Level'), 'Row,Level');
  assert.equal(stripBom(''), '');
});

test('parseCsvText splits simple rows and cells', () => {
  assert.deepEqual(parseCsvText('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parseCsvText handles CRLF line endings and skips a trailing empty line', () => {
  assert.deepEqual(parseCsvText('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('parseCsvText keeps commas inside quoted cells', () => {
  assert.deepEqual(parseCsvText('a,"b,c",d'), [['a', 'b,c', 'd']]);
});

test('parseCsvText unescapes doubled quotes inside quoted cells', () => {
  assert.deepEqual(parseCsvText('"say ""hi""",x'), [['say "hi"', 'x']]);
});

test('parseCsvText keeps newlines inside quoted cells', () => {
  assert.deepEqual(parseCsvText('"line1\nline2",x'), [['line1\nline2', 'x']]);
});

test('parseCsvText preserves non-ASCII text', () => {
  assert.deepEqual(parseCsvText('งานออกแบบ,สมชาย'), [['งานออกแบบ', 'สมชาย']]);
});

test('csvTemplateText is the exact 12-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Billing Amount,Billing Status,Predecessors\n'
  );
});

const HEADER = 'Row,Level,Task Name,Owner,PIC,Planned Start,Planned Finish,Remarks,Deliverable,Billing Amount,Billing Status,Predecessors';

function rowsOf(text) {
  return parseCsvText(text);
}

test('validateCsvRows accepts a valid file and builds task specs in order', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Phase A,KPMG,,,,,,,,\n' +
    '2,1,Design,KPMG,Alice,2026-07-01,2026-07-10,first cut,,,,\n' +
    '3,1,Build,Client Team,Bob,2026-07-11,2026-07-20,,Y,25000,Invoiced,2\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], {
    _row: 1, _level: 0, name: 'Phase A', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null,
    remarks: '', deliverable: false, billingAmount: null, billingStatus: null, predecessors: [],
  });
  assert.equal(tasks[1].owner, 'KPMG');
  assert.equal(tasks[1].pic, 'Alice');
  assert.equal(tasks[2].owner, 'Client Team');
  assert.equal(tasks[2].deliverable, true);
  assert.equal(tasks[2].billingAmount, 25000);
  assert.equal(tasks[2].billingStatus, 'Invoiced');
  assert.deepEqual(tasks[2].predecessors, [2]);
});

test('validateCsvRows rejects a wrong header row', () => {
  const { errors, tasks } = validateCsvRows(rowsOf('Row,Level,Name\n1,0,A'));
  assert.equal(tasks.length, 0);
  assert.ok(errors.length >= 1);
  assert.match(errors[0], /header/i);
});

test('validateCsvRows rejects wrong column count with the row number', () => {
  const { errors } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A'));
  assert.ok(errors.some(e => /Row 1:.*12 columns/.test(e)));
});

test('validateCsvRows rejects duplicate and non-integer Row numbers', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,,,\n' +
    '1,0,B,KPMG,,,,,,,,\n' +
    'x,0,C,KPMG,,,,,,,,\n'
  ));
  assert.ok(errors.some(e => /duplicate/i.test(e)));
  assert.ok(errors.some(e => /Row number 'x'/.test(e)));
});

test('validateCsvRows rejects a Level jump greater than +1 and a first row above level 0', () => {
  const jump = validateCsvRows(rowsOf(HEADER + '\n1,0,A,KPMG,,,,,,,,\n2,2,B,KPMG,,,,,,,,\n'));
  assert.ok(jump.errors.some(e => /Row 2:.*Level 2/.test(e)));
  const firstDeep = validateCsvRows(rowsOf(HEADER + '\n1,1,A,KPMG,,,,,,,,\n'));
  assert.ok(firstDeep.errors.some(e => /Row 1:.*Level/.test(e)));
});

test('validateCsvRows rejects empty Task Name, blank Owner, bad dates, bad Billing values', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,,,,next tuesday,2026-13-99,,maybe,lots,Sort Of,\n'
  ));
  assert.ok(errors.some(e => /Task Name/.test(e)));
  assert.ok(errors.some(e => /Owner is required/.test(e)));
  assert.ok(errors.some(e => /Planned Start/.test(e)));
  assert.ok(errors.some(e => /Billing Amount/.test(e)));
  assert.ok(errors.some(e => /Billing Status/.test(e)));
});

test('validateCsvRows rejects a whitespace-only Owner the same as a blank one', () => {
  const { errors } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A,   ,,,,,,,,\n'));
  assert.ok(errors.some(e => /Row 1:.*Owner is required/.test(e)));
});

test('validateCsvRows leaves PIC optional when Owner is present', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(HEADER + '\n1,0,Task A,KPMG,,,,,,,,\n'));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].pic, '');
});

test('validateCsvRows rejects predecessor references to missing rows and to self', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,,,99\n' +
    '2,0,B,KPMG,,,,,,,,2\n'
  ));
  assert.ok(errors.some(e => /Row 1:.*99/.test(e)));
  assert.ok(errors.some(e => /Row 2:.*itself/i.test(e)));
});

test('validateCsvRows allows forward predecessor references', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,,,,2\n' +
    '2,0,B,KPMG,,,,,,,,\n'
  ));
  assert.deepEqual(errors, []);
});

test('validateCsvRows returns no tasks when any error exists', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Good,KPMG,,,,,,,,\n' +
    '2,0,,KPMG,,,,,,,,\n'
  ));
  assert.ok(errors.length > 0);
  assert.deepEqual(tasks, []);
});

test('validateCsvRows parses deliverable variants case-insensitively', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,KPMG,,,,,yes,,,\n' +
    '2,0,B,KPMG,,,,,TRUE,,,\n' +
    '3,0,C,KPMG,,,,,n,,,\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].deliverable, true);
  assert.equal(tasks[1].deliverable, true);
  assert.equal(tasks[2].deliverable, false);
});

test('escapeCsvField leaves plain values untouched and normalizes null/undefined to empty string', () => {
  assert.equal(escapeCsvField('Alice'), 'Alice');
  assert.equal(escapeCsvField(''), '');
  assert.equal(escapeCsvField(null), '');
  assert.equal(escapeCsvField(undefined), '');
  assert.equal(escapeCsvField(42), '42');
});

test('escapeCsvField quotes and escapes values containing commas, quotes, or newlines', () => {
  assert.equal(escapeCsvField('a,b'), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
});

test('buildExportCsv on an empty project produces just the BOM-prefixed header row with a trailing CRLF', () => {
  const csv = buildExportCsv({ tasks: [] }, { order: [], computed: new Map() }, new Map());
  assert.equal(csv, '﻿WBS,Task,Owner,PIC,P-Start,P-Finish,A-Start,A-Finish,Duration,Weight,%Plan,%Actual,Status,Updated By,Updated At,Remarks,Predecessors\r\n');
});

test('buildExportCsv writes one row per task in calc.order with formatted values', () => {
  const project = { tasks: [
    { id: 't1', name: 'Design', owner: 'KPMG', pic: 'Alice', plannedStart: '2026-01-05', plannedFinish: '2026-01-10', actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
  ] };
  const calc = {
    order: ['t1'],
    computed: new Map([['t1', { wbs: '1.1', duration: 5, weight: 0.25, plannedPctToDate: 0.6, actualPct: 0.3, status: 'In Progress' }]]),
  };
  const lastUpdated = new Map([['t1', { who: 'Bob', when: '2026-01-08T10:30:00.000Z' }]]);
  const csv = buildExportCsv(project, calc, lastUpdated);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '1.1,Design,KPMG,Alice,2026-01-05,2026-01-10,,,5,25%,60%,30%,In Progress,Bob,2026-01-08 10:30,,');
});

test('buildExportCsv renders predecessors as comma-separated WBS references and blanks missing fields', () => {
  const project = { tasks: [
    { id: 'a', name: 'A', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
    { id: 'b', name: 'B', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: ['a'] },
  ] };
  const calc = {
    order: ['a', 'b'],
    computed: new Map([
      ['a', { wbs: '1', duration: 0, weight: 0.5, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }],
      ['b', { wbs: '2', duration: 0, weight: 0.5, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }],
    ]),
  };
  const csv = buildExportCsv(project, calc, new Map());
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '1,A,KPMG,,,,,,0,50%,0%,0%,Not Start,,,,');
  assert.equal(lines[2], '2,B,KPMG,,,,,,0,50%,0%,0%,Not Start,,,,1');
});

test('buildExportCsv escapes a task name containing a comma', () => {
  const project = { tasks: [
    { id: 't1', name: 'Design, Build & Test', owner: 'KPMG', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
  ] };
  const calc = { order: ['t1'], computed: new Map([['t1', { wbs: '1', duration: 0, weight: 1, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }]]) };
  const csv = buildExportCsv(project, calc, new Map());
  assert.ok(csv.includes('"Design, Build & Test"'));
});

test('buildExportCsv escapes Thai text with embedded newlines (Owner field) without corrupting it', () => {
  const project = { tasks: [
    { id: 't1', name: 'งานย่อยที่ 1', owner: 'KPMG/\nคณะทำงานกลาง', pic: '', plannedStart: null, plannedFinish: null, actualStart: null, actualFinish: null, remarks: '', predecessors: [] },
  ] };
  const calc = { order: ['t1'], computed: new Map([['t1', { wbs: '1', duration: 0, weight: 1, plannedPctToDate: 0, actualPct: 0, status: 'Not Start' }]]) };
  const csv = buildExportCsv(project, calc, new Map());
  assert.ok(csv.includes('"KPMG/\nคณะทำงานกลาง"'));
  assert.ok(csv.includes('งานย่อยที่ 1'));
});
