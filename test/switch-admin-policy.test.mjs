import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScopedGatekeeperPolicy } from '../src/switch-admin-policy.mjs';

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
