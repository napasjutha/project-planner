const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('build.py produces dist/ProjectPlanner.html with embedded data block', () => {
  execSync('python3 build.py', { cwd: ROOT });
  const outPath = path.join(ROOT, 'dist', 'ProjectPlanner.html');
  assert.ok(fs.existsSync(outPath), 'dist/ProjectPlanner.html should exist');
  const html = fs.readFileSync(outPath, 'utf8');
  assert.match(html, /<script type="application\/json" id="project-data">/);
  assert.doesNotMatch(html, /__CSS__|__JS__/);
  assert.match(html, /<title>ProjectPlanner<\/title>/);
});

test('build.py output embeds a valid, blank starter project', () => {
  const outPath = path.join(ROOT, 'dist', 'ProjectPlanner.html');
  const html = fs.readFileSync(outPath, 'utf8');
  const match = html.match(/<script type="application\/json" id="project-data">([\s\S]*?)<\/script>/);
  assert.ok(match, 'project-data block should be present');
  const data = JSON.parse(match[1]);
  assert.deepEqual(data.tasks, []);
  assert.deepEqual(data.holidays, []);
  assert.equal(typeof data.meta.id, 'string');
});

test('build.py output includes every engine in dependency order', () => {
  execSync('python3 build.py', { cwd: ROOT });
  const html = fs.readFileSync(path.join(ROOT, 'dist', 'ProjectPlanner.html'), 'utf8');
  const markers = ['function networkdays', 'function deriveStatus', 'function recalc', 'function forwardPass', 'class Project', 'function takeSnapshot'];
  let lastIndex = -1;
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    assert.ok(idx > lastIndex, `expected "${marker}" to appear after the previous engine`);
    lastIndex = idx;
  }
});
