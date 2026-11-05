import { discoverLocalSwitch, readLocalSwitchEnv } from '../src/local-switch.mjs';
import { linkedMattermostAccount } from '../src/switch-link-confirmation.mjs';

// The linked Mattermost account was created before Switch required proof of
// ownership. Generate an official one-time confirmation challenge only for
// that existing account, using the local administrator session.
// No registration, credential rotation, database access or policy modification.
const local = discoverLocalSwitch();
const report = { check: 'confirm existing Mattermost account', administrator: 'not-checked', account: 'not-checked', status: 'not-completed' };
let step = 'local-server';
const fail = (code, httpStatus = null) => {
  console.log(JSON.stringify({ ...report, error: { step, code, httpStatus } }, null, 2));
  process.exitCode = 2;
};
async function main() {
  if (process.argv.length > 2) return fail('NO_ARGUMENTS_EXPECTED');
  if (!local || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(local.bridgeUrl)) {
    return fail('LOCAL_CORE_NOT_FOUND');
  }
  const email = readLocalSwitchEnv('GATEWAY_ADMIN_EMAIL');
  const password = readLocalSwitchEnv('GATEWAY_ADMIN_PASSWORD');
  if (!email || !password) return fail('LOCAL_ADMIN_CONFIG_UNAVAILABLE');
  const base = local.bridgeUrl;
  async function api(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const error = new Error('Local Switch request failed');
      error.code = 'HTTP_ERROR';
      error.status = response.status;
      throw error;
    }
    return { body: await response.json(), response };
  }
  step = 'login';
  const login = await api('/gateway/auth/login', { method: 'POST', body: { email, password } });
  const cookies = login.response.headers.getSetCookie?.().join(', ') ??
    login.response.headers.get('set-cookie') ?? '';
  const token = /(?:^|,\s*)switch_auth=([^;,\s]+)/.exec(cookies)?.[1];
  if (!token) return fail('ADMIN_COOKIE_NOT_RECEIVED');
  const cookie = `switch_auth=${token}`;
  step = 'session';
  const session = (await api('/gateway/auth/me', { cookie })).body;
  if (session?.role !== 'admin') return fail('NOT_ADMIN');
  report.administrator = 'authorized';

  step = 'existing-link';
  const identities = (await api('/gateway/auth/me/identities', { cookie })).body;
  const identity = linkedMattermostAccount(identities, 'user');
  report.account = 'user';
  if (identity.verified === true) {
    report.status = 'already-verified';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (identity.verified !== false) return fail('UNEXPECTED_VERIFICATION_STATE');

  step = 'issue-official-confirmation-code';
  const response = (await api(
    `/gateway/collaborations/${encodeURIComponent(identity.bridge_id)}/identities/${encodeURIComponent(identity.id)}/code`,
    { method: 'POST', cookie }
  )).body;
  if (typeof response?.code !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(response.code)) {
    return fail('INVALID_CONFIRMATION_RESPONSE');
  }
  report.status = 'code-issued';
  console.log(JSON.stringify(report, null, 2));
  console.log('\nIn Switch Console release-room, signed in to Mattermost as user, send exactly:');
  console.log(`!link-account ${response.code}`);
  console.log('\nDo not paste the verification code into ChatGPT or GitHub. It expires after one use or its deadline.');
  console.log('After posting it, run: npm.cmd run authorize:switch');
}

try {
  await main();
} catch (error) {
  fail(error?.code ?? 'LOCAL_REQUEST_ERROR', error?.status ?? null);
}
