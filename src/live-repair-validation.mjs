import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

const exactSha = /^[a-f0-9]{40}$/;

export class RepairValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function git(root, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('git', args, {
      cwd: root, shell: false, windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
    });
    let stdout = '';
    let stderr = '';
    const kill = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.on('data', (part) => { stdout += part; if (stdout.length > 50_000) child.kill('SIGKILL'); });
    child.stderr.on('data', (part) => { stderr += part; if (stderr.length > 50_000) child.kill('SIGKILL'); });
    child.once('error', () => { clearTimeout(kill); reject(new RepairValidationError('GIT_UNAVAILABLE')); });
    child.once('close', (code) => {
      clearTimeout(kill);
      resolveResult({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}
async function mustGit(root, args, errorCode) {
  const result = await git(root, args);
  if (result.code !== 0) throw new RepairValidationError(errorCode);
  return result.stdout;
}

/** Verify the repair really follows the original blocked checkout and touches
 * only the expected demonstration code and regression test.
 * This alone is NOT a passing test or a release authorization.
 */
export async function verifyRepairedCheckout({ checkoutRoot, originalSha, repairedSha }) {
  if (!exactSha.test(originalSha ?? '') || !exactSha.test(repairedSha ?? '') ||
    originalSha === repairedSha) throw new RepairValidationError('INVALID_REPAIR_SHA');
  const root = realpathSync(resolve(checkoutRoot));
  const head = await mustGit(root, ['rev-parse', '--verify', 'HEAD'], 'GIT_HEAD_UNAVAILABLE');
  if (head !== repairedSha) throw new RepairValidationError('REPAIR_HEAD_MISMATCH');
  const dirty = await mustGit(root, ['status', '--porcelain', '--untracked-files=all'], 'GIT_STATUS_FAILED');
  if (dirty) throw new RepairValidationError('REPAIR_CHECKOUT_DIRTY');
  const parent = await mustGit(root, ['rev-parse', '--verify', 'HEAD^'], 'REPAIR_PARENT_MISSING');
  if (parent !== originalSha) throw new RepairValidationError('REPAIR_NOT_DIRECT_DESCENDANT');
  const changed = (await mustGit(root, ['diff', '--name-only', originalSha, repairedSha], 'REPAIR_DIFF_FAILED'))
    .split('\n').map((s) => s.trim()).filter(Boolean).sort();
  const expected = ['src/refund.mjs', 'test/refund-regression.test.mjs'].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new RepairValidationError('UNEXPECTED_REPAIR_FILE_CHANGES');
  }
  return { originalSha, repairedSha, files: changed, clean: true, parentVerified: true };
}
