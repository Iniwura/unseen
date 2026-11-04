# UNSEEN

UNSEEN is an evidence-driven release gate for a human and AI agents working together through Switch. It keeps the release owner attached to one exact Git commit while engineering and support rooms gather the facts that a normal green build can miss.

The signature flow is a checkout release that looks safe, an overlooked support requirement recovered in `support-room`, a real refund regression that blocks the candidate, an independently tested repair, and a human approval bound to the repaired commit and evidence digest.

## What is real here

Implemented and locally verified:

- Current Switch agent protocol client: bearer-authenticated HTTP operations plus WebSocket connections, cursor resume, heartbeats, control frames, gaps, and reconnection state.
- `release-room` / `support-room` event policy with exact room IDs, configured participant identities, sender roles, duplicate-event handling, addressed-message handling, and cross-room denial.
- Durable decision state and audit history using atomic JSON writes.
- Fail-closed release policy: missing evidence, failed verification, contradictions, stale SHA, stale evidence, forged runner reports, unauthorized human senders, replayed approvals, and reused capabilities are rejected.
- An allowlisted process runner with fixed argv, no shell, exact Git `HEAD` binding, output hashing, timeout, output limits, and HMAC runner attestations.
- Nonce-bound human approval from an authenticated Switch event and a single-use execution capability with a receipt or failure record.
- Read-only release board with a responsive evidence-oriented interface, state API, audit API, and counterfactual replay endpoint.
- An actual local checkout demo. It creates a Git repository, runs a passing baseline, runs a real failing successive-refund test, commits a repair, retests the exact repaired SHA, and produces an approval receipt.

The local demo uses a clearly labelled protocol harness because this environment has no Switch Console, Docker, or authenticated Switch server. It does not claim those local frames are live Switch traffic.

## Run it

Requires Node.js 20+.

```bash
npm install
npm test
npm run demo
npm run diagnose:switch
npm run register:switch
npm run discover:switch
npm run reset:local
npm run replay
npm start
```

`npm test` runs the preserved Phase 1 tests plus security, Switch-ingestion, runner, and server tests. `npm run demo` is the reproducible Blind-Spot Recovery workflow and reports the exact temporary commit hashes and test output digests it observed.

The board is available at `http://127.0.0.1:4173`. It is intentionally read-only: state changes must originate from the authenticated Switch adapter or local trusted runner, never from a browser request.

`npm run replay` repeats the local protocol-harness recovery. `npm run reset:local` removes only the repository-local `.unseen/` state directory. `npm run diagnose:switch` discovers the Switch Console's native local-server ports, checks configuration presence, the checkout path, runtime availability, and unauthenticated bridge health without printing secret values. After the local server is running, `npm run register:switch` uses the local bootstrap registration token in-process, saves only the returned Gatekeeper credentials to ignored owner-only `.env.local`, and `npm run discover:switch` uses authenticated `list_rooms`/`list_participants` operations to resolve exact room IDs. It never guesses IDs or prints credentials.

## Switch setup

UNSEEN follows the current official protocol: register once with `POST /agents`, keep the returned agent API key, connect over `/agents/{id}/connection/ws`, answer `ping` frames with `{ "type": "pong", "cursor": n }`, resume with the stored cursor and generation, and call the operation registry over HTTP. SSE is not used because the current documentation marks it as deprecated.

Create two rooms in Switch Console / bundled Mattermost:

- `release-room`: release owner, engineering agent, and UNSEEN.
- `support-room`: support evidence investigator, authorized coding agent, and UNSEEN.

The adapter expects addressed messages with this explicit envelope:

```text
UNSEEN/1 {"kind":"release_request","decisionId":"…","sha":"…"}
UNSEEN/1 {"kind":"evidence","decisionId":"…","requirementId":"support","documentDigest":"…"}
UNSEEN/1 {"kind":"remediation_ready","decisionId":"…","newSha":"…"}
UNSEEN/1 {"kind":"approval","decisionId":"…","sha":"…","evidenceDigest":"…","nonce":"…"}
```

The live coordinator in `scripts/live-bridge.mjs` turns those authenticated events into the complete visible workflow: it asks engineering for baseline evidence, asks the investigator for support evidence, runs the fixed allowlisted commands against the exact candidate SHA, blocks failed regressions, asks the coding agent for a repaired SHA, independently retests that SHA, and issues a one-use approval challenge. A human approval produces an auditable preview receipt; it never deploys from the chat adapter.

For a single local setup file, start the Switch Console Local server, then run the secret-safe bootstrap and discovery path:

```bash
npm run diagnose:switch
npm run register:switch
npm run discover:switch
npm run connect:switch
```

