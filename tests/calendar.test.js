const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCalendarLayout } = require('../src/js/calendar.js');

function act(overrides) {
  return Object.assign({
    type: 'Meeting', name: 'Untitled', dateStart: null, dateEnd: null,
    timeStart: null, timeEnd: null, groupIds: [], keyDate: false, remarks: '',
  }, overrides);
}

test('computeCalendarLayout returns a Mon-Fri week grid for July 2026 with correct day numbers and no activities', () => {
  const layout = computeCalendarLayout(2026, 6, []);
  assert.equal(layout.year, 2026);
  assert.equal(layout.month, 6);
  assert.equal(layout.weeks.length, 5);
  const dayNumbers = layout.weeks.map(w => w.days.map(d => d ? d.dayOfMonth : null));
  assert.deepEqual(dayNumbers, [
    [null, null, 1, 2, 3],
    [6, 7, 8, 9, 10],
    [13, 14, 15, 16, 17],
    [20, 21, 22, 23, 24],
    [27, 28, 29, 30, 31],
  ]);
  assert.equal(layout.weeks[1].days[3].date, '2026-07-09');
  assert.deepEqual(layout.segments, []);
});

test('computeCalendarLayout trims an entirely-blank leading week row when the month starts on a weekend (August 2026)', () => {
  const layout = computeCalendarLayout(2026, 7, []);
  assert.equal(layout.weeks.length, 5);
  const dayNumbers = layout.weeks.map(w => w.days.map(d => d ? d.dayOfMonth : null));
  assert.deepEqual(dayNumbers, [
    [3, 4, 5, 6, 7],
    [10, 11, 12, 13, 14],
    [17, 18, 19, 20, 21],
    [24, 25, 26, 27, 28],
    [31, null, null, null, null],
  ]);
});

test('a single-day Meeting occupies exactly one day cell (one segment, lane 0)', () => {
  const meeting = act({ id: 'act_single', type: 'Meeting', name: 'Internal Meeting', dateStart: '2026-07-09', dateEnd: '2026-07-09', timeStart: '14:30', timeEnd: '15:30' });
  const layout = computeCalendarLayout(2026, 6, [meeting]);
  assert.equal(layout.segments.length, 1);
  const seg = layout.segments[0];
  assert.equal(seg.weekIndex, 1);
  assert.equal(seg.startCol, 3);
  assert.equal(seg.endCol, 3);
  assert.equal(seg.lane, 0);
  assert.equal(seg.activity, meeting);
});

test('a multi-day Workshop spanning a weekend gap splits into two segments, one per week row', () => {
  const workshop = act({ id: 'act_multi', type: 'Workshop', name: 'Discovery Workshop', dateStart: '2026-07-09', dateEnd: '2026-07-13' });
  const layout = computeCalendarLayout(2026, 6, [workshop]);
  assert.equal(layout.segments.length, 2);
  const [seg1, seg2] = layout.segments;
  assert.equal(seg1.weekIndex, 1);
  assert.equal(seg1.startCol, 3);
  assert.equal(seg1.endCol, 4);
  assert.equal(seg2.weekIndex, 2);
  assert.equal(seg2.startCol, 0);
  assert.equal(seg2.endCol, 0);
});

test('a keyDate activity marks its day cell keyDate:true and leaves other cells false', () => {
  const keyMeeting = act({ id: 'act_key', name: 'Steering Review', dateStart: '2026-07-09', dateEnd: '2026-07-09', keyDate: true });
  const layout = computeCalendarLayout(2026, 6, [keyMeeting]);
  assert.equal(layout.weeks[1].days[3].keyDate, true);
  assert.equal(layout.weeks[1].days[4].keyDate, false);
  assert.equal(layout.weeks[0].days[2].keyDate, false);
});

test('two activities on the same day are assigned separate stacked lanes', () => {
  const a = act({ id: 'act_a', name: 'Steering Committee Update', dateStart: '2026-07-06', dateEnd: '2026-07-06' });
  const b = act({ id: 'act_b', name: 'Team Sync', dateStart: '2026-07-06', dateEnd: '2026-07-06' });
  const layout = computeCalendarLayout(2026, 6, [a, b]);
  assert.equal(layout.segments.length, 2);
  const segA = layout.segments.find(s => s.activity.id === 'act_a');
  const segB = layout.segments.find(s => s.activity.id === 'act_b');
  assert.equal(segA.weekIndex, 1);
  assert.equal(segA.startCol, 0);
  assert.equal(segA.lane, 0);
  assert.equal(segB.weekIndex, 1);
  assert.equal(segB.startCol, 0);
  assert.equal(segB.lane, 1);
});

test('an activity date range is clipped to the target month at a cross-month boundary', () => {
  const crossMonth = act({ id: 'act_clip', name: 'Cross-month', dateStart: '2026-06-29', dateEnd: '2026-07-01' });
  const layout = computeCalendarLayout(2026, 6, [crossMonth]);
  assert.equal(layout.segments.length, 1);
  const seg = layout.segments[0];
  assert.equal(seg.weekIndex, 0);
  assert.equal(seg.startCol, 2);
  assert.equal(seg.endCol, 2);
});

test('an activity entirely outside the target month produces zero segments', () => {
  const outside = act({ id: 'act_out', name: 'Nope', dateStart: '2026-08-05', dateEnd: '2026-08-05' });
  const layout = computeCalendarLayout(2026, 6, [outside]);
  assert.equal(layout.segments.length, 0);
});

test('an activity with a missing dateStart or dateEnd is skipped without crashing', () => {
  const noStart = act({ id: 'act_nostart', name: 'Bad', dateStart: null, dateEnd: '2026-07-09' });
  const noEnd = act({ id: 'act_noend', name: 'Bad2', dateStart: '2026-07-09', dateEnd: null });
  const layout = computeCalendarLayout(2026, 6, [noStart, noEnd]);
  assert.equal(layout.segments.length, 0);
});
