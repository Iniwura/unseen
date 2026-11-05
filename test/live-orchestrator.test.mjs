import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate, sha256 } from '../src/gate.mjs';
import { LiveOrchestrator } from '../src/live-orchestrator.mjs';
import { SwitchEventIngestor, unseenMessage } from '../src/switch-ingest.mjs';
import { createMemoryStore } from '../src/store.mjs';

const INITIAL_SHA = '1'.repeat(40);
const FIXED_SHA = '2'.repeat(40);
const participants = {
  owner: { kind: 'human', role: 'release-owner' },
  engineering: { kind: 'agent', role: 'engineering-agent' },
  investigator: { kind: 'agent', role: 'evidence-investigator' },
  coding: { kind: 'agent', role: 'coding-agent' }
};
const policies = {
  release: { name: 'release-room', roomId: 'release-room', allowedRoles: ['engineering-agent', 'release-owner'] },
  support: { name: 'support-room', roomId: 'support-room', allowedRoles: ['evidence-investigator', 'coding-agent'] }
};

function frame(id, roomId, sender, body) {
  return { event: 'message', id, data: { type: 'message', room_id: roomId, bridge_id: null, payload: { addressed: true, sender, message_id: `switch-message-${id}`, body } } };
}

function setup({ runner, blockedOnly = false } = {}) {
  const gate = createGate({ runnerSecret: 'live-orchestrator-test-secret-long-enough', authorizedHumans: ['owner'] });
  const posts = [];
  const contexts = [];
  const client = {
    async postMessage(roomId, content) { posts.push({ roomId, content }); return { ok: true }; },
    async readContext(roomId, options) { contexts.push({ roomId, options }); return { roomId, messages: [] }; }
  };
  const ingestor = new SwitchEventIngestor({
    gate,
    agentId: 'unseen-agent',
    selfSenderId: 'unseen-agent',
    roomPolicies: policies,
    participants,
    eventStore: createMemoryStore(),
    onCommand: (command) => command,
    onRemediation: (command) => command
  });
  const orchestrator = new LiveOrchestrator({
    gate,
    runner: runner ?? {
      async run({ sha, command }) {
        const report = { requirementId: command === 'baseline-tests' ? 'engineering' : 'support', sha, command, exitCode: 0, outputDigest: sha256(`${sha}:${command}:pass`), runnerId: 'allowlisted-test-runner', observedAt: new Date().toISOString() };
        return { ...report, attestation: gate.runnerAttestation(report) };
      }
    },
    client,
    ingestor,
    blockedOnly,
    rooms: { release: 'release-room', support: 'support-room' },
    mentions: { engineering: '@engineering', investigator: '@investigator', 'coding-agent': '@coding', 'release-owner': '@owner' },
    stateStore: createMemoryStore()
  });
  const connection = { authenticated: true, agentId: 'unseen-agent' };
  orchestrator.handleFrame({ event: 'connection_state', data: { agent_id: 'unseen-agent', rooms: ['release-room', 'support-room'], cursor: 0, generation: 1 } }, connection);
  return { gate, posts, contexts, ingestor, orchestrator, connection };
}

function messagePayload(post) {
  const marker = post.content.indexOf('UNSEEN/1 ');
  assert.notEqual(marker, -1);
  return JSON.parse(post.content.slice(marker + 'UNSEEN/1 '.length));
}

