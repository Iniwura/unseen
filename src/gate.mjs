import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createMemoryStore } from './store.mjs';

export class GateError extends Error {
  constructor(code, message) { super(message); this.name = 'GateError'; this.code = code; }
}

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const defaultRequirements = [
  { id: 'engineering', room: 'release-room', command: 'baseline-tests' },
  { id: 'support', room: 'support-room', command: 'refund-regression' }
];

function invariant(ok, code, explanation) {
  if (!ok) throw new GateError(code, explanation);
}

function clone(value) { return structuredClone(value); }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function hmac(secret, value) { return createHmac('sha256', secret).update(JSON.stringify(value)).digest('hex'); }
function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function isDigest(value) { return typeof value === 'string' && digestPattern.test(value); }
function isSha(value) { return typeof value === 'string' && shaPattern.test(value); }

function serializeDecision(decision) {
  return {
    id: decision.id,
    sha: decision.sha,
    superseded: decision.superseded,
    approved: decision.approved,
    executed: decision.executed,
    requirements: [...decision.requirements.values()].map(clone),
    approval: decision.approval ? clone(decision.approval) : null,
    capability: decision.capability ? clone(decision.capability) : null,
    receipt: decision.receipt ? clone(decision.receipt) : null
  };
}

function hydrateDecision(raw) {
  return {
    id: raw.id,
    sha: raw.sha,
    superseded: Boolean(raw.superseded),
    approved: Boolean(raw.approved),
    executed: Boolean(raw.executed),
    requirements: new Map((raw.requirements ?? []).map((requirement) => [requirement.id, clone(requirement)])),
    approval: raw.approval ? clone(raw.approval) : null,
    capability: raw.capability ? clone(raw.capability) : null,
    receipt: raw.receipt ? clone(raw.receipt) : null
  };
}

