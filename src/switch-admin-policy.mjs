/** Safely add one exact human account in one room without widening any other policy. */
export function buildScopedGatekeeperPolicy(existingPolicy, { roomId, externalUserRowId }) {
  if (!existingPolicy || !Array.isArray(existingPolicy.rules) || existingPolicy.rules.length === 0) {
    throw new Error('Refusing to modify an unrestricted, absent or malformed addressing policy');
  }
  if (typeof roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(roomId)
    || typeof externalUserRowId !== 'string' || !/^[0-9a-f-]{36}$/i.test(externalUserRowId)) {
    throw new Error('Explicit room and linked external-user row UUIDs are required');
  }
  const rules = structuredClone(existingPolicy.rules);
  const alreadyAllowed = rules.some((r) => Array.isArray(r.rooms)
    && r.rooms.includes(roomId)
    && Array.isArray(r.users) && r.users.includes(externalUserRowId)
    && r.room_groups === '*'); // [] matches NO groups, not all groups.
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

/** Gateway/Pydantic may change JSON object key order without changing a policy.
 * Compare exact values and rule order while canonicalizing dictionary keys.
 */
export function sameScopedPolicy(actual, expected) {
  if (!Array.isArray(actual?.rules) || !Array.isArray(expected?.rules)) return false;
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, canonical(val)]));
    }
    return value;
  };
  return JSON.stringify(canonical(actual.rules)) === JSON.stringify(canonical(expected.rules));
}

/** Add exactly one registered agent to one room without widening the policy. */
export function buildScopedAgentPolicy(existingPolicy, { roomId, agentId }) {
  if (!existingPolicy || !Array.isArray(existingPolicy.rules) || existingPolicy.rules.length === 0) {
    throw new Error('Refusing to modify an open, absent, or malformed Gatekeeper policy');
  }
  const uuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
  if (!uuid(roomId) || !uuid(agentId)) throw new Error('Exact room and registered-agent UUIDs required');
  const rules = structuredClone(existingPolicy.rules);
  const already = rules.some((r) =>
    Array.isArray(r.rooms) && r.rooms.includes(roomId) &&
    r.room_groups === '*' && Array.isArray(r.agents) && r.agents.includes(agentId) &&
    Array.isArray(r.users) && r.users.length === 0 &&
    r.owner === false && r.owner_agents === false && r.platform === false
  );
  if (already) return { policy: { rules }, changed: false };
  rules.push({
    rooms: [roomId], room_groups: '*', users: [], agents: [agentId],
    owner: false, owner_agents: false, platform: false
  });
  return { policy: { rules }, changed: true };
}

/** Verify a room report against a unique registered agent and room membership.
 * A sender string is observed provenance; it cannot authorize a role by itself.
 */
export function resolveReportedAgent(report, members, agents, expectedName) {
  if (!report || report.status !== 'observed-not-authorized' ||
      report.expectedName !== expectedName || report.matches !== 1 ||
      !report.observed || report.observed.senderName !== expectedName ||
      typeof report.observed.senderId !== 'string' || !report.observed.senderId.startsWith('@') ||
      !Array.isArray(members) || !Array.isArray(agents)) {
    throw new Error('Report sender provenance is absent or ambiguous');
  }
  const registered = agents.filter((a) => a?.name === expectedName && typeof a.id === 'string');
  if (registered.length !== 1) throw new Error('Registered agent identity is not unique');
  const match = members.filter((m) => m?.type === 'agent' &&
    m?.agent_id === registered[0].id && m?.name === expectedName);
  if (match.length !== 1) throw new Error('Registered agent lacks exact room membership');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(registered[0].id)) {
    throw new Error('Registered agent ID is not an exact UUID');
  }
  return { id: registered[0].id, name: expectedName, senderId: report.observed.senderId };
}
