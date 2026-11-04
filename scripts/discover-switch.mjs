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
    if (Array.isArray(value)) return value;
    for (const name of names) {
      if (Array.isArray(value?.[name])) return value[name];
      if (value?.[name] && typeof value[name] === 'object') {
        const nested = listFrom(value[name], names);
        if (nested.length > 0) return nested;
      }
    }
    return [];
  };
  const findRoom = (rooms, name) => rooms.find((room) => [room.name, room.display_name, room.displayName, room.slug].filter(Boolean).some((value) => String(value).toLowerCase() === name));
  const participantId = (participant) => participant?.id ?? participant?.participant_id ?? participant?.participantId ?? participant?.user_id ?? participant?.userId ?? null;
  const participantLabels = (participant) => [participant?.name, participant?.display_name, participant?.displayName, participant?.username, participant?.handle, participant?.slug, participant?.agent_name, participant?.agentName].filter(Boolean).map((value) => String(value).toLowerCase());
  const exactParticipant = (allParticipants, requestedName) => {
    if (!requestedName) return null;
    const matches = [...new Map(allParticipants
      .filter((participant) => participantId(participant) && participantLabels(participant).includes(requestedName.toLowerCase()))
      .map((participant) => [participantId(participant), participant])).values()];
    return matches.length === 1 ? participantId(matches[0]) : null;
  };
  try {
    await client.health();
    const roomResponse = await client.listRooms();
    const rooms = listFrom(roomResponse, ['rooms', 'data', 'items']);
    const release = findRoom(rooms, 'release-room');
    const support = findRoom(rooms, 'support-room');
    const participants = {};
    const rawParticipants = [];
    for (const room of [release, support].filter(Boolean)) {
      const response = await client.listParticipants(room.id);
      const roomParticipants = listFrom(response, ['participants', 'users', 'members', 'data', 'items']);
      rawParticipants.push(...roomParticipants);
      participants[room.name ?? room.slug ?? room.id] = redact(roomParticipants);
    }
    const participantNames = {
      engineering: env.SWITCH_ENGINEERING_AGENT_NAME ?? 'ini-unseen-engineer',
      investigator: env.SWITCH_INVESTIGATOR_NAME,
      coding: env.SWITCH_CODING_AGENT_NAME,
      releaseOwner: env.SWITCH_RELEASE_OWNER_NAME
    };
    const resolvedParticipants = {
      engineering: exactParticipant(rawParticipants, participantNames.engineering),
      investigator: exactParticipant(rawParticipants, participantNames.investigator),
      coding: exactParticipant(rawParticipants, participantNames.coding),
      releaseOwner: exactParticipant(rawParticipants, participantNames.releaseOwner)
    };
    const output = { agentId: env.SWITCH_AGENT_ID, bridgeUrl, rooms: redact(rooms), selectedRooms: redact({ release, support }), participants, resolvedParticipants };
    console.log(JSON.stringify(output, null, 2));
    const envPath = resolve('.env.local');
    const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const values = {};
    if (release?.id) values.SWITCH_RELEASE_ROOM_ID = release.id;
    if (support?.id) values.SWITCH_SUPPORT_ROOM_ID = support.id;
    if (resolvedParticipants.engineering) values.SWITCH_ENGINEERING_AGENT_ID = resolvedParticipants.engineering;
    if (resolvedParticipants.investigator) values.SWITCH_INVESTIGATOR_AGENT_ID = resolvedParticipants.investigator;
    if (resolvedParticipants.coding) values.SWITCH_CODING_AGENT_ID = resolvedParticipants.coding;
    if (resolvedParticipants.releaseOwner) values.SWITCH_RELEASE_OWNER_ID = resolvedParticipants.releaseOwner;
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
