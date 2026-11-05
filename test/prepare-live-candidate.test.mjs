import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/prepare-live-candidate.mjs', import.meta.url));
function command(cwd) {
  const result = spawnSync(process.execPath, [script], {
    cwd, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' },
    timeout: 90_000, maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  return { status: result.status, report: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
}

test('live checkout is an exact committed and genuinely failing candidate; setup never resets it', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'unseen-live-candidate-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const first = command(cwd);
  assert.equal(first.status, 0);
  assert.equal(first.report.status, 'created');
  assert.equal(first.report.baseline, 'PASS');
  assert.equal(first.report.regression, 'FAIL_EXPECTED');
  assert.match(first.report.candidateSha, /^[a-f0-9]{40}$/);
  const checkout = join(cwd, '.unseen', 'live-checkout');
  const refundPath = join(checkout, 'src', 'refund.mjs');
  assert.match(readFileSync(refundPath, 'utf8'), /Math.min\(amount, order.captured\)/);

  const second = command(cwd);
  assert.equal(second.status, 0);
  assert.equal(second.report.status, 'existing-intact');
  assert.equal(second.report.candidateSha, first.report.candidateSha);

  writeFileSync(refundPath, '// Modified by an investigator; setup must not erase this.\n');
  const third = command(cwd);
  assert.equal(third.status, 2);
  assert.equal(third.report.status, 'not-prepared');
  assert.match(third.report.error, /refusing to overwrite or reset/);
  assert.match(readFileSync(refundPath, 'utf8'), /Modified by an investigator/);
});
