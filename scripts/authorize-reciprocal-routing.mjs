import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch, readLocalSwitchEnv } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { planReciprocalAgentPolicy, planMatches, eligibleEngineeringRetry } from '../src/reciprocal-addressing.mjs';
import { createJsonStore } from '../src/store.mjs';
import { originalCandidateSha } from '../src/live-blocked-preflight.mjs';
import { unseenMessage } from '../src/switch-ingest.mjs';

// This changes the recipient agents' policies, NOT the Gatekeeper policy.
// --apply explicitly grants only the exact Gatekeeper agent in each target
// room, preserving all existing owner/agent restrictions. No permissions
// are ever granted to arbitrary users, rooms or coding agents.
//
// Once policies read back correctly, and ONLY if the active decision is still
// missing engineering evidence, retry that request once from Gatekeeper.
// This does not invent evidence, approve, repair, deploy or change release state.
loadLocalEnv();
const apply = process.argv.includes('--apply');
const report = {
  check: 'reciprocal Switch addressing for live UNSEEN evidence requests',
  action: apply ? 'explicit-apply' : 'dry-run',
  permissions: 'not-modified',
  engineer: 'not-checked',
  support: 'not-checked',
  retry: 'not-sent',
  releasesApproved: false,
  deployments: false
};
let step = 'configuration';
function fail(code, status = null) {
  report.error = { step, code, httpStatus: status };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) return fail('INVALID_ARGUMENT');
  const local = discoverLocalSwitch();
  const gatekeeperId = process.env.SWITCH_AGENT_ID;
  if (!local || !/^http:\/\/127\.0\.0\.1:\d+$/.test(local.bridgeUrl) ||
      !gatekeeperId || !process.env.SWITCH_AGENT_API_KEY) {
    return fail('LOCAL_GATEKEEPER_UNAVAILABLE');
  }
  const email = readLocalSwitchEnv('GATEWAY_ADMIN_EMAIL');
  const password = readLocalSwitchEnv('GATEWAY_ADMIN_PASSWORD');
  if (!email || !password) return fail('LOCAL_ADMIN_UNAVAILABLE');

  const endpoint = local.bridgeUrl.replace(/\/$/, '');
  const request = async (url, {method='GET', body, cookie}={}) => {
    const res = await fetch(endpoint + url, {
      method,
      headers: { accept: 'application/json',
        ...(body === undefined ? {} : {'content-type':'application/json'}),
        ...(cookie ? {cookie} : {}) },
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      const e = new Error('Switch request refused');
      e.code = 'SWITCH_HTTP_ERROR';
      e.status = res.status;
      throw e;
    }
    return {response:res, json:await res.json().catch(()=>null)};
  };

  step = 'admin-login';
  const login = await request('/gateway/auth/login',{method:'POST',body:{email,password}});
  const setCookie = login.response.headers.getSetCookie?.().join(', ') ??
    login.response.headers.get('set-cookie') ?? '';
  const token = /(?:^|,\s*)switch_auth=([^;,\s]+)/.exec(setCookie)?.[1];
  if (!token) return fail('ADMIN_COOKIE_MISSING');
  const cookie = 'switch_auth=' + token;

  step = 'admin-check';
  if ((await request('/gateway/auth/me',{cookie})).json?.role !== 'admin') return fail('NOT_AN_ADMIN');
  const version = (await request('/gateway/version',{cookie})).json?.version;
  if (version !== '0.31.0') return fail('UNSUPPORTED_SWITCH_VERSION');
  report.core = version;

  const gatekeeper = (await request('/gateway/agents/'+encodeURIComponent(gatekeeperId),{cookie})).json;
  if (gatekeeper?.id !== gatekeeperId || gatekeeper?.name !== 'unseen-gatekeeper' ||
      gatekeeper?.owner_name !== 'Agent Bootstrap') return fail('UNEXPECTED_GATEKEEPER');
  const bridge = new SwitchClient({
    bridgeUrl:endpoint,agentId:gatekeeperId,apiKey:process.env.SWITCH_AGENT_API_KEY
  });
  const rooms = operationList(await bridge.listRooms(),['rooms','data','items']);
  const registry = (await request('/gateway/agents',{cookie})).json;
  if (!Array.isArray(registry)) return fail('MALFORMED_AGENT_DIRECTORY');
  const targets = [
    {name:'ini-unseen-engineer',room:'release-room',report:'engineer'},
    {name:'switch-buddy-admin',room:'support-room',report:'support'}
  ];
  const proposals = [];
  for (const target of targets) {
    step = 'verify-' + target.name;
    const registered = registry.filter(a=>a?.name===target.name && typeof a.id==='string');
    if (registered.length !== 1) return fail('TARGET_REGISTRY_NOT_UNIQUE');
    const selected = roomId(findRoomByExactName(rooms,target.room));
    if (!selected) return fail('REQUIRED_ROOM_NOT_VISIBLE');
    const members = operationList(await bridge.listParticipants(selected),['participants','data','items']);
    if (!members.some(m=>m?.type==='agent' && m?.agent_id===gatekeeperId && m?.name==='unseen-gatekeeper') ||
        !members.some(m=>m?.type==='agent' && m?.agent_id===registered[0].id && m?.name===target.name)) {
      return fail('TARGET_OR_GATEKEEPER_NOT_ROOM_MEMBER');
    }
    const details = (await request('/gateway/agents/'+encodeURIComponent(registered[0].id),{cookie})).json;
    if (details?.id!==registered[0].id || details?.name!==target.name) return fail('TARGET_AGENT_MISMATCH');
    let planned;
    try { planned = planReciprocalAgentPolicy(details.addressing_policy,{roomId:selected,gatekeeperId}); }
    catch { return fail('UNSAFE_TARGET_ADDRESSING_POLICY'); }
    proposals.push({...target,agentId:registered[0].id,roomId:selected,oldPolicy:details.addressing_policy,planned});
    report[target.report] = planned.reason;
    report[target.report+'Rules'] = { before: details.addressing_policy?.rules?.length ?? 'open',
      after: planned.policy?.rules?.length ?? 'open' };
  }
  if (proposals[0].agentId === proposals[1].agentId) return fail('TARGETS_NOT_DISTINCT');

  // Ensure we can safely resume the SAME release; not a new request.
  step = 'active-decision-check';
  const workflow = createJsonStore('.unseen/workflow.json').load();
  const release = createJsonStore('.unseen/live-blocked-request.json').load();
  const gate = createJsonStore('.unseen/state.json').load();
  const live = createJsonStore('.unseen/live-status.json').load();
  let retry;
  if (release?.sha !== originalCandidateSha) {
    return fail('DURABLE_RELEASE_SHA_MISMATCH');
  }
  try {
    retry = eligibleEngineeringRetry({
      workflow, persistedGate: gate, live,
      sha: originalCandidateSha, expectedDecisionId: release?.decisionId,
      requiredRooms: proposals.map((p) => p.roomId)
    });
  } catch (error) {
    // Restrict diagnostics to fixed state flags; don't print persisted Gatekeeper
    // state, runner secrets, source events, auth tokens or raw messages.
    report.recovery = error?.diagnostic ?? null;
    return fail(error?.code ?? 'LIVE_RELEASE_NOT_READY_FOR_ENGINEERING_RETRY');
  }
  report.decisionId = retry.decisionId;
  report.targetSha = retry.sha;

  if (!apply) {
    report.permissions = proposals.some(p=>p.planned.changed) ? 'ready-to-apply' : 'already-permitted';
    report.retry = 'ready-to-resend-once';
    report.next = 'Run npm.cmd run authorize:routing -- --apply in a SECOND PowerShell window while live:blocked stays running.';
    console.log(JSON.stringify(report,null,2));
    return;
  }

  const changed = [];
  for (const proposal of proposals) {
    step = 'recheck-and-apply-'+proposal.name;
    const current = (await request('/gateway/agents/'+encodeURIComponent(proposal.agentId),{cookie})).json;
    if (!planMatches(current?.addressing_policy,proposal.oldPolicy)) {
      report.partiallyApplied = changed;
      return fail('POLICY_CHANGED_SINCE_PREFLIGHT');
    }
    if (proposal.planned.changed) {
      await request('/gateway/agents/'+encodeURIComponent(proposal.agentId)+'/addressing-policy',{
        method:'PUT',cookie,body:{policy:proposal.planned.policy}
      });
      changed.push(proposal.name);
    }
    const checked = (await request('/gateway/agents/'+encodeURIComponent(proposal.agentId),{cookie})).json;
    if (!planMatches(checked?.addressing_policy,proposal.planned.policy)) {
      report.partiallyApplied = changed;
      return fail('TARGET_POLICY_READBACK_FAILED');
    }
  }
  report.permissions = changed.length ? 'scoped-and-verified' : 'already-permitted-and-verified';
  report.changedAgentPolicies = changed;
  step = 'retry-engineering';
  // No gate mutation. Repeat only the existing engineering request. The
  // authorized agent must independently provide a real evidence message.
  const body = '@ini-unseen-engineer Verify the exact candidate ' + retry.sha +
    ' and the baseline test inside .unseen/live-checkout. Reply addressed to @unseen-gatekeeper with one real source-backed command:\n' +
    unseenMessage({
      kind:'evidence',decisionId:retry.decisionId,requirementId:'engineering',
      documentDigest:'<SHA256-OF-ACTUAL-ENGINEERING-SOURCE>'
    }) +
    '\nReplace the digest placeholder with the actual 64-hex SHA-256 of your source. Do not repair, approve or deploy.';
  const post = await bridge.postMessage(proposals[0].roomId,body);
  if (post?.ok !== true) return fail('RETRY_MESSAGE_NOT_CONFIRMED');
  report.retry = 'confirmed-posted-to-engineer';
  report.result = 'awaiting-actual-agent-evidence';
  console.log(JSON.stringify(report,null,2));
}
try { await main(); }
catch(e){ fail(e?.code??'LOCAL_AUTHORIZATION_FAILED',e?.status??null); }
