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

/** Return only safe state labels, never state snapshots, secrets or event payloads. */
export function diagnoseEngineeringRetry({ workflow, persistedGate, live, sha, expectedDecisionId, requiredRooms = [] }) {
  const decisions = Array.isArray(persistedGate?.decisions) ? persistedGate.decisions : [];
  const matches = expectedDecisionId ? decisions.filter((d) => d?.id === expectedDecisionId) : [];
  const decision = matches.length === 1 ? matches[0] : null;
  const engineeringState = decision?.requirements?.find((r) => r?.id === 'engineering')?.state ?? null;
  const supportState = decision?.requirements?.find((r) => r?.id === 'support')?.state ?? null;
  const subscribedRooms = Array.isArray(live?.rooms) ? live.rooms : [];
  const report = {
    connection: live?.status ?? 'not-recorded',
    authenticatedLiveSource: live?.evidence === 'live-switch',
    subscribedRoomsCount: subscribedRooms.length,
    requiredRoomsPresent: requiredRooms.every((id) => subscribedRooms.includes(id)),
    sameActiveDecision: Boolean(expectedDecisionId && workflow?.activeDecisionId === expectedDecisionId),
    pendingVerification: workflow?.pendingVerification?.requirementId ?? null,
    samePersistedDecisionCount: matches.length,
    exactCandidateMatched: decision?.sha === sha,
    decisionFinalized: Boolean(decision && (decision.superseded || decision.approved || decision.executed)),
    engineeringState,
    supportState
  };
  let code = 'ELIGIBLE_TO_RETRY';
  if (live?.status !== 'connected' || live?.evidence !== 'live-switch') code = 'LIVE_BRIDGE_NOT_CONNECTED';
  else if (!subscribedRooms.length || !report.requiredRoomsPresent) code = 'LIVE_ROOMS_NOT_CONFIRMED';
  else if (!expectedDecisionId || !report.sameActiveDecision) code = 'ACTIVE_DECISION_MISMATCH';
  else if (workflow?.pendingVerification) code = 'VERIFICATION_ALREADY_PENDING';
  else if (matches.length !== 1) code = 'DECISION_RECORD_NOT_UNIQUE';
  else if (decision?.sha !== sha) code = 'CANDIDATE_SHA_MISMATCH';
  else if (report.decisionFinalized) code = 'RELEASE_ALREADY_FINALIZED';
  else if (engineeringState === 'VERIFIED_PASS') code = 'ENGINEERING_ALREADY_VERIFIED';
  else if (engineeringState !== 'MISSING') code = 'ENGINEERING_EVIDENCE_NOT_MISSING';
  return { code, report };
}

export function eligibleEngineeringRetry({ workflow, persistedGate, live, sha, expectedDecisionId, requiredRooms = [] }) {
  const { code, report } = diagnoseEngineeringRetry({
    workflow, persistedGate, live, sha, expectedDecisionId, requiredRooms
  });
  if (code !== 'ELIGIBLE_TO_RETRY') {
    const error = new Error('Existing release cannot accept an engineering retry in its current state');
    error.code = code;
    error.diagnostic = report;
    throw error;
  }
  return { decisionId: expectedDecisionId, sha };
}
