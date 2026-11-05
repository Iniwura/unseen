import test from 'node:test';
import assert from 'node:assert/strict';
import { unseenMessage } from '../src/switch-ingest.mjs';
import { originalCandidateSha, evidenceActors, validatedPriorOwner, requireBoundAgentReport } from '../src/live-blocked-preflight.mjs';

const prior = {
  result: 'live-fail-closed-verified', decisionId: 'switch-live-c4f2d8e7-6686-42a8-a620-61074dbcb53b',
  sha: 'b2f571da50c4c3b642b22e60dfd7dee9888c23ff',
  source: 'authenticated-switch-event', replyPosted: true
};
const ownerId = '@switch-mattermost-8e9028a5-665e-4ac3-910e-36add1580068-user:localhost';
const oldMessage = {
  kind:'message',sender:ownerId,sender_name:'user',id:'prior-owner-source',
  body:'@unseen-gatekeeper '+unseenMessage({kind:'release_request',decisionId:prior.decisionId,sha:prior.sha})
};
const ctx = (messages) => ({result:{threads:[{root:{kind:'room_join'},replies:messages}],truncated:false}});
test('live owner comes only from the exact prior successful Switch source', () => {
  assert.equal(validatedPriorOwner(ctx([oldMessage]),prior),ownerId);
  assert.equal(validatedPriorOwner(ctx([oldMessage]),prior,ownerId),ownerId);
  assert.throws(()=>validatedPriorOwner(ctx([oldMessage]),prior,'@wrong:local'),/conflicts/);
  assert.throws(()=>validatedPriorOwner(ctx([]),prior),/uniquely/);
  assert.throws(()=>validatedPriorOwner(ctx([oldMessage,oldMessage]),prior),/uniquely/);
  assert.throws(()=>validatedPriorOwner(ctx([oldMessage]),{...prior,source:'fixture'}),/missing or malformed/);
  assert.throws(()=>validatedPriorOwner(ctx([{...oldMessage,body:'not a command'}]),prior),/uniquely/);
});
test('engineer/support role binding must match exact already-observed Switch reports',()=>{
  const engineer=evidenceActors[0];
  const observed='@switch-agent-37333894:localhost';
  const message={kind:'message',sender:observed,sender_name:engineer.name,
    body:'Live checkout verification complete '+originalCandidateSha+' 60 !== 50'};
  assert.equal(requireBoundAgentReport(ctx([message]),engineer,observed).matched,true);
  assert.throws(()=>requireBoundAgentReport(ctx([message]),engineer,'@other:local'),/not the same/);
  assert.throws(()=>requireBoundAgentReport(ctx([{...message,sender_name:'not-engineer'}]),engineer,observed),/not the same/);
  assert.throws(()=>requireBoundAgentReport(ctx([{...message,body:'unrelated'}]),engineer,observed),/not the same/);
});
