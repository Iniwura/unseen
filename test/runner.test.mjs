import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAllowlistedRunner } from '../src/runner.mjs';
import { sha256 } from '../src/gate.mjs';

test('runner executes only a fixed command and binds its output to the current commit', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'unseen-runner-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'test'), { recursive: true });
  writeFileSync(join(root, 'test/gate.test.mjs'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fixture passes', () => assert.equal(2 + 2, 4));\n");
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=runner-test', '-c', 'user.email=runner@example.invalid', 'add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=runner-test', '-c', 'user.email=runner@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const runner = createAllowlistedRunner({ checkoutRoot: root, attestor: (report) => sha256(JSON.stringify(report)), runnerId: 'runner-test' });
  const report = await runner.run({ sha, command: 'baseline-tests' });
  assert.equal(report.sha, sha);
  assert.equal(report.command, 'baseline-tests');
  assert.equal(report.exitCode, 0);
  assert.equal(report.runnerId, 'runner-test');
  writeFileSync(join(root, 'untracked.txt'), 'must not be executed');
  await assert.rejects(() => runner.run({ sha, command: 'baseline-tests' }), (error) => error.code === 'DIRTY_CHECKOUT');
  rmSync(join(root, 'untracked.txt'));
  await assert.rejects(() => runner.run({ sha, command: 'node -e "process.exit(0)"' }), (error) => error.code === 'COMMAND_DENIED');
});
