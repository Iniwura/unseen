import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { createAllowlistedRunner } from '../src/runner.mjs';
import { createJsonStore } from '../src/store.mjs';
import { evidenceActors, originalCandidateSha, validatedPriorOwner,
  requireBoundAgentReport } from '../src/live-blocked-preflight.mjs';

// Runs only the live BLOCKED milestone. No privilege changes, registration,
// agent creation, deployment, approval or remediation are possible here.
// The persistent checkout must be the original, deliberately failing commit.
loadLocalEnv();
const report = {
  milestone: 'live Switch release blocked by failing refund regression',
  candidateSha: originalCandidateSha,
  permissionsChanged: false,
  codingAgent: 'disabled-for-blocked-milestone',
  release: 'not-requested',
  preflight: 'not-complete'
};
function fail(code) {
  report.error = code;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
}
async function run() {
  const env = process.env;
  const local = discoverLocalSwitch();
  const endpoint = env.SWITCH_BRIDGE_URL ?? local?.bridgeUrl;
  if (!endpoint || !env.SWITCH_AGENT_ID || !env.SWITCH_AGENT_API_KEY) {
    return fail('EXISTING_GATEKEEPER_NOT_CONFIGURED');
  }
  const candidate = resolve('.unseen/live-checkout');
  const runner = createAllowlistedRunner({
    checkoutRoot: candidate, runnerId: 'unseen-blocked-milestone-preflight',
    attestor: () => 'preflight-not-an-attestation'
  });
  let baseline;
  let regression;
  try {
    baseline = await runner.run({sha:originalCandidateSha,command:'baseline-tests'});
    regression = await runner.run({sha:originalCandidateSha,command:'refund-regression'});
  } catch (error) {
    return fail('CANDIDATE_PRECHECK_' + (error?.code ?? 'FAILED'));
  }
  if (baseline.exitCode !== 0 || regression.exitCode === 0 ||
      !regression.stdout.includes('# fail 1')) return fail('EXPECTED_REAL_REFUND_FAILURE_NOT_REPRODUCED');
  report.baseline = 'PASS';
  report.refundRegression = 'FAIL_EXPECTED';

  const client = new SwitchClient({bridgeUrl:endpoint,agentId:env.SWITCH_AGENT_ID,apiKey:env.SWITCH_AGENT_API_KEY});
  const rooms = operationList(await client.listRooms(),['rooms','data','items']);
  const selected = {};
  for (const name of ['release-room','support-room']) {
    const found = roomId(findRoomByExactName(rooms,name));
    if (!found) return fail('REQUIRED_SWITCH_ROOM_NOT_FOUND');
    selected[name] = found;
  }
  const proof = createJsonStore('.unseen/live-proof.json').load();
  const history = {};
  for (const name of Object.keys(selected)) {
    history[name] = await client.operation('read_context',{room_id:selected[name],limit:150});
  }
  let owner;
  try { owner = validatedPriorOwner(history['release-room'],proof,env.SWITCH_RELEASE_OWNER_ID); }
  catch { return fail('PREVIOUS_VERIFIED_OWNER_NOT_FOUND_OR_CONFLICTED'); }
  report.releaseOwner = 'matched-previous-authenticated-live-request';

  for (const actor of evidenceActors) {
    if (!env[actor.key]) return fail('AUTHORIZATION_BINDING_MISSING_' + actor.key);
    try { requireBoundAgentReport(history[actor.room],actor,env[actor.key]); }
    catch { return fail('EVIDENCE_SENDER_CONFLICT_' + actor.room.toUpperCase().replace('-','_')); }
  }
  report.engineer = 'exact-previously-verified-sender';
  report.support = 'exact-previously-verified-sender';

  for(const [name,key] of [['release-room','SWITCH_RELEASE_ROOM_ID'],['support-room','SWITCH_SUPPORT_ROOM_ID']]) {
    if(env[key] && env[key] !== selected[name]) return fail('EXISTING_ROOM_ID_CONFLICT_' + key);
    env[key] = selected[name];
  }
  env.SWITCH_RELEASE_OWNER_ID = owner;
  env.UNSEEN_AUTHORIZED_HUMANS = owner;
  env.UNSEEN_CHECKOUT_ROOT = candidate;
  env.UNSEEN_BLOCKED_ONLY = '1';
  env.SWITCH_ENGINEERING_MENTION = '@ini-unseen-engineer';
  env.SWITCH_INVESTIGATOR_MENTION = '@switch-buddy-admin';
  // The coding agent remains deliberately unauthorized for the blocked phase.
  // Set empty strings instead of deleting keys: the live bridge loads
  // .env.local again and must not repopulate an optional coding-agent role.
  env.SWITCH_CODING_AGENT_ID = '';
  env.SWITCH_CODING_MENTION = '';

  const requests = createJsonStore('.unseen/live-blocked-request.json');
  const saved = requests.load();
  let request;
  if (saved?.decisionId) {
    if (saved.sha !== originalCandidateSha) return fail('REQUEST_TARGET_CHANGED');
    request = saved;
  } else {
    request = { sha: originalCandidateSha, decisionId: 'live-block-' + randomUUID() };
    requests.save(request);
  }
  // Never advance if another candidate's active decision is present.
  const oldState = createJsonStore(env.UNSEEN_STATE_PATH ?? '.unseen/state.json').load();
  const active = (oldState.decisions ?? []).filter((d)=>d && !d.executed && !d.superseded);
  if (active.some((d)=>d.sha !== originalCandidateSha)) return fail('DIFFERENT_RELEASE_ALREADY_ACTIVE');

  report.preflight = 'verified';
  report.release = 'awaiting-real-human-message';
  report.connection = 'starting';
  console.log(JSON.stringify(report,null,2));
  console.log('When the Gatekeeper prints its Switch connection message, post this EXACT message in release-room from your linked Mattermost user:');
  console.log('@unseen-gatekeeper UNSEEN/1 ' + JSON.stringify({
    kind:'release_request',decisionId:request.decisionId,sha:request.sha
  }));
  console.log('Keep this PowerShell window running. It listens for real addressed engineering/support evidence; no approval or deployment will be made during this milestone.');

  await import('./live-bridge.mjs');
}
try { await run(); }
catch (error) { fail(error?.code ?? 'LIVE_BLOCKED_PRECHECK_FAILED'); }
