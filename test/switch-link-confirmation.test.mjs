import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedMattermostAccount, assertUsableLinkedIdentity } from '../src/switch-link-confirmation.mjs';

const linked = [
  { id: 'a', bridge_id: 'b', bridge_type: 'mattermost', external_username: 'iniwura', verified: true },
  { id: 'c', bridge_id: 'b', bridge_type: 'mattermost', external_username: 'user', verified: false }
];
test('picks the exact linked Mattermost identity even when another is verified', () => {
  assert.deepEqual(linkedMattermostAccount(linked), linked[1]);
});
test('refuses an absent or duplicate target rather than issuing code for wrong account', () => {
  assert.throws(() => linkedMattermostAccount([linked[0]]));
  assert.throws(() => linkedMattermostAccount([linked[1], linked[1]]));
  assert.throws(() => linkedMattermostAccount(null));
});

test('Switch Core 0.31 treats existing linked accounts as usable without a newer verified field', () => {
  const legacy = { id:'row-1', bridge_id:'bridge-1', bridge_type:'mattermost', external_username:'user' };
  assert.equal(assertUsableLinkedIdentity(legacy, '0.31.0'), 'legacy-claimed-0.31');
  assert.equal(assertUsableLinkedIdentity(legacy, '0.31.1'), 'legacy-claimed-0.31');
  assert.throws(() => assertUsableLinkedIdentity(legacy, null), /Unknown Switch identity/);
  assert.throws(() => assertUsableLinkedIdentity(legacy, '0.32.0'), /Unknown Switch identity/);
});
test('Never skip explicit unverified=false on newer Switch or accept malformed linked account', () => {
  assert.throws(() => assertUsableLinkedIdentity(linked[1], '0.31.0'), /requires its official confirmation/);
  assert.equal(assertUsableLinkedIdentity(linked[0], '0.31.0'), 'verified-confirmation');
  assert.throws(() => assertUsableLinkedIdentity({}, '0.31.0'), /incomplete/);
});
