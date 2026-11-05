import { buildScopedAgentPolicy, sameScopedPolicy } from './switch-admin-policy.mjs';

export function planReciprocalAgentPolicy(existingPolicy, { roomId, gatekeeperId }) {
  // If target agent is already public, no permission change is needed.
  if (existingPolicy === null || existingPolicy === undefined ||
      (Array.isArray(existingPolicy?.rules) && existingPolicy.rules.length === 0)) {
    return { changed: false, policy: existingPolicy, reason: 'already-open' };
  }
  if (!Array.isArray(existingPolicy?.rules)) throw new Error('Malformed target-agent addressing policy');
  const result = buildScopedAgentPolicy(existingPolicy, {roomId, agentId:gatekeeperId});
  return { ...result, reason: result.changed ? 'exact-room-gatekeeper-only' : 'already-present' };
}

export function planMatches(readback, expected) {
  if (expected === null || expected === undefined) return readback === null || readback === undefined;
  return sameScopedPolicy(readback, expected);
}

export function eligibleEngineeringRetry({ workflow, persistedGate, live, sha, expectedDecisionId }) {
  if (live?.status !== 'connected' || live?.evidence !== 'live-switch' ||
      !Array.isArray(live.rooms) || !live.rooms.length) {
    throw new Error('The existing live Switch bridge is not confirmed connected');
  }
  if (!expectedDecisionId || workflow?.activeDecisionId !== expectedDecisionId ||
      workflow?.pendingVerification) {
    throw new Error('Active decision is missing, changed, or already being verified');
  }
  const decisions = persistedGate?.decisions;
  const active = Array.isArray(decisions)
    ? decisions.filter((d) => d?.id === expectedDecisionId)
    : [];
  if (active.length !== 1 || active[0].sha !== sha ||
      active[0].superseded || active[0].approved || active[0].executed) {
    throw new Error('Existing decision is not an active, unapproved exact-SHA release');
  }
  const evidence = active[0].requirements?.find((r) => r?.id === 'engineering');
  if (!evidence || evidence.state !== 'MISSING') {
    throw new Error('Engineering evidence is not missing; do not retry');
  }
  return { decisionId: active[0].id, sha: active[0].sha };
}