function canonicalEvidence(decision, policyVersion) {
  const requirements = [...decision.requirements.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((requirement) => ({
      id: requirement.id,
      state: requirement.state,
      source: requirement.source,
      report: requirement.report
    }));
  return { sha: decision.sha, policyVersion, requirements };
}

/**
 * The fail-closed decision model. `discover` and `recordInternalVerification`
 * remain compatible with Phase 1. Production code must use
 * `recordRunnerVerification` and `approveFromSwitch`, which require attestations
 * created by the trusted adapters in this repository.
 */
export function createGate({
  policyVersion = '1',
  requirements = defaultRequirements,
  store = createMemoryStore(),
  runnerSecret = null,
  authorizedHumans = [],
  approvalRoom = 'release-room',
  approvalTtlMs = 15 * 60 * 1000
} = {}) {
  invariant(typeof policyVersion === 'string' && policyVersion.length > 0, 'BAD_POLICY', 'Policy version required');
  invariant(Array.isArray(requirements) && requirements.length > 0, 'BAD_POLICY', 'Requirements required');
  invariant(Array.isArray(authorizedHumans), 'BAD_POLICY', 'Authorized humans must be an array');
  const reqs = new Map();
  for (const requirement of requirements) {
    invariant(typeof requirement?.id === 'string' && requirement.id && typeof requirement.room === 'string' && requirement.room && typeof requirement.command === 'string' && requirement.command, 'BAD_POLICY', 'Requirement needs id, room, command');
    invariant(!reqs.has(requirement.id), 'BAD_POLICY', 'Duplicate requirement');
    reqs.set(requirement.id, { id: requirement.id, room: requirement.room, command: requirement.command });
  }

  const persisted = store.load?.() ?? {};
  const effectiveRunnerSecret = runnerSecret ?? persisted.runnerSecret ?? randomBytes(32).toString('hex');
  invariant(typeof effectiveRunnerSecret === 'string' && effectiveRunnerSecret.length >= 32, 'BAD_POLICY', 'Runner secret must be at least 32 characters');
  invariant(!persisted.policyVersion || persisted.policyVersion === policyVersion, 'BAD_POLICY', 'State belongs to another policy version');
  const decisions = new Map((persisted.decisions ?? []).map((raw) => [raw.id, hydrateDecision(raw)]));
  const events = new Set(persisted.events ?? []);
  const logs = Array.isArray(persisted.audit) ? persisted.audit.map(clone) : [];
  const challenges = new Map((persisted.challenges ?? []).map((challenge) => [challenge.decisionId, clone(challenge)]));

  for (const decision of decisions.values()) {
    invariant(isSha(decision.sha), 'BAD_STATE', 'Persisted decision has an invalid SHA');
    for (const requirementId of reqs.keys()) {
      invariant(decision.requirements.has(requirementId), 'BAD_STATE', 'Persisted decision is missing a policy requirement');
    }
  }

  function persist() {
    store.save?.({
      version: 2,
      policyVersion,
      runnerSecret: effectiveRunnerSecret,
      decisions: [...decisions.values()].map(serializeDecision),
      events: [...events],
      audit: logs,
      challenges: [...challenges.values()]
    });
  }

  function log(id, type, detail) {
    logs.push({ sequence: logs.length + 1, decisionId: id, type, detail: clone(detail), at: new Date().toISOString() });
  }

  function record(id) {
    const decision = decisions.get(id);
    invariant(decision, 'NOT_FOUND', 'Decision not found');
    return decision;
  }

  function statusOf(decision) {
    const states = [...decision.requirements.values()].map((requirement) => requirement.state);
    if (decision.executed) return 'EXECUTED';
    if (decision.superseded) return 'SUPERSEDED';
    if (states.includes('VERIFIED_FAIL') || states.includes('CONFLICTED')) return 'BLOCKED';
    if (decision.receipt?.result?.status === 'failed') return 'EXECUTION_FAILED';
    if (decision.approved) return 'AUTHORIZED';
    if (states.some((state) => state !== 'VERIFIED_PASS')) return 'PENDING_EVIDENCE';
    return 'READY_FOR_APPROVAL';
  }

  function evidenceDigest(decision) { return hash(canonicalEvidence(decision, policyVersion)); }

  function snapshot(decision) {
    return {
      id: decision.id,
      sha: decision.sha,
      policyVersion,
      status: statusOf(decision),
      requirements: [...decision.requirements.values()].map(clone),
      evidenceDigest: evidenceDigest(decision),
      approved: decision.approved,
      executed: decision.executed,
      approval: decision.approval ? {
        approvalId: decision.approval.approvalId,
        sender: decision.approval.sender,
        room: decision.approval.room,
        eventId: decision.approval.eventId,
        evidenceDigest: decision.approval.evidenceDigest,
        approvedAt: decision.approval.approvedAt
      } : null,
      receipt: decision.receipt ? clone(decision.receipt) : null
    };
  }

  function assertMutable(decision) {
    invariant(!decision.superseded, 'SUPERSEDED', 'Decision has been superseded');
    invariant(!decision.approved, 'ALREADY_APPROVED', 'Approved decision is immutable');
    invariant(!decision.executed, 'ALREADY_EXECUTED', 'Executed decision is immutable');
  }

  const api = {
    begin(sha, id = randomUUID()) {
      invariant(isSha(sha), 'BAD_SHA', 'Candidate must be an exact 40-character Git SHA');
      invariant(typeof id === 'string' && id.length > 0 && !decisions.has(id), 'DUPLICATE_ID', 'Decision ID already used');
      const decision = {
        id,
        sha,
        superseded: false,
        approved: false,
        executed: false,
        requirements: new Map([...reqs.keys()].map((key) => [key, { id: key, state: 'MISSING', source: null, report: null }])),
        approval: null,
        capability: null,
        receipt: null
      };
      decisions.set(id, decision);
      log(id, 'DECISION_CREATED', { sha });
      persist();
      return snapshot(decision);
    },


    /**
     * Atomically preserve a verified BLOCKED decision and open a new,
     * distinct review of a repaired Git commit. Callers must independently
     * verify commit ancestry and tests *before* invoking this transition.
     */
    beginSupersedingBlocked(blockedId, newSha, newId = `repair-${randomUUID()}`) {
      const blocked = record(blockedId);
      invariant(statusOf(blocked) === 'BLOCKED' && !blocked.superseded &&
        !blocked.approved && !blocked.executed, 'NOT_BLOCKED',
        'Only an active, unapproved BLOCKED decision can be superseded');
      invariant(isSha(newSha) && newSha !== blocked.sha, 'BAD_REPAIRED_SHA',
        'Repair requires a distinct exact Git commit SHA');
      invariant(typeof newId === 'string' && newId.length > 0 &&
        !decisions.has(newId), 'DUPLICATE_ID', 'A fresh repaired decision ID is required');
      const repaired = {
        id: newId,
        sha: newSha,
        superseded: false,
        approved: false,
        executed: false,
        requirements: new Map([...reqs.keys()].map((key) => [
          key, { id: key, state: 'MISSING', source: null, report: null }
        ])),
        approval: null,
        capability: null,
        receipt: null
      };
      blocked.superseded = true;
      blocked.approved = false;
      decisions.set(newId, repaired);
      log(blockedId, 'SUPERSEDED', { newSha, newDecisionId: newId });
      log(newId, 'DECISION_CREATED', { sha: newSha, supersedes: blockedId });
      persist();
      return { previous: snapshot(blocked), repaired: snapshot(repaired) };
    },

    // Evidence is a provenance claim, not a passing test. The Switch adapter
    // must authenticate the event before calling this method.
    discover(id, { requirementId, room, eventId, documentDigest, collector }) {
      const decision = record(id);
      assertMutable(decision);
      const requirement = decision.requirements.get(requirementId);
      const expected = reqs.get(requirementId);
      invariant(requirement, 'UNKNOWN_REQUIREMENT', 'Unknown requirement');
      invariant(room === expected.room, 'WRONG_ROOM', 'Evidence came from wrong room');
      invariant(typeof eventId === 'string' && eventId.length > 0, 'INVALID_EVENT', 'Switch event ID required');
      invariant(isDigest(documentDigest), 'INVALID_DIGEST', 'Source content digest required');
      invariant(typeof collector === 'string' && collector.length > 0, 'INVALID_COLLECTOR', 'Collector ID required');
      const eventKey = `${room}/${eventId}`;
      invariant(!events.has(eventKey), 'REPLAY', 'This source event was already used');
      events.add(eventKey);
      const source = { room, eventId, documentDigest, collector };
      if (requirement.source && requirement.source.documentDigest !== documentDigest) {
        requirement.state = 'CONFLICTED';
        requirement.report = null;
        requirement.source = source;
      } else {
        requirement.source = source;
        requirement.report = null;
        requirement.state = 'DISCOVERED_UNVERIFIED';
      }
      log(id, 'EVIDENCE_DISCOVERED', { requirementId, source, state: requirement.state });
      persist();
      return snapshot(decision);
    },

    /**
     * Legacy Phase 1 contract. It intentionally remains internal-only and
     * accepts caller-supplied data for compatibility with the original tests.
     * Never expose it from an HTTP or Switch handler.
     */
    recordInternalVerification(id, { requirementId, sha, command, exitCode, outputDigest, runnerId }) {
      const decision = record(id);
      const requirement = decision.requirements.get(requirementId);
      const expected = reqs.get(requirementId);
      invariant(requirement, 'UNKNOWN_REQUIREMENT', 'Unknown requirement');
      invariant(!decision.superseded, 'SUPERSEDED', 'Decision has been superseded');
      invariant(requirement.source && requirement.state !== 'CONFLICTED', 'EVIDENCE_MISSING', 'Discover non-conflicting source evidence first');
      invariant(sha === decision.sha, 'STALE_SHA', 'Verification SHA differs from decision SHA');
      invariant(command === expected.command, 'COMMAND_DENIED', 'Only the requirement allowlisted command is accepted');
      invariant(Number.isInteger(exitCode), 'INVALID_RESULT', 'Numeric exit code required');
      invariant(isDigest(outputDigest), 'INVALID_RESULT', 'Output digest required');
      invariant(typeof runnerId === 'string' && runnerId.length > 0, 'INVALID_RESULT', 'Runner identity required');
      requirement.report = { sha, command, exitCode, outputDigest, runnerId, trusted: false };
      requirement.state = exitCode === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL';
      log(id, 'VERIFICATION_RECORDED', { requirementId, exitCode, sha, trusted: false });
      persist();
      return snapshot(decision);
    },

    recordRunnerVerification(id, report) {
      const decision = record(id);
      const requirement = decision.requirements.get(report?.requirementId);
      const expected = reqs.get(report?.requirementId);
      invariant(requirement, 'UNKNOWN_REQUIREMENT', 'Unknown requirement');
      invariant(!decision.superseded, 'SUPERSEDED', 'Decision has been superseded');
      invariant(requirement.source && requirement.state !== 'CONFLICTED', 'EVIDENCE_MISSING', 'Discover non-conflicting source evidence first');
      invariant(report?.sha === decision.sha, 'STALE_SHA', 'Verification SHA differs from decision SHA');
      invariant(report?.command === expected.command, 'COMMAND_DENIED', 'Only the requirement allowlisted command is accepted');
      invariant(Number.isInteger(report?.exitCode), 'INVALID_RESULT', 'Numeric exit code required');
      invariant(isDigest(report?.outputDigest), 'INVALID_RESULT', 'Output digest required');
      invariant(typeof report?.runnerId === 'string' && report.runnerId.length > 0, 'INVALID_RESULT', 'Runner identity required');
      const attested = {
        requirementId: report.requirementId,
        sha: report.sha,
        command: report.command,
        exitCode: report.exitCode,
        outputDigest: report.outputDigest,
        runnerId: report.runnerId,
        observedAt: report.observedAt,
        policyVersion: report.policyVersion ?? policyVersion
      };
      invariant(attested.policyVersion === policyVersion, 'STALE_POLICY', 'Verification policy version differs from the decision policy');
      invariant(sameSecret(report?.attestation, hmac(effectiveRunnerSecret, attested)), 'UNTRUSTED_RUNNER', 'Verification was not attested by the allowlisted runner');
      requirement.report = { ...attested, trusted: true };
      requirement.state = report.exitCode === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL';
      log(id, 'VERIFICATION_RECORDED', { requirementId: report.requirementId, exitCode: report.exitCode, sha: report.sha, trusted: true, outputDigest: report.outputDigest });
      persist();
      return snapshot(decision);
    },

    issueApprovalChallenge(id, { ttlMs = approvalTtlMs, now = Date.now() } = {}) {
      const decision = record(id);
      invariant(statusOf(decision) === 'READY_FOR_APPROVAL', 'NOT_READY', 'Decision is not ready for approval');
      invariant(Number.isInteger(ttlMs) && ttlMs > 0, 'INVALID_CHALLENGE', 'Challenge TTL must be positive');
      const nonce = randomBytes(24).toString('base64url');
      const challenge = { decisionId: id, nonceDigest: hash(nonce), evidenceDigest: evidenceDigest(decision), sha: decision.sha, expiresAt: now + ttlMs, used: false };
      challenges.set(id, challenge);
      log(id, 'APPROVAL_CHALLENGE_ISSUED', { sha: decision.sha, evidenceDigest: challenge.evidenceDigest, expiresAt: challenge.expiresAt });
      persist();
      return { decisionId: id, sha: decision.sha, evidenceDigest: challenge.evidenceDigest, nonce, expiresAt: challenge.expiresAt };
    },

    /**
     * Only the trusted Switch WebSocket adapter should call this method. The
     * `authenticated` marker is created by that adapter after checking the
     * bearer-authenticated connection, room membership, event sequence and
     * configured human identity.
     */
    approveFromSwitch(id, approval) {
      const decision = record(id);
      const challenge = challenges.get(id);
      invariant(statusOf(decision) === 'READY_FOR_APPROVAL', 'NOT_READY', 'Only a ready decision can be approved');
      invariant(challenge && !challenge.used, 'NO_CHALLENGE', 'A live approval challenge is required');
      invariant(approval?.authenticated === true && approval.origin === 'switch-websocket', 'UNAUTHENTICATED_APPROVAL', 'Approval did not come from an authenticated Switch event');
      invariant(approval.decisionId === id && approval.sha === decision.sha, 'STALE_APPROVAL', 'Approval is not bound to this exact decision and commit');
      invariant(approval.evidenceDigest === challenge.evidenceDigest && approval.evidenceDigest === evidenceDigest(decision), 'STALE_EVIDENCE', 'Approval evidence is stale');
      invariant(typeof approval.nonce === 'string' && hash(approval.nonce) === challenge.nonceDigest, 'INVALID_NONCE', 'Approval nonce is invalid');
      invariant(Date.now() <= challenge.expiresAt, 'EXPIRED_CHALLENGE', 'Approval challenge expired');
      invariant(approval.room === approvalRoom, 'WRONG_ROOM', 'Human approval came from the wrong room');
      invariant(typeof approval.sender === 'string' && authorizedHumans.includes(approval.sender), 'UNAUTHORIZED_HUMAN', 'Human sender is not authorized to approve releases');
      invariant(typeof approval.eventId === 'string' && approval.eventId.length > 0, 'INVALID_EVENT', 'Switch approval event ID required');
      challenge.used = true;
      decision.approved = true;
      decision.approval = {
        approvalId: randomUUID(),
        sender: approval.sender,
        room: approval.room,
        eventId: approval.eventId,
        nonceDigest: challenge.nonceDigest,
        evidenceDigest: approval.evidenceDigest,
        approvedAt: new Date().toISOString()
      };
      log(id, 'HUMAN_APPROVED', { approvalId: decision.approval.approvalId, sender: approval.sender, room: approval.room, eventId: approval.eventId, sha: decision.sha, evidenceDigest: approval.evidenceDigest });
      persist();
      return snapshot(decision);
    },

    requestExecution(id) {
      const decision = record(id);
      if (!(decision.approved && statusOf(decision) === 'AUTHORIZED')) {
        log(id, 'EXECUTION_REFUSED', { reason: 'No trusted Switch-origin human authorization is recorded' });
        persist();
        throw new GateError('AUTHORIZATION_UNAVAILABLE', 'Execution is fail-closed until trusted Switch approval is recorded');
      }
      if (!decision.capability) {
        decision.capability = { capabilityId: randomUUID(), secret: randomBytes(32).toString('base64url'), decisionId: id, sha: decision.sha, evidenceDigest: evidenceDigest(decision), used: false };
        log(id, 'EXECUTION_CAPABILITY_ISSUED', { capabilityId: decision.capability.capabilityId, sha: decision.sha });
        persist();
      }
      return { capabilityId: decision.capability.capabilityId, secret: decision.capability.secret, decisionId: id, sha: decision.sha, evidenceDigest: decision.capability.evidenceDigest };
    },

    execute(id, capability, executor) {
      const decision = record(id);
      const stored = decision.capability;
      invariant(decision.approved && statusOf(decision) === 'AUTHORIZED', 'AUTHORIZATION_UNAVAILABLE', 'Decision is not authorized');
      invariant(stored && capability?.capabilityId === stored.capabilityId && capability.secret === stored.secret, 'INVALID_CAPABILITY', 'Execution capability is invalid');
      invariant(!stored.used, 'CAPABILITY_REPLAY', 'Execution capability has already been used');
      invariant(capability.decisionId === id && capability.sha === decision.sha && capability.evidenceDigest === evidenceDigest(decision), 'STALE_CAPABILITY', 'Execution capability is stale');
      invariant(typeof executor === 'function', 'INVALID_EXECUTOR', 'A restricted executor is required');
      stored.used = true;
      try {
        const result = executor({ decisionId: id, sha: decision.sha, evidenceDigest: capability.evidenceDigest });
        decision.executed = true;
        decision.receipt = { receiptId: randomUUID(), decisionId: id, sha: decision.sha, evidenceDigest: capability.evidenceDigest, result: clone(result), executedAt: new Date().toISOString() };
        log(id, 'EXECUTED', { receiptId: decision.receipt.receiptId, sha: decision.sha, evidenceDigest: capability.evidenceDigest });
        persist();
        return snapshot(decision);
      } catch (error) {
        decision.receipt = { receiptId: randomUUID(), decisionId: id, sha: decision.sha, evidenceDigest: capability.evidenceDigest, result: { status: 'failed', error: error instanceof Error ? error.message : String(error) }, executedAt: new Date().toISOString() };
        log(id, 'EXECUTION_FAILED', { receiptId: decision.receipt.receiptId, sha: decision.sha, error: decision.receipt.result.error });
        persist();
        throw error;
      }
    },

    supersede(id, newSha) {
      const decision = record(id);
      invariant(isSha(newSha), 'BAD_SHA', 'New exact Git SHA required');
      invariant(!decision.executed, 'ALREADY_EXECUTED', 'An executed decision is immutable');
      decision.superseded = true;
      decision.approved = false;
      log(id, 'SUPERSEDED', { newSha });
      persist();
      return snapshot(decision);
    },

    describe(id) { return snapshot(record(id)); },
    list() { return [...decisions.values()].map(snapshot); },
    getAudit(id) { record(id); return clone(logs.filter((entry) => entry.decisionId === id)); },
    counterfactual(id) {
      const decision = record(id);
      const support = decision.requirements.get('support');
      return {
        decisionId: id,
        actualStatus: statusOf(decision),
        withoutRecoveredEvidence: support?.source ? 'PENDING_EVIDENCE' : 'PENDING_EVIDENCE',
        withoutGate: 'RELEASE_WOULD_HAVE_BEEN_ATTEMPTED',
        explanation: 'The release remained blocked until the support-room requirement was discovered, verified, and bound to this exact commit.'
      };
    },
    runnerAttestation(report) {
      const attested = {
        requirementId: report.requirementId,
        sha: report.sha,
        command: report.command,
        exitCode: report.exitCode,
        outputDigest: report.outputDigest,
        runnerId: report.runnerId,
        observedAt: report.observedAt,
        policyVersion: report.policyVersion ?? policyVersion
      };
      invariant(attested.policyVersion === policyVersion, 'STALE_POLICY', 'Verification policy version differs from the decision policy');
      return hmac(effectiveRunnerSecret, attested);
    }
  };

  return Object.freeze(api);
}

export function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
export function isGitSha(value) { return isSha(value); }
