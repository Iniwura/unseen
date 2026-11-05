import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSwitchChallenge } from '../src/switch-smoke.mjs';

const nonce = 'UNSEEN-CHECK-very-long-random-token';
const frame = (room, sender, body, addressed = true) => ({
  event: 'message', id: 117, data: { room_id: room, payload: {
    sender, sender_name: 'iniwura', body, addressed
  } }
});
test('probe only matches exact nonce in the authorized room', () => {
  assert.equal(matchSwitchChallenge(frame('other-room', '@person:server', nonce), 'release-id', nonce), null);
  assert.equal(matchSwitchChallenge(frame('release-id', '@person:server', 'hello'), 'release-id', nonce), null);
  assert.equal(matchSwitchChallenge(frame('release-id', '', nonce), 'release-id', nonce), null);
});
test('probe preserves the server-provided addressed flag and opaque sender', () => {
  const matched = matchSwitchChallenge(frame('release-id', '@opaque:server', '@unseen-gatekeeper '+nonce), 'release-id', nonce);
  assert.deepEqual(matched, { senderId: '@opaque:server', senderName: 'iniwura', addressed: true, sequence: 117 });
  assert.equal(matchSwitchChallenge(frame('release-id', '@opaque:server', nonce, false), 'release-id', nonce).addressed, false);
});