`register:switch` discovers the native Core endpoint and reads the local registration bootstrap token only in memory. It saves the returned Gatekeeper ID/API key and exact room IDs only to ignored owner-only `.env.local`; it never logs or writes the bootstrap token. Remaining human/agent role IDs are intentionally explicit configuration, not inferred from names. The bridge also persists only cursors, workflow state, audit state, and sanitized connection status under `.unseen/`; it never logs or writes the API key.

The message body is not authentication. The adapter authenticates the WebSocket connection, checks the server-provided connection state and room membership, matches the opaque Switch sender ID against its configured participant directory, and only then forwards the event to the gate.

A minimal server-side connection looks like this:

```js
import { SwitchClient } from './src/switch-client.mjs';
import { SwitchEventIngestor } from './src/switch-ingest.mjs';
import { createJsonStore } from './src/store.mjs';

const client = new SwitchClient({
  bridgeUrl: process.env.SWITCH_BRIDGE_URL,
  agentId: process.env.SWITCH_AGENT_ID,
  apiKey: process.env.SWITCH_AGENT_API_KEY,
  connectionStore: createJsonStore('.unseen/switch-connection.json')
});

const ingestor = new SwitchEventIngestor({
  gate,
  agentId: process.env.SWITCH_AGENT_ID,
  roomPolicies: {
    'release-room': { name: 'release-room', roomId: process.env.SWITCH_RELEASE_ROOM_ID, allowedRoles: ['engineering-agent', 'release-owner'] },
    'support-room': { name: 'support-room', roomId: process.env.SWITCH_SUPPORT_ROOM_ID, allowedRoles: ['evidence-investigator', 'coding-agent'] }
  },
  participants: {
    [process.env.SWITCH_RELEASE_OWNER_ID]: { kind: 'human', role: 'release-owner' },
    [process.env.SWITCH_ENGINEERING_AGENT_ID]: { kind: 'agent', role: 'engineering-agent' },
    [process.env.SWITCH_INVESTIGATOR_AGENT_ID]: { kind: 'agent', role: 'evidence-investigator' }
  }
});

await client.connect({
  rooms: [process.env.SWITCH_RELEASE_ROOM_ID, process.env.SWITCH_SUPPORT_ROOM_ID],
  filter: 'all',
  onFrame: (frame, connection) => ingestor.handleFrame(frame, connection)
});
```

Do not put the API key in the browser, a public repo, or a screenshot. Use the Switch Console and official quickstart to create the server, link Mattermost, register the agent, and capture the real participant IDs. The live path is intentionally not enabled by `npm start` without those credentials.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/gate.mjs` | Durable, fail-closed decision model and approval/receipt policy |
| `src/runner.mjs` | Restricted real process execution and HMAC attestations |
| `src/switch-client.mjs` | Current Switch HTTP + WebSocket protocol client |
| `src/switch-ingest.mjs` | Authenticated frame validation and room workflow mapping |
| `src/live-orchestrator.mjs` | Visible live release/evidence/remediation/approval workflow |
| `src/store.mjs` | Atomic JSON and in-memory persistence adapters |
| `src/server.mjs` | Read-only board and JSON APIs |
| `demo/recovery.mjs` | Reproducible actual-code Blind-Spot Recovery demo |
| `public/` | Restrained evidence board UI |
| `test/` | Policy, security, Switch-ingestion, runner, and server tests |
| `scripts/diagnose-switch.mjs` | Secret-safe host/bridge connection diagnostic |
| `scripts/register-switch.mjs` | Authenticated local Gatekeeper registration |
| `scripts/discover-switch.mjs` | Authenticated room/participant discovery |

## Evidence labels and live boundary

The local recovery demo is labelled `simulated-protocol-harness`; its Git checkout, test execution, and receipt are real, but its messages are not Switch traffic. A live run is labelled `live-switch` in `.unseen/live-status.json` and the board, and requires the authenticated Core/WebSocket path. The live coordinator never deploys from chat: a human approval produces an auditable `release-preview` receipt only.

The native Switch endpoint is discovered from Switch Console metadata rather than guessed. If the diagnostic reports the endpoint but it is unreachable, start the Local server in Switch Console and rerun the diagnostic. No credentials, deployment, or mainnet action is part of this repository.

Official references used for the implementation:

- [Switch quickstart](https://docs.switchagents.ai/switch-rooms/getting-started)
- [Switch agent protocol](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol)
- [Switch agent connection](https://docs.switchagents.ai/switch-rooms/internals/agent-connection)
- [Switch agent events](https://docs.switchagents.ai/switch-rooms/internals/agent-events)
- [Flip the Switch hackathon](https://www.wemakedevs.org/hackathons/switch)
