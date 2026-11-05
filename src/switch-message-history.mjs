/** Search Switch's read_context room timeline without trusting display names as identities. */
export function findChallengeInRoomContext(response, nonce) {
  let data = response;
  for (let depth = 0; depth < 6 && data && typeof data === 'object' && !Array.isArray(data) && !Array.isArray(data.threads) && Object.hasOwn(data, 'result'); depth += 1) {
    data = data.result;
  }
  if (!data || !Array.isArray(data.threads)) {
    throw new Error('Unexpected Switch read_context response: threads missing');
  }
  const messages = data.threads.flatMap((thread) => [thread?.root, ...(Array.isArray(thread?.replies) ? thread.replies : [])]).filter((entry) => entry?.kind === 'message');
  const found = messages.find((entry) => typeof entry.body === 'string' && entry.body.includes(nonce));
  return {
    found: Boolean(found),
    truncated: data.truncated === true,
    messagesScanned: messages.length,
    mentionPresent: Boolean(found && /@unseen-gatekeeper\b/i.test(found.body)),
    // These values are observed only, never saved into a trusted sender allowlist.
    senderId: found && typeof found.sender === 'string' ? found.sender : null,
    senderName: found && typeof found.sender_name === 'string' ? found.sender_name : null
  };
}
