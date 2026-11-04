import { createGate } from '../src/gate.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { SwitchEventIngestor } from '../src/switch-ingest.mjs';
import { createJsonStore } from '../src/store.mjs';

const required = [
  'SWITCH_BRIDGE_URL', 'SWITCH_AGENT_ID', 'SWITCH_AGENT_API_KEY',
  'SWITCH_RELEASE_ROOM_ID', 'SWITCH_SUPPORT_ROOM_ID',
  'SWITCH_RELEASE_OWNER_ID', 'SWITCH_ENGINEERING_AGENT_ID', 'SWITCH_INVESTIGATOR_AGENT_ID'
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing live Switch configuration: ${missing.join(', ')}`);
  process.exitCode = 2;
} else {
  const statePath = process.env.UNSEEN_STATE_PATH ?? '.unseen/state.json';
  const gate = createGate({
    store: createJsonStore(statePath),
    authorizedHumans: (process.env.UNSEEN_AUTHORIZED_HUMANS ?? process.env.SWITCH_RELEASE_OWNER_ID).split(',').map((value) => value.trim()).filter(Boolean)
  });
  const client = new SwitchClient({
    bridgeUrl: process.env.SWITCH_BRIDGE_URL,
    agentId: process.env.SWITCH_AGENT_ID,
    apiKey: process.env.SWITCH_AGENT_API_KEY,
    connectionStore: createJsonStore('.unseen/switch-connection.json')
  });
  const ingestor = new SwitchEventIngestor({
    gate,
    agentId: process.env.SWITCH_AGENT_ID,
    roomPolicies: {
      'release-room': { name: 'release-room', roomId: process.env.SWITCH_RELEASE_ROOM_ID, allowedRoles: ['engineering-agent', 'release-owner'] },
      'support-room': { name: 'support-room', roomId: process.env.SWITCH_SUPPORT_ROOM_ID, allowedRoles: ['evidence-investigator', 'coding-agent'] }
    },
    participants: {
      [process.env.SWITCH_RELEASE_OWNER_ID]: { kind: 'human', role: 'release-owner' },
      [process.env.SWITCH_ENGINEERING_AGENT_ID]: { kind: 'agent', role: 'engineering-agent' },
      [process.env.SWITCH_INVESTIGATOR_AGENT_ID]: { kind: 'agent', role: 'evidence-investigator' },
      ...(process.env.SWITCH_CODING_AGENT_ID ? { [process.env.SWITCH_CODING_AGENT_ID]: { kind: 'agent', role: 'coding-agent' } } : {})
    },
    eventStore: createJsonStore('.unseen/switch-events.json')
  });
  const connection = await client.connect({
    rooms: [process.env.SWITCH_RELEASE_ROOM_ID, process.env.SWITCH_SUPPORT_ROOM_ID],
    scope: 'all',
    filter: 'all',
    onFrame: async (frame, authenticatedConnection) => {
      const result = ingestor.handleFrame(frame, authenticatedConnection);
      if (result?.requiresContextReload) {
        console.warn('Switch reported a cursor gap; reload room context before taking action.');
      } else if (result?.accepted) {
        console.log(JSON.stringify({ accepted: result.type, eventId: result.eventId, status: result.decision?.status ?? null }));
      }
    },
    onError: (error) => console.error(`[switch] ${error.code ?? 'ERROR'}: ${error.message}`)
  });
  console.log(`UNSEEN connected to Switch agent ${connection.agentId}; listening to release-room and support-room.`);
}
