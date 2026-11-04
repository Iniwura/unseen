import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate, sha256 } from '../src/gate.mjs';
import { SwitchEventIngestor, unseenMessage } from '../src/switch-ingest.mjs';
import { createMemoryStore } from '../src/store.mjs';

const SHA = 'e'.repeat(40);
const participants = {
  'switch-agent-engineering': { kind: 'agent', role: 'engineering-agent' },
  'switch-agent-investigator': { kind: 'agent', role: 'evidence-investigator' },
  '@switch-user-release-owner:local': { kind: 'human', role: 'release-owner' },
  'switch-agent-outsider': { kind: 'agent', role: 'outsider' }
};
const policies = {
  'release-room': { name: 'release-room', roomId: 'room-release', allowedRoles: ['engineering-agent', 'release-owner'] },
  'support-room': { name: 'support-room', roomId: 'room-support', allowedRoles: ['evidence-investigator'] }
};

function frame(id, roomId, sender, body) {
  return { event: 'message', id, data: { type: 'message', room_id: roomId, bridge_id: null, payload: { addressed: true, sender, sender_name: sender, message_id: `message-${id}`, body, timestamp: Date.now(), thread_id: null, attachments: [] } } };
}

function setup() {
  const gate = createGate({ runnerSecret: 'switch-test-secret-that-is-long-enough', authorizedHumans: ['@switch-user-release-owner:local'] });
  const decision = gate.begin(SHA, 'SWITCH-1');
  const ingestor = new SwitchEventIngestor({ gate, agentId: 'unseen-agent', roomPolicies: policies, participants, eventStore: createMemoryStore() });
  const connection = { authenticated: true, agentId: 'unseen-agent' };
  ingestor.handleFrame({ event: 'connection_state', id: null, data: { type: 'connection_state', agent_id: 'unseen-agent', rooms: ['room-release', 'room-support'], cursor: 0, generation: 1 } }, connection);
  return { gate, decision, ingestor, connection };
}

test('authenticated Switch evidence crosses only the configured room boundary', () => {
  const { gate, decision, ingestor, connection } = setup();
  const result = ingestor.handleFrame(frame(1, 'room-support', 'switch-agent-investigator', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('support requirement') })), connection);
  assert.equal(result.accepted, true);
  assert.equal(gate.describe(decision.id).requirements.find((item) => item.id === 'support').state, 'DISCOVERED_UNVERIFIED');
  assert.deepEqual(ingestor.handleFrame(frame(1, 'room-support', 'switch-agent-investigator', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('support requirement') })), connection), { duplicate: true, eventId: 'unseen-agent:1' });
});

test('unlisted senders and unclaimed rooms are rejected before gate mutation', () => {
  const { decision, ingestor, connection } = setup();
  assert.throws(() => ingestor.handleFrame(frame(2, 'room-support', 'switch-agent-outsider', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('x') })), connection), (error) => error.code === 'SENDER_NOT_PERMITTED');
  assert.throws(() => ingestor.handleFrame(frame(3, 'room-unknown', 'switch-agent-investigator', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('x') })), connection), (error) => error.code === 'ROOM_DENIED');
});

test('failed event handling is retryable instead of being marked as consumed', () => {
  const { gate, ingestor, connection } = setup();
  const body = unseenMessage({ kind: 'evidence', decisionId: 'created-after-delivery', requirementId: 'support', documentDigest: sha256('retryable') });
  assert.throws(() => ingestor.handleFrame(frame(4, 'room-support', 'switch-agent-investigator', body), connection), (error) => error.code === 'NOT_FOUND');
  gate.begin(SHA, 'created-after-delivery');
  const accepted = ingestor.handleFrame(frame(4, 'room-support', 'switch-agent-investigator', body), connection);
  assert.equal(accepted.accepted, true);
});

test('approval message requires a human release owner and Switch authentication', () => {
  const { gate, decision, ingestor, connection } = setup();
  ingestor.handleFrame(frame(1, 'room-release', 'switch-agent-engineering', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'engineering', documentDigest: sha256('engineering') })), connection);
  ingestor.handleFrame(frame(2, 'room-support', 'switch-agent-investigator', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('support') })), connection);
  const report = { requirementId: 'engineering', sha: SHA, command: 'baseline-tests', exitCode: 0, outputDigest: sha256('eng-out'), runnerId: 'runner', observedAt: new Date().toISOString() };
  gate.recordRunnerVerification(decision.id, { ...report, attestation: gate.runnerAttestation(report) });
  const support = { requirementId: 'support', sha: SHA, command: 'refund-regression', exitCode: 0, outputDigest: sha256('support-out'), runnerId: 'runner', observedAt: new Date().toISOString() };
  gate.recordRunnerVerification(decision.id, { ...support, attestation: gate.runnerAttestation(support) });
  const challenge = gate.issueApprovalChallenge(decision.id);
  const approval = ingestor.handleFrame(frame(3, 'room-release', '@switch-user-release-owner:local', unseenMessage({ kind: 'approval', decisionId: decision.id, sha: SHA, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce })), connection);
  assert.equal(approval.decision.status, 'AUTHORIZED');
});

test('release requests are restricted to the human owner and self-authored messages are ignored', () => {
  const { gate, decision, ingestor, connection } = setup();
  let command = null;
  const releaseIngestor = new SwitchEventIngestor({
    gate,
    agentId: 'unseen-agent',
    selfSenderId: 'unseen-agent',
    roomPolicies: policies,
    participants,
    eventStore: createMemoryStore(),
    onCommand(value) { command = value; return value; }
  });
  releaseIngestor.handleFrame({ event: 'connection_state', id: null, data: { type: 'connection_state', agent_id: 'unseen-agent', rooms: ['room-release', 'room-support'], cursor: 0, generation: 1 } }, connection);
  const requested = releaseIngestor.handleFrame(frame(7, 'room-release', '@switch-user-release-owner:local', unseenMessage({ kind: 'release_request', sha: SHA, decisionId: 'RELEASE-REQUEST-1' })), connection);
  assert.equal(requested.type, 'release_request');
  assert.equal(command.decisionId, 'RELEASE-REQUEST-1');
  assert.deepEqual(releaseIngestor.handleFrame(frame(8, 'room-release', 'unseen-agent', unseenMessage({ kind: 'status', value: 'visible' })), connection), { ignored: true, self: true, event: 'message', eventId: 'unseen-agent:8' });
  assert.throws(() => ingestor.handleFrame(frame(9, 'room-release', 'switch-agent-engineering', unseenMessage({ kind: 'release_request', sha: SHA })), connection), (error) => error.code === 'RELEASE_SENDER_DENIED');
  assert.equal(gate.describe(decision.id).status, 'PENDING_EVIDENCE');
});

test('a gap can be acknowledged only after the context reload path runs', () => {
  const { ingestor, connection } = setup();
  const gap = ingestor.handleFrame({ event: 'gap', id: null, data: { from: 10, to: 14 } }, connection);
  assert.equal(gap.requiresContextReload, true);
  assert.equal(ingestor.gapDetected, true);
  assert.equal(ingestor.markContextReloaded(), true);
  assert.equal(ingestor.gapDetected, false);
});