test('live orchestration runs the blocked-repair-approval sequence on exact commits', async () => {
  const runnerCalls = [];
  const setupState = setup({
    runner: {
      async run({ sha, command }) {
        runnerCalls.push({ sha, command });
        const exitCode = sha === INITIAL_SHA && command === 'refund-regression' ? 1 : 0;
        const report = { requirementId: command === 'baseline-tests' ? 'engineering' : 'support', sha, command, exitCode, outputDigest: sha256(`${sha}:${command}:${exitCode}`), runnerId: 'allowlisted-test-runner', observedAt: new Date().toISOString() };
        return { ...report, attestation: setupState.gate.runnerAttestation(report) };
      }
    }
  });
  const { gate, orchestrator, connection, posts } = setupState;

  await orchestrator.handleFrame(frame(1, 'release-room', 'owner', unseenMessage({ kind: 'release_request', decisionId: 'LIVE-1', sha: INITIAL_SHA })), connection);
  let decision = gate.describe('LIVE-1');
  assert.equal(decision.status, 'PENDING_EVIDENCE');
  assert.ok(posts.some((post) => post.roomId === 'support-room'));

  await orchestrator.handleFrame(frame(2, 'release-room', 'engineering', unseenMessage({ kind: 'evidence', decisionId: 'LIVE-1', requirementId: 'engineering', documentDigest: sha256('engineering-support') })), connection);
  assert.equal(gate.describe('LIVE-1').requirements.find((item) => item.id === 'engineering').state, 'VERIFIED_PASS');
  assert.ok(posts.some((post) => post.content.includes('@investigator')));

  await orchestrator.handleFrame(frame(3, 'support-room', 'investigator', unseenMessage({ kind: 'evidence', decisionId: 'LIVE-1', requirementId: 'support', documentDigest: sha256('support-acceptance') })), connection);
  assert.equal(gate.describe('LIVE-1').status, 'BLOCKED');
  assert.ok(posts.some((post) => post.content.includes('@coding')));

  await orchestrator.handleFrame(frame(4, 'support-room', 'coding', unseenMessage({ kind: 'remediation_ready', decisionId: 'LIVE-1', newSha: FIXED_SHA })), connection);
  decision = gate.describe(orchestrator.state.activeDecisionId);
  assert.equal(gate.describe('LIVE-1').status, 'SUPERSEDED');
  assert.equal(decision.sha, FIXED_SHA);

  await orchestrator.handleFrame(frame(5, 'release-room', 'engineering', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'engineering', documentDigest: sha256('engineering-fixed') })), connection);
  await orchestrator.handleFrame(frame(6, 'support-room', 'investigator', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('support-fixed') })), connection);
  assert.equal(gate.describe(decision.id).status, 'READY_FOR_APPROVAL');
  const challenge = messagePayload(posts.find((post) => post.content.includes('"kind":"approval"')));
  assert.equal(challenge.sha, FIXED_SHA);

  await orchestrator.handleFrame(frame(7, 'release-room', 'owner', unseenMessage({ kind: 'approval', ...challenge })), connection);
  const final = gate.describe(decision.id);
  assert.equal(final.status, 'EXECUTED');
  assert.equal(final.receipt.result.action, 'release-preview');
  assert.deepEqual(runnerCalls.map((call) => call.sha), [INITIAL_SHA, INITIAL_SHA, FIXED_SHA, FIXED_SHA]);
  assert.ok(posts.some((post) => post.content.includes('Auditable receipt')));
});

test('runner interruption remains fail-closed and resumes from durable pending verification', async () => {
  let attempts = 0;
  const setupState = setup({
    runner: {
      async run({ sha, command }) {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('runner temporarily unavailable'), { code: 'SPAWN_FAILED' });
        const report = { requirementId: command === 'baseline-tests' ? 'engineering' : 'support', sha, command, exitCode: 0, outputDigest: sha256(`${sha}:${command}`), runnerId: 'allowlisted-test-runner', observedAt: new Date().toISOString() };
        return { ...report, attestation: setupState.gate.runnerAttestation(report) };
      }
    }
  });
  const { gate, orchestrator, connection, posts } = setupState;
  await orchestrator.handleFrame(frame(10, 'release-room', 'owner', unseenMessage({ kind: 'release_request', decisionId: 'RETRY-1', sha: INITIAL_SHA })), connection);
  await orchestrator.handleFrame(frame(11, 'release-room', 'engineering', unseenMessage({ kind: 'evidence', decisionId: 'RETRY-1', requirementId: 'engineering', documentDigest: sha256('retryable-engineering') })), connection);
  assert.equal(gate.describe('RETRY-1').status, 'PENDING_EVIDENCE');
  assert.equal(orchestrator.state.pendingVerification.requirementId, 'engineering');
  assert.ok(posts.some((post) => post.content.includes('fail-closed')));
  await orchestrator.resumePending();
  assert.equal(gate.describe('RETRY-1').requirements.find((item) => item.id === 'engineering').state, 'VERIFIED_PASS');
});

