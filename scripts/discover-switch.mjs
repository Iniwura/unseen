import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SwitchClient } from '../src/switch-client.mjs';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';

loadLocalEnv();
const env = process.env;
const localSwitch = discoverLocalSwitch();
const bridgeUrl = env.SWITCH_BRIDGE_URL ?? localSwitch?.bridgeUrl;
if (!bridgeUrl || !env.SWITCH_AGENT_ID || !env.SWITCH_AGENT_API_KEY) {
  console.error('Switch discovery requires a reachable Core endpoint and the Gatekeeper credentials.');
  console.error('Run npm run register:switch first.');
  process.exitCode = 2;
} else {
  const client = new SwitchClient({ bridgeUrl, agentId: env.SWITCH_AGENT_ID, apiKey: env.SWITCH_AGENT_API_KEY });
  const redact = (value, key = '') => {
    if (/(token|secret|key|password|credential|cookie|authorization|bearer|jwt)/i.test(key)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((item) => redact(item, key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
    return value;
  };
  const listFrom = (value, names) => {
    for (const name of names) if (Array.isArray(value?.[name])) return value[name];
    return Array.isArray(value) ? value : [];
  };
  const findRoom = (rooms, name) => rooms.find((room) => [room.name, room.display_name, room.displayName, room.slug].filter(Boolean).some((value) => String(value).toLowerCase() === name));
  try {
    await client.health();
    const roomResponse = await client.listRooms();
    const rooms = listFrom(roomResponse, ['rooms', 'data', 'items']);
    const release = findRoom(rooms, 'release-room');
    const support = findRoom(rooms, 'support-room');
    const participants = {};
    for (const room of [release, support].filter(Boolean)) participants[room.name ?? room.slug ?? room.id] = redact(await client.listParticipants(room.id));
    const output = { agentId: env.SWITCH_AGENT_ID, bridgeUrl, rooms: redact(rooms), selectedRooms: redact({ release, support }), participants };
    console.log(JSON.stringify(output, null, 2));
    const envPath = resolve('.env.local');
    const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const values = {};
    if (release?.id) values.SWITCH_RELEASE_ROOM_ID = release.id;
    if (support?.id) values.SWITCH_SUPPORT_ROOM_ID = support.id;
    const lines = current.split(/\r?\n/).filter((line) => line && !Object.keys(values).some((key) => line.startsWith(`${key}=`)));
    lines.push(...Object.entries(values).map(([key, value]) => `${key}=${value}`));
    if (Object.keys(values).length > 0) {
      writeFileSync(envPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
      chmodSync(envPath, 0o600);
    }
  } catch (error) {
    console.error(`Switch discovery failed: ${error.code ?? 'ERROR'}: ${error.message}`);
    process.exitCode = 1;
  }
}
