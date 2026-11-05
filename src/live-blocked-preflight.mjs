import { parseUnseenMessage } from './switch-ingest.mjs';
import { inspectAgentReport } from './switch-agent-reports.mjs';

export const originalCandidateSha = 'a921b8a5d51c0a8a58fcdcd59c0963ac012d8627';

export const evidenceActors = [
  { room: 'release-room', name: 'ini-unseen-engineer', key: 'SWITCH_ENGINEERING_AGENT_ID',
    phrases: ['Live checkout verification complete', '60 !== 50'] },
  { room: 'support-room', name: 'switch-buddy-admin', key: 'SWITCH_INVESTIGATOR_AGENT_ID',
    phrases: ['Conclusion for candidate', 'sw_dcb1a077ada96e36be62e334a753ff57'] }
];

export function roomMessages(response) {
  let data = response;
  for (let depth = 0; depth < 6 && data && typeof data === 'object' &&
    !Array.isArray(data.threads) && Object.hasOwn(data, 'result'); depth++) {
    data = data.result;
  }
  if (!Array.isArray(data?.threads)) throw new Error('Switch room context has no threads');
  return data.threads.flatMap((thread) => [thread?.root,
    ...(Array.isArray(thread?.replies) ? thread.replies : [])])
    .filter((m) => m?.kind === 'message');
}

export function validatedPriorOwner(response, priorProof, configuredOwner = null) {
  if (priorProof?.result !== 'live-fail-closed-verified' ||
      !/^switch-live-[0-9a-f-]{36}$/i.test(priorProof.decisionId ?? '') ||
      !/^[0-9a-f]{40}$/.test(priorProof.sha ?? '') ||
      priorProof.source !== 'authenticated-switch-event' || priorProof.replyPosted !== true) {
    throw new Error('Previous authenticated Switch release proof is missing or malformed');
  }
  const matches = roomMessages(response).filter((message) => {
    if (typeof message.sender !== 'string' || !message.sender.startsWith('@') ||
        message.sender_name !== 'user' || typeof message.body !== 'string') return false;
    const parsed = parseUnseenMessage(message.body);
    return parsed?.kind === 'release_request' &&
      parsed?.decisionId === priorProof.decisionId && parsed?.sha === priorProof.sha;
  });
  if (matches.length !== 1) throw new Error('Could not uniquely match the previously verified human release request in Switch history');
  const sender = matches[0].sender;
  if (configuredOwner && configuredOwner !== sender) {
    throw new Error('Configured release owner conflicts with the previous real Switch request sender');
  }
  return sender;
}

export function requireBoundAgentReport(response, actor, expectedSender) {
  const report = inspectAgentReport(response, {
    expectedName: actor.name, candidateSha: originalCandidateSha, phrases: actor.phrases
  });
  if (report.status !== 'observed-not-authorized' ||
      report.observed?.senderId !== expectedSender) {
    throw new Error('Agent sender is not the same report source as the authorized Switch binding');
  }
  return { room: actor.room, agent: actor.name, matched: true };
}
