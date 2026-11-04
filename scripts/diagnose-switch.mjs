import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';

loadLocalEnv();
const env = process.env;
const localSwitch = discoverLocalSwitch();
const required = [
  'SWITCH_BRIDGE_URL', 'SWITCH_AGENT_ID', 'SWITCH_AGENT_API_KEY',
  'SWITCH_RELEASE_ROOM_ID', 'SWITCH_SUPPORT_ROOM_ID',
  'SWITCH_RELEASE_OWNER_ID', 'SWITCH_ENGINEERING_AGENT_ID',
  'SWITCH_INVESTIGATOR_AGENT_ID', 'SWITCH_CODING_AGENT_ID',
  'UNSEEN_CHECKOUT_ROOT'
];

function commandDiagnostic(file, args) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.error) return { available: false, code: result.error.code ?? 'SPAWN_FAILED' };
  return { available: result.status === 0, code: result.status === 0 ? 'OK' : `EXIT_${result.status}` };
}

async function bridgeDiagnostic(url) {
  if (!url) return { configured: false, reachable: false, code: 'NOT_CONFIGURED' };
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
    return { configured: true, reachable: response.ok, status: response.status, code: response.ok ? 'OK' : 'HTTP_ERROR' };
  } catch (error) {
    return { configured: true, reachable: false, code: error.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE' };
  }
}

const checkoutRoot = env.UNSEEN_CHECKOUT_ROOT ? resolve(env.UNSEEN_CHECKOUT_ROOT) : null;
const automaticCheckoutRoot = !checkoutRoot && existsSync(resolve('.git')) ? resolve('.') : null;
const effectiveCheckoutRoot = checkoutRoot ?? automaticCheckoutRoot;
const checkout = effectiveCheckoutRoot && existsSync(effectiveCheckoutRoot)
  ? { configured: Boolean(checkoutRoot), source: checkoutRoot ? 'environment' : 'current-repository', exists: true, directory: statSync(effectiveCheckoutRoot).isDirectory() }
  : { configured: Boolean(checkoutRoot), source: checkoutRoot ? 'environment' : 'not-found', exists: false, directory: false };
const docker = commandDiagnostic(process.platform === 'win32' ? 'docker.exe' : 'docker', ['info', '--format', '{{.ServerVersion}}']);
const bridgeUrl = env.SWITCH_BRIDGE_URL ?? localSwitch?.bridgeUrl ?? null;
const bridge = await bridgeDiagnostic(bridgeUrl);
const configuration = Object.fromEntries(required.map((name) => [name, Boolean(env[name] || (name === 'UNSEEN_CHECKOUT_ROOT' && automaticCheckoutRoot))]));
const missing = required.filter((name) => !configuration[name]);
const nextAction = [];
if (missing.length > 0) nextAction.push(`Set the missing live variables: ${missing.join(', ')}`);
if (!checkout.directory) nextAction.push('Point UNSEEN_CHECKOUT_ROOT at a clean Git checkout used for the live candidate.');
if (!docker.available && !localSwitch) nextAction.push('Install/start Docker Desktop and enable WSL integration if the Switch Console is hosted locally.');
if (!bridge.reachable && localSwitch) nextAction.push('Open Switch Console and start the Local server; wait for its status to show Running, then rerun this diagnostic.');
if (!bridge.reachable && !localSwitch) nextAction.push('Start or authenticate the Switch Console bridge, then rerun this diagnostic.');
if (nextAction.length === 0) nextAction.push('Configuration is present; run npm run connect:switch and perform the live checklist.');

console.log(JSON.stringify({
  ok: missing.length === 0 && checkout.directory && bridge.reachable,
  configuration,
  checkout,
  docker,
  switchBridge: bridge,
  discoveredLocalSwitch: localSwitch ? { bridgeUrl: localSwitch.bridgeUrl, apiPort: localSwitch.apiPort, mattermostPort: localSwitch.mattermostPort, metadataPath: localSwitch.portsPath } : null,
  authentication: {
    apiKeyConfigured: Boolean(env.SWITCH_AGENT_API_KEY),
    valuesInspected: false,
    note: 'Credentials are only checked for presence; values are never printed or validated by this local diagnostic.'
  },
  desktopApps: {
    switchConsole: bridge.reachable ? 'bridge-reachable' : 'not-verified-by-this-shell',
    mattermost: bridge.reachable ? 'not-independently-inspected' : 'not-verified-by-this-shell',
    codex: 'desktop-authentication-requires-user-session'
  },
  nextAction
}, null, 2));
