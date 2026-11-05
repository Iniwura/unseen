import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('refund demo prints the exact vulnerable and repaired commits with truthful harness provenance', () => {
  const demoPath = fileURLToPath(new URL('../demo/recovery.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [demoPath], {
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024
  });
  const initial = output.match(/^candidate exact commit: ([a-f0-9]{40})$/m)?.[1];
  const repaired = output.match(/^repaired exact commit: ([a-f0-9]{40}) \/ exit 0$/m)?.[1];
  assert.ok(initial, 'report exact vulnerable checkout commit SHA');
  assert.ok(repaired, 'report exact repaired checkout commit SHA and passing regression exit');
  assert.notEqual(repaired, initial, 'repaired commit must differ from vulnerable commit');
  assert.match(output, /^recovered blind spot: BLOCKED$/m);
  assert.match(output, /^failure was real: exit 1, output [a-f0-9]{64}$/m);
  assert.match(output, /TRANSPORT: local protocol harness exercising the real Switch adapter; no live Switch event is claimed\./);
});
