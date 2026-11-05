import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('editorial release board keeps all existing API and evidence detail anchors', () => {
  for (const id of [
    'connection', 'decision-count', 'last-updated', 'decisions-list', 'lead-case',
    'empty', 'detail', 'detail-title', 'detail-close', 'evidence-graph',
    'audit-trail', 'counterfactual'
  ]) assert.match(html, new RegExp('id="' + id + '"'), 'Missing UI anchor ' + id);
  assert.match(html, /WHAT THE/);
  assert.match(html, /BUILD/);
  assert.match(html, /Evidence is the interface/);
  assert.match(html, /<a class="skip-link"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(js, /\/api\/state/);
  assert.match(js, /\/api\/decisions\//);
});
test('editorial spotlight is populated from real persisted state, never a fabricated demo receipt', () => {
  assert.match(js, /const latest = decisions.length \? decisions.at\(-1\) : null/);
  assert.match(js, /latest.receipt\?\.receiptId/);
  assert.match(js, /data.metadata\?\.switchEvidence === 'live-switch'/);
  assert.doesNotMatch(html, /c79574fe-1be5-427f-8788-36f8a9b9620d/);
  assert.doesNotMatch(js, /c79574fe-1be5-427f-8788-36f8a9b9620d/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
test('editorial dashboard JavaScript has valid syntax on Node 20+', () => {
  const script = fileURLToPath(new URL('../public/app.js', import.meta.url));
  const result = spawnSync(process.execPath, ['--check', script], { encoding:'utf8', windowsHide:true });
  assert.equal(result.status, 0, result.stderr || 'Syntax validation failed');
});
