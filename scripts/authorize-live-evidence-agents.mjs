import { chmodSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch, readLocalSwitchEnv } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { inspectAgentReport } from '../src/switch-agent-reports.mjs';
import { buildScopedAgentPolicy, resolveReportedAgent, sameScopedPolicy } from '../src/switch-admin-policy.mjs';

loadLocalEnv();
const apply = process.argv.includes('--apply');
const report = {
  check: 'scoped Gatekeeper evidence-agent authorization',
  core: 'not-checked',
  engineer: 'not-checked',
  support: 'not-checked',
  permission: 'not-modified',
  senderBindings: 'not-saved',
  codingAgent: 'not-authorized'
};
let step = 'config';
const safeFail = (code, status = null) => {
  report.error = { step, code, httpStatus: status };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
};

const candidates = [
  { room: 'release-room', agent: 'ini-unseen-engineer', env: 'SWITCH_ENGINEERING_AGENT_ID',
    phrases: ['Live checkout verification complete', '60 !== 50'] },
  { room: 'support-room', agent: 'switch-buddy-admin', env: 'SWITCH_INVESTIGATOR_AGENT_ID',
    phrases: ['Conclusion for candidate', 'sw_dcb1a077ada96e36be62e334a753ff57'] }
];
const candidateSha = 'a921b8a5d51c0a8a58fcdcd59c0963ac012d8627';
const exactKey = (value) => typeof value === 'string' && value.length > 0 && !value.includes('\n');
const local = discoverLocalSwitch();
async function run() {
  if (process.argv.slice(2).some((arg) => arg !== '--apply'))
    return safeFail('UNKNOWN_ARGUMENT');
  if (!local || !/^http:\/\/127\.0\.0\.1:\d+$/.test(local.bridgeUrl)) return safeFail('NON_LOOPBACK_SWITCH');
  if (!exactKey(process.env.SWITCH_AGENT_ID) || !exactKey(process.env.SWITCH_AGENT_API_KEY))
    return safeFail('GATEKEEPER_CREDENTIALS_UNAVAILABLE');
  const head = spawnSync('git', ['-C', resolve('.unseen/live-checkout'), 'rev-parse', 'HEAD'], {
    encoding: 'utf8', windowsHide: true, timeout: 8000
  });
  if (head.status !== 0 || String(head.stdout ?? '').trim() !== candidateSha) {
    return safeFail('CANDIDATE_SHA_CHANGED');
  }
  const email = readLocalSwitchEnv('GATEWAY_ADMIN_EMAIL');
  const password = readLocalSwitchEnv('GATEWAY_ADMIN_PASSWORD');
  if (!exactKey(email) || !exactKey(password)) return safeFail('LOCAL_ADMIN_UNAVAILABLE');

  // Read the local admin session only in this process. Never persist or print it.
  const base = local.bridgeUrl.replace(/\/$/, '');
  const request = async (path, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const e = new Error('Switch administrative API rejected the request');
      e.code = 'HTTP_ERROR';
      e.status = response.status;
      throw e;
    }
    return { json: await response.json().catch(() => null), response };
  };
  step = 'admin-login';
  const login = await request('/gateway/auth/login', { method:'POST', body: { email, password } });
  const setCookie = login.response.headers.getSetCookie?.().join(', ') ??
    login.response.headers.get('set-cookie') ?? '';
  const token = /(?:^|,\s*)switch_auth=([^;,\s]+)/.exec(setCookie)?.[1];
  if (!token) return safeFail('NO_ADMIN_SESSION');
  const cookie = 'switch_auth=' + token;
  step = 'admin-role';
  const me = (await request('/gateway/auth/me', {cookie})).json;
  if (me?.role !== 'admin') return safeFail('NOT_ADMIN');
  step = 'core-version';
  const version = (await request('/gateway/version', {cookie})).json?.version;
  if (typeof version !== 'string' || !version.startsWith('0.31.')) return safeFail('UNSUPPORTED_CORE_VERSION');
  report.core = version;

  step = 'gatekeeper';
  const id = process.env.SWITCH_AGENT_ID;
  const details = (await request('/gateway/agents/' + encodeURIComponent(id), {cookie})).json;
  if (details?.id !== id || details?.name !== 'unseen-gatekeeper' ||
      details?.owner_name !== 'Agent Bootstrap') return safeFail('GATEKEEPER_MISMATCH');

  const allAgents = (await request('/gateway/agents', {cookie})).json;
  if (!Array.isArray(allAgents)) return safeFail('INVALID_AGENT_REGISTRY');

  const agent = new SwitchClient({
    bridgeUrl: base, agentId: id, apiKey: process.env.SWITCH_AGENT_API_KEY
  });
  step = 'room-discovery';
  const roomList = operationList(await agent.listRooms(), ['rooms','data','items']);
  const bindings = [];
  for (const option of candidates) {
    const exactRoom = findRoomByExactName(roomList, option.room);
    const selectedRoomId = roomId(exactRoom);
    if (!selectedRoomId) return safeFail('ROOM_NOT_VISIBLE');
    const members = operationList(await agent.listParticipants(selectedRoomId), ['participants','data','items']);
    step = 'authenticated-history-' + option.room;
    const context = await agent.operation('read_context', { room_id: selectedRoomId, limit: 150 });
    const observed = inspectAgentReport(context, {
      expectedName: option.agent, candidateSha, phrases: option.phrases
    });
    let verified;
    try { verified = resolveReportedAgent(observed, members, allAgents, option.agent); }
    catch { return safeFail('UNVERIFIED_AGENT_OR_ROOM_MEMBERSHIP'); }
    step = 'registered-agent-detail-' + option.agent;
    const registered = (await request('/gateway/agents/' + encodeURIComponent(verified.id), {cookie})).json;
    if (registered?.id !== verified.id || registered?.name !== option.agent)
      return safeFail('AGENT_REGISTRY_MISMATCH');
    bindings.push({ ...option, roomId: selectedRoomId, registeredAgentId: verified.id, senderId: verified.senderId });
    report[option.room === 'release-room' ? 'engineer' : 'support'] = 'registered-member-and-report-matched';
  }
  if (bindings[0].senderId === bindings[1].senderId ||
      bindings[0].registeredAgentId === bindings[1].registeredAgentId) {
    return safeFail('AGENT_ROLES_NOT_INDEPENDENT');
  }

  step = 'existing-policy';
  const original = details.addressing_policy;
  let policy = original;
  let changed = false;
  try {
    for (const binding of bindings) {
      const next = buildScopedAgentPolicy(policy, {
        roomId: binding.roomId, agentId: binding.registeredAgentId
      });
      policy = next.policy;
      changed ||= next.changed;
    }
  } catch { return safeFail('UNSAFE_EXISTING_POLICY'); }
  report.existingRules = original.rules.length;
  report.proposedRules = policy.rules.length;
  report.scopes = ['engineering agent: release-room only', 'support agent: support-room only'];
  const envFile = resolve('.env.local');
  const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const assignments = Object.fromEntries(bindings.map((b) => [b.env, b.senderId]));
  for (const [name, value] of Object.entries(assignments)) {
    const line = existing.split(/\r?\n/).find((part) => part.startsWith(name + '='));
    const prior = line ? line.slice(name.length + 1).replace(/^["']|["']$/g, '') : null;
    if (prior !== null && prior !== value) return safeFail('SENDER_BINDING_CONFLICT');
    if (process.env[name] && process.env[name] !== value) return safeFail('ACTIVE_SENDER_BINDING_CONFLICT');
  }
  if (!apply) {
    report.permission = changed ? 'ready-to-apply' : 'already-present';
    report.senderBindings = 'ready-to-save';
    report.next = 'Run npm.cmd run authorize:agents -- --apply after reviewing the exact room scopes.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (changed) {
    step = 'update-policy';
    await request('/gateway/agents/' + encodeURIComponent(id) + '/addressing-policy', {
      method: 'PUT', body: { policy }, cookie
    });
  }
  step = 'readback-policy';
  const readback = (await request('/gateway/agents/' + encodeURIComponent(id), {cookie})).json;
  if (!sameScopedPolicy(readback?.addressing_policy, policy))
    return safeFail('POLICY_READBACK_MISMATCH');
  report.permission = changed ? 'applied-and-verified' : 'already-present-and-verified';

  // Save only opaque event sender bindings in ignored local config. Preserve
  // the Gatekeeper's existing API key and all other local fields unchanged.
  step = 'persist-local-bindings';
  const updated = existing.split(/\r?\n/).filter((line) => line && !Object.keys(assignments).some((key) => line.startsWith(key + '=')));
  for (const [key, value] of Object.entries(assignments)) updated.push(key + '=' + value);
  const temp = envFile + '.' + process.pid + '.tmp';
  writeFileSync(temp, updated.join('\n') + '\n', { encoding:'utf8', mode:0o600 });
  try { renameSync(temp, envFile); chmodSync(envFile, 0o600); }
  catch { return safeFail('LOCAL_BINDINGS_NOT_SAVED'); }
  report.senderBindings = 'saved-to-ignored-local-file';
  report.status = 'evidence-agents-bound';
  report.next = 'Next: live blocked-decision test. The coding-agent role remains unassigned.';
  console.log(JSON.stringify(report, null, 2));
}
try { await run(); }
catch (error) { safeFail(error?.code ?? 'LOCAL_SWITCH_REQUEST_FAILED', error?.status ?? null); }
