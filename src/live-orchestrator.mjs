import { randomUUID } from 'node:crypto';
import { isGitSha } from './gate.mjs';
import { unseenMessage, parseUnseenMessage } from './switch-ingest.mjs';
import { createMemoryStore } from './store.mjs';
import { verifyRepairedCheckout } from './live-repair-validation.mjs';

export class LiveWorkflowError extends Error {
  constructor(code, message) { super(message); this.name = 'LiveWorkflowError'; this.code = code; }
}

function assert(ok, code, message) {
  if (!ok) throw new LiveWorkflowError(code, message);
}

/**
 * The live workflow coordinator. It owns no authentication: SwitchClient and
 * SwitchEventIngestor establish that boundary first. This layer turns accepted
 * events into visible room messages and trusted runner transitions.
 */
export class LiveOrchestrator {
  constructor({
    gate,
    runner,
    client,
    ingestor,
    rooms,
    mentions = {},
    blockedOnly = false,
    recoveryReview = false,
    stateStore = createMemoryStore()
  } = {}) {
    assert(gate && runner && client && ingestor, 'BAD_WORKFLOW', 'Live workflow dependencies are required');
    assert(rooms?.release && rooms?.support, 'BAD_WORKFLOW', 'Release and support room IDs are required');
    this.gate = gate;
    this.runner = runner;
    this.client = client;
    this.ingestor = ingestor;
    this.rooms = rooms;
    this.mentions = mentions;
    this.blockedOnly = blockedOnly === true;
    this.recoveryReview = recoveryReview === true;
    this.stateStore = stateStore;
    this.state = { activeDecisionId: null, supportRequestedFor: null, approvalChallengeFor: null, lastError: null, ...(stateStore.load?.() ?? {}) };
  }

  persist() { this.stateStore.save?.(this.state); }

  async post(room, value) {
    const roomId = room === 'release-room' ? this.rooms.release : this.rooms.support;
    const content = typeof value === 'string' ? value : unseenMessage(value);
    return this.client.postMessage(roomId, content);
  }

  mention(role) {
    const mention = this.mentions[role];
    return mention ? `${mention} ` : '';
  }

  active() {
    if (!this.state.activeDecisionId) return null;
    try { return this.gate.describe(this.state.activeDecisionId); } catch (error) {
      if (error.code === 'NOT_FOUND') return null;
      throw error;
    }
  }

  async handleFrame(frame, connection) {
    // The live blocked-only milestone must not accept an approval, remediation
    // or execution capability even if one is posted by an otherwise authorized
    // user/agent. This check precedes the ingestor's gate mutation.
    if (this.blockedOnly && frame?.event === 'message') {
      const kind = parseUnseenMessage(frame.data?.payload?.body)?.kind;
      if (['approval','approval_refresh_request','remediation','remediation_ready'].includes(kind)) {
        return { ignored: true, blockedOnly: true, command: kind };
      }
    }
    const result = this.ingestor.handleFrame(frame, connection);
    if (result?.accepted && result.type === 'release_request') return this.startRelease(result.command, result.eventId);
    if (result?.accepted && result.type === 'repair_review_request') {
      return this.startRepairedReview(result.command, result.eventId);
    }
    if (result?.accepted && result.type === 'evidence') return this.handleEvidence(result);
    if (result?.accepted && result.type === 'remediation') return this.handleRemediation(result);
    if (result?.accepted && result.type === 'approval_refresh_request') {
      return this.refreshApprovalChallenge(result.command);
    }
    if (result?.accepted && result.type === 'approval') return this.handleApproval(result);
    return result;
  }

  async startRelease(command, eventId) {
    assert(isGitSha(command?.sha), 'BAD_RELEASE_SHA', 'Release requests must contain the exact 40-character candidate Git SHA');
    const existing = this.active();
    if (existing && !['EXECUTED', 'SUPERSEDED'].includes(existing.status)) {
      if (existing.sha === command.sha) {
        await this.post('release-room', `UNSEEN is already reviewing ${existing.sha.slice(0, 12)} (decision ${existing.id}).`);
        return existing;
      }
      throw new LiveWorkflowError('ACTIVE_DECISION', 'An active release decision must finish or be superseded before a different SHA is reviewed');
    }
    const decision = this.gate.begin(command.sha, command.decisionId || `release-${randomUUID()}`);
    this.state.activeDecisionId = decision.id;
    this.state.supportRequestedFor = null;
    this.state.approvalChallengeFor = null;
    this.state.approvalChallengeEvidenceDigest = null;
    this.state.lastError = null;
    this.persist();
    await this.post('release-room', `UNSEEN is reviewing checkout ${decision.sha} (decision ${decision.id}).`);
    await this.post('release-room', `${this.mention('engineering')}Verify the candidate commit and report the baseline evidence with:\n${unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'engineering', documentDigest: '<sha256-of-authoritative-engineering-evidence>' })}`);
    await this.post('support-room', `${this.mention('investigator')}UNSEEN is waiting for engineering evidence before requesting support acceptance for decision ${decision.id}.`);
    return decision;
  }


