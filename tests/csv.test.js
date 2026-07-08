const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stripBom, parseCsvText, csvTemplateText } = require('../src/js/csv.js');

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
