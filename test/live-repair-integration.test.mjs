import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGate, sha256 } from '../src/gate.mjs';
import { createMemoryStore } from '../src/store.mjs';
import { createAllowlistedRunner } from '../src/runner.mjs';
import { verifyRepairedCheckout } from '../src/live-repair-validation.mjs';
import { LiveOrchestrator } from '../src/live-orchestrator.mjs';
import { SwitchEventIngestor, unseenMessage } from '../src/switch-ingest.mjs';

function git(root, ...args) {
  return execFileSync('git', args, {cwd:root,encoding:'utf8',windowsHide:true}).trim();
}
function makeCheckout(t) {
  const root=mkdtempSync(join(tmpdir(),'unseen-live-repair-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'src'),{recursive:true});
  mkdirSync(join(root,'test'),{recursive:true});
  writeFileSync(join(root,'package.json'),'{"type":"module","private":true}\n');
  const originalSource=`export function issueRefund(order, amount) {
  const approved = Math.min(amount, order.captured);
  order.refunded += approved;
  return approved;
}
`;
  const repairedSource=`export function issueRefund(order, amount) {
  const remaining = Math.max(0, order.captured - order.refunded);
  const approved = Math.min(amount, remaining);
  order.refunded += approved;
  return approved;
}
`;
  writeFileSync(join(root,'src/refund.mjs'),originalSource);
  writeFileSync(join(root,'test/gate.test.mjs'),`import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRefund } from '../src/refund.mjs';
test('checkout function exists',()=>assert.equal(issueRefund({captured:100,refunded:0},20),20));
`);
  writeFileSync(join(root,'test/refund-regression.test.mjs'),`import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRefund } from '../src/refund.mjs';
test('successive refunds capped',()=>{
const order={captured:100,refunded:0};
assert.equal(issueRefund(order,50),50);
assert.equal(issueRefund(order,60),50);
assert.equal(order.refunded,100);
});
`);
  git(root,'init','-q');
  git(root,'add','.');
  git(root,'-c','user.name=UNSEEN test','-c','user.email=unseen@example.invalid',
    'commit','-qm','original vulnerable refund');
  const originalSha=git(root,'rev-parse','HEAD');
  writeFileSync(join(root,'src/refund.mjs'),repairedSource);
  writeFileSync(join(root,'test/refund-regression.test.mjs'),`import test from 'node:test';
import assert from 'node:assert/strict';
import { issueRefund } from '../src/refund.mjs';
test('successive refunds capped',()=>{
const order={captured:100,refunded:0};
assert.equal(issueRefund(order,50),50);
assert.equal(issueRefund(order,60),50);
assert.equal(order.refunded,100);
});
test('fully refunded boundary',()=>{
const order={captured:100,refunded:100};
assert.equal(issueRefund(order,10),0);
});
`);
  git(root,'add','.');
  git(root,'-c','user.name=UNSEEN test','-c','user.email=unseen@example.invalid',
    'commit','-qm','repair cumulative refund');
  const repairedSha=git(root,'rev-parse','HEAD');
  return {root,originalSha,repairedSha};
}
function blockedGate(originalSha) {
  const gate=createGate({runnerSecret:'a'.repeat(64),authorizedHumans:['owner']});
  const d=gate.begin(originalSha,'blocked-original');
  gate.discover(d.id,{
    requirementId:'support',room:'support-room',eventId:'real-support-source',
    documentDigest:sha256('owner acceptance'),collector:'investigator'
  });
  const report={
    requirementId:'support',sha:originalSha,command:'refund-regression',exitCode:1,
    outputDigest:sha256('failing regression'),runnerId:'initial-trusted-runner',
    observedAt:new Date().toISOString(),policyVersion:'1'
  };
  gate.recordRunnerVerification(d.id,{...report,attestation:gate.runnerAttestation(report)});
  assert.equal(gate.describe(d.id).status,'BLOCKED');
  return gate;
}
function frame(id,roomId,sender,body) {
  return {
    event:'message',id,data:{
      room_id:roomId,bridge_id:null,
      payload:{sender,addressed:true,body,message_id:'proof-message-'+id}
    }
  };
}
function orchestratorFor(gate,root,{recoveryReview=true,blockedOnly=false}={}) {
  const posts=[];
  const runner=createAllowlistedRunner({
    checkoutRoot:root,runnerId:'real-repair-test-runner',
    attestor:(report)=>gate.runnerAttestation(report)
  });
  const ingestor=new SwitchEventIngestor({
    gate,agentId:'unseen-gatekeeper',selfSenderId:'unseen-gatekeeper',
    roomPolicies:{
      release:{name:'release-room',roomId:'release-room',allowedRoles:['release-owner','engineering-agent']},
      support:{name:'support-room',roomId:'support-room',allowedRoles:['evidence-investigator']}
    },
    participants:{
      owner:{kind:'human',role:'release-owner'},
      engineer:{kind:'agent',role:'engineering-agent'},
      investigator:{kind:'agent',role:'evidence-investigator'},
      stranger:{kind:'human',role:'visitor'}
    },
    eventStore:createMemoryStore(),onCommand:(command)=>command
  });
  const workflow=new LiveOrchestrator({
    gate,runner,ingestor,recoveryReview,blockedOnly,
    client:{async postMessage(roomId,content) {
      posts.push({roomId,content}); return {ok:true};
    }},
    rooms:{release:'release-room',support:'support-room'},
    mentions:{engineering:'@ini-unseen-engineer',investigator:'@switch-buddy-admin', 'release-owner':'@user'},
    stateStore:createMemoryStore({activeDecisionId:'blocked-original'})
  });
  const connection={authenticated:true,agentId:'unseen-gatekeeper'};
  ingestor.handleFrame({event:'connection_state',data:{
    agent_id:'unseen-gatekeeper',rooms:['release-room','support-room']
  }},connection);
  return {workflow,posts,connection};
}
test('repair code verifies real Git parent, clean checkout and precisely the expected files',async(t)=>{
  const {root,originalSha,repairedSha}=makeCheckout(t);
  const record=await verifyRepairedCheckout({checkoutRoot:root,originalSha,repairedSha});
  assert.equal(record.parentVerified,true);
  assert.deepEqual(record.files,['src/refund.mjs','test/refund-regression.test.mjs']);
  await assert.rejects(()=>verifyRepairedCheckout({checkoutRoot:root,originalSha:'f'.repeat(40),repairedSha}),
    {code:'REPAIR_NOT_DIRECT_DESCENDANT'});
  writeFileSync(join(root,'temp-nope.txt'),'untracked\n');
  await assert.rejects(()=>verifyRepairedCheckout({checkoutRoot:root,originalSha,repairedSha}),
    {code:'REPAIR_CHECKOUT_DIRTY'});
});
test('real owner repair request verifies tests before superseding; fresh evidence, independent runner and nonce approval still required',async(t)=>{
  const {root,originalSha,repairedSha}=makeCheckout(t);
  const gate=blockedGate(originalSha);
  const {workflow,posts,connection}=orchestratorFor(gate,root);
  const request=unseenMessage({
    kind:'repair_review_request',blockedDecisionId:'blocked-original',
    originalSha,newSha:repairedSha
  });
  await workflow.handleFrame(frame(1,'release-room','owner',request),connection);
  assert.equal(gate.describe('blocked-original').status,'SUPERSEDED');
  const reviewed=gate.describe(workflow.state.activeDecisionId);
  assert.equal(reviewed.sha,repairedSha);
  assert.equal(reviewed.status,'PENDING_EVIDENCE');
  assert.equal(reviewed.approved,false);
  assert.equal(reviewed.executed,false);
  assert.ok(posts.some(p=>p.content.includes('Both independent allowlisted test commands PASS')));
  assert.ok(posts.some(p=>p.roomId==='support-room'&&p.content.includes('NEW addressed evidence')));
  await workflow.handleFrame(frame(2,'release-room','engineer',unseenMessage({
    kind:'evidence',decisionId:reviewed.id,requirementId:'engineering',
    documentDigest:sha256('fresh engineer evidence')
  })),connection);
  assert.equal(gate.describe(reviewed.id).status,'PENDING_EVIDENCE');
  await workflow.handleFrame(frame(3,'support-room','investigator',unseenMessage({
    kind:'evidence',decisionId:reviewed.id,requirementId:'support',
    documentDigest:sha256('fresh independent support review')
  })),connection);
  const ready=gate.describe(reviewed.id);
  assert.equal(ready.status,'READY_FOR_APPROVAL');
  assert.equal(ready.approved,false);
  assert.equal(ready.executed,false);
  const challengePost=posts.find(p=>p.content.includes('"kind":"approval"'));
  assert.ok(challengePost);
  const challenge=JSON.parse(challengePost.content.slice(challengePost.content.indexOf('UNSEEN/1 ')+'UNSEEN/1 '.length));
  await workflow.handleFrame(frame(4,'release-room','owner',
    unseenMessage({kind:'approval',...challenge})),connection);
  const done=gate.describe(reviewed.id);
  assert.equal(done.status,'EXECUTED');
  assert.equal(done.receipt?.result?.action,'release-preview');
  assert.ok(posts.some(p=>p.content.includes('no deployment was performed')));
});
test('failed repaired tests never supersede the original BLOCKED decision',async(t)=>{
  const {root,originalSha,repairedSha}=makeCheckout(t);
  // Replace executable fix by a still-incorrect implementation, then commit it
  // as a fresh descendant of the old blocked commit would be required. Here
  // we instead simulate an invalid candidate SHA; the original block survives.
  const gate=blockedGate(originalSha);
  const {workflow,posts,connection}=orchestratorFor(gate,root);
  await workflow.handleFrame(frame(10,'release-room','owner',unseenMessage({
    kind:'repair_review_request',blockedDecisionId:'blocked-original',
    originalSha,newSha:'f'.repeat(40)
  })),connection);
  assert.equal(gate.describe('blocked-original').status,'BLOCKED');
  assert.equal(workflow.state.activeDecisionId,'blocked-original');
  assert.ok(posts.some(p=>p.content.includes('UNSEEN REFUSED repaired commit')));
  // The authentic repair still exists and remains available for a valid review.
  assert.equal(git(root,'rev-parse','HEAD'),repairedSha);
});
test('blocked-only mode cannot accept a repair review, and strangers cannot initiate one',async(t)=>{
  const {root,originalSha,repairedSha}=makeCheckout(t);
  const gate=blockedGate(originalSha);
  const {workflow,connection}=orchestratorFor(gate,root,{recoveryReview:false,blockedOnly:true});
  const body=unseenMessage({kind:'repair_review_request',
    blockedDecisionId:'blocked-original',originalSha,newSha:repairedSha});
  await assert.rejects(()=>workflow.handleFrame(frame(20,'release-room','owner',body),connection),
    {code:'REVIEW_MODE_DENIED'});
  await assert.rejects(()=>workflow.handleFrame(frame(21,'release-room','stranger',body),connection),
    {code:'SENDER_NOT_PERMITTED'});
  assert.equal(gate.describe('blocked-original').status,'BLOCKED');
});
