import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';

// Read-only Switch doctor: never registers agents, posts messages, modifies
// rooms, writes credentials, or guesses trusted event sender identities.
loadLocalEnv();
const local = discoverLocalSwitch();
const endpoint = process.env.SWITCH_BRIDGE_URL ?? local?.bridgeUrl;
const missing = ['SWITCH_AGENT_ID', 'SWITCH_AGENT_API_KEY'].filter((name) => !process.env[name]);
const report = {
  checker: 'UNSEEN Switch read-only readiness',
  core: 'not-checked',
  gatekeeperCredentials: missing.length ? 'missing' : 'configured',
  gatekeeperIdentity: 'not-checked',
  releaseRoom: 'not-checked',
  supportRoom: 'not-checked',
  addressing: 'not-checked',
  roleSenderBindings: 'not-verified',
  fullDemoReady: false,
  next: null
};
const print = () => console.log(JSON.stringify(report, null, 2));
if (!endpoint || missing.length) {
  report.next = `Local configuration is incomplete: ${[...(!endpoint ? ['SWITCH_BRIDGE_URL'] : []), ...missing].join(', ')}. Do not re-register.`;
  print();
  process.exitCode = 2;
} else {
  const client = new SwitchClient({ bridgeUrl: endpoint, agentId: process.env.SWITCH_AGENT_ID, apiKey: process.env.SWITCH_AGENT_API_KEY });
  let step = 'health';
  try {
    await client.health();
    report.core = 'reachable';
    step = 'get_agent_detail';
    const detailResponse = await client.operation('get_agent_detail', { agent_id: process.env.SWITCH_AGENT_ID });
    const details = detailResponse?.result ?? detailResponse;
    if (details?.id !== process.env.SWITCH_AGENT_ID) {
      throw Object.assign(new Error('Authenticated agent identity mismatch'), { code: 'AGENT_MISMATCH' });
    }
    report.gatekeeperIdentity = 'authenticated';
    const addressing = details?.addressing?.policy;
    report.addressing = typeof addressing === 'string' ? addressing : 'unknown';
    step = 'list_rooms';
    const roomResponse = await client.listRooms();
    const rooms = operationList(roomResponse, ['rooms', 'data', 'items']);
    for (const [name, field] of [['release-room', 'releaseRoom'], ['support-room', 'supportRoom']]) {
      const room = findRoomByExactName(rooms, name);
      if (!roomId(room)) {
        report[field] = 'not-visible-to-gatekeeper';
        continue;
      }
      try {
        const response = await client.listParticipants(roomId(room));
        const members = operationList(response, ['participants', 'users', 'members', 'data', 'items']);
        report[field] = members.some((member) => (member.agent_id ?? member.id) === process.env.SWITCH_AGENT_ID)
          ? 'authenticated-member'
          : 'member-not-confirmed';
      } catch (error) {
        report[field] = `membership-check-http-${error?.status ?? 'failed'}`;
      }
    }
    const roles = ['SWITCH_RELEASE_OWNER_ID', 'SWITCH_ENGINEERING_AGENT_ID', 'SWITCH_INVESTIGATOR_AGENT_ID', 'SWITCH_CODING_AGENT_ID'];
    report.roleSenderBindings = roles.every((name) => Boolean(process.env[name]))
      ? 'configured-not-verified-as-event-senders'
      : 'missing-sender-bindings';
    const roomsOk = report.releaseRoom === 'authenticated-member' && report.supportRoom === 'authenticated-member';
    if (!roomsOk) {
      report.next = 'Both Gatekeeper room memberships must be verified. Check Switch invites; do not re-register or guess IDs.';
      process.exitCode = 2;
    } else if (['owner_only', 'owner_and_owner_agents'].includes(report.addressing)) {
      report.next = 'Gatekeeper is bootstrap-owned and may reject your admin messages under this addressing policy. Verify owner-authorized policy before live release events.';
      process.exitCode = 2;
    } else {
      report.next = 'Room access looks ready. Next verify WebSocket connection_state, addressed human event, and exact opaque sender identities.';
    }
    print();
  } catch (error) {
    report.next = 'Authenticated operation failed. No credentials or room state were changed.';
    report.error = { step, code: error?.code ?? 'ERROR', status: error?.status ?? null };
    print();
    process.exitCode = 2;
  }
}
