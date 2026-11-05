import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectAgentReport } from '../src/switch-agent-reports.mjs';

const sha = 'a921b8a5d51c0a8a58fcdcd59c0963ac012d8627';
const engineer = {
  kind: 'message', id: 'server-msg-1', sender: '@real-bot:localhost',
  sender_name: 'ini-unseen-engineer',
  body: 'Live checkout verification complete. Candidate ' + sha + '. 60 !== 50.'
};
const criteria = {
  expectedName: 'ini-unseen-engineer', candidateSha: sha,
  phrases: ['Live checkout verification complete', '60 !== 50']
};
const response = (messages, truncated = false) => ({
  result: { threads: [{ root: { kind: 'room_join' }, replies: messages }], truncated }
});
test('finds the uniquely attributed real Switch report but NEVER authorizes its agent role', () => {
  const found = inspectAgentReport(response([engineer]), criteria);
  assert.equal(found.status, 'observed-not-authorized');
  assert.equal(found.observed.senderId, engineer.sender);
  assert.equal(found.observed.messageId, engineer.id);
  assert.equal(found.matches, 1);
  assert.equal(found.messagesScanned, 1);
  assert.equal(Object.hasOwn(found, 'trustedSenderBound'), false);
});
test('rejects lookalike or unrelated bodies, duplicates, truncated or malformed context', () => {
  const spoofName = { ...engineer, sender_name: 'human' };
  const wrongSha = { ...engineer, body: 'Live checkout verification complete. ' + 'b'.repeat(40) + '. 60 !== 50.' };
  const wrongReport = inspectAgentReport(response([spoofName, wrongSha], true), criteria);
  assert.equal(wrongReport.status, 'not-found');
  assert.equal(wrongReport.historyTruncated, true);
  const duplicate = inspectAgentReport(response([engineer, { ...engineer, id:'server-msg-2' }]), criteria);
  assert.equal(duplicate.status, 'ambiguous');
  assert.equal(duplicate.observed, null);
  assert.throws(() => inspectAgentReport({ result: { messages: [] } }, criteria), /threads/);
});
