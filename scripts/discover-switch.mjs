import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SwitchClient } from '../src/switch-client.mjs';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';

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
  const participantId = (participant) => participant?.id ?? participant?.participant_id ?? participant?.participantId ?? participant?.agent_id ?? participant?.agentId ?? participant?.user_id ?? participant?.userId ?? null;
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
    const rooms = operationList(roomResponse, ['rooms', 'data', 'items']);
    const release = findRoomByExactName(rooms, 'release-room');
    const support = findRoomByExactName(rooms, 'support-room');
    if (!roomId(release) || !roomId(support)) {
      throw new Error(`Gatekeeper cannot discover both rooms (visible=${rooms.length}, release=${Boolean(roomId(release))}, support=${Boolean(roomId(support))}). Verify Gatekeeper membership and workspace; do not guess IDs.`);
    }
    const participants = {};
    const rawParticipants = [];
    for (const room of [release, support]) {
      // The room-specific endpoint does not require a live WebSocket claim.
      // It independently verifies membership for the Gatekeeper API key.
      const response = await client.listParticipants(roomId(room));
      const roomParticipants = operationList(response, ['participants', 'users', 'members', 'data', 'items']);
      rawParticipants.push(...roomParticipants);
      participants[room.name ?? room.slug ?? roomId(room)] = redact(roomParticipants);
    }
    const participantNames = {
      engineering: env.SWITCH_ENGINEERING_AGENT_NAME ?? 'ini-unseen-engineer',
      investigator: env.SWITCH_INVESTIGATOR_NAME,
      coding: env.SWITCH_CODING_AGENT_NAME,
      releaseOwner: env.SWITCH_RELEASE_OWNER_NAME
    };
    // These are account/roster IDs, NOT authenticated WebSocket payload.sender IDs.
    // Display them as informational matches only; never use them for gate authorization.
    const rosterMatches = {
      engineering: exactParticipant(rawParticipants, participantNames.engineering),
      investigator: exactParticipant(rawParticipants, participantNames.investigator),
      coding: exactParticipant(rawParticipants, participantNames.coding),
      releaseOwner: exactParticipant(rawParticipants, participantNames.releaseOwner)
    };
    const output = { agentId: env.SWITCH_AGENT_ID, bridgeUrl, rooms: redact(rooms), selectedRooms: redact({ release, support }), participants, rosterMatches, trustedSenderBindings: 'not-derived-from-room-roster' };
    console.log(JSON.stringify(output, null, 2));
    console.log('Sender role IDs were not populated: roster UUIDs are not Switch event sender IDs. Bind roles only to independently verified opaque payload.sender identities.');
    const envPath = resolve('.env.local');
    const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    const values = {};
    if (roomId(release)) values.SWITCH_RELEASE_ROOM_ID = roomId(release);
    if (roomId(support)) values.SWITCH_SUPPORT_ROOM_ID = roomId(support);
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
