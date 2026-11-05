import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedMattermostAccount } from '../src/switch-link-confirmation.mjs';

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
