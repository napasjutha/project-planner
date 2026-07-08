const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripBom, parseCsvText, csvTemplateText, validateCsvRows } = require('../src/js/csv.js');

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

test('csvTemplateText is the exact 11-column header row', () => {
  assert.equal(
    csvTemplateText(),
    'Row,Level,Task Name,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors\n'
  );
});

const HEADER = 'Row,Level,Task Name,PIC,Planned Start,Planned Finish,Remarks,Milestone,Billing Amount,Billing Status,Predecessors';

function rowsOf(text) {
  return parseCsvText(text);
}

test('validateCsvRows accepts a valid file and builds task specs in order', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Phase A,,,,,,,,\n' +
    '2,1,Design,Alice,2026-07-01,2026-07-10,first cut,,,,\n' +
    '3,1,Build,Bob,2026-07-11,2026-07-20,,Y,25000,Invoiced,2\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], {
    _row: 1, _level: 0, name: 'Phase A', pic: '', plannedStart: null, plannedFinish: null,
    remarks: '', milestone: false, billingAmount: null, billingStatus: null, predecessors: [],
  });
  assert.equal(tasks[2].milestone, true);
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
  assert.ok(errors.some(e => /Row 1:.*11 columns/.test(e)));
});

test('validateCsvRows rejects duplicate and non-integer Row numbers', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,,,,\n' +
    '1,0,B,,,,,,,,\n' +
    'x,0,C,,,,,,,,\n'
  ));
  assert.ok(errors.some(e => /duplicate/i.test(e)));
  assert.ok(errors.some(e => /Row number 'x'/.test(e)));
});

test('validateCsvRows rejects a Level jump greater than +1 and a first row above level 0', () => {
  const jump = validateCsvRows(rowsOf(HEADER + '\n1,0,A,,,,,,,,\n2,2,B,,,,,,,,\n'));
  assert.ok(jump.errors.some(e => /Row 2:.*Level 2/.test(e)));
  const firstDeep = validateCsvRows(rowsOf(HEADER + '\n1,1,A,,,,,,,,\n'));
  assert.ok(firstDeep.errors.some(e => /Row 1:.*Level/.test(e)));
});

test('validateCsvRows rejects empty Task Name, bad dates, bad Billing values', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,,,next tuesday,2026-13-99,,maybe,lots,Sort Of,\n'
  ));
  assert.ok(errors.some(e => /Task Name/.test(e)));
  assert.ok(errors.some(e => /Planned Start/.test(e)));
  assert.ok(errors.some(e => /Billing Amount/.test(e)));
  assert.ok(errors.some(e => /Billing Status/.test(e)));
});

test('validateCsvRows rejects predecessor references to missing rows and to self', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,,,,99\n' +
    '2,0,B,,,,,,,,2\n'
  ));
  assert.ok(errors.some(e => /Row 1:.*99/.test(e)));
  assert.ok(errors.some(e => /Row 2:.*itself/i.test(e)));
});

test('validateCsvRows allows forward predecessor references', () => {
  const { errors } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,,,,2\n' +
    '2,0,B,,,,,,,,\n'
  ));
  assert.deepEqual(errors, []);
});

test('validateCsvRows returns no tasks when any error exists', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,Good,,,,,,,,\n' +
    '2,0,,,,,,,,,\n'
  ));
  assert.ok(errors.length > 0);
  assert.deepEqual(tasks, []);
});

test('validateCsvRows parses milestone variants case-insensitively', () => {
  const { errors, tasks } = validateCsvRows(rowsOf(
    HEADER + '\n' +
    '1,0,A,,,,,yes,,,\n' +
    '2,0,B,,,,,TRUE,,,\n' +
    '3,0,C,,,,,n,,,\n'
  ));
  assert.deepEqual(errors, []);
  assert.equal(tasks[0].milestone, true);
  assert.equal(tasks[1].milestone, true);
  assert.equal(tasks[2].milestone, false);
});
