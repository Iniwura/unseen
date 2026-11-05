import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { matchSwitchChallenge } from '../src/switch-smoke.mjs';

// Diagnostic only: no mutation, registration, message sending, credential output,
// gate execution, token persistence, or trusted-role auto-binding.
loadLocalEnv();
const env = process.env;
const url = env.SWITCH_BRIDGE_URL ?? discoverLocalSwitch()?.bridgeUrl;
const report = {
  gatekeeper: 'not-checked',
  websocket: 'not-checked',
  releaseRoom: 'not-checked',
  supportRoom: 'not-checked',
  addressedMessage: 'not-observed',
  trustedSenderBound: false
};
function printAndExit(code) {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = code;
}
if (!url || !env.SWITCH_AGENT_ID || !env.SWITCH_AGENT_API_KEY) {
  report.gatekeeper = 'missing-local-configuration';
  printAndExit(2);
} else {
  const client = new SwitchClient({ bridgeUrl: url, agentId: env.SWITCH_AGENT_ID, apiKey: env.SWITCH_AGENT_API_KEY });
  try {
    await client.health();
    const rooms = operationList(await client.listRooms(), ['rooms', 'data', 'items']);
    const release = roomId(findRoomByExactName(rooms, 'release-room'));
    const support = roomId(findRoomByExactName(rooms, 'support-room'));
    report.gatekeeper = 'authenticated';
    if (!release || !support) {
      report.websocket = 'not-started';
      report.releaseRoom = release ? 'visible' : 'not-visible';
      report.supportRoom = support ? 'visible' : 'not-visible';
      printAndExit(2);
    } else {
      const nonce = `UNSEEN-CHECK-${randomUUID()}`;
      let ready = false;
      let completed = false;
      let finish;
      const finished = new Promise((resolve) => { finish = resolve; });
      const complete = (result) => {
        if (completed) return;
        completed = true;
        finish(result);
      };
      const connection = await client.connect({
        rooms: [release, support],
        scope: 'all',
        filter: 'all',
        onFrame: (frame, conn) => {
          if (frame.event === 'refused') {
            report.websocket = `refused-${frame.data?.status ?? 'unknown'}`;
            complete('refused');
            return;
          }
          if (frame.event === 'connection_state') {
            const claimed = Array.isArray(frame.data?.rooms) ? frame.data.rooms : [];
            report.websocket = 'authenticated-connection-state';
            report.releaseRoom = claimed.includes(release) ? 'subscribed' : 'not-subscribed';
            report.supportRoom = claimed.includes(support) ? 'subscribed' : 'not-subscribed';
            if (report.releaseRoom !== 'subscribed' || report.supportRoom !== 'subscribed') {
              complete('missing-rooms');
              return;
            }
            ready = true;
            console.log('Both rooms subscribed. In Switch release-room, send exactly this message:');
            console.log(`@unseen-gatekeeper ${nonce}`);
            console.log('The probe will show whether the message was delivered and addressed. Do not post a release_request.');
            return;
          }
          if (frame.event === 'message' && ready) {
            const matched = matchSwitchChallenge(frame, release, nonce);
            if (!matched) return;
            report.addressedMessage = matched.addressed ? 'verified-addressed' : 'received-but-not-addressed';
            // The sender is copied verbatim from authenticated Switch traffic.
            // It is informational only, never written to a trusted role binding.
            report.observedSenderId = matched.senderId;
            report.observedSenderName = matched.senderName;
            report.observedSequence = matched.sequence;
            complete(matched.addressed ? 'verified' : 'unaddressed');
          }
        },
        onError: (error) => {
          report.websocketErrorCode = error?.code ?? 'WS_ERROR';
          const status = /^Unexpected server response: (\\d{3})$/.exec(String(error?.message ?? ''));
          if (status) report.websocketHttpStatus = Number(status[1]);
        }
      });
      const timeout = setTimeout(() => complete('timeout'), 120_000);
      const outcome = await Promise.race([
        finished,
        connection.closedPromise.then(({ code, evictionCode }) => {
          report.websocketClose = { code, evictionCode: evictionCode ?? null };
          return 'socket-closed';
        })
      ]);
      clearTimeout(timeout);
      connection.close();
      report.outcome = outcome;
      printAndExit(outcome === 'verified' ? 0 : 2);
    }
  } catch (error) {
    const handshake = /^Unexpected server response: (\\d{3})$/.exec(String(error?.message ?? ''));
    report.error = {
      code: error?.code ?? (handshake ? 'WS_HANDSHAKE_REFUSED' : 'ERROR'),
      status: error?.status ?? (handshake ? Number(handshake[1]) : null)
    };
    printAndExit(2);
  }
}
