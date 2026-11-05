import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnseenMessage, unseenMessage } from '../src/switch-ingest.mjs';

const command = { kind: 'release_request', decisionId: 'LIVE-CHECK', sha: 'a'.repeat(40) };
test('parses a normal Switch UNSEEN protocol command', () => {
  assert.deepEqual(parseUnseenMessage(unseenMessage(command)), command);
});
test('parses the exact leading Gatekeeper mention seen in real Mattermost messages', () => {
  assert.deepEqual(parseUnseenMessage('@unseen-gatekeeper ' + unseenMessage(command)), command);
  assert.deepEqual(parseUnseenMessage('@UNSEEN-GATEKEEPER ' + unseenMessage(command)), command);
});
test('does not parse embedded commands or another agent mention', () => {
  assert.equal(parseUnseenMessage('hello ' + unseenMessage(command)), null);
  assert.equal(parseUnseenMessage('@different-agent ' + unseenMessage(command)), null);
  assert.equal(parseUnseenMessage('@unseen-gatekeeper other ' + unseenMessage(command)), null);
  assert.equal(parseUnseenMessage(''), null);
});
