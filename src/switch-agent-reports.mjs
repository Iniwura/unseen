/**
 * Identify exact existing Switch room messages, without elevating the
 * sender to a trusted role. A message's sender_name is display metadata.
 * Operator must compare identities with authenticated agent details before
 * configuring authorization.
 */
export function inspectAgentReport(response, { expectedName, candidateSha, phrases }) {
  let payload = response;
  for (let i = 0; i < 6 && payload && typeof payload === 'object' &&
       !Array.isArray(payload.threads) && Object.hasOwn(payload, 'result'); i += 1) {
    payload = payload.result;
  }
  if (!Array.isArray(payload?.threads)) throw new Error('Switch room context has no threads');
  const messages = payload.threads
    .flatMap((thread) => [thread?.root, ...(Array.isArray(thread?.replies) ? thread.replies : [])])
    .filter((entry) => entry?.kind === 'message');
  const matches = messages.filter((m) =>
    typeof m.sender === 'string' && m.sender.length > 0 &&
    typeof m.sender_name === 'string' && m.sender_name.toLowerCase() === expectedName.toLowerCase() &&
    typeof m.body === 'string' && m.body.includes(candidateSha) &&
    phrases.every((fragment) => m.body.includes(fragment))
  );
  return {
    status: matches.length === 1 ? 'observed-not-authorized' : matches.length === 0 ? 'not-found' : 'ambiguous',
    expectedName,
    matches: matches.length,
    messagesScanned: messages.length,
    historyTruncated: payload.truncated === true,
    observed: matches.length === 1 ? {
      senderId: matches[0].sender,
      senderName: matches[0].sender_name,
      messageId: matches[0].id ?? null,
      timestamp: matches[0].timestamp ?? null
    } : null
  };
}
