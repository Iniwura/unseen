import { createMemoryStore } from './store.mjs';

export class SwitchIngestError extends Error {
  constructor(code, message) { super(message); this.name = 'SwitchIngestError'; this.code = code; }
}

function assert(ok, code, message) {
  if (!ok) throw new SwitchIngestError(code, message);
}

function participantLookup(participants, id) {
  if (participants instanceof Map) return participants.get(id);
  return participants?.[id];
}

export function parseUnseenMessage(body) {
  if (typeof body !== 'string') return null;
  const prefix = 'UNSEEN/1 ';
  // Mattermost keeps the explicit agent mention in the message body.
  // Strip ONLY Gatekeeper's exact leading handle; never scan a message for
  // a protocol fragment or accept another agent's mention as our command.
  const text = body.replace(/^@unseen-gatekeeper[ \\t]+/i, '');
  if (!text.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(text.slice(prefix.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    throw new SwitchIngestError('MALFORMED_MESSAGE', 'UNSEEN message is not valid JSON');
  }
}

/**
 * Converts authenticated Switch protocol frames into gate transitions. This
 * is intentionally separate from the HTTP server: the server never accepts a
 * caller-supplied sender, room, or "authenticated" flag.
 */
export class SwitchEventIngestor {
  constructor({
    gate,
    agentId,
    roomPolicies,
    participants,
    bridgeId = null,
    eventStore = createMemoryStore(),
    onRemediation = null,
    onCommand = null,
    selfSenderId = agentId
  } = {}) {
    assert(gate && typeof gate.discover === 'function' && typeof gate.approveFromSwitch === 'function', 'BAD_GATE', 'A gate is required');
    assert(typeof agentId === 'string' && agentId.length > 0, 'BAD_AGENT', 'Authenticated agent ID is required');
    assert(roomPolicies && typeof roomPolicies === 'object', 'BAD_ROOMS', 'Room policies are required');
    this.gate = gate;
    this.agentId = agentId;
    this.roomPolicies = roomPolicies;
    this.participants = participants;
    this.bridgeId = bridgeId;
    this.eventStore = eventStore;
    const saved = eventStore.load?.() ?? {};
    this.seen = new Set(saved.seen ?? []);
    this.connectionRooms = new Set();
    this.gapDetected = false;
    this.onRemediation = onRemediation;
    this.onCommand = onCommand;
    this.selfSenderId = selfSenderId;
  }

  persist() { this.eventStore.save?.({ seen: [...this.seen] }); }

  handleConnectionState(frame, connection) {
    assert(frame?.event === 'connection_state', 'BAD_STATE_FRAME', 'First Switch frame must be connection_state');
    assert(frame.data?.agent_id === this.agentId || frame.data?.agentId === this.agentId, 'AGENT_MISMATCH', 'Switch connection belongs to another agent');
    assert(Array.isArray(frame.data?.rooms), 'BAD_STATE_FRAME', 'Switch connection state did not include rooms');
    this.connectionRooms = new Set(frame.data.rooms);
    assert(connection?.authenticated === true, 'UNAUTHENTICATED_CONNECTION', 'Switch connection was not authenticated by the protocol client');
    return { rooms: [...this.connectionRooms], cursor: frame.data.cursor ?? 0, generation: frame.data.generation ?? null };
  }

  handleFrame(frame, connection) {
    assert(connection?.authenticated === true, 'UNAUTHENTICATED_CONNECTION', 'Switch frame did not come from an authenticated connection');
    assert(connection.agentId === this.agentId, 'AGENT_MISMATCH', 'Switch frame agent identity mismatch');
    if (frame.event === 'connection_state') return this.handleConnectionState(frame, connection);
    if (frame.event === 'ping') return { control: 'ping' };
    if (frame.event === 'gap') {
      this.gapDetected = true;
      return { control: 'gap', requiresContextReload: true };
    }
    if (frame.event === 'subscription_changed') {
      this.connectionRooms = new Set(frame.data?.rooms ?? []);
      return { control: 'subscription_changed', rooms: [...this.connectionRooms] };
    }
    if (!['message', 'command', 'room_join'].includes(frame.event)) return { control: frame.event ?? 'unknown' };
    assert(Number.isInteger(frame.id) && frame.id >= 0, 'BAD_EVENT_ID', 'Switch domain events require a numeric sequence ID');
    const roomId = frame.data?.room_id;
    const policy = Object.values(this.roomPolicies).find((candidate) => candidate.roomId === roomId);
    assert(policy, 'ROOM_DENIED', 'Event came from a room outside the UNSEEN policy');
    assert(this.connectionRooms.has(roomId), 'ROOM_NOT_CLAIMED', 'Authenticated connection does not currently cover this room');
    if (this.bridgeId !== null) assert(frame.data.bridge_id === this.bridgeId, 'BRIDGE_MISMATCH', 'Event came from an unexpected Switch bridge');
    const eventKey = `${this.agentId}:${frame.id}`;
    if (this.seen.has(eventKey)) return { duplicate: true, eventId: eventKey };
    const remember = () => { this.seen.add(eventKey); this.persist(); };

    if (frame.event !== 'message') { remember(); return { ignored: true, event: frame.event, eventId: eventKey }; }
    const payload = frame.data.payload;
    assert(payload && typeof payload === 'object', 'BAD_MESSAGE', 'Switch message payload is missing');
    if (payload.sender === this.selfSenderId) {
      remember();
      return { ignored: true, self: true, event: 'message', eventId: eventKey };
    }
    const identity = participantLookup(this.participants, payload.sender);
    assert(identity && typeof identity.kind === 'string' && typeof identity.role === 'string', 'UNTRUSTED_SENDER', 'Message sender is not in the configured Switch participant directory');
    assert(!policy.allowedRoles || policy.allowedRoles.includes(identity.role), 'SENDER_NOT_PERMITTED', 'Sender is not permitted in this room');
    if (payload.addressed !== true) { remember(); return { ignored: true, event: 'message', eventId: eventKey, addressed: false }; }
    const command = parseUnseenMessage(payload.body);
    if (!command) { remember(); return { ignored: true, event: 'message', eventId: eventKey, addressed: true }; }
    const messageId = typeof payload.message_id === 'string' && payload.message_id.length > 0 ? payload.message_id : eventKey;
    if (command.kind === 'evidence') {
      assert(identity.kind === 'agent', 'EVIDENCE_SENDER_DENIED', 'Evidence must be reported by an authorized agent');
      assert(typeof command.decisionId === 'string' && typeof command.requirementId === 'string', 'BAD_EVIDENCE', 'Evidence message is missing its decision or requirement ID');
      const result = this.gate.discover(command.decisionId, {
        requirementId: command.requirementId,
        room: policy.name,
        eventId: messageId,
        documentDigest: command.documentDigest,
        collector: payload.sender
      });
      remember();
      return { accepted: true, type: 'evidence', eventId: eventKey, requirementId: command.requirementId, decision: result };
    }
    if (command.kind === 'approval') {
      assert(identity.kind === 'human' && identity.role === 'release-owner', 'APPROVAL_SENDER_DENIED', 'Only the configured human release owner can approve');
      assert(policy.name === 'release-room', 'APPROVAL_ROOM_DENIED', 'Approval must originate in release-room');
      const result = this.gate.approveFromSwitch(command.decisionId, {
        decisionId: command.decisionId,
        sha: command.sha,
        evidenceDigest: command.evidenceDigest,
        nonce: command.nonce,
        sender: payload.sender,
        room: policy.name,
        eventId: messageId,
        authenticated: true,
        origin: 'switch-websocket'
      });
      remember();
      return { accepted: true, type: 'approval', eventId: eventKey, decision: result };
    }
    if (command.kind === 'release_request') {
      assert(identity.kind === 'human' && identity.role === 'release-owner', 'RELEASE_SENDER_DENIED', 'Only the configured human release owner can request a release');
      assert(policy.name === 'release-room', 'RELEASE_ROOM_DENIED', 'Release requests must originate in release-room');
      assert(typeof this.onCommand === 'function', 'COMMAND_UNAVAILABLE', 'No release command handler is installed');
      const result = this.onCommand({ ...command, sender: payload.sender, room: policy.name, eventId: messageId });
      remember();
      return { accepted: true, type: 'release_request', eventId: eventKey, result, command };
    }
    if (command.kind === 'remediation' || command.kind === 'remediation_ready') {
      assert(identity.kind === 'agent' && identity.role === 'coding-agent', 'REMEDIATION_SENDER_DENIED', 'Only the configured coding agent can submit remediation work');
      assert(typeof this.onRemediation === 'function', 'REMEDIATION_UNAVAILABLE', 'No authorized remediation handler is installed');
      const result = this.onRemediation({ ...command, sender: payload.sender, room: policy.name, eventId: messageId });
      remember();
      return { accepted: true, type: 'remediation', eventId: eventKey, result };
    }
    if (typeof this.onCommand === 'function') {
      const result = this.onCommand({ ...command, sender: payload.sender, room: policy.name, eventId: messageId });
      remember();
      return { accepted: true, type: command.kind ?? 'command', eventId: eventKey, result, command };
    }
    remember();
    return { ignored: true, event: 'message', eventId: eventKey, addressed: true, command: command.kind ?? null };
  }

  markContextReloaded() {
    this.gapDetected = false;
    return true;
  }
}

export function unseenMessage(value) {
  return `UNSEEN/1 ${JSON.stringify(value)}`;
}