  /**
   * A real, human-requested review of an engineer-authored repair. This
   * path is distinct from a trusted coding-agent remediation event: the
   * request is not evidence. Verify Git parent/files and execute both
   * allowlisted tests *before* changing the blocked release.
   */
  async startRepairedReview(command, eventId) {
    assert(this.recoveryReview && !this.blockedOnly, 'REVIEW_MODE_DENIED',
      'Repair review is not enabled in this live workflow');
    const existing = this.active();
    assert(existing?.id === command?.blockedDecisionId &&
      existing?.sha === command?.originalSha && existing?.status === 'BLOCKED',
      'STALE_BLOCKED_DECISION', 'Original decision must still be the exact active blocked release');
    assert(isGitSha(command?.newSha) && command.newSha !== existing.sha,
      'BAD_REPAIRED_SHA', 'Repair must name a different exact Git commit');
    if (!this.runner.root) throw new LiveWorkflowError('RUNNER_CHECKOUT_MISSING','The real checkout is unavailable');
    let inspected;
    let baseline;
    let support;
    try {
      inspected = await verifyRepairedCheckout({
        checkoutRoot:this.runner.root, originalSha:existing.sha, repairedSha:command.newSha
      });
      baseline = await this.runner.run({ sha:command.newSha, command:'baseline-tests' });
      support = await this.runner.run({ sha:command.newSha, command:'refund-regression' });
      if (baseline.exitCode !== 0 || support.exitCode !== 0) {
        throw new LiveWorkflowError('REPAIR_REGRESSION_FAILED',
          'One or more allowlisted tests did not pass against the repaired exact Git SHA');
      }
    } catch (error) {
      const code = error?.code ?? 'REPAIR_VERIFICATION_ERROR';
      this.state.lastError = {code, decisionId:existing.id, sha:command.newSha};
      this.persist();
      await this.post('release-room',
        `UNSEEN REFUSED repaired commit ${command.newSha}. Independent Git and test verification failed (${code}). Original release ${existing.id} remains BLOCKED. No approval or deployment.`);
      return this.gate.describe(existing.id);
    }
    // Atomic durable supersession of the original BLOCKED decision occurs
    // ONLY after both independent tests pass on a clean direct child commit.
    const transition = this.gate.beginSupersedingBlocked(existing.id, inspected.repairedSha);
    const repaired = transition.repaired;
    this.state.activeDecisionId = repaired.id;
    this.state.supportRequestedFor = null;
    this.state.approvalChallengeFor = null;
    this.state.approvalChallengeEvidenceDigest = null;
    this.state.pendingVerification = null;
    this.state.lastError = null;
    this.persist();
    await this.post('release-room',
      `UNSEEN verified the repair ${repaired.sha} against the blocked parent ${existing.sha}. Both independent allowlisted test commands PASS (baseline output ${baseline.outputDigest}, refund output ${support.outputDigest}). Original decision ${existing.id} preserved as SUPERSEDED; new decision ${repaired.id} requires FRESH engineering and support evidence. No approval or deployment.`);
    await this.post('release-room',
      `${this.mention('engineering')}Re-check repaired commit ${repaired.sha}. Return a NEW addressed evidence message, citing your new source, for:\n${unseenMessage({
        kind:'evidence',decisionId:repaired.id,requirementId:'engineering',
        documentDigest:'<SHA256-OF-FRESH-ENGINEERING-REPORT>'
      })}`);
    await this.post('support-room',
      `${this.mention('investigator')}Re-check owner-authored refund acceptance for repaired commit ${repaired.sha}. Return a NEW addressed evidence message with your source digest for:\n${unseenMessage({
        kind:'evidence',decisionId:repaired.id,requirementId:'support',
        documentDigest:'<SHA256-OF-FRESH-SUPPORT-REVIEW>'
      })}`);
    return repaired;
  }

