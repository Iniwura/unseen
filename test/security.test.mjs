import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate, GateError, sha256 } from '../src/gate.mjs';
import { createMemoryStore } from '../src/store.mjs';

const SHA = 'c'.repeat(40);
const SECRET = 'runner-secret-that-is-long-enough-for-hmac';
const digest = sha256('support acceptance requirement: refunds never exceed the captured amount');

function readyGate() {
  const gate = createGate({ runnerSecret: SECRET, authorizedHumans: ['@switch-user-release-owner:local'] });
  const decision = gate.begin(SHA, 'SECURE-1');
  gate.discover(decision.id, { requirementId: 'engineering', room: 'release-room', eventId: 'eng-1', documentDigest: sha256('engineering evidence'), collector: 'switch-agent-engineering' });
  gate.discover(decision.id, { requirementId: 'support', room: 'support-room', eventId: 'support-1', documentDigest: digest, collector: 'switch-agent-investigator' });
  for (const [requirementId, command] of [['engineering', 'baseline-tests'], ['support', 'refund-regression']]) {
    const report = { requirementId, sha: SHA, command, exitCode: 0, outputDigest: sha256(`${command}-output`), runnerId: 'runner-1', observedAt: new Date().toISOString() };
    gate.recordRunnerVerification(decision.id, { ...report, attestation: gate.runnerAttestation(report) });
  }
  return { gate, id: decision.id };
}

function code(fn) {
  try { fn(); } catch (error) { return error.code; }
  return null;
}

test('unattested and stale reports fail closed', () => {
  const gate = createGate({ runnerSecret: SECRET });
  const decision = gate.begin(SHA, 'SECURE-REPORT');
  gate.discover(decision.id, { requirementId: 'support', room: 'support-room', eventId: 's1', documentDigest: digest, collector: 'agent' });
  const report = { requirementId: 'support', sha: SHA, command: 'refund-regression', exitCode: 0, outputDigest: sha256('out'), runnerId: 'runner-1', observedAt: new Date().toISOString() };
  assert.equal(code(() => gate.recordRunnerVerification(decision.id, report)), 'UNTRUSTED_RUNNER');
  assert.equal(code(() => gate.recordRunnerVerification(decision.id, { ...report, sha: 'd'.repeat(40), attestation: gate.runnerAttestation(report) })), 'STALE_SHA');
});

test('durable store reloads the decision and audit history', () => {
  const store = createMemoryStore();
  const first = createGate({ store, runnerSecret: SECRET });
  first.begin(SHA, 'RESTART-1');
  const second = createGate({ store, runnerSecret: SECRET });
  assert.equal(second.describe('RESTART-1').sha, SHA);
  assert.deepEqual(second.getAudit('RESTART-1').map((entry) => entry.type), ['DECISION_CREATED']);
});

test('approval binds one human, room, nonce, evidence digest, and exact SHA', () => {
  const { gate, id } = readyGate();
  const challenge = gate.issueApprovalChallenge(id);
  assert.equal(code(() => gate.approveFromSwitch(id, { authenticated: false, origin: 'switch-websocket', decisionId: id, sha: SHA, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce, sender: '@switch-user-release-owner:local', room: 'release-room', eventId: 'approval-1' })), 'UNAUTHENTICATED_APPROVAL');
  assert.equal(code(() => gate.approveFromSwitch(id, { authenticated: true, origin: 'switch-websocket', decisionId: id, sha: 'd'.repeat(40), evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce, sender: '@switch-user-release-owner:local', room: 'release-room', eventId: 'approval-1' })), 'STALE_APPROVAL');
  const approved = gate.approveFromSwitch(id, { authenticated: true, origin: 'switch-websocket', decisionId: id, sha: SHA, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce, sender: '@switch-user-release-owner:local', room: 'release-room', eventId: 'approval-1' });
  assert.equal(approved.status, 'AUTHORIZED');
  assert.equal(code(() => gate.approveFromSwitch(id, { authenticated: true, origin: 'switch-websocket', decisionId: id, sha: SHA, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce, sender: '@switch-user-release-owner:local', room: 'release-room', eventId: 'approval-2' })), 'NOT_READY');
});

test('execution capability is one-use and produces an auditable receipt', () => {
  const { gate, id } = readyGate();
  const challenge = gate.issueApprovalChallenge(id);
  gate.approveFromSwitch(id, { authenticated: true, origin: 'switch-websocket', decisionId: id, sha: SHA, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce, sender: '@switch-user-release-owner:local', room: 'release-room', eventId: 'approval-1' });
  const capability = gate.requestExecution(id);
  const executed = gate.execute(id, capability, (context) => ({ provider: 'preview', ...context }));
  assert.equal(executed.status, 'EXECUTED');
  assert.equal(code(() => gate.execute(id, capability, () => ({ nope: true }))), 'AUTHORIZATION_UNAVAILABLE');
  assert.equal(gate.getAudit(id).at(-1).type, 'EXECUTED');
});

test('contradictory support evidence remains blocking after a prior pass', () => {
  const { gate, id } = readyGate();
  const snapshot = gate.discover(id, { requirementId: 'support', room: 'support-room', eventId: 'support-2', documentDigest: sha256('contradiction'), collector: 'agent-2' });
  assert.equal(snapshot.status, 'BLOCKED');
});
