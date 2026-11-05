import { resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { createJsonStore } from '../src/store.mjs';
import { createGate } from '../src/gate.mjs';
import { createAllowlistedRunner } from '../src/runner.mjs';
import { verifyRepairedCheckout } from '../src/live-repair-validation.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { validatedPriorOwner, originalCandidateSha, evidenceActors, requireBoundAgentReport } from '../src/live-blocked-preflight.mjs';
import { inspectAgentReport } from '../src/switch-agent-reports.mjs';
import { unseenMessage } from '../src/switch-ingest.mjs';

// Real Switch recovery of the already BLOCKED refund checkout.
// No registration, admin writes, permission changes, deployments or fund moves.
// Existing owner and evidence-agent identities are rechecked via authenticated
// Switch history. A human-originated review is required to supersede the block.
loadLocalEnv();
const repairedSha = 'f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078';
const blockedDecisionId = 'live-block-a9eb054a-9564-42bf-aaf1-c3b7ee5a9c8c';
const report = {
  milestone: 'real Switch repair review',
  originalCandidateSha, repairedSha, blockedDecisionId,
  permissionsChanged:false, deployments:false, approvals:false,
  preflight:'not-complete', repairedDecision:'not-created'
};
function fail(code) {
  report.error = code;
  console.log(JSON.stringify(report,null,2));
  process.exitCode = 2;
}
async function run() {
  const env = process.env;
  const local = discoverLocalSwitch();
  const endpoint = env.SWITCH_BRIDGE_URL ?? local?.bridgeUrl;
  if (!endpoint || !env.SWITCH_AGENT_ID || !env.SWITCH_AGENT_API_KEY) {
    return fail('EXISTING_SWITCH_GATEKEEPER_NOT_CONFIGURED');
  }
  const checkout = resolve('.unseen/live-checkout');
  try {
    await verifyRepairedCheckout({checkoutRoot:checkout,originalSha:originalCandidateSha,repairedSha});
    const runner = createAllowlistedRunner({
      checkoutRoot:checkout,runnerId:'unseen-repair-preflight',
      attestor:()=> 'preflight-only-not-release-evidence'
    });
    const baseline = await runner.run({sha:repairedSha,command:'baseline-tests'});
    const refund = await runner.run({sha:repairedSha,command:'refund-regression'});
    if (baseline.exitCode !== 0 || refund.exitCode !== 0) return fail('REPAIRED_REGRESSION_TEST_FAILED');
    report.git = 'exact-direct-child-clean-two-expected-files';
    report.baseline = 'PASS';
    report.refundRegression = 'PASS';
  } catch (error) {
    return fail('REPAIR_PREFLIGHT_' + (error?.code ?? 'FAILED'));
  }

  const policyVersion = env.UNSEEN_POLICY_VERSION ?? '1';
  const gate = createGate({
    policyVersion,
    store:createJsonStore(env.UNSEEN_STATE_PATH ?? '.unseen/state.json'),
    authorizedHumans:[],
  });
  const workflow = createJsonStore('.unseen/workflow.json').load();
  let blocked;
  let active;
  try {
    blocked = gate.describe(blockedDecisionId);
    if (blocked.sha !== originalCandidateSha) return fail('ORIGINAL_BLOCKED_SHA_MISMATCH');
    active = gate.describe(workflow.activeDecisionId);
  } catch { return fail('ORIGINAL_GATE_STATE_MISSING'); }
  const notYetRequested = blocked.status === 'BLOCKED' &&
    active.id === blockedDecisionId && active.status === 'BLOCKED';
  const resumed = blocked.status === 'SUPERSEDED' &&
    active.sha === repairedSha && active.id !== blocked.id &&
    active.status !== 'EXECUTED' && active.status !== 'SUPERSEDED';
  if (!notYetRequested && !resumed) return fail('REPAIR_RELEASE_STATE_UNEXPECTED');
  report.repairedDecision = resumed ? active.id : 'not-created';

  const client = new SwitchClient({
    bridgeUrl:endpoint,agentId:env.SWITCH_AGENT_ID,apiKey:env.SWITCH_AGENT_API_KEY
  });
  const rooms = operationList(await client.listRooms(),['rooms','data','items']);
  const selected = {};
  for (const name of ['release-room','support-room']) {
    selected[name] = roomId(findRoomByExactName(rooms,name));
    if (!selected[name]) return fail('REQUIRED_SWITCH_ROOM_NOT_VISIBLE');
  }
  const histories = {};
  for (const name of Object.keys(selected)) {
    histories[name] = await client.operation('read_context',{room_id:selected[name],limit:150});
  }
  const previous = createJsonStore('.unseen/live-proof.json').load();
  let owner;
  try {
    owner = validatedPriorOwner(histories['release-room'],previous,env.SWITCH_RELEASE_OWNER_ID);
    for (const actor of evidenceActors) {
      if (!env[actor.key]) throw new Error('Missing agent authorization');
      requireBoundAgentReport(histories[actor.room],actor,env[actor.key]);
    }
    const repairReport = inspectAgentReport(histories['release-room'], {
      expectedName:'ini-unseen-engineer',
      candidateSha:repairedSha,
      phrases:['Repair complete in the existing live checkout only.',
        'Original candidate remains unchanged as parent', 'git status --porcelain']
    });
    if (repairReport.status !== 'observed-not-authorized' ||
        repairReport.observed?.senderId !== env.SWITCH_ENGINEERING_AGENT_ID) {
      throw new Error('Repaired-commit report not bound to the authorized engineering agent');
    }
  } catch { return fail('AUTHENTICATED_REPAIR_PROVENANCE_NOT_FOUND'); }
  report.engineeringRepairSource='matched-real-Switch-report';
  report.releaseOwner='matched-previous-authenticated-human';

  for (const [name,key] of [['release-room','SWITCH_RELEASE_ROOM_ID'],['support-room','SWITCH_SUPPORT_ROOM_ID']]) {
    if (env[key] && env[key] !== selected[name]) return fail('ROOM_BINDING_CONFLICT');
    env[key] = selected[name];
  }
  env.SWITCH_RELEASE_OWNER_ID = owner;
  env.UNSEEN_AUTHORIZED_HUMANS = owner;
  env.UNSEEN_CHECKOUT_ROOT = checkout;
  env.SWITCH_ENGINEERING_MENTION = '@ini-unseen-engineer';
  env.SWITCH_INVESTIGATOR_MENTION = '@switch-buddy-admin';
  env.SWITCH_RELEASE_OWNER_MENTION = '@user';
  env.UNSEEN_RECOVERY_REVIEW = '1';
  env.UNSEEN_BLOCKED_ONLY = '0';
  // Set empty strings instead of deleting keys: the live bridge loads
  // .env.local again and must not repopulate an optional coding-agent role.
  env.SWITCH_CODING_AGENT_ID = '';
  env.SWITCH_CODING_MENTION = '';

  report.preflight='verified';
  report.phase = resumed ? 'resuming-existing-repaired-review' : 'awaiting-owner-repair-review-request';
  console.log(JSON.stringify(report,null,2));
  if (notYetRequested) {
    console.log('AFTER "UNSEEN listening" appears, post this EXACT message from the linked human account in release-room:');
    console.log('@unseen-gatekeeper '+unseenMessage({
      kind:'repair_review_request',blockedDecisionId,
      originalSha:originalCandidateSha,newSha:repairedSha
    }));
  } else {
    console.log('Existing repaired decision found. Do NOT repost a repair review request.');
  }
  console.log('Keep this listener open for fresh engineering and support evidence, followed by separate human approval. No deployment is performed.');
  await import('./live-bridge.mjs');
}
try { await run(); }
catch(error) { fail(error?.code ?? 'LIVE_RECOVERY_PREFLIGHT_FAILED'); }
