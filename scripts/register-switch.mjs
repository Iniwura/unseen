import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SwitchClient } from '../src/switch-client.mjs';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch, readLocalSwitchEnv } from '../src/local-switch.mjs';

loadLocalEnv();
const env = process.env;
const localSwitch = discoverLocalSwitch();
const bridgeUrl = env.SWITCH_BRIDGE_URL ?? localSwitch?.bridgeUrl;
const registrationKey = env.SWITCH_REGISTRATION_KEY ?? readLocalSwitchEnv('AGENT_REGISTRATION_TOKEN');
if (!bridgeUrl || !registrationKey) {
  console.error('Switch registration is unavailable: Core endpoint or local registration bootstrap is missing.');
  console.error('Start the Switch local server, then rerun npm run register:switch. No secret value is requested or printed.');
  process.exitCode = 2;
} else if (env.SWITCH_AGENT_ID) {
  console.error('SWITCH_AGENT_ID is already configured; refusing to register or rotate an existing agent.');
  process.exitCode = 2;
} else {
  try {
    const client = new SwitchClient({ bridgeUrl, registrationKey });
    await client.health();
    const result = await client.register({
      name: env.SWITCH_GATEKEEPER_NAME ?? 'unseen-gatekeeper',
      displayName: env.SWITCH_GATEKEEPER_DISPLAY_NAME ?? 'UNSEEN Gatekeeper',
      description: 'Evidence-backed release gate for the UNSEEN Blind-Spot Recovery workflow',
      connectionModel: 'always_on',
      connectorType: 'unseen'
    });
    const envPath = resolve('.env.local');
    const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const values = { SWITCH_BRIDGE_URL: bridgeUrl, SWITCH_AGENT_ID: result.agentId, SWITCH_AGENT_API_KEY: result.apiKey };
    const lines = existing.split(/\r?\n/).filter((line) => line && !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
    lines.push(...Object.entries(values).map(([key, value]) => `${key}=${value}`));
    writeFileSync(envPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(envPath, 0o600);
    console.log(`Registered ${env.SWITCH_GATEKEEPER_NAME ?? 'unseen-gatekeeper'} as agent ${result.agentId}. API key saved only to ignored .env.local.`);
    console.log('Next: npm run discover:switch');
  } catch (error) {
    console.error(`Switch registration failed: ${error.code ?? 'ERROR'}: ${error.message}`);
    process.exitCode = 1;
  }
}
