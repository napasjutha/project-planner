const { test } = require('node:test');
const assert = require('node:assert/strict');
const { networkdays, addWorkdays, remainingWorkdays } = require('../src/js/schedule.js');
const HOLIDAYS_2024 = require('./fixtures/holidays-2024.js');

test('networkdays: same-week span, no holiday (workbook row 8: 2024-01-15 Mon to 2024-01-16 Tue)', () => {
  assert.equal(networkdays('2024-01-15', '2024-01-16', []), 2);
});

test('networkdays: spans one weekend, no holiday (workbook row 9: 2024-01-16 to 2024-01-26)', () => {
  assert.equal(networkdays('2024-01-16', '2024-01-26', []), 9);
});

test('networkdays: full workweek (workbook row 10: 2024-01-22 Mon to 2024-01-26 Fri)', () => {
  assert.equal(networkdays('2024-01-22', '2024-01-26', []), 5);
});

test('networkdays: single day (workbook row 11: 2024-02-21 to 2024-02-21)', () => {
  assert.equal(networkdays('2024-02-21', '2024-02-21', []), 1);
});

test('networkdays: excludes a holiday that falls inside the range (workbook row 17: 2024-02-23 to 2024-03-04, holiday 2024-02-26 excluded -> 6, not 7)', () => {
  assert.equal(networkdays('2024-02-23', '2024-03-04', HOLIDAYS_2024), 6);
});

test('networkdays: same range without the holiday list counts the holiday as a workday -> 7', () => {
  assert.equal(networkdays('2024-02-23', '2024-03-04', []), 7);
});

test('networkdays: reversed order returns a negative count', () => {
  assert.equal(networkdays('2024-01-16', '2024-01-15', []), -2);
});

test('networkdays: missing arguments return 0', () => {
  assert.equal(networkdays(null, '2024-01-01', []), 0);
  assert.equal(networkdays('2024-01-01', null, []), 0);
});

test('addWorkdays: 5 workdays from 2024-02-23 skipping the 2024-02-26 holiday lands on 2024-03-04', () => {
  assert.equal(addWorkdays('2024-02-23', 5, HOLIDAYS_2024), '2024-03-04');
});

test('addWorkdays: 0 workdays returns the same date', () => {
  assert.equal(addWorkdays('2024-01-15', 0, []), '2024-01-15');
});

test('remainingWorkdays: status date before finish counts the working days between (2024-03-01 Fri to 2024-03-04 Mon)', () => {
  assert.equal(remainingWorkdays('2024-03-01', '2024-03-04', []), 2);
});

test('remainingWorkdays: status date equal to finish returns 0', () => {
  assert.equal(remainingWorkdays('2024-03-04', '2024-03-04', []), 0);
});

test('remainingWorkdays: status date past finish returns 0', () => {
  assert.equal(remainingWorkdays('2024-03-05', '2024-03-04', []), 0);
});
