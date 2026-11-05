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


test('runner strips inherited Node test-context flag and observes an actually failing refund regression', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'unseen-nested-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'test'), { recursive: true });
  writeFileSync(join(root, 'test/regression.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "test('real failure cannot be hidden by a nested test context', () => assert.equal(60, 50));"
  ].join('\n'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=runner-test', '-c', 'user.email=runner@example.invalid', 'add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=runner-test', '-c', 'user.email=runner@example.invalid', 'commit', '-qm', 'regression fixture'], { cwd: root });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const runner = createAllowlistedRunner({
    checkoutRoot: root,
    attestor: (report) => sha256(JSON.stringify(report)),
    commands: { 'refund-regression': { file: process.execPath, args: ['--test', 'test/regression.test.mjs'] } }
  });
  const before = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = 'child-v8';
  try {
    const report = await runner.run({ sha, command: 'refund-regression' });
    assert.equal(report.exitCode, 1, 'an actual failed test must never report exit 0');
    assert.match(report.stdout, /# tests 1/);
    assert.match(report.stdout, /# fail 1/);
  } finally {
    if (before === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = before;
  }
});
