import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch, readLocalSwitchEnv } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { buildScopedGatekeeperPolicy } from '../src/switch-admin-policy.mjs';

// Native Windows-only admin operation. No secrets are printed, written, exported,
// transmitted to external hosts, or persisted. Never changes ownership or rooms.
// --apply explicitly authorizes one scoped human-to-Gatekeeper addressing rule.
loadLocalEnv();
const apply = process.argv.includes('--apply');
const unexpected = process.argv.slice(2).filter((arg) => arg !== '--apply');
const agentId = process.env.SWITCH_AGENT_ID;
const local = discoverLocalSwitch();
const report = {
  action: apply ? 'apply-scoped-addressing-rule' : 'dry-run',
  gatekeeper: 'not-checked',
  administrator: 'not-checked',
  mattermostIdentity: 'not-checked',
  releaseRoom: 'not-checked',
  existingPolicy: 'not-checked',
  change: 'not-made'
};
let step = 'configuration';

function safeError(code, status = null) {
  report.error = { step, code, status };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
}

async function run() {
  if (unexpected.length) return safeError('UNEXPECTED_ARGUMENT');
  if (!local || !agentId || typeof local.bridgeUrl !== 'string') return safeError('MISSING_LOCAL_GATEKEEPER');
  const base = local.bridgeUrl.replace(/\/$/, '');
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(base)) return safeError('NON_LOOPBACK_CORE_URL');

  const email = readLocalSwitchEnv('GATEWAY_ADMIN_EMAIL');
  const password = readLocalSwitchEnv('GATEWAY_ADMIN_PASSWORD');
  if (!email || !password) return safeError('LOCAL_ADMIN_CREDENTIALS_UNAVAILABLE');

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
      const error = new Error('Local Switch administrative API refused request');
      error.code = 'HTTP_ERROR';
      error.status = response.status;
      throw error;
    }
    const json = await response.json().catch(() => null);
    return { json, response };
  };

  step = 'admin-login';
  const login = await request('/gateway/auth/login', {
    method: 'POST', body: { email, password }
  });
  const setCookie = login.response.headers.getSetCookie?.().join(', ') ??
    login.response.headers.get('set-cookie') ?? '';
  const token = /(?:^|,\s*)switch_auth=([^;,\s]+)/.exec(setCookie)?.[1];
  if (!token) return safeError('NO_SWITCH_AUTH_COOKIE');
  const cookie = `switch_auth=${token}`;

  step = 'admin-session';
  const me = (await request('/gateway/auth/me', { cookie })).json;
  if (me?.role !== 'admin') return safeError('SESSION_NOT_ADMIN');
  report.administrator = 'authorized';

  step = 'linked-mattermost-identity';
  const identities = (await request('/gateway/auth/me/identities', { cookie })).json;
  if (!Array.isArray(identities)) return safeError('INVALID_IDENTITIES_RESPONSE');
  const linked = identities.filter((identity) =>
    identity?.bridge_type === 'mattermost' &&
    identity?.external_username === 'user'
  );
  if (linked.length !== 1) return safeError('EXACT_USER_IDENTITY_NOT_LINKED');
  if (linked[0].verified !== true) return safeError('LINK_NOT_YET_VERIFIED');
  report.mattermostIdentity = 'verified-user';

  step = 'gatekeeper-detail';
  const detail = (await request(`/gateway/agents/${encodeURIComponent(agentId)}`, { cookie })).json;
  if (detail?.id !== agentId || detail?.name !== 'unseen-gatekeeper'
    || detail?.owner_name !== 'Agent Bootstrap') return safeError('GATEKEEPER_IDENTITY_OR_OWNER_MISMATCH');
  report.gatekeeper = 'exact-bootstrap-agent';

  step = 'release-room-discovery';
  const agent = new SwitchClient({
    bridgeUrl: base, agentId, apiKey: process.env.SWITCH_AGENT_API_KEY
  });
  if (!agent.apiKey) return safeError('GATEKEEPER_KEY_UNAVAILABLE');
  const rooms = operationList(await agent.listRooms(), ['rooms','data','items']);
  const release = roomId(findRoomByExactName(rooms, 'release-room'));
  if (!release) return safeError('RELEASE_ROOM_NOT_VISIBLE');
  report.releaseRoom = 'verified';

  step = 'current-addressing-policy';
  const oldPolicy = detail.addressing_policy;
  const plan = buildScopedGatekeeperPolicy(oldPolicy, { roomId: release, externalUserRowId: linked[0].id });
  report.existingPolicy = 'restricted';
  report.currentRules = oldPolicy.rules.length;
  report.proposedRules = plan.policy.rules.length;
  report.plannedScope = 'verified Mattermost user only, release-room only';
  if (!plan.changed) {
    report.change = 'already-present';
  } else if (!apply) {
    report.change = 'ready-to-apply';
    report.next = 'Run npm.cmd run authorize:switch -- --apply to authorize only this narrow permission.';
  } else {
    step = 'apply-scoped-policy';
    await request(`/gateway/agents/${encodeURIComponent(agentId)}/addressing-policy`, {
      cookie, method:'PUT', body: { policy: plan.policy }
    });
    step = 'verify-policy';
    const checked = (await request(`/gateway/agents/${encodeURIComponent(agentId)}`, { cookie })).json;
    if (JSON.stringify(checked?.addressing_policy?.rules) !== JSON.stringify(plan.policy.rules)) {
      return safeError('POST_UPDATE_POLICY_MISMATCH');
    }
    report.change = 'applied-and-verified';
  }

  console.log(JSON.stringify(report, null, 2));
}
try {
  await run();
} catch (error) {
  safeError(error?.code ?? 'LOCAL_ADMIN_REQUEST_ERROR', error?.status ?? null);
}
