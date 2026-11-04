import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { SwitchClient } from '../src/switch-client.mjs';
import { createMemoryStore } from '../src/store.mjs';

class FakeSocket extends EventEmitter {
  static instances = [];
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.sent = [];
    FakeSocket.instances.push(this);
    queueMicrotask(() => this.emit('open'));
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.emit('close'); }
}

test('Switch client uses bearer HTTP and current WebSocket resume protocol', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  const store = createMemoryStore();
  const client = new SwitchClient({ bridgeUrl: 'http://switch.local/bridge', agentId: 'agent-1', apiKey: 'secret', fetchImpl, WebSocketImpl: FakeSocket, connectionStore: store });
  const frames = [];
  const connection = await client.connect({ rooms: ['room-a', 'room-b'], onFrame: (frame) => frames.push(frame) });
  const socket = FakeSocket.instances.at(-1);
  assert.match(socket.url, /^ws:\/\/switch\.local\/bridge\/agents\/agent-1\/connection\/ws\?/);
  assert.equal(socket.options.headers.Authorization, 'Bearer secret');
  socket.emit('message', JSON.stringify({ type: 'connection_state', agent_id: 'agent-1', generation: 4, cursor: 11, rooms: ['room-a'] }));
  socket.emit('message', JSON.stringify({ event: 'message', id: 12, data: { type: 'message', room_id: 'room-a', payload: {} } }));
  socket.emit('message', JSON.stringify({ type: 'ping' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(frames[0].event, 'connection_state');
  assert.equal(frames[1].id, 12);
  assert.deepEqual(socket.sent, [{ type: 'pong', cursor: 12 }]);
  assert.equal(store.load().cursor, 12);
  await client.operation('post_message', { room_id: 'room-a', content: 'hello' }, { connectionId: connection.connectionId });
  assert.equal(requests.at(-1).options.headers.authorization, 'Bearer secret');
  assert.equal(requests.at(-1).options.headers['x-switch-connection-id'], connection.connectionId);
});
