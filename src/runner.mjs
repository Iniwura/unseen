import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const shaPattern = /^[0-9a-f]{40}$/;

export class RunnerError extends Error {
  constructor(code, message) { super(message); this.name = 'RunnerError'; this.code = code; }
}

function assert(ok, code, message) {
  if (!ok) throw new RunnerError(code, message);
}

function digest(stdout, stderr, exitCode) {
  return createHash('sha256').update(`${stdout}\0${stderr}\0${exitCode}`).digest('hex');
}

function isInside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function runProcess(file, args, options) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      if (!settled) {
        settled = true;
        reject(new RunnerError('TIMEOUT', `Allowlisted command exceeded ${options.timeoutMs}ms`));
      }
    }, options.timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > options.maxOutputBytes) child.kill('SIGKILL'); });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > options.maxOutputBytes) child.kill('SIGKILL'); });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(new RunnerError('SPAWN_FAILED', error.message)); }
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolveProcess({ exitCode: Number.isInteger(code) ? code : 1, signal, stdout, stderr });
    });
  });
}

async function gitHead(root, options) {
  const result = await runProcess('git', ['rev-parse', '--verify', 'HEAD'], { ...options, cwd: root });
  assert(result.exitCode === 0, 'NOT_GIT_CHECKOUT', 'Candidate path is not a usable Git checkout');
  const sha = result.stdout.trim();
  assert(shaPattern.test(sha), 'INVALID_HEAD', 'Checkout HEAD is not an exact Git SHA');
  return sha;
}

async function gitClean(root, options) {
  const result = await runProcess('git', ['status', '--porcelain', '--untracked-files=all'], { ...options, cwd: root });
  assert(result.exitCode === 0, 'NOT_GIT_CHECKOUT', 'Could not inspect candidate checkout status');
  assert(result.stdout.trim() === '', 'DIRTY_CHECKOUT', 'Candidate checkout has uncommitted or untracked files');
}

/**
 * Execute only named, fixed commands inside a configured checkout root.
 * There is no shell, no caller-supplied argv, no caller-supplied test path,
 * and the candidate SHA is checked both before and after the process.
 */
export function createAllowlistedRunner({
  checkoutRoot,
  attestor,
  runnerId = 'unseen-runner',
  policyVersion = '1',
  timeoutMs = 120_000,
  maxOutputBytes = 1_000_000,
  commands = {
    'baseline-tests': { file: process.execPath, args: ['--test', 'test/gate.test.mjs'] },
    'refund-regression': { file: process.execPath, args: ['--test', 'test/refund-regression.test.mjs'] }
  }
} = {}) {
  assert(typeof checkoutRoot === 'string' && checkoutRoot.length > 0, 'BAD_ROOT', 'Runner checkout root is required');
  assert(typeof attestor === 'function', 'BAD_ATTESTOR', 'Runner attestor is required');
  const root = realpathSync(resolve(checkoutRoot));
  assert(statSync(root).isDirectory(), 'BAD_ROOT', 'Runner checkout root must be a directory');
  const definitions = new Map(Object.entries(commands));
  for (const [name, definition] of definitions) {
    assert(/^[a-z0-9-]+$/.test(name), 'BAD_ALLOWLIST', `Invalid allowlisted command name: ${name}`);
    assert(definition && typeof definition.file === 'string' && Array.isArray(definition.args), 'BAD_ALLOWLIST', `Invalid allowlisted command: ${name}`);
    assert(definition.args.every((arg) => typeof arg === 'string'), 'BAD_ALLOWLIST', `Invalid allowlisted arguments: ${name}`);
  }

  return Object.freeze({
    async run({ sha, command }) {
      assert(shaPattern.test(sha), 'BAD_SHA', 'Runner requires an exact 40-character Git SHA');
      const definition = definitions.get(command);
      assert(definition, 'COMMAND_DENIED', `Command is not in the runner allowlist: ${command}`);
      const before = await gitHead(root, { timeoutMs: Math.min(timeoutMs, 15_000), maxOutputBytes });
      assert(before === sha, 'STALE_SHA', 'Checkout HEAD does not match the decision SHA');
      await gitClean(root, { timeoutMs: Math.min(timeoutMs, 15_000), maxOutputBytes });
      // Node's own test runner sets NODE_TEST_CONTEXT on its workers.
      // Passing it to a nested `node --test` makes the subprocess return 0
      // without executing the test file. Never inherit test-runner control
      // variables from the caller into a trusted verification command.
      const commandEnv = { ...process.env, CI: '1', NODE_OPTIONS: '--no-addons' };
      delete commandEnv.NODE_TEST_CONTEXT;
      const result = await runProcess(definition.file, definition.args, {
        cwd: root,
        env: commandEnv,
        timeoutMs,
        maxOutputBytes
      });
      // A zero exit code is not evidence that any tests ran. Require the
      // Node TAP footer for our fixed `node --test <file>` allowlist entries.
      if (definition.file === process.execPath && definition.args[0] === '--test') {
        const summaryLine = result.stdout.split('\n').find((line) => line.trim().startsWith('# tests '));
        const count = summaryLine === undefined ? 0 : Number(summaryLine.trim().slice('# tests '.length));
        if (!Number.isSafeInteger(count) || count < 1) {
          throw new RunnerError('NO_TEST_RESULTS', 'Allowlisted test command produced no nonzero TAP test count');
        }
      }
      const after = await gitHead(root, { timeoutMs: Math.min(timeoutMs, 15_000), maxOutputBytes });
      assert(after === sha, 'CHECKOUT_CHANGED', 'Checkout HEAD changed during verification');
      await gitClean(root, { timeoutMs: Math.min(timeoutMs, 15_000), maxOutputBytes });
      const observedAt = new Date().toISOString();
      const report = {
        requirementId: command === 'baseline-tests' ? 'engineering' : 'support',
        sha,
        command,
        exitCode: result.exitCode,
        outputDigest: digest(result.stdout, result.stderr, result.exitCode),
        runnerId,
        observedAt,
        policyVersion,
        stdout: result.stdout,
        stderr: result.stderr,
        signal: result.signal ?? null
      };
      return { ...report, attestation: attestor(report) };
    },
    root
  });
}