  async handleEvidence(result) {
    const decision = result.decision;
    const target = decision.requirements.find((item) => item.id === result.requirementId);
    assert(target, 'WORKFLOW_STATE', 'Accepted evidence did not identify a requirement');
    return this.verifyRequirement(decision, target.id);
  }

  async verifyRequirement(decision, requirementId) {
    const target = decision.requirements.find((item) => item.id === requirementId);
    assert(target, 'WORKFLOW_STATE', 'Verification target is not a policy requirement');
    this.state.pendingVerification = { decisionId: decision.id, requirementId, sha: decision.sha };
    this.persist();
    let report;
    let verified;
    try {
      report = await this.runner.run({ sha: decision.sha, command: target.id === 'engineering' ? 'baseline-tests' : 'refund-regression' });
      verified = this.gate.recordRunnerVerification(decision.id, report);
    } catch (error) {
      this.state.lastError = { code: error.code ?? 'RUNNER_ERROR', message: error.message, decisionId: decision.id, requirementId, sha: decision.sha };
      this.persist();
      await this.post('release-room', `UNSEEN could not complete ${requirementId} verification for ${decision.sha}. The decision remains unauthorized and fail-closed. Retry after resolving: ${error.message}`);
      return this.gate.describe(decision.id);
    }
    this.state.pendingVerification = null;
    this.state.lastError = null;
    this.persist();
    const room = target.id === 'engineering' ? 'release-room' : 'support-room';
    const resultLabel = report.exitCode === 0 ? 'PASS' : 'FAIL';
    await this.post(room, `UNSEEN verification ${resultLabel}: ${target.id} on ${decision.sha} (exit ${report.exitCode}, output ${report.outputDigest}).`);
    if (report.exitCode !== 0) {
      await this.post('release-room', `UNSEEN BLOCKED decision ${decision.id}. The ${target.id} regression failed on the exact candidate commit.`);
      if (target.id === 'support') {
        await this.post('support-room', `${this.mention('coding-agent')}The support regression is reproducible on ${decision.sha}. Repair it, commit the fix, then report:\n${unseenMessage({ kind: 'remediation_ready', decisionId: decision.id, newSha: '<exact-repaired-commit-sha>' })}`);
      }
      return verified;
    }
    if (target.id === 'engineering') await this.requestSupportEvidence(verified);
    if (verified.status === 'READY_FOR_APPROVAL') await this.issueApprovalChallenge(verified);
    return verified;
  }

  async resumePending() {
    const decision = this.active();
    if (!decision) return null;
    const pending = this.state.pendingVerification?.decisionId === decision.id ? this.state.pendingVerification : null;
    const requirement = pending
      ? decision.requirements.find((item) => item.id === pending.requirementId)
      : decision.requirements.find((item) => item.state === 'DISCOVERED_UNVERIFIED');
    if (!requirement || requirement.state !== 'DISCOVERED_UNVERIFIED') return null;
    if (pending && decision.sha !== pending.sha) return null;
    return this.verifyRequirement(decision, requirement.id);
  }

  async requestSupportEvidence(decision) {
    if (this.state.supportRequestedFor === decision.id) return;
    this.state.supportRequestedFor = decision.id;
    this.persist();
    await this.post('support-room', `${this.mention('investigator')}Retrieve the support acceptance requirement through Switch for decision ${decision.id} at commit ${decision.sha}. Return only an addressed ${unseenMessage({ kind: 'evidence', decisionId: decision.id, requirementId: 'support', documentDigest: '<sha256-of-authoritative-support-evidence>' })} message after checking the source.`);
    await this.post('release-room', `UNSEEN found no verified support acceptance yet. Evidence Investigator requested in support-room.`);
  }

