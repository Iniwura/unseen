import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export class SwitchProtocolError extends Error {
  constructor(code, message, status = null, body = null) {
    super(message);
    this.name = 'SwitchProtocolError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

function assert(ok, code, message) {
  if (!ok) throw new SwitchProtocolError(code, message);
}

function toSocketUrl(httpUrl) {
  const url = new URL(httpUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  // WHATWG URL serializes an origin with a trailing slash. Appending
  // `/agents/...` without trimming it creates `//agents/...`, which
  // Switch's strict WebSocket route does not accept.
  return url.href.replace(/\/$/, '');
}

function normalizeFrame(value) {
  const frame = typeof value === 'string' || Buffer.isBuffer(value) ? JSON.parse(value.toString()) : value;
  if (frame && typeof frame.event === 'string' && frame.data && typeof frame.data === 'object') {
    return { event: frame.event, id: frame.id ?? null, data: frame.data };
  }
  return { event: frame?.type ?? null, id: null, data: frame };
}

function waitFor(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let timer;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

export class SwitchClient {
  constructor({
    bridgeUrl,
    agentId,
    apiKey,
    registrationKey,
    fetchImpl = fetch,
    WebSocketImpl = WebSocket,
    connectionStore = null,
    clientName = 'unseen-switch-client',
    clientVersion = '0.2.0'
  } = {}) {
    assert(typeof bridgeUrl === 'string' && bridgeUrl.length > 0, 'BAD_BRIDGE_URL', 'Switch bridge URL is required');
    this.bridgeUrl = bridgeUrl.replace(/\/$/, '');
    this.agentId = agentId ?? null;
    this.apiKey = apiKey ?? null;
    this.registrationKey = registrationKey ?? null;
    this.fetchImpl = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
    this.connectionStore = connectionStore;
    this.clientName = clientName;
    this.clientVersion = clientVersion;
  }

  async request(path, { method = 'GET', body, bearer = this.apiKey, headers = {} } = {}) {
    const requestHeaders = { accept: 'application/json', ...headers };
    if (body !== undefined) requestHeaders['content-type'] = 'application/json';
    if (bearer) requestHeaders.authorization = `Bearer ${bearer}`;
    const response = await this.fetchImpl(`${this.bridgeUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
    if (!response.ok) {
      throw new SwitchProtocolError('HTTP_ERROR', `Switch returned HTTP ${response.status}`, response.status, parsed);
    }
    return parsed;
  }

  health() { return this.request('/health', { bearer: null }); }

  async register({ name, description, displayName = name, connectionModel = 'always_on', connectorType = 'unseen', overwrite = false } = {}) {
    assert(!this.agentId && this.registrationKey, 'REGISTRATION_CONFIG', 'Registration requires a registration key and no existing agent');
    const result = await this.request('/agents', {
      method: 'POST',
      bearer: this.registrationKey,
      body: {
        name,
        description,
        display_name: displayName,
        connector_type: connectorType,
        overwrite,
        integration_profile: {
          connection_model: connectionModel,
          message_exchange: true,
          pre_invocation_mediation: [],
          post_invocation_mediation: [],
          event_reporting: []
        }
      }
    });
    assert(typeof result?.id === 'string' && typeof result?.api_key === 'string', 'BAD_REGISTRATION_RESPONSE', 'Switch registration did not return an agent ID and API key');
    this.agentId = result.id;
    this.apiKey = result.api_key;
    return { agentId: this.agentId, apiKey: this.apiKey };
  }

  operation(operation, args = {}, { connectionId = null } = {}) {
    assert(this.agentId && this.apiKey, 'AUTH_REQUIRED', 'Switch agent credentials are required');
    const headers = connectionId ? { 'x-switch-connection-id': connectionId } : {};
    return this.request(`/agents/${encodeURIComponent(this.agentId)}/ops/${encodeURIComponent(operation)}`, { method: 'POST', body: args, headers });
  }

  updateAgentDetail(args) { return this.operation('update_agent_detail', args); }
  postMessage(roomId, content) { return this.request(`/agents/${encodeURIComponent(this.agentId)}/message`, { method: 'POST', body: { room_id: roomId, content } }); }
  listRooms() { return this.operation('list_rooms'); }
  getRoomDetail(roomId, options) { return this.operation('get_room_detail', { room_id: roomId }, options); }
  // The list_participants operation accepts no room_id: it only reads the currently connected room.
  // This authenticated read-only endpoint accepts an explicit room and verifies membership.
  listParticipants(roomId) { return this.request(`/agents/rooms/${encodeURIComponent(roomId)}/participants`); }
  readContext(roomId, options) { return this.operation('read_context', { room_id: roomId }, options); }
  sendTargetedMessage(roomId, recipientId, content, options) { return this.operation('send_targeted_message', { room_id: roomId, recipient_id: recipientId, content }, options); }

  async connect({ rooms = [], scope = 'all', filter = 'all', onFrame = () => {}, onError = () => {} } = {}) {
    assert(this.agentId && this.apiKey, 'AUTH_REQUIRED', 'Switch agent credentials are required');
    const saved = this.connectionStore?.load?.() ?? {};
    const connectionId = saved.connectionId ?? randomUUID();
    const params = new URLSearchParams({
      connection_id: connectionId,
      scope,
      filter,
      start_from: saved.cursor === undefined ? 'head' : String(saved.cursor),
      client: this.clientName,
      client_version: this.clientVersion,
      protocol: '6',
      protocol_accepts: '6'
    });
    if (rooms.length > 0) params.set('rooms', rooms.join(','));
    if (saved.generation !== undefined && saved.generation !== null) params.set('expected_generation', String(saved.generation));
    const socketUrl = `${toSocketUrl(this.bridgeUrl)}/agents/${encodeURIComponent(this.agentId)}/connection/ws?${params}`;
    const socket = new this.WebSocketImpl(socketUrl, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    let closeResolve;
    const closedPromise = new Promise((resolve) => { closeResolve = resolve; });
    const state = { socket, connectionId, agentId: this.agentId, authenticated: false, cursor: saved.cursor ?? 0, generation: saved.generation ?? null, rooms: [], closed: false, evictionCode: null, closeReason: null };
    const connection = {
      ...state,
      send: (value) => socket.send(JSON.stringify(value)),
      closedPromise,
      close: () => { state.closed = true; socket.close(); }
    };
    const opened = new Promise((resolve, reject) => {
      socket.once('open', () => { state.authenticated = true; connection.authenticated = true; resolve(connection); });
      socket.once('error', reject);
    });
    let frameChain = Promise.resolve();
    socket.on('message', (raw) => {
      frameChain = frameChain.then(async () => {
        try {
          const frame = normalizeFrame(raw);
          if (frame.event === 'connection_state') {
            state.cursor = frame.data.cursor ?? state.cursor;
            state.generation = frame.data.generation ?? state.generation;
            state.rooms = Array.isArray(frame.data.rooms) ? [...frame.data.rooms] : [];
            connection.rooms = state.rooms;
            connection.cursor = state.cursor;
            this.connectionStore?.save?.({ connectionId, cursor: state.cursor, generation: state.generation, rooms: state.rooms });
          } else if (frame.event === 'ping') {
            connection.send({ type: 'pong', cursor: state.cursor });
          } else if (frame.event === 'evicted') {
            state.evictionCode = frame.data?.code ?? null;
            connection.evictionCode = state.evictionCode;
          } else if (Number.isInteger(frame.id)) {
            state.cursor = Math.max(state.cursor, frame.id);
            this.connectionStore?.save?.({ connectionId, cursor: state.cursor, generation: state.generation, rooms: state.rooms });
          }
          await onFrame(frame, connection);
        } catch (error) {
          onError(error);
        }
      });
    });
    socket.on('error', onError);
    socket.on('close', (code, reason) => {
      state.closed = true;
      state.closeReason = reason?.toString?.() ?? null;
      connection.closed = true;
      connection.evictionCode = state.evictionCode;
      connection.closeReason = state.closeReason;
      frameChain.then(() => closeResolve({ code, reason: state.closeReason, evictionCode: state.evictionCode }), () => closeResolve({ code, reason: state.closeReason, evictionCode: state.evictionCode }));
    });
    return opened;
  }

  async connectWithRetry({ retries = 5, initialDelayMs = 500, ...options } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try { return await this.connect(options); } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        await new Promise((resolve) => setTimeout(resolve, initialDelayMs * (2 ** attempt)));
      }
    }
    throw lastError;
  }

  /**
   * Keep one authenticated connection alive. A reconnect reuses the persisted
   * connection ID, cursor, and generation; a `taken_over` eviction is final.
   * The caller owns the AbortSignal so a normal shutdown is explicit.
   */
  async runResilient({ maxReconnects = Infinity, initialDelayMs = 500, maxDelayMs = 10_000, signal, onConnection = () => {}, ...options } = {}) {
    let reconnects = 0;
    while (!signal?.aborted) {
      let connection;
      try {
        connection = await this.connect(options);
      } catch (error) {
        await onConnection({ status: 'connect-error', error });
        if (reconnects >= maxReconnects) throw error;
        await waitFor(Math.min(maxDelayMs, initialDelayMs * (2 ** reconnects)), signal);
        reconnects += 1;
        continue;
      }
      reconnects = 0;
      await onConnection({ status: 'connected', connection });
      const closeResult = await Promise.race([
        connection.closedPromise,
        signal ? (signal.aborted ? Promise.resolve({ aborted: true }) : new Promise((resolve) => signal.addEventListener('abort', () => resolve({ aborted: true }), { once: true }))) : new Promise(() => {})
      ]);
      if (closeResult?.aborted) {
        await onConnection({ status: 'closed', connection, closeResult });
        connection.close();
        return connection;
      }
      await onConnection({ status: closeResult?.evictionCode === 'taken_over' ? 'taken_over' : 'disconnected', connection, closeResult });
      if (closeResult?.evictionCode === 'taken_over') return connection;
      if (reconnects >= maxReconnects) throw new SwitchProtocolError('RECONNECT_EXHAUSTED', 'Switch connection closed and reconnect limit was reached');
      await waitFor(Math.min(maxDelayMs, initialDelayMs * (2 ** reconnects)), signal);
      reconnects += 1;
    }
    return null;
  }
}

export { normalizeFrame };
