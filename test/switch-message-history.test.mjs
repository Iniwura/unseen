import test from 'node:test';
import assert from 'node:assert/strict';
import { findChallengeInRoomContext } from '../src/switch-message-history.mjs';

const nonce = 'UNSEEN-CHECK-969061af-cc26-4dfd-ac07-e4dce8403a0e';
test('finds a posted probe message in nested Switch result threads', () => {
  const result = findChallengeInRoomContext({ result: { threads: [{ root: { id: '1', kind: 'room_join' }, replies: [
    { kind: 'message', sender: '@sender:server', sender_name: 'iniwura', body: '@unseen-gatekeeper '+nonce }
  ] }], truncated: false } }, nonce);
  assert.equal(result.found, true);
  assert.equal(result.senderId, '@sender:server');
  assert.equal(result.mentionPresent, true);
  assert.equal(result.messagesScanned, 1);
});
test('reports missing code without assuming a delivery failure', () => {
  const result = findChallengeInRoomContext({ result: { threads: [{ root: { kind: 'message', body: 'Different message' }, replies: [] }], truncated: true } }, nonce);
  assert.equal(result.found, false);
  assert.equal(result.truncated, true);
  assert.equal(result.mentionPresent, false);
});
test('fails safely on malformed read_context envelopes', () => {
  assert.throws(() => findChallengeInRoomContext({ result: { items: [] } }, nonce), /threads missing/);
});
