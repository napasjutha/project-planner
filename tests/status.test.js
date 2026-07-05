const { test } = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, deriveStatus } = require('../src/js/status.js');

test('Blocked override wins regardless of dates/progress', () => {
  assert.equal(deriveStatus({
    actualPct: 1, plannedStart: '2024-01-01', plannedFinish: '2024-01-05',
    statusDate: '2024-01-10', statusOverride: 'Blocked',
  }), STATUS.BLOCKED);
});

test('Cancelled override wins regardless of dates/progress', () => {
  assert.equal(deriveStatus({
    actualPct: 0, plannedStart: '2024-01-01', plannedFinish: '2024-01-05',
    statusDate: '2024-01-01', statusOverride: 'Cancelled',
  }), STATUS.CANCELLED);
});

test('actualPct 100% is Complete even if status date is before finish (workbook rows 8-19 pattern)', () => {
  assert.equal(deriveStatus({
    actualPct: 1, plannedStart: '2024-01-15', plannedFinish: '2024-01-16',
    statusDate: '2024-01-15', statusOverride: null,
  }), STATUS.COMPLETE);
});

test('status date before planned start is Not Start', () => {
  assert.equal(deriveStatus({
    actualPct: 0.5, plannedStart: '2024-02-01', plannedFinish: '2024-02-20',
    statusDate: '2024-01-01', statusOverride: null,
  }), STATUS.NOT_START);
});

test('status date within [start, finish] is In Progress', () => {
  assert.equal(deriveStatus({
    actualPct: 0.5, plannedStart: '2024-02-01', plannedFinish: '2024-02-20',
    statusDate: '2024-02-10', statusOverride: null,
  }), STATUS.IN_PROGRESS);
});

test('status date past finish with actualPct < 100% is Delayed', () => {
  assert.equal(deriveStatus({
    actualPct: 0.5, plannedStart: '2024-02-01', plannedFinish: '2024-02-20',
    statusDate: '2024-03-01', statusOverride: null,
  }), STATUS.DELAYED);
});

test('missing plannedStart is Not Start', () => {
  assert.equal(deriveStatus({
    actualPct: 0, plannedStart: null, plannedFinish: null,
    statusDate: '2024-01-01', statusOverride: null,
  }), STATUS.NOT_START);
});
