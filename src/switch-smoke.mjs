/** Extract only the verified identity for one explicit, nonce-matched Switch message.
 * Never infer identity from usernames, membership UUIDs or a client-id prefix.
 */
export function matchSwitchChallenge(frame, releaseRoomId, nonce) {
  if (!frame || frame.event !== 'message' || frame.data?.room_id !== releaseRoomId) return null;
  const payload = frame.data?.payload;
  if (!payload || typeof payload.sender !== 'string' || !payload.sender) return null;
  if (typeof payload.body !== 'string' || !payload.body.includes(nonce)) return null;
  return {
    senderId: payload.sender,
    senderName: typeof payload.sender_name === 'string' ? payload.sender_name : null,
    addressed: payload.addressed === true,
    sequence: Number.isInteger(frame.id) ? frame.id : null
  };
}
