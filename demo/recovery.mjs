import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGate, sha256 } from '../src/gate.mjs';
import { createAllowlistedRunner } from '../src/runner.mjs';
import { SwitchEventIngestor, unseenMessage } from '../src/switch-ingest.mjs';
import { createJsonStore, createMemoryStore } from '../src/store.mjs';

const root = mkdtempSync(join(tmpdir(), 'unseen-recovery-'));
const write = (file, contents) => { mkdirSync(join(root, file, '..'), { recursive: true }); writeFileSync(join(root, file), contents); };
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (message) => {
  git('-c', 'user.name=UNSEEN demo', '-c', 'user.email=unseen@example.invalid', 'add', '.');
  git('-c', 'user.name=UNSEEN demo', '-c', 'user.email=unseen@example.invalid', 'commit', '-qm', message);
  return git('rev-parse', 'HEAD');
};

function event(id, roomId, sender, body) {
  return { event: 'message', id, data: { type: 'message', room_id: roomId, bridge_id: null, payload: { addressed: true, sender, sender_name: sender, message_id: `local-message-${id}`, body, timestamp: Date.now(), thread_id: null, attachments: [] } } };
}

function log(label, value) { console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); }

try {
  git('init', '-q');
  write('package.json', JSON.stringify({ type: 'module' }));
  write('src/refund.mjs', `export function issueRefund(order, amount) {\n  const approved = Math.min(amount, order.captured);\n  order.refunded += approved;\n  return approved;\n}\n`);
  write('test/baseline.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('checkout loads', () => assert.equal(typeof 1, 'number'));\n`);
  write('test/refund-regression.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { issueRefund } from '../src/refund.mjs';\ntest('successive refunds never exceed the captured amount', () => {\n  const order = { captured: 100, refunded: 0 };\n  assert.equal(issueRefund(order, 50), 50);\n  assert.equal(issueRefund(order, 60), 50);\n  assert.equal(order.refunded, 100);\n});\n`);
  const initialSha = commit('checkout: candidate release');
  log('candidate exact commit', initialSha);

  const demoStatePath = process.env.UNSEEN_DEMO_STATE_PATH;
  const gate = createGate({
    runnerSecret: 'demo-runner-secret-that-is-long-enough',
    authorizedHumans: ['@release-owner:local'],
    store: demoStatePath ? createJsonStore(demoStatePath) : createMemoryStore()
  });
  const decision = gate.begin(initialSha, 'DEMO-RECOVERY-1');
  const runner = createAllowlistedRunner({
    checkoutRoot: root,
    runnerId: 'demo-allowlisted-runner',
    attestor: (report) => gate.runnerAttestation(report),
    commands: {
      'baseline-tests': { file: process.execPath, args: ['--test', 'test/baseline.test.mjs'] },
      'refund-regression': { file: process.execPath, args: ['--test', 'test/refund-regression.test.mjs'] }
    }
  });
  const participants = {
    'engineering-agent': { kind: 'agent', role: 'engineering-agent' },
    'investigator-agent': { kind: 'agent', role: 'evidence-investigator' },
    'coding-agent': { kind: 'agent', role: 'coding-agent' },
    '@release-owner:local': { kind: 'human', role: 'release-owner' }
  };
  const roomPolicies = {
    'release-room': { name: 'release-room', roomId: 'release-room-id', allowedRoles: ['engineering-agent', 'release-owner'] },
    'support-room': { name: 'support-room', roomId: 'support-room-id', allowedRoles: ['evidence-investigator', 'coding-agent'] }
  };
  const connection = { authenticated: true, agentId: 'unseen-demo-agent' };
  let fixedSha = null;
  const ingestor = new SwitchEventIngestor({
    gate,
    agentId: 'unseen-demo-agent',
    roomPolicies,
    participants,
    eventStore: createMemoryStore(),
    onRemediation(command) {
      if (command.decisionId !== decision.id) throw new Error('remediation was not bound to the blocked decision');
      write('src/refund.mjs', `export function issueRefund(order, amount) {\n  const remaining = order.captured - order.refunded;\n  const approved = Math.min(amount, remaining);\n  order.refunded += approved;\n  return approved;\n}\n`);
      fixedSha = commit('fix: cap successive refunds at captured amount');
      return { fixedSha };
    }
  });
  ingestor.handleFrame({ event: 'connection_state', id: null, data: { type: 'connection_state', agent_id: 'unseen-demo-agent', rooms: ['release-room-id', 'support-room-id'], cursor: 0, generation: 1 } }, connection);

  ingestor.handleFrame(event(1, 'release-room-id', 'engineering-agent', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'engineering', documentDigest: sha256(`engineering evidence ${initialSha}`) })), connection);
  const engineeringReport = await runner.run({ sha: initialSha, command: 'baseline-tests' });
  gate.recordRunnerVerification(decision.id, engineeringReport);
  log('engineering', gate.describe(decision.id).status);

  ingestor.handleFrame(event(2, 'support-room-id', 'investigator-agent', unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: sha256('support acceptance: successive refunds must not exceed captured amount') })), connection);
  const failingReport = await runner.run({ sha: initialSha, command: 'refund-regression' });
  gate.recordRunnerVerification(decision.id, failingReport);
  log('recovered blind spot', gate.describe(decision.id).status);
  log('failure was real', `exit ${failingReport.exitCode}, output ${failingReport.outputDigest}`);

  ingestor.handleFrame(event(3, 'support-room-id', 'coding-agent', unseenMessage({ kind: 'remediation', decisionId: decision.id, reason: 'support regression is reproducible; cap the remaining refundable amount' })), connection);
  gate.supersede(decision.id, fixedSha);
  const repaired = gate.begin(fixedSha, 'DEMO-RECOVERY-2');
  ingestor.handleFrame(event(4, 'release-room-id', 'engineering-agent', unseenMessage({ kind: 'evidence', decisionId: repaired.id, requirementId: 'engineering', documentDigest: sha256(`engineering evidence ${fixedSha}`) })), connection);
  gate.recordRunnerVerification(repaired.id, await runner.run({ sha: fixedSha, command: 'baseline-tests' }));
  ingestor.handleFrame(event(5, 'support-room-id', 'investigator-agent', unseenMessage({ kind: 'evidence', decisionId: repaired.id, requirementId: 'support', documentDigest: sha256('support acceptance: successive refunds must not exceed captured amount') })), connection);
  const passingReport = await runner.run({ sha: fixedSha, command: 'refund-regression' });
  gate.recordRunnerVerification(repaired.id, passingReport);
  log('repaired exact commit', `${fixedSha} / exit ${passingReport.exitCode}`);

  const challenge = gate.issueApprovalChallenge(repaired.id);
  ingestor.handleFrame(event(6, 'release-room-id', '@release-owner:local', unseenMessage({ kind: 'approval', decisionId: repaired.id, sha: fixedSha, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce })), connection);
  const capability = gate.requestExecution(repaired.id);
  const final = gate.execute(repaired.id, capability, ({ sha, evidenceDigest }) => ({ action: 'release-preview', sha, evidenceDigest }));
  log('authenticated approval', final.approval);
  log('decision receipt', final.receipt);
  log('counterfactual', gate.counterfactual(repaired.id));
  console.log('TRANSPORT: local protocol harness exercising the real Switch adapter; no live Switch event is claimed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
