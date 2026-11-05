/** Safely add one exact human account in one room without widening any other policy. */
export function buildScopedGatekeeperPolicy(existingPolicy, { roomId, externalUserRowId }) {
  if (!existingPolicy || !Array.isArray(existingPolicy.rules) || existingPolicy.rules.length === 0) {
    throw new Error('Refusing to modify an unrestricted, absent or malformed addressing policy');
  }
  if (typeof roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(roomId)
    || typeof externalUserRowId !== 'string' || !/^[0-9a-f-]{36}$/i.test(externalUserRowId)) {
    throw new Error('Explicit room and verified external-user row UUIDs are required');
  }
  const rules = structuredClone(existingPolicy.rules);
  const alreadyAllowed = rules.some((r) => Array.isArray(r.rooms)
    && r.rooms.includes(roomId)
    && Array.isArray(r.users) && r.users.includes(externalUserRowId)
    && (r.room_groups === '*' || (Array.isArray(r.room_groups) && r.room_groups.length === 0)));
  if (alreadyAllowed) return { policy: { rules }, changed: false };
  rules.push({
    rooms: [roomId],
    room_groups: '*',
    users: [externalUserRowId],
    agents: [],
    owner: false,
    owner_agents: false,
    platform: false
  });
  return { policy: { rules }, changed: true };
}
