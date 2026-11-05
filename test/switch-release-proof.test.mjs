import test from 'node:test';
import assert from 'node:assert/strict';
import { matchReleaseProofRequest } from '../src/switch-release-proof.mjs';
import { unseenMessage } from '../src/switch-ingest.mjs';

const values = { roomId: 'release-id', senderId: '@linked-user:localhost', decisionId: 'LIVE-1', sha: 'f'.repeat(40) };
const command = { kind: 'release_request', decisionId: values.decisionId, sha: values.sha };
const make = ({ roomId = values.roomId, sender = values.senderId, body = '@unseen-gatekeeper '+unseenMessage(command), addressed = true } = {}) => ({
  event: 'message', id: 21, data: { room_id: roomId, payload: { sender, body, addressed } }
});
test('accepts only a real addressed, exact owner, exact room, current challenge and candidate SHA', () => {
  assert.deepEqual(matchReleaseProofRequest(make(), values), command);
  assert.equal(matchReleaseProofRequest(make({ roomId: 'support-id' }), values), null);
  assert.equal(matchReleaseProofRequest(make({ sender: '@stranger:localhost' }), values), null);
  assert.equal(matchReleaseProofRequest(make({ addressed: false }), values), null);
  assert.equal(matchReleaseProofRequest(make({ body: '@unseen-gatekeeper ' + unseenMessage({ ...command, sha:'a'.repeat(40) }) }), values), null);
  assert.equal(matchReleaseProofRequest(make({ body: '@unseen-gatekeeper ' + unseenMessage({ ...command, decisionId: 'OLD' }) }), values), null);
  assert.equal(matchReleaseProofRequest(make({ body: '@different ' + unseenMessage(command) }), values), null);
  assert.equal(matchReleaseProofRequest({event:'ping',data:{}}, values), null);
});