test('restart recovery finds discovered evidence even if the workflow checkpoint was not written', async () => {
  const setupState = setup();
  const { gate, orchestrator, connection } = setupState;
  await orchestrator.handleFrame(frame(20, 'release-room', 'owner', unseenMessage({ kind: 'release_request', decisionId: 'RESTART-1', sha: INITIAL_SHA })), connection);
  await orchestrator.handleFrame(frame(21, 'release-room', 'engineering', unseenMessage({ kind: 'evidence', decisionId: 'RESTART-1', requirementId: 'engineering', documentDigest: sha256('restart-engineering') })), connection);
  orchestrator.stateStore.save({ ...orchestrator.state, pendingVerification: null });
  orchestrator.state = { ...orchestrator.state, pendingVerification: null };
  await orchestrator.resumePending();
  assert.equal(gate.describe('RESTART-1').requirements.find((item) => item.id === 'engineering').state, 'VERIFIED_PASS');
});

test('event gap reloads both rooms and keeps the workflow paused when context is incomplete', async () => {
  const { orchestrator, connection, contexts, ingestor, posts } = setup();
  const result = await orchestrator.handleFrame({ event: 'gap', data: { from: 8, to: 12 } }, connection);
  assert.equal(result.requiresContextReload, true);
  const reloads = await orchestrator.recoverGap(connection);
  assert.equal(reloads.length, 2);
  assert.equal(contexts.length, 2);
  assert.equal(ingestor.gapDetected, false);
  assert.ok(posts.at(-1).content.includes('reloaded both room contexts'));
});


test('blocked-only live milestone refuses approval and remediation even from otherwise trusted identities', async () => {
  const { gate, orchestrator, connection } = setup({ blockedOnly: true });
  await orchestrator.handleFrame(frame(80,'release-room','owner',
    unseenMessage({kind:'release_request',decisionId:'LOCKED-1',sha:INITIAL_SHA})),connection);
  await orchestrator.handleFrame(frame(81,'release-room','engineering',
    unseenMessage({kind:'evidence',decisionId:'LOCKED-1',requirementId:'engineering',documentDigest:sha256('engineering evidence')})),connection);
  await orchestrator.handleFrame(frame(82,'support-room','investigator',
    unseenMessage({kind:'evidence',decisionId:'LOCKED-1',requirementId:'support',documentDigest:sha256('support evidence')})),connection);
  assert.equal(gate.describe('LOCKED-1').status,'READY_FOR_APPROVAL');
  const before = gate.describe('LOCKED-1');
  const refusal = await orchestrator.handleFrame(frame(83,'release-room','owner',
    unseenMessage({kind:'approval',decisionId:'LOCKED-1',sha:INITIAL_SHA,evidenceDigest:before.evidenceDigest,nonce:'not-allowed'})),connection);
  assert.equal(refusal.blockedOnly,true);
  assert.equal(gate.describe('LOCKED-1').approved,false);
  assert.equal(gate.describe('LOCKED-1').executed,false);
  const remediation = await orchestrator.handleFrame(frame(84,'support-room','coding',
    unseenMessage({kind:'remediation_ready',decisionId:'LOCKED-1',newSha:FIXED_SHA})),connection);
  assert.equal(remediation.blockedOnly,true);
  assert.equal(gate.describe('LOCKED-1').sha,INITIAL_SHA);
});
