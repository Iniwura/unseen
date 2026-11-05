import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// A dedicated, persistent, real Git checkout for the live Switch scenario.
// No existing candidate is overwritten or reset.
const target = resolve('.unseen/live-checkout');
const parent = dirname(target);
const line = (items) => items.join('\n') + '\n';
const sample = {
  'package.json': JSON.stringify({ name: 'unseen-live-checkout', private: true, type: 'module' }, null, 2) + '\n',
  'src/refund.mjs': line([
    '// Deliberately vulnerable demonstration candidate; a coding agent must repair it.',
    'export function issueRefund(order, amount) {',
    '  const approved = Math.min(amount, order.captured);',
    '  order.refunded += approved;',
    '  return approved;',
    '}'
  ]),
  'test/gate.test.mjs': line([
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { issueRefund } from '../src/refund.mjs';",
    "test('checkout refund function is available', () => {",
    '  const order = { captured: 100, refunded: 0 };',
    '  assert.equal(issueRefund(order, 30), 30);',
    '});'
  ]),
  'test/refund-regression.test.mjs': line([
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { issueRefund } from '../src/refund.mjs';",
    "test('successive refunds never exceed the captured amount', () => {",
    '  const order = { captured: 100, refunded: 0 };',
    '  assert.equal(issueRefund(order, 50), 50);',
    '  assert.equal(issueRefund(order, 60), 50);',
    '  assert.equal(order.refunded, 100);',
    '});'
  ]),
  'README.md': line([
    '# UNSEEN live checkout',
    '',
    'This separate, intentionally vulnerable Git checkout is used for the actual Switch demo.',
    'Refunds must never exceed the order captured amount, including successive refunds.',
    'The baseline passes; the refund regression fails until the coding agent commits a repair.',
    'UNSEEN then independently tests the repaired exact SHA. This is not a production checkout.',
    'No payments, customer data, or deployments are involved.'
  ])
};

function command(file, args, cwd) {
  const env = { ...process.env, CI: '1' };
  // A nested node --test can silently skip tests if it inherits this flag.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(file, args, {
    cwd, encoding: 'utf8', shell: false, windowsHide: true,
    env, timeout: 30_000, maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
function git(args, cwd) {
  const result = command('git', args, cwd);
  if (result.status !== 0) throw new Error('Git operation failed in the live candidate checkout');
  return result.stdout.trim();
}
function testedCount(result) {
  const text = result.stdout.split(/\r?\n/).find((item) => item.trim().startsWith('# tests '));
  const count = text ? Number(text.trim().slice('# tests '.length)) : 0;
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}
function verify(candidate) {
  if (!existsSync(join(candidate, '.git'))) throw new Error('Refusing a non-Git live candidate directory');
  const head = git(['rev-parse', '--verify', 'HEAD'], candidate);
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Candidate HEAD is not a 40-character Git SHA');
  if (git(['status', '--porcelain', '--untracked-files=all'], candidate)) {
    throw new Error('Checkout has changes; refusing to overwrite or reset it');
  }
  const baseline = command(process.execPath, ['--test', 'test/gate.test.mjs'], candidate);
  const regression = command(process.execPath, ['--test', 'test/refund-regression.test.mjs'], candidate);
  if (baseline.status !== 0 || testedCount(baseline) < 1) {
    throw new Error('Baseline tests did not actually pass');
  }
  if (regression.status === 0 || testedCount(regression) < 1 || !regression.stdout.includes('# fail 1')) {
    throw new Error('Refund regression is not failing; checkout may already be repaired. No reset performed.');
  }
  return { candidateSha: head, baseline: 'PASS', regression: 'FAIL_EXPECTED', checkout: candidate };
}
try {
  if (existsSync(target)) {
    console.log(JSON.stringify({ status: 'existing-intact', ...verify(target) }, null, 2));
  } else {
    mkdirSync(parent, { recursive: true });
    const stage = mkdtempSync(join(parent, 'candidate-build-'));
    let moved = false;
    try {
      for (const [file, content] of Object.entries(sample)) {
        const location = join(stage, file);
        mkdirSync(dirname(location), { recursive: true });
        writeFileSync(location, content, { encoding: 'utf8', flag: 'wx' });
      }
      git(['init', '-q'], stage);
      git(['-c', 'user.name=UNSEEN demo', '-c', 'user.email=unseen@example.invalid', 'add', '.'], stage);
      git(['-c', 'user.name=UNSEEN demo', '-c', 'user.email=unseen@example.invalid',
        'commit', '-qm', 'checkout: vulnerable candidate awaiting evidence'], stage);
      verify(stage);
      if (existsSync(target)) throw new Error('Candidate destination appeared; refusing overwrite');
      renameSync(stage, target);
      moved = true;
      console.log(JSON.stringify({ status: 'created', ...verify(target) }, null, 2));
    } finally {
      if (!moved) rmSync(stage, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'not-prepared', error: error?.message ?? 'UNKNOWN_ERROR' }, null, 2));
  process.exitCode = 2;
}
