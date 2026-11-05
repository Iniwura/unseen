import test from 'node:test';
import assert from 'node:assert/strict';
import {planReciprocalAgentPolicy,planMatches,eligibleEngineeringRetry} from '../src/reciprocal-addressing.mjs';

const gatekeeperId='d88a22ec-6691-4481-aaec-1e3e41ac55e0';
const release='b2043fc6-5a53-44a5-acf9-b755d40d6351';
const support='202e75f4-aa18-454f-9cee-7d65c59e7bb0';
const restricted={
 rules:[{ rooms:'*',room_groups:'*',users:[],agents:[],owner:true,owner_agents:false,platform:false }]
};
test('outgoing policy is the exact Gatekeeper agent in the exact room, not a global allow-all',()=>{
  const initial=structuredClone(restricted);
  const plan=planReciprocalAgentPolicy(restricted,{roomId:release,gatekeeperId});
  assert.equal(plan.changed,true);
  assert.equal(plan.reason,'exact-room-gatekeeper-only');
  assert.deepEqual(plan.policy.rules[0],restricted.rules[0]);
  assert.deepEqual(plan.policy.rules[1],{
    rooms:[release],room_groups:'*',users:[],agents:[gatekeeperId],
    owner:false,owner_agents:false,platform:false
  });
  assert.deepEqual(restricted,initial);
  const repeat=planReciprocalAgentPolicy(plan.policy,{roomId:release,gatekeeperId});
  assert.equal(repeat.changed,false);
  assert.ok(planMatches(repeat.policy,plan.policy));
  assert.ok(!planMatches(restricted,plan.policy));
  assert.equal(planReciprocalAgentPolicy(null,{roomId:support,gatekeeperId}).reason,'already-open');
  assert.equal(planReciprocalAgentPolicy({rules:[]},{roomId:support,gatekeeperId}).changed,false);
});
test('bad agent UUID, room UUID, or malformed rules cannot weaken restrictive policy',()=>{
  assert.throws(()=>planReciprocalAgentPolicy(restricted,{roomId:'*',gatekeeperId}),/UUID/);
  assert.throws(()=>planReciprocalAgentPolicy(restricted,{roomId:release,gatekeeperId:'@someone:localhost'}),/UUID/);
  assert.throws(()=>planReciprocalAgentPolicy({rules:'*'},{roomId:release,gatekeeperId}),/Malformed/);
});
const sha='a921b8a5d51c0a8a58fcdcd59c0963ac012d8627';
const id='live-block-a9eb054a-9564-42bf-aaf1-c3b7ee5a9c8c';
const workflow={activeDecisionId:id,pendingVerification:null};
const decision={id,sha,approved:false,executed:false,superseded:false,
 requirements:[{id:'engineering',state:'MISSING'},{id:'support',state:'MISSING'}]};
const live={status:'connected',evidence:'live-switch',rooms:[release,support]};
test('existing pending exact-SHA decision permits one engineering re-request but never new release',()=>{
  assert.deepEqual(eligibleEngineeringRetry({workflow,persistedGate:{decisions:[decision]},live,sha,expectedDecisionId:id}),
    {decisionId:id,sha});
});
test('retry is blocked if disconnected, stale, approval granted or evidence recorded',()=>{
  const input={workflow,persistedGate:{decisions:[decision]},live,sha,expectedDecisionId:id};
  const deny=(overrides)=>assert.throws(()=>eligibleEngineeringRetry({...input,...overrides}));
  deny({live:{...live,status:'disconnected'}});
  deny({workflow:{activeDecisionId:'other'}});
  deny({workflow:{...workflow,pendingVerification:{decisionId:id}}});
  deny({expectedDecisionId:'old'});
  deny({sha:'f'.repeat(40)});
  deny({persistedGate:{decisions:[{...decision,approved:true}]}});
  deny({persistedGate:{decisions:[{...decision,executed:true}]}});
  deny({persistedGate:{decisions:[{...decision,superseded:true}]}});
  deny({persistedGate:{decisions:[{...decision,requirements:[{id:'engineering',state:'DISCOVERED_UNVERIFIED'}]}]}});
  deny({persistedGate:{decisions:[]}});
});
