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
  return url;
}

function normalizeFrame(value) {
  const frame = typeof value === 'string' || Buffer.isBuffer(value) ? JSON.parse(value.toString()) : value;
  if (frame && typeof frame.event === 'string' && frame.data && typeof frame.data === 'object') {
    return { event: frame.event, id: frame.id ?? null, data: frame.data };
  }
  return { event: frame?.type ?? null, id: null, data: frame };
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
  listParticipants(roomId, options) { return this.operation('list_participants', { room_id: roomId }, options); }
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
    const state = { socket, connectionId, agentId: this.agentId, authenticated: false, cursor: saved.cursor ?? 0, generation: saved.generation ?? null, rooms: [], closed: false };
    const connection = {
      ...state,
      send: (value) => socket.send(JSON.stringify(value)),
      close: () => { state.closed = true; socket.close(); }
    };
    const opened = new Promise((resolve, reject) => {
      socket.once('open', () => { state.authenticated = true; connection.authenticated = true; resolve(connection); });
      socket.once('error', reject);
    });
    socket.on('message', async (raw) => {
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
        } else if (Number.isInteger(frame.id)) {
          state.cursor = Math.max(state.cursor, frame.id);
          this.connectionStore?.save?.({ connectionId, cursor: state.cursor, generation: state.generation, rooms: state.rooms });
        }
        await onFrame(frame, connection);
      } catch (error) {
        onError(error);
      }
    });
    socket.on('error', onError);
    socket.on('close', () => { state.closed = true; });
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
}

export { normalizeFrame };
