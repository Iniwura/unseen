import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScopedGatekeeperPolicy, buildScopedAgentPolicy, resolveReportedAgent, sameScopedPolicy } from '../src/switch-admin-policy.mjs';

const room = 'b2043fc6-5a53-44a5-acf9-b755d40d6351';
const identity = '00000000-0000-4000-8000-000000000001';
const old = { rules: [{rooms:'*',room_groups:'*',users:[],agents:[],owner:true,owner_agents:false,platform:false}] };

test('adds only the linked user in release room and preserves owner-only rule', () => {
  const original = structuredClone(old);
  const plan = buildScopedGatekeeperPolicy(old,{roomId:room,externalUserRowId:identity});
  assert.equal(plan.changed,true);
  assert.deepEqual(old,original);
  assert.equal(plan.policy.rules.length,2);
  assert.deepEqual(plan.policy.rules[0],old.rules[0]);
  assert.deepEqual(plan.policy.rules[1],{
    rooms:[room],room_groups:'*',users:[identity],agents:[],owner:false,owner_agents:false,platform:false
  });
});
test('existing exact scoped rule is idempotent', () => {
  const first=buildScopedGatekeeperPolicy(old,{roomId:room,externalUserRowId:identity});
  const second=buildScopedGatekeeperPolicy(first.policy,{roomId:room,externalUserRowId:identity});
  assert.equal(second.changed,false);
  assert.deepEqual(second.policy,first.policy);
});
test('never overwrites open, malformed or unknown authorization state', () => {
  for(const p of [null,{}, {rules:[]}, {rules:'open'}])assert.throws(()=>buildScopedGatekeeperPolicy(p,{roomId:room,externalUserRowId:identity}));
  assert.throws(()=>buildScopedGatekeeperPolicy(old,{roomId:'bad',externalUserRowId:identity}));
});

test('exact policy verification ignores JSON key order but not rule changes', () => {
  const expected = buildScopedGatekeeperPolicy(old,{roomId:room,externalUserRowId:identity}).policy;
  const swapped = {rules: expected.rules.map(rule =>
    Object.fromEntries(Object.entries(rule).reverse())
  )};
  assert.equal(sameScopedPolicy(swapped, expected),true);
  assert.equal(sameScopedPolicy({rules: swapped.rules.slice(0,1)},expected),false);
  assert.equal(sameScopedPolicy(null, expected),false);
});
test('empty room group selector does not make an existing policy effective', () => {
  const unreachable = {rules:[{
    rooms:[room], room_groups:[], users:[identity], agents:[],
    owner:false, owner_agents:false, platform:false
  }]};
  const {changed,policy}=buildScopedGatekeeperPolicy(unreachable,{roomId:room,externalUserRowId:identity});
  assert.equal(changed,true);
  assert.equal(policy.rules.length,2);
});

test('agent scope adds only one exact agent in one room, preserves human/owner grants and is idempotent', () => {
  const engineerId = '00000000-0000-4000-8000-000000000011';
  const supportId = '00000000-0000-4000-8000-000000000022';
  const supportRoom = '202e75f4-aa18-454f-9cee-7d65c59e7bb0';
  const withUser = buildScopedGatekeeperPolicy(old, {roomId:room,externalUserRowId:identity}).policy;
  const scopedEng = buildScopedAgentPolicy(withUser, {roomId:room,agentId:engineerId});
  const scopedSupport = buildScopedAgentPolicy(scopedEng.policy, {roomId:supportRoom,agentId:supportId});
  assert.equal(scopedEng.changed, true);
  assert.equal(scopedSupport.changed, true);
  assert.deepEqual(scopedSupport.policy.rules.slice(0,2), withUser.rules);
  assert.deepEqual(scopedSupport.policy.rules[2], {
    rooms:[room], room_groups:'*', users:[], agents:[engineerId], owner:false, owner_agents:false, platform:false
  });
  assert.deepEqual(scopedSupport.policy.rules[3], {
    rooms:[supportRoom], room_groups:'*', users:[], agents:[supportId], owner:false, owner_agents:false, platform:false
  });
  const repeat = buildScopedAgentPolicy(scopedSupport.policy, {roomId:room,agentId:engineerId});
  assert.equal(repeat.changed, false);
  assert.equal(repeat.policy.rules.length, 4);
  assert.deepEqual(old.rules[0], withUser.rules[0]);
});
test('agent scopes cannot open the gate or accept invalid identifiers', () => {
  const id = '00000000-0000-4000-8000-000000000011';
  assert.throws(() => buildScopedAgentPolicy(null,{roomId:room,agentId:id}));
  assert.throws(() => buildScopedAgentPolicy({rules:[]},{roomId:room,agentId:id}));
  assert.throws(() => buildScopedAgentPolicy(old,{roomId:'*',agentId:id}));
  assert.throws(() => buildScopedAgentPolicy(old,{roomId:room,agentId:'@name:localhost'}));
});
test('sender roles require unique registry entry and exact authenticated room membership', () => {
  const agentId = '00000000-0000-4000-8000-000000000011';
  const report = {
    status:'observed-not-authorized', expectedName:'ini-unseen-engineer', matches:1,
    observed:{senderId:'@switch-agent-37333894:localhost',senderName:'ini-unseen-engineer'}
  };
  const agents=[{id:agentId,name:'ini-unseen-engineer'}];
  const members=[{type:'agent',agent_id:agentId,name:'ini-unseen-engineer'}];
  const verified=resolveReportedAgent(report,members,agents,'ini-unseen-engineer');
  assert.equal(verified.id,agentId);
  assert.equal(verified.senderId,report.observed.senderId);
  assert.throws(()=>resolveReportedAgent({...report,matches:2},members,agents,'ini-unseen-engineer'));
  assert.throws(()=>resolveReportedAgent(report,[],agents,'ini-unseen-engineer'));
  assert.throws(()=>resolveReportedAgent(report,members,[...agents,...agents],'ini-unseen-engineer'));
  assert.throws(()=>resolveReportedAgent({...report,observed:{...report.observed,senderName:'someone-else'}},members,agents,'ini-unseen-engineer'));
  assert.throws(()=>resolveReportedAgent(report,[{...members[0],type:'user'}],agents,'ini-unseen-engineer'));
});
