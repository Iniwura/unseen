import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGate } from '../src/gate.mjs';
import { LiveOrchestrator } from '../src/live-orchestrator.mjs';
import { createAllowlistedRunner } from '../src/runner.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { SwitchEventIngestor } from '../src/switch-ingest.mjs';
import { createJsonStore } from '../src/store.mjs';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';

loadLocalEnv();
const env = process.env;
const localSwitch = discoverLocalSwitch();
if (!env.SWITCH_BRIDGE_URL && localSwitch?.bridgeUrl) env.SWITCH_BRIDGE_URL = localSwitch.bridgeUrl;
if (!env.UNSEEN_CHECKOUT_ROOT && existsSync(resolve('.git'))) env.UNSEEN_CHECKOUT_ROOT = resolve('.');
const required = [
  'SWITCH_BRIDGE_URL', 'SWITCH_AGENT_ID', 'SWITCH_AGENT_API_KEY',
  'SWITCH_RELEASE_ROOM_ID', 'SWITCH_SUPPORT_ROOM_ID',
  'SWITCH_RELEASE_OWNER_ID', 'SWITCH_ENGINEERING_AGENT_ID',
  'SWITCH_INVESTIGATOR_AGENT_ID', 'SWITCH_CODING_AGENT_ID',
  'UNSEEN_CHECKOUT_ROOT'
];
const missing = required.filter((name) => !env[name]);
if (missing.length > 0) {
  console.error(`Missing live UNSEEN configuration: ${missing.join(', ')}`);
  console.error('Run npm run diagnose:switch for a grouped diagnostic.');
  process.exitCode = 2;
} else {
  const statePath = env.UNSEEN_STATE_PATH ?? '.unseen/state.json';
  const connectionStore = createJsonStore('.unseen/switch-connection.json');
  const eventStore = createJsonStore('.unseen/switch-events.json');
  const workflowStore = createJsonStore('.unseen/workflow.json');
  const liveStatusStore = createJsonStore(env.UNSEEN_LIVE_STATUS_PATH ?? '.unseen/live-status.json');
  liveStatusStore.save({ status: 'starting', evidence: 'live-switch', at: new Date().toISOString(), connectionId: null, cursor: null, generation: null, rooms: [] });
  const policyVersion = env.UNSEEN_POLICY_VERSION ?? '1';
  const gate = createGate({
    policyVersion,
    store: createJsonStore(statePath),
    authorizedHumans: (env.UNSEEN_AUTHORIZED_HUMANS ?? env.SWITCH_RELEASE_OWNER_ID).split(',').map((value) => value.trim()).filter(Boolean)
  });
  const client = new SwitchClient({
    bridgeUrl: env.SWITCH_BRIDGE_URL,
    agentId: env.SWITCH_AGENT_ID,
    apiKey: env.SWITCH_AGENT_API_KEY,
    connectionStore
  });
  const runner = createAllowlistedRunner({
    checkoutRoot: env.UNSEEN_CHECKOUT_ROOT,
    runnerId: env.UNSEEN_RUNNER_ID ?? 'unseen-live-runner',
    policyVersion,
    attestor: (report) => gate.runnerAttestation(report)
  });
  const ingestor = new SwitchEventIngestor({
    gate,
    agentId: env.SWITCH_AGENT_ID,
    selfSenderId: env.SWITCH_AGENT_ID,
    roomPolicies: {
      'release-room': { name: 'release-room', roomId: env.SWITCH_RELEASE_ROOM_ID, allowedRoles: ['engineering-agent', 'release-owner'] },
      'support-room': { name: 'support-room', roomId: env.SWITCH_SUPPORT_ROOM_ID, allowedRoles: ['evidence-investigator', 'coding-agent'] }
    },
    participants: {
      [env.SWITCH_RELEASE_OWNER_ID]: { kind: 'human', role: 'release-owner' },
      [env.SWITCH_ENGINEERING_AGENT_ID]: { kind: 'agent', role: 'engineering-agent' },
      [env.SWITCH_INVESTIGATOR_AGENT_ID]: { kind: 'agent', role: 'evidence-investigator' },
      [env.SWITCH_CODING_AGENT_ID]: { kind: 'agent', role: 'coding-agent' }
    },
    eventStore,
    onRemediation: (command) => command,
    onCommand: (command) => command
  });
  const orchestrator = new LiveOrchestrator({
    gate,
    runner,
    client,
    ingestor,
    rooms: { release: env.SWITCH_RELEASE_ROOM_ID, support: env.SWITCH_SUPPORT_ROOM_ID },
    mentions: {
      'release-owner': env.SWITCH_RELEASE_OWNER_MENTION ?? '@release-owner',
      engineering: env.SWITCH_ENGINEERING_MENTION ?? '@engineering-agent',
      investigator: env.SWITCH_INVESTIGATOR_MENTION ?? '@evidence-investigator',
      'coding-agent': env.SWITCH_CODING_MENTION ?? '@coding-agent'
    },
    stateStore: workflowStore
  });

  async function onFrame(frame, connection) {
    if (frame.event === 'connection_state') liveStatusStore.save({ status: 'connected', evidence: 'live-switch', at: new Date().toISOString(), connectionId: connection.connectionId, cursor: connection.cursor, generation: connection.generation, rooms: connection.rooms });
    if (frame.event === 'gap') liveStatusStore.save({ status: 'gap', evidence: 'live-switch', at: new Date().toISOString(), connectionId: connection.connectionId, cursor: connection.cursor, generation: connection.generation, rooms: connection.rooms });
    const result = await orchestrator.handleFrame(frame, connection);
    if (frame.event === 'connection_state') await orchestrator.resumePending();
    if (result?.requiresContextReload) {
      await orchestrator.recoverGap(connection);
      liveStatusStore.save({ status: 'connected', evidence: 'live-switch', at: new Date().toISOString(), connectionId: connection.connectionId, cursor: connection.cursor, generation: connection.generation, rooms: connection.rooms });
      return;
    }
    if (result?.accepted) console.log(JSON.stringify({ accepted: result.type, eventId: result.eventId, status: result.decision?.status ?? null }));
  }

  try {
    await client.health();
    console.log('Switch bridge health check passed.');
    console.log(`UNSEEN listening on release-room=${env.SWITCH_RELEASE_ROOM_ID} support-room=${env.SWITCH_SUPPORT_ROOM_ID}`);
    await client.runResilient({
      rooms: [env.SWITCH_RELEASE_ROOM_ID, env.SWITCH_SUPPORT_ROOM_ID],
      scope: 'all',
      filter: 'all',
      onFrame,
      onConnection: ({ status, connection, closeResult, error }) => {
        const safeError = error ? { code: error.code ?? 'CONNECT_ERROR', message: error.message } : null;
        liveStatusStore.save({ status, evidence: 'live-switch', at: new Date().toISOString(), connectionId: connection?.connectionId ?? null, cursor: connection?.cursor ?? null, generation: connection?.generation ?? null, rooms: connection?.rooms ?? [], closeCode: closeResult?.code ?? null, evictionCode: closeResult?.evictionCode ?? null, error: safeError });
      },
      onError: (error) => console.error(`[switch] ${error.code ?? 'ERROR'}: ${error.message}`)
    });
  } catch (error) {
    liveStatusStore.save({ status: 'failed', evidence: 'live-switch', at: new Date().toISOString(), error: { code: error.code ?? 'BRIDGE_ERROR', message: error.message } });
    console.error(`[live-bridge] ${error.code ?? 'ERROR'}: ${error.message}`);
    process.exitCode = 1;
  }
}
