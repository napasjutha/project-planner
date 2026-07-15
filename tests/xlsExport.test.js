const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recalc } = require('../src/js/calc.js');
const { buildExportXlsHtml } = require('../src/js/xlsExport.js');

function fixtureProject() {
  return {
    meta: { name: 'RAM Modernization', statusDate: '2026-07-09' },
    tasks: [
      { id: 't1', parentId: null, order: 0, name: 'Phase 1', owner: 'KPMG', pic: '', plannedStart: '2026-06-01', plannedFinish: '2026-06-20', actualStart: null, actualFinish: null, remarks: '' },
      { id: 't2', parentId: 't1', order: 0, name: 'การประชุมเริ่มโครงการ', owner: 'KPMG', pic: 'Somchai', plannedStart: '2026-06-01', plannedFinish: '2026-06-10', actualStart: '2026-06-01', actualFinish: '2026-06-10', remarks: '' },
      { id: 't3', parentId: 't1', order: 1, name: 'Build <Module A> & "Test"', owner: 'KPMG', pic: '', plannedStart: '2026-06-01', plannedFinish: '2026-06-05', actualStart: null, actualFinish: null, remarks: '' },
    ],
    holidays: [],
  };
}

test('buildExportXlsHtml produces one <tr> per calc.order entry plus one header row', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  const trCount = (html.match(/<tr/g) || []).length;
  assert.equal(trCount, calc.order.length + 1);
});

test('buildExportXlsHtml header row contains the documented columns', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  ['WBS', 'Task', 'Owner', 'PIC', 'P-Start', 'P-Finish', 'A-Start', 'A-Finish', 'Duration', 'Weight', '% Plan', '% Actual', 'Status', 'Remarks'].forEach(col => {
    assert.ok(html.includes(col), 'missing column header: ' + col);
  });
});

test('buildExportXlsHtml renders a Thai task name unescaped (just present as UTF-8 text)', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  assert.ok(html.includes('การประชุมเริ่มโครงการ'));
});

test('buildExportXlsHtml HTML-escapes special characters in task names', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  assert.ok(html.includes('Build &lt;Module A&gt; &amp; &quot;Test&quot;'));
  assert.ok(!html.includes('Build <Module A> & "Test"'));
});

test('buildExportXlsHtml applies a status-tint style to a Delayed row', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  // t3: plannedFinish 2026-06-05 is before statusDate 2026-07-09, no actualFinish -> Delayed
  const delayedRowMatch = html.match(/<tr[^>]*>(?:(?!<\/tr>).)*Build[\s\S]*?<\/tr>/);
  assert.ok(delayedRowMatch, 'could not find the Delayed row in the output');
  assert.ok(/background:\s*#f/i.test(delayedRowMatch[0]) || /background-color/i.test(delayedRowMatch[0]), 'Delayed row should carry a background tint style');
});

test('buildExportXlsHtml wraps the table in a UTF-8-charset HTML document', () => {
  const project = fixtureProject();
  const calc = recalc(project);
  const html = buildExportXlsHtml(project, calc);
  assert.ok(html.includes('<meta charset="utf-8">'));
  assert.ok(html.includes('<table'));
  assert.ok(html.includes('</table>'));
});
