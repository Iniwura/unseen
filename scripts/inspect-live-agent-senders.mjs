import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.mjs';
import { discoverLocalSwitch } from '../src/local-switch.mjs';
import { SwitchClient } from '../src/switch-client.mjs';
import { operationList, findRoomByExactName, roomId } from '../src/switch-discovery.mjs';
import { inspectAgentReport } from '../src/switch-agent-reports.mjs';

// Read-only on Switch; local Git HEAD read only. No registration, no chat posts,
// no permission changes, no role bindings, no evidence/approvals or deployment.
loadLocalEnv();
const candidateSha = 'a921b8a5d51c0a8a58fcdcd59c0963ac012d8627';
const report = {
  check: 'inspect actual Switch agent report senders',
  candidateSha,
  authorizedRolesModified: false,
  status: 'not-checked',
  rooms: {}
};
const fail = (code) => {
  report.status = 'incomplete';
  report.errorCode = code;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
};
const endpoint = process.env.SWITCH_BRIDGE_URL ?? discoverLocalSwitch()?.bridgeUrl;
if (!endpoint || !process.env.SWITCH_AGENT_ID || !process.env.SWITCH_AGENT_API_KEY) {
  fail('GATEKEEPER_CONFIG_MISSING');
} else {
  const checked = spawnSync('git', ['-C', resolve('.unseen/live-checkout'), 'rev-parse', 'HEAD'], {
    encoding: 'utf8', windowsHide: true
  });
  if (checked.status !== 0 || String(checked.stdout ?? '').trim() !== candidateSha) {
    fail('CANDIDATE_SHA_CHANGED');
  } else {
    try {
      const client = new SwitchClient({ bridgeUrl: endpoint, agentId: process.env.SWITCH_AGENT_ID, apiKey: process.env.SWITCH_AGENT_API_KEY });
      const rooms = operationList(await client.listRooms(), ['rooms', 'data', 'items']);
      for (const item of [
        { name: 'release-room', agent: 'ini-unseen-engineer',
          phrases: ['Live checkout verification complete', '60 !== 50'] },
        { name: 'support-room', agent: 'switch-buddy-admin',
          phrases: ['Conclusion for candidate', 'sw_dcb1a077ada96e36be62e334a753ff57'] }
      ]) {
        const id = roomId(findRoomByExactName(rooms, item.name));
        if (!id) throw Object.assign(new Error('Missing room'), { code: 'ROOM_NOT_VISIBLE' });
        const context = await client.operation('read_context', { room_id: id, limit: 150 });
        report.rooms[item.name] = inspectAgentReport(context, {
          expectedName: item.agent, candidateSha, phrases: item.phrases
        });
      }
      const observations = Object.values(report.rooms);
      report.status = observations.every((entry) => entry.status === 'observed-not-authorized') ? 'reports-located' : 'some-reports-not-located';
      report.next = 'Observed sender IDs are read-only candidates; they are NOT role bindings. Explicit authenticated agent verification is still required.';
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'reports-located') process.exitCode = 2;
    } catch (error) {
      fail(error.code ?? 'SWITCH_HISTORY_READ_FAILED');
    }
  }
}
