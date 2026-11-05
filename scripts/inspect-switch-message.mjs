import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { findChallengeInRoomContext } from '../src/switch-message-history.mjs';

// Read-only historical check. Does NOT register, connect, post, approve,
// mutate configuration, or collect credentials.
const nonce = process.argv[2];
if (!/^UNSEEN-CHECK-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonce ?? '')) {
  console.error('Usage: npm.cmd run inspect:switch -- UNSEEN-CHECK-<code-from-last-probe>');
  process.exitCode = 2;
} else {
  loadLocalEnv();
  const endpoint = process.env.SWITCH_BRIDGE_URL ?? discoverLocalSwitch()?.bridgeUrl;
  const report = { check: 'Switch release-room message history', room: 'release-room', messageInHistory: 'unknown', note: null };
  if (!endpoint || !process.env.SWITCH_AGENT_ID || !process.env.SWITCH_AGENT_API_KEY) {
    report.note = 'Gatekeeper credentials or local Core URL missing.';
    process.exitCode = 2;
  } else {
    const client = new SwitchClient({ bridgeUrl: endpoint, agentId: process.env.SWITCH_AGENT_ID, apiKey: process.env.SWITCH_AGENT_API_KEY });
    try {
      const rooms = operationList(await client.listRooms(), ['rooms', 'data', 'items']);
      const id = roomId(findRoomByExactName(rooms, 'release-room'));
      if (!id) {
        report.note = 'Gatekeeper cannot discover release-room.';
        process.exitCode = 2;
      } else {
        const observation = findChallengeInRoomContext(await client.operation('read_context', { room_id: id, limit: 150 }), nonce);
        report.messageInHistory = observation.found;
        report.mentionPresent = observation.mentionPresent;
        report.messagesScanned = observation.messagesScanned;
        report.historyTruncated = observation.truncated;
        if (observation.found) {
          report.observedSenderId = observation.senderId;
          report.observedSenderName = observation.senderName;
          report.note = 'Message recorded in release-room. If live probe did not see it, inspect addressing policy, room event delivery, and WebSocket receiver. An @mention in text alone does not prove addressed=true.';
        } else if (observation.truncated) {
          report.note = 'Code not found among the most recent messages; context was truncated. This result is inconclusive.';
          process.exitCode = 2;
        } else {
          report.note = 'This exact test message is not present in release-room history. Verify it was actually sent using the chat composer; printing the code in PowerShell does not send it.';
        }
      }
    } catch (error) {
      report.note = 'Authenticated Switch history lookup failed.';
      report.error = { code: error.code ?? 'ERROR', status: error.status ?? null };
      process.exitCode = 2;
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
