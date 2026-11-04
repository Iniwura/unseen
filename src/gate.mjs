import { createHash, randomUUID } from 'node:crypto';

// Phase 1 is intentionally a *pure decision model*, not an authorization server.
// A later Switch adapter must authenticate event origins, humans, and verifier reports.
export class GateError extends Error {
  constructor(code, message) { super(message); this.name = 'GateError'; this.code = code; }
}

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
function invariant(ok, code, explanation) { if (!ok) throw new GateError(code, explanation); }
function clone(x) { return structuredClone(x); }
function hash(x) { return createHash('sha256').update(JSON.stringify(x)).digest('hex'); }

export function createGate({ policyVersion = '1', requirements = [
  { id: 'engineering', room: 'release-room', command: 'baseline-tests' },
  { id: 'support', room: 'support-room', command: 'refund-regression' }
] } = {}) {
  invariant(typeof policyVersion === 'string' && policyVersion.length > 0, 'BAD_POLICY', 'Policy version required');
  invariant(Array.isArray(requirements) && requirements.length > 0, 'BAD_POLICY', 'Requirements required');
  const reqs = new Map();
  for (const r of requirements) {
    invariant(typeof r?.id === 'string' && r.id && typeof r.room === 'string' && r.room && typeof r.command === 'string' && r.command, 'BAD_POLICY', 'Requirement needs id, room, command');
    invariant(!reqs.has(r.id), 'BAD_POLICY', 'Duplicate requirement');
    reqs.set(r.id, { id:r.id, room:r.room, command:r.command });
  }
  const decisions = new Map();
  const events = new Set();
  const logs = [];
  function log(id, type, detail) { logs.push({sequence:logs.length+1, decisionId:id, type, detail:clone(detail)}); }
  function record(id) { const d=decisions.get(id); invariant(d,'NOT_FOUND','Decision not found');return d; }
  function statusOf(d) {
    if (d.executed) return 'EXECUTED';
    if (d.approved) return 'AUTHORIZED';
    if (d.superseded) return 'SUPERSEDED';
    const states = [...d.requirements.values()].map(r=>r.state);
    if (states.includes('VERIFIED_FAIL') || states.includes('CONFLICTED')) return 'BLOCKED';
    if (states.some(s=>s!=='VERIFIED_PASS')) return 'PENDING_EVIDENCE';
    return 'READY_FOR_APPROVAL';
  }
  function snapshot(d) {
    return { id:d.id, sha:d.sha, policyVersion, status:statusOf(d), requirements:[...d.requirements.values()].map(clone), evidenceDigest:evidenceDigest(d), approved:d.approved, executed:d.executed };
  }
  function evidenceDigest(d) {
    const entries = [...d.requirements.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>({id:r.id, state:r.state, source:r.source, report:r.report}));
    return hash({sha:d.sha,policyVersion,requirements:entries});
  }
  return Object.freeze({
    begin(sha, id=randomUUID()) {
      invariant(shaPattern.test(sha),'BAD_SHA','Candidate must be an exact 40-character Git SHA');
      invariant(typeof id==='string' && id.length>0 && !decisions.has(id),'DUPLICATE_ID','Decision ID already used');
      const d={id,sha,superseded:false,approved:false,executed:false,requirements:new Map([...reqs].map(([key])=>[key,{id:key,state:'MISSING',source:null,report:null}]))};
      decisions.set(id,d);log(id,'DECISION_CREATED',{sha});return snapshot(d);
    },
    // Evidence is a provenance claim, not a passing test.
    discover(id, {requirementId,room,eventId,documentDigest,collector}) {
      const d=record(id);
      invariant(!d.superseded,'SUPERSEDED','Decision has been superseded');
      const r=d.requirements.get(requirementId), expected=reqs.get(requirementId);
      invariant(r,'UNKNOWN_REQUIREMENT','Unknown requirement');
      invariant(room===expected.room,'WRONG_ROOM','Evidence came from wrong room');
      invariant(typeof eventId==='string' && eventId.length>0,'INVALID_EVENT','Switch event ID required');
      invariant(digestPattern.test(documentDigest),'INVALID_DIGEST','Source content digest required');
      invariant(typeof collector==='string' && collector.length>0,'INVALID_COLLECTOR','Collector ID required');
      const eventKey=room+'/'+eventId;
      invariant(!events.has(eventKey),'REPLAY','This source event was already used');
      events.add(eventKey);
      const source={room,eventId,documentDigest,collector};
      if(r.source && r.source.documentDigest !== documentDigest) {
        r.state='CONFLICTED';r.report=null;r.source=source;
      } else {r.source=source;r.report=null;r.state='DISCOVERED_UNVERIFIED';}
      log(id,'EVIDENCE_DISCOVERED',{requirementId,source,state:r.state});return snapshot(d);
    },
    // This is an internal contract to be wired ONLY to an actual allowlisted verifier.
    // Input can be forged by callers today; never expose as an unguarded network API.
    recordInternalVerification(id,{requirementId,sha,command,exitCode,outputDigest,runnerId}) {
      const d=record(id),r=d.requirements.get(requirementId),expected=reqs.get(requirementId);
      invariant(r,'UNKNOWN_REQUIREMENT','Unknown requirement');
      invariant(!d.superseded,'SUPERSEDED','Decision has been superseded');
      invariant(r.source && r.state!=='CONFLICTED','EVIDENCE_MISSING','Discover non-conflicting source evidence first');
      invariant(sha===d.sha,'STALE_SHA','Verification SHA differs from decision SHA');
      invariant(command===expected.command,'COMMAND_DENIED','Only the requirement allowlisted command is accepted');
      invariant(Number.isInteger(exitCode),'INVALID_RESULT','Numeric exit code required');
      invariant(digestPattern.test(outputDigest),'INVALID_RESULT','Output digest required');
      invariant(typeof runnerId==='string' && runnerId.length>0,'INVALID_RESULT','Runner identity required');
      r.report={sha,command,exitCode,outputDigest,runnerId};r.state=exitCode===0?'VERIFIED_PASS':'VERIFIED_FAIL';
      log(id,'VERIFICATION_RECORDED',{requirementId,exitCode,sha});return snapshot(d);
    },
    supersede(id,newSha) {
      const d=record(id);invariant(shaPattern.test(newSha),'BAD_SHA','New exact Git SHA required');
      invariant(!d.executed,'ALREADY_EXECUTED','An executed decision is immutable');
      d.superseded=true;log(id,'SUPERSEDED',{newSha});return snapshot(d);
    },
    requestExecution(id) {
      const d=record(id);log(id,'EXECUTION_REFUSED',{reason:'No verified Switch-origin human authorization adapter is installed'});
      throw new GateError('AUTHORIZATION_UNAVAILABLE','Execution is fail-closed until trusted Switch approval and restricted executor are implemented');
    },
    describe(id){return snapshot(record(id));},
    getAudit(id){record(id);return clone(logs.filter(e=>e.decisionId===id));}
  });
}
export function sha256(text){return createHash('sha256').update(text).digest('hex');}
