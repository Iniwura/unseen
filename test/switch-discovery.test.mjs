import test from 'node:test';
import assert from 'node:assert/strict';
import { operationList, roomId, findRoomByExactName } from '../src/switch-discovery.mjs';

test('discovers real Switch rooms from the documented operation result envelope', () => {
  const response = { result: { rooms: [{ id: 'release-id', name: 'release-room' }, { id: 'support-id', name: 'support-room' }] } };
  const rooms = operationList(response, ['rooms', 'data', 'items']);
  assert.equal(roomId(findRoomByExactName(rooms, 'release-room')), 'release-id');
  assert.equal(roomId(findRoomByExactName(rooms, 'support-room')), 'support-id');
});

test('handles nested participant responses and empty responses without inventing IDs', () => {
  const participants = operationList({ result: { data: { participants: [{ id: 'sender-id', name: 'ini-unseen-engineer' }] } } }, ['participants', 'users', 'members', 'data', 'items']);
  assert.deepEqual(participants, [{ id: 'sender-id', name: 'ini-unseen-engineer' }]);
  assert.deepEqual(operationList({ result: { rooms: [] } }, ['rooms', 'data']), []);
  assert.equal(findRoomByExactName([], 'release-room'), undefined);
  assert.equal(roomId(null), null);
});

test('uses exact room names and supports alternative documented identifier fields', () => {
  const rooms = [{ room_id: 'release-id', slug: '#release-room' }, { id: 'release-other', name: 'release-room-old' }];
  assert.equal(roomId(findRoomByExactName(rooms, 'release-room')), 'release-id');
  assert.equal(findRoomByExactName(rooms, 'release'), undefined);
});
