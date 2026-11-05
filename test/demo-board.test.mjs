import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGate } from '../src/gate.mjs';
import { createJsonStore } from '../src/store.mjs';
import { createUnseenServer } from '../src/server.mjs';

test('a local harness can populate a separately labelled read-only board', async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), 'unseen-board-test-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const statePath = join(temporary, 'harness-state.json');
  const demo = fileURLToPath(new URL('../demo/recovery.mjs', import.meta.url));
  const root = fileURLToPath(new URL('../', import.meta.url));

  const run = spawnSync(process.execPath, [demo], {
    cwd: root,
    env: { ...process.env, UNSEEN_DEMO_STATE_PATH: statePath },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRANSPORT: local protocol harness/);
  assert.equal(existsSync(statePath), true);
  const stored = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(stored.decisions.length, 2);

  const gate = createGate({ store: createJsonStore(statePath) });
  const records = gate.list();
  assert.equal(records[0].status, 'SUPERSEDED');
  assert.equal(records[1].status, 'EXECUTED');
  assert.ok(records[1].receipt?.receiptId, 'harness receipt must be real execution output');

  const server = createUnseenServer({
    gate,
    metadata: { boardSource: 'local-protocol-harness', switchEvidence: 'local-protocol-harness' }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/state`);
  assert.equal(response.status, 200);
  const board = await response.json();
  assert.equal(board.metadata.boardSource, 'local-protocol-harness');
  assert.notEqual(board.metadata.switchEvidence, 'live-switch');
  assert.equal(board.decisions.length, 2);
  const html = await fetch(base).then((res) => res.text());
  assert.match(html, /LOCAL PROTOCOL HARNESS/);
});