  async handleRemediation(result) {
    const command = result.result;
    const current = this.active();
    assert(current && current.id === command.decisionId, 'STALE_REMEDIATION', 'Remediation is not bound to the active blocked decision');
    assert(current.status === 'BLOCKED', 'REMEDIATION_NOT_ALLOWED', 'Remediation is only accepted for a blocked decision');
    assert(isGitSha(command.newSha), 'BAD_REPAIRED_SHA', 'Remediation must provide an exact repaired Git SHA');
    this.gate.supersede(current.id, command.newSha);
    const repaired = this.gate.begin(command.newSha, `repair-${randomUUID()}`);
    this.state.activeDecisionId = repaired.id;
    this.state.supportRequestedFor = null;
    this.state.approvalChallengeFor = null;
    this.state.approvalChallengeEvidenceDigest = null;
    this.persist();
    await this.post('release-room', `UNSEEN superseded blocked decision ${current.id}. Independent verification now targets repaired commit ${repaired.sha} (decision ${repaired.id}).`);
    await this.post('release-room', `${this.mention('engineering')}Verify the repaired commit and report a fresh engineering evidence event for decision ${repaired.id}.`);
    await this.post('support-room', `${this.mention('investigator')}Re-check the support requirement against repaired commit ${repaired.sha} and report a fresh evidence event for decision ${repaired.id}.`);
    return repaired;
  }

  async issueApprovalChallenge(decision, { force = false } = {}) {
    const current = this.gate.describe(decision.id);
    assert(current.status === 'READY_FOR_APPROVAL' && current.id === this.state.activeDecisionId,
      'APPROVAL_NOT_READY', 'Both requirements must pass on the current active release');
    // New trusted evidence can alter the canonical evidence digest even when
    // the decision ID stays the same. Never keep a previously issued, now
    // stale nonce simply because it was for the same decision.
    if (!force && this.state.approvalChallengeFor === current.id &&
        this.state.approvalChallengeEvidenceDigest === current.evidenceDigest) return null;
    const challenge = this.gate.issueApprovalChallenge(current.id);
    this.state.approvalChallengeFor = current.id;
    this.state.approvalChallengeEvidenceDigest = challenge.evidenceDigest;
    this.persist();
    await this.post('release-room', `${this.mention('release-owner')}Both requirements pass. Use only this LATEST approval challenge for the verified artifact. Prior challenge messages are invalid:\n${unseenMessage({ kind: 'approval', decisionId: challenge.decisionId, sha: challenge.sha, evidenceDigest: challenge.evidenceDigest, nonce: challenge.nonce })}`);
    return challenge;
  }

  async refreshApprovalChallenge(command) {
    assert(this.recoveryReview && !this.blockedOnly,
      'APPROVAL_REFRESH_NOT_AVAILABLE', 'Challenge refresh is not enabled in this live recovery workflow');
    const decision = this.active();
    assert(decision && decision.id === command?.decisionId && decision.sha === command?.sha,
      'STALE_APPROVAL_REFRESH', 'Challenge refresh must match the current exact decision and commit');
    assert(decision.status === 'READY_FOR_APPROVAL' && !decision.approved && !decision.executed,
      'APPROVAL_NOT_READY', 'The release is not currently ready for human approval');
    return this.issueApprovalChallenge(decision, { force: true });
  }

  async handleApproval(result) {
    const capability = this.gate.requestExecution(result.decision.id);
    const executed = this.gate.execute(result.decision.id, capability, ({ sha, evidenceDigest }) => ({ action: 'release-preview', sha, evidenceDigest }));
    await this.post('release-room', `UNSEEN AUTHORIZED ${executed.sha}. Auditable receipt ${executed.receipt.receiptId} created; no deployment was performed.`);
    return executed;
  }

  async recoverGap(connection) {
    this.state.lastError = { code: 'EVENT_GAP', message: 'Switch event cursor gap detected; room context reload required' };
    this.persist();
    const reloads = [];
    for (const [name, roomId] of Object.entries(this.rooms)) {
      try {
        const context = await this.client.readContext(roomId, { connectionId: connection.connectionId });
        reloads.push({ name, roomId, ok: true, context });
      } catch (error) {
        reloads.push({ name, roomId, ok: false, error: error.message });
      }
    }
    const complete = reloads.every((item) => item.ok);
    if (complete) this.ingestor.markContextReloaded();
    await this.post('release-room', complete
      ? 'UNSEEN detected an event gap, reloaded both room contexts, and paused action on missing events. Re-emit any evidence or approval request as a fresh addressed Switch message.'
      : 'UNSEEN detected an event gap but could not reload every room context. The release remains paused and fail-closed; restore Switch context access before re-emitting evidence or approval.');
    return reloads;
  }
}
