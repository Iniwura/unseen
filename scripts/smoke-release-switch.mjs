import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createGate } from '../src/gate.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { matchReleaseProofRequest } from '../src/switch-release-proof.mjs';
import { createJsonStore } from '../src/store.mjs';

// Only proves a Switch-authenticated human release request causes a durable,
// fail-closed PENDING_EVIDENCE decision. No runner, evidence, remediation,
// approval, execution, registration or deployment actions are available here.
loadLocalEnv();
const endpoint = process.env.SWITCH_BRIDGE_URL ?? discoverLocalSwitch()?.bridgeUrl;
const agentId = process.env.SWITCH_AGENT_ID;
const apiKey = process.env.SWITCH_AGENT_API_KEY;
const senderId = process.env.SWITCH_RELEASE_OWNER_ID;
const report = {
  check: 'UNSEEN authenticated live release gate',
  connection: 'not-checked',
  owner: senderId ? 'configured' : 'missing',
  decision: 'not-created',
  switchReply: 'not-sent',
  result: 'not-proven'
};
const reportAndExit = (status) => {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = status;
};
if (!endpoint || !agentId || !apiKey || !senderId || !/^@[^\\s]+:[^\\s]+$/.test(senderId)) {
  report.error = 'Missing Gatekeeper credentials or exact, verified opaque SWITCH_RELEASE_OWNER_ID; never guess it from a display name.';
  reportAndExit(2);
} else {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  const sha = String(git.stdout ?? '').trim();
  if (git.status !== 0 || !/^[a-f0-9]{40}$/i.test(sha)) {
    report.error = 'The current directory must be a Git checkout with a valid HEAD SHA.';
    reportAndExit(2);
  } else {
    const client = new SwitchClient({ bridgeUrl: endpoint, agentId, apiKey });
    const nonce = randomUUID();
    const decisionId = `switch-live-${nonce}`;
    const stateStore = createJsonStore('.unseen/live-proof-gate.json');
    const gate = createGate({ authorizedHumans: [senderId], store: stateStore });
    const proofStore = createJsonStore('.unseen/live-proof.json');
    let ready = false;
    let finished = false;
    let finish;
    const completion = new Promise((resolve) => { finish = resolve; });
    const complete = (outcome) => {
      if (finished) return;
      finished = true;
      finish(outcome);
    };
    try {
      const rooms = operationList(await client.listRooms(), ['rooms', 'data', 'items']);
      const release = roomId(findRoomByExactName(rooms, 'release-room'));
      const support = roomId(findRoomByExactName(rooms, 'support-room'));
      if (!release || !support) throw Object.assign(new Error('Required rooms are not visible'), { code: 'ROOMS_MISSING' });
      const connection = await client.connect({
        rooms: [release, support],
        scope: 'all',
        filter: 'all',
        onFrame: async (frame, conn) => {
          if (frame.event === 'connection_state') {
            const granted = frame.data?.rooms ?? [];
            if (!Array.isArray(granted) || !granted.includes(release) || !granted.includes(support)) {
              report.connection = 'rooms-not-subscribed';
              complete('not-ready');
              return;
            }
            ready = true;
            report.connection = 'authenticated-both-rooms';
            console.log('Switch is connected. Post this EXACT message in release-room from your linked Mattermost user account:');
            console.log(`@unseen-gatekeeper UNSEEN/1 ${JSON.stringify({ kind: 'release_request', decisionId, sha })}`);
            console.log('This is a fail-closed integration proof, not a deployment or full recovery demo.');
            return;
          }
          if (frame.event === 'gap') {
            report.connection = 'event-gap-fail-closed';
            complete('gap');
            return;
          }
          if (frame.event !== 'message' || !ready) return;
          let matched;
          try {
            matched = matchReleaseProofRequest(frame, { roomId: release, senderId, decisionId, sha });
          } catch (error) {
            report.messageError = error?.code ?? 'INVALID_COMMAND';
            complete('invalid-command');
            return;
          }
          if (!matched) return;
          try {
            const decision = gate.begin(sha, decisionId);
            if (decision.status !== 'PENDING_EVIDENCE' || decision.approved || decision.executed) {
              throw new Error('Unexpected non-pending gate state');
            }
            report.decision = 'persisted-pending-evidence';
            report.decisionId = decision.id;
            report.sha = decision.sha;
            report.eventId = Number.isSafeInteger(frame.id) ? frame.id : null;
            const reply = await client.postMessage(release,
              `UNSEEN LIVE GATE: ${decision.id} is PENDING_EVIDENCE for ${sha}. Engineering and support proof are MISSING. Approval and execution are prohibited. No deployment occurred.`);
            if (reply?.ok !== true) throw new Error('Switch did not confirm posting the live gate decision');
            report.switchReply = 'confirmed-posted';
            report.result = 'live-fail-closed-verified';
            proofStore.save({ result: report.result, decisionId, sha, eventId: report.eventId, status: decision.status, source: 'authenticated-switch-event', replyPosted: true });
            complete('verified');
          } catch (error) {
            report.error = error?.code ?? 'GATE_OR_REPLY_FAILED';
            complete('error');
          }
        },
        onError: (error) => { report.connectionErrorCode = error?.code ?? 'WS_ERROR'; }
      });
      const timeout = setTimeout(() => complete('timeout'), 120_000);
      const outcome = await Promise.race([
        completion,
        connection.closedPromise.then(() => 'disconnected')
      ]);
      clearTimeout(timeout);
      connection.close();
      report.outcome = outcome;
      if (outcome === 'timeout') report.result = 'no-matching-addressed-release-request-observed';
      reportAndExit(outcome === 'verified' ? 0 : 2);
    } catch (error) {
      report.error = error?.code ?? 'LIVE_CONNECTION_ERROR';
      reportAndExit(2);
    }
  }
}
