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

class ReconnectingSocket extends EventEmitter {
  static instances = [];
  static onOpen = null;
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.sent = [];
    this.index = ReconnectingSocket.instances.push(this) - 1;
    queueMicrotask(() => {
      this.emit('open');
      ReconnectingSocket.onOpen?.(this, this.index);
    });
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { if (!this.closed) { this.closed = true; this.emit('close', 1000, 'closed'); } }
}

test('resilient Switch connection reuses the persisted cursor after disconnect', async () => {
  ReconnectingSocket.instances = [];
  const store = createMemoryStore({ connectionId: 'resume-me', cursor: 4, generation: 2, rooms: ['room-a'] });
  const controller = new AbortController();
  ReconnectingSocket.onOpen = (socket, index) => {
    if (index === 0) {
      socket.emit('message', JSON.stringify({ event: 'message', id: 5, data: { room_id: 'room-a', payload: {} } }));
      queueMicrotask(() => socket.emit('close', 1006, 'network drop'));
    } else {
      setTimeout(() => controller.abort(), 10);
    }
  };
  const client = new SwitchClient({ bridgeUrl: 'http://switch.local/bridge', agentId: 'agent-1', apiKey: 'secret', WebSocketImpl: ReconnectingSocket, connectionStore: store });
  await client.runResilient({ maxReconnects: 2, initialDelayMs: 0, signal: controller.signal });
  assert.equal(ReconnectingSocket.instances.length, 2);
  const resumed = new URL(ReconnectingSocket.instances[1].url);
  assert.equal(resumed.searchParams.get('connection_id'), 'resume-me');
  assert.equal(resumed.searchParams.get('start_from'), '5');
  assert.equal(resumed.searchParams.get('expected_generation'), '2');
  ReconnectingSocket.onOpen = null;
});

test('resilient Switch connection stops after a taken-over eviction', async () => {
  ReconnectingSocket.instances = [];
  ReconnectingSocket.onOpen = (socket) => {
    socket.emit('message', JSON.stringify({ event: 'evicted', data: { code: 'taken_over' } }));
    queueMicrotask(() => socket.emit('close', 4001, 'taken over'));
  };
  const client = new SwitchClient({ bridgeUrl: 'http://switch.local/bridge', agentId: 'agent-1', apiKey: 'secret', WebSocketImpl: ReconnectingSocket, connectionStore: createMemoryStore() });
  const connection = await client.runResilient({ maxReconnects: 3, initialDelayMs: 0 });
  assert.equal(connection.evictionCode, 'taken_over');
  assert.equal(ReconnectingSocket.instances.length, 1);
  ReconnectingSocket.onOpen = null;
});

test('connection frame handling is serialized before a reconnect is allowed', async () => {
  class OrderedSocket extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => {
        this.emit('open');
        this.emit('message', JSON.stringify({ event: 'message', id: 1, data: {} }));
        this.emit('message', JSON.stringify({ event: 'message', id: 2, data: {} }));
        this.emit('close', 1006, 'network drop');
      });
    }
    send() {}
    close() {}
  }
  const order = [];
  const client = new SwitchClient({ bridgeUrl: 'http://switch.local', agentId: 'agent-1', apiKey: 'secret', WebSocketImpl: OrderedSocket });
  const connection = await client.connect({ onFrame: async (frame) => { order.push(`start-${frame.id}`); await new Promise((resolve) => setTimeout(resolve, frame.id === 1 ? 5 : 0)); order.push(`end-${frame.id}`); } });
  await connection.closedPromise;
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2']);
});

test('room participant discovery uses the authenticated explicit-room read endpoint', async () => {
  const requests = [];
  const client = new SwitchClient({
    bridgeUrl: 'http://127.0.0.1:64821',
    agentId: 'gatekeeper',
    apiKey: 'private-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ participants: [{ agent_id: 'engineer-id', name: 'ini-unseen-engineer', type: 'agent' }] }) };
    }
  });
  const result = await client.listParticipants('room-id');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:64821/agents/rooms/room-id/participants');
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.authorization, 'Bearer private-key');
  assert.equal(Object.hasOwn(requests[0].options.headers, 'x-switch-connection-id'), false);
  assert.deepEqual(result.participants[0].agent_id, 'engineer-id');
});

test('WebSocket connection uses the exact root agents route with no duplicate slash', async () => {
  for (const base of ['http://127.0.0.1:64821', 'http://127.0.0.1:64821/']) {
    const client = new SwitchClient({
      bridgeUrl: base, agentId: 'gatekeeper', apiKey: 'private-key', WebSocketImpl: FakeSocket
    });
    const connection = await client.connect({ rooms: ['release-id', 'support-id'], scope: 'all' });
    const endpoint = new URL(FakeSocket.instances.at(-1).url);
    assert.equal(endpoint.pathname, '/agents/gatekeeper/connection/ws');
    assert.equal(endpoint.searchParams.get('rooms'), 'release-id,support-id');
    connection.close();
  }
});
