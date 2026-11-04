import test from 'node:test';
import assert from 'node:assert/strict';
import {createGate, sha256} from '../src/gate.mjs';
const SHA='a'.repeat(40), SHA2='b'.repeat(40);
const dig=sha256('source document');
const output=sha256('runner output');
const ev=(requirementId, room, eventId)=>({requirementId,room,eventId,documentDigest:dig,collector:'agent-A'});
const vr=(requirementId,command,exitCode=0,sha=SHA)=>({requirementId,sha,command,exitCode,outputDigest:output,runnerId:'test-fixture'});
function readyEngineering(g,id){g.discover(id,ev('engineering','release-room','e1'));return g.recordInternalVerification(id,vr('engineering','baseline-tests'));}
function setup(){const g=createGate();const d=g.begin(SHA);return {g,id:d.id};}
function errorCode(fn,code){assert.throws(fn,e=>e.code===code);}
test('initially pending',()=>{const {g,id}=setup(); assert.equal(g.describe(id).status,'PENDING_EVIDENCE');});
test('engineering pass cannot bypass missing support',()=>{const {g,id}=setup();readyEngineering(g,id);assert.equal(g.describe(id).status,'PENDING_EVIDENCE');});
test('discovered support without actual test still pending',()=>{const {g,id}=setup();readyEngineering(g,id);g.discover(id,ev('support','support-room','s1'));assert.equal(g.describe(id).status,'PENDING_EVIDENCE');});
test('failing support regression blocks release',()=>{const {g,id}=setup();readyEngineering(g,id);g.discover(id,ev('support','support-room','s1'));g.recordInternalVerification(id,vr('support','refund-regression',1));assert.equal(g.describe(id).status,'BLOCKED');});
test('passing both requirements is ready for approval, not authorized',()=>{const {g,id}=setup();readyEngineering(g,id);g.discover(id,ev('support','support-room','s1'));g.recordInternalVerification(id,vr('support','refund-regression',0));assert.equal(g.describe(id).status,'READY_FOR_APPROVAL');assert.equal(g.describe(id).approved,false);});
test('no direct release action without trusted approval adapter',()=>{const {g,id}=setup();errorCode(()=>g.requestExecution(id),'AUTHORIZATION_UNAVAILABLE');});
test('even ready decisions cannot execute without authenticated approval',()=>{const {g,id}=setup();readyEngineering(g,id);g.discover(id,ev('support','support-room','s1'));g.recordInternalVerification(id,vr('support','refund-regression'));errorCode(()=>g.requestExecution(id),'AUTHORIZATION_UNAVAILABLE');});
test('wrong room evidence refused',()=>{const {g,id}=setup();errorCode(()=>g.discover(id,ev('support','release-room','x')),'WRONG_ROOM');});
test('replayed evidence event refused',()=>{const {g,id}=setup();g.discover(id,ev('support','support-room','s1'));errorCode(()=>g.discover(id,ev('support','support-room','s1')),'REPLAY');});
test('unknown requirement refused',()=>{const {g,id}=setup();errorCode(()=>g.discover(id,ev('unknown','support-room','q')),'UNKNOWN_REQUIREMENT');});
test('missing evidence cannot be counted as verified',()=>{const {g,id}=setup();errorCode(()=>g.recordInternalVerification(id,vr('support','refund-regression')),'EVIDENCE_MISSING');});
test('wrong command cannot verify support',()=>{const {g,id}=setup();g.discover(id,ev('support','support-room','s1'));errorCode(()=>g.recordInternalVerification(id,vr('support','baseline-tests')),'COMMAND_DENIED');});
test('verification must match exact SHA',()=>{const {g,id}=setup();g.discover(id,ev('support','support-room','s1'));errorCode(()=>g.recordInternalVerification(id,vr('support','refund-regression',0,SHA2)),'STALE_SHA');});
test('invalid digest is refused',()=>{const {g,id}=setup();errorCode(()=>g.discover(id,{...ev('support','support-room','s1'),documentDigest:'banana'}),'INVALID_DIGEST');});
test('conflicting support sources block despite earlier pass',()=>{const {g,id}=setup();readyEngineering(g,id);g.discover(id,ev('support','support-room','s1'));g.recordInternalVerification(id,vr('support','refund-regression'));g.discover(id,{...ev('support','support-room','s2'),documentDigest:sha256('different')});assert.equal(g.describe(id).status,'BLOCKED');});
test('superseded commit invalidates decision',()=>{const {g,id}=setup();readyEngineering(g,id);g.supersede(id,SHA2);assert.equal(g.describe(id).status,'SUPERSEDED');errorCode(()=>g.discover(id,ev('support','support-room','s1')),'SUPERSEDED');});
test('no duplicate decision id',()=>{const g=createGate();g.begin(SHA,'release');errorCode(()=>g.begin(SHA,'release'),'DUPLICATE_ID');});
test('audit records refusal, not fabricated approval',()=>{const {g,id}=setup();errorCode(()=>g.requestExecution(id),'AUTHORIZATION_UNAVAILABLE');assert.deepEqual(g.getAudit(id).map(e=>e.type),['DECISION_CREATED','EXECUTION_REFUSED']);});
test('malformed SHA rejected',()=>errorCode(()=>createGate().begin('HEAD'),'BAD_SHA'));
test('consumer cannot mutate internal state through returned snapshot',()=>{const {g,id}=setup();const s=g.describe(id);s.requirements[0].state='VERIFIED_PASS';assert.equal(g.describe(id).status,'PENDING_EVIDENCE');});
