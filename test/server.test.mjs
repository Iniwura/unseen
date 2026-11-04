import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnseenServer } from '../src/server.mjs';
import { createGate } from '../src/gate.mjs';
import { createMemoryStore } from '../src/store.mjs';

test('read-only board serves state and rejects mutation requests', async (t) => {
  const gate = createGate({ runnerSecret: 'server-test-secret-that-is-long-enough' });
  const server = createUnseenServer({ gate });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const state = await fetch(`${base}/api/state`);
  assert.deepEqual((await state.json()).decisions, []);
  const mutation = await fetch(`${base}/api/state`, { method: 'POST' });
  assert.equal(mutation.status, 405);
  const board = await fetch(base);
  assert.equal(board.status, 200);
  assert.match(await board.text(), /Evidence is the interface/);
});

test('board reports the persisted live-versus-unverified Switch status', async (t) => {
  const gate = createGate({ runnerSecret: 'server-live-status-test-secret-long' });
  const server = createUnseenServer({ gate, liveStatusStore: createMemoryStore({ status: 'connected', evidence: 'live-switch', cursor: 19 }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const state = await fetch(`http://127.0.0.1:${address.port}/api/state`).then((response) => response.json());
  assert.equal(state.metadata.switch, 'connected');
  assert.equal(state.metadata.switchEvidence, 'live-switch');
  assert.equal(state.metadata.liveStatus.cursor, 19);
});
