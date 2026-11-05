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

## Verified live Switch milestone (November 5, 2026)

The **first fail-closed release decision has now run against the operator's actual Switch Core 0.31.0 / Mattermost server**. The human sent an addressed `release_request` from their linked `user` account in `release-room`. UNSEEN authenticated the event, recorded the exact candidate Git SHA, persisted the `PENDING_EVIDENCE` decision, and posted the blocked/missing-evidence result back into the real room.

- **Outcome:** `live-fail-closed-verified`; authenticated connection to both rooms, Switch reply confirmed posted.
- **Observed Switch event:** sequence `9007194959773699`.
- **Observed decision:** `switch-live-c4f2d8e7-6686-42a8-a620-61074dbcb53b`.
- **Proof and exact transcript:** [November 5 live Switch proof](docs/LIVE_SWITCH_PROOF_2026-11-05.md).
- **Repeat:** `npm.cmd run smoke:release` using an existing local server and exact verified sender binding. The command prints the fresh message to post; it never approves a release or deploys.

**Proof boundary:** This is a real Switch-connected **entry-point and missing-evidence gate test**, not an end-to-end live remediation/approval recording. The complete blocked-refund, repaired-commit and approval sequence is implemented and locally tested, but must still be exercised through actual Switch agents and rooms before being claimed live. The `ini-unseen-engineer` agent exists, but its authenticated event sender has not yet been bound to the live orchestrator.

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

## Inspect a paused live release without resetting it

If `authorize:routing` returns a retry error, it now prints a **safe local recovery diagnosis**: bridge connection state, room subscription count, exact decision match and engineering/support evidence states. It does not print credentials, runner secrets, source documents or full state files. An error such as `LIVE_BRIDGE_NOT_CONNECTED`, `LIVE_ROOMS_NOT_CONFIRMED`, `ACTIVE_DECISION_MISMATCH`, or `ENGINEERING_ALREADY_VERIFIED` identifies the next step without guessing or resetting the candidate.

The default authorization command is still idempotent. It only re-sends an engineering request when the existing live decision is authenticated, still active, exactly SHA-bound, missing engineering evidence, and subscribed to both intended rooms. **Do not repost the original release request or delete any state files to resolve a retry error.**

## Fix Gatekeeper-to-agent routing without opening permissions

If the live engineering agent replies to Gatekeeper's request with **"You're not permitted to direct messages to me in this room"**, the *recipient engineer's* addressing policy is rejecting **Gatekeeper's** outgoing message. Authorizing engineers to message Gatekeeper does not authorize Gatekeeper to message the engineers.

Keep `npm.cmd run live:blocked` running. In a **separate PowerShell window**, in this same UNSEEN repository, run:

```powershell
npm.cmd run authorize:routing
npm.cmd run authorize:routing -- --apply
```

The first command is a dry-run. The second explicitly adds **Gatekeeper's registered agent ID only in release-room** to `ini-unseen-engineer`'s policy, and **Gatekeeper only in support-room** to `switch-buddy-admin`'s policy. If a recipient's policy is already open, nothing is changed. Existing owner rules, target ownership, user permissions, room memberships and the Gatekeeper's own policy remain untouched. It authenticates through the existing local Switch 0.31 administrator account; does not print or save credentials; verifies exact agent identities and memberships; re-reads recipient policies before mutation; and checks each saved result.

Only when an exact, still-active, unapproved `PENDING_EVIDENCE` decision matches the durable `live:blocked` request and engineering evidence is still missing does the apply command **re-send the engineering request** from Gatekeeper (without issuing a new release request). This only posts a message. The engineer must independently return a real `UNSEEN/1` evidence event. We do not call the milestone live `BLOCKED` until that event is accepted and the Gatekeeper's own runner reproduces the refund failure from the exact candidate SHA.

**Safety:** The existing `live:blocked` bridge remains in blocked-only mode; the command grants no approval, execution, remediation or coding-agent privileges. Running `--apply` is an explicit, narrowly scoped permission change; running the dry-run alone makes no changes.

## Show the actual live BLOCKED decision

Once the scoped evidence-agent authorization returns `status: evidence-agents-bound`, use:

```powershell
npm.cmd run live:blocked
```

This is a single preflight and live bridge command. It **does not** redo registration, permissions or agent setup. The command verifies a real passing baseline and intentionally failing refund regression against the separate persistent candidate `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`. It then discovers both rooms, cross-checks both authorized agent sender IDs against their already observed authenticated Switch history messages, and recovers the release owner from the **previously verified live release proof**. It refuses conflicted/missing evidence and refuses to use UNSEEN's product Git HEAD.

The command prints one fresh **real Switch release request**, which the human posts from the linked `user` account into `release-room`, **after the bridge reports a successful connection**. Keep PowerShell running. The bridge posts a real request to `@ini-unseen-engineer`, awaits addressed evidence and performs its own allowlisted baseline test. It then posts a support request to `@switch-buddy-admin` in `support-room`. The investigator must return an addressed, source-backed `UNSEEN/1` evidence message; the Gatekeeper independently runs the refund regression on that same Git SHA, records exit 1 and posts a **BLOCKED** decision to Switch. The real existing reports can be cited, but they do not themselves count as protocol evidence events.

This command explicitly enables a **blocked-only safety lock** that ignores even otherwise valid approval or remediation messages. It cannot authorize a release or accept a coding-agent repair during this first live phase. All state is local/ignored. `npm run demo` remains a separate local protocol harness and is not evidence of this live run.

After the confirmed live BLOCKED decision, the workflow can be switched to the repair/approval phase with an explicitly authorized coding agent and fresh verification against the repaired commit. Never claim the complete sequence was executed live before that happens.

## Authorize only the independently observed evidence agents

Once `inspect:agents` finds the specific engineering and support reports, the guarded command `npm.cmd run authorize:agents` checks both report authors again against Switch Core 0.31's **authenticated registered-agent directory** and exact `listParticipants` room memberships. It also checks the pre-existing Gatekeeper ownership and restricted policy before proposing any changes.

`npm.cmd run authorize:agents -- --apply` explicitly grants **only** `ini-unseen-engineer` in `release-room` and `switch-buddy-admin` in `support-room`, preserving owner, human and all other original rules. It verifies the exact policy readback and saves their observed opaque event sender IDs to ignored `.env.local` without displaying or rotating credentials.

The observed sender is established by a unique previous Switch report and is checked against registered name and room membership. This uses server-authenticated records but does not offer a cryptographic certificate mapping the historical chat display name to a bot ID; treat it as an explicitly authorized local demo binding, not as third-party attestation. No coding agent is assigned by this step.

## Inspect existing real Switch agent reports

After the engineer and support agent have posted their investigation results, use `npm.cmd run inspect:agents`. This is **read-only**: it searches authenticated Gatekeeper `read_context` responses for their already-posted, uniquely identified reports in `release-room` and `support-room`, and reports observed opaque sender IDs. It checks the exact prepared vulnerable candidate SHA.

**An observed sender is not automatically a trusted role.** Never assign engineering, investigator or coding permissions solely by a matching display name. The human owner must confirm each returned identity against the registered Switch agent, intended room and report before a narrowly scoped role configuration can be applied. The command does not write `.env.local`, change Switch permissions, send messages, execute tests, issue approvals or deploy anything.

## Prepare a real candidate for the live Switch demonstration

The one-time local demo in `npm run demo` uses a **disposable** Git checkout. The live multi-agent demonstration needs a **persistent separate checkout** that the engineering, investigator and coding agents can inspect, test and repair.

From the existing UNSEEN project directory on Windows:

```powershell
npm.cmd run prepare:live
```

This command creates a real nested Git checkout at `.unseen/live-checkout` (ignored by GitHub), commits a deliberately vulnerable refund candidate, and checks that the baseline passes while the successive-refunds regression **fails**. It reports the candidate's exact Git SHA and does not modify the UNSEEN product repository. Running it a second time is read-only. If an agent has modified, repaired or committed the candidate, it **refuses to reset it**.

The actual release decision must be for the checkout SHA printed by this command, **not UNSEEN's own Git HEAD**. The live bridge now selects this checkout by default if it has been prepared; an explicit `UNSEEN_CHECKOUT_ROOT` can override that for an independently verified real project.

**Trust boundary:** Creating a reproducible vulnerable checkout is an honest staged scenario, not a claim that independent support evidence or an agent-created repair has already occurred. The full live bridge still requires exact *observed* Switch sender identities for the human release owner, engineering agent, support investigator and coding agent. Never guess role IDs from usernames or room roster UUIDs, reuse a role without authorization, or claim local-harness events are live Switch events.

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

From native Windows PowerShell, the same sequence can be run from the repository checkout with `.\scripts\connect-switch-native.ps1`. It skips registration when `.env.local` already contains a Gatekeeper ID, so it cannot rotate an existing registration.

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
| `scripts/connect-switch-native.ps1` | Native Windows bootstrap and live bridge launcher |

## Evidence labels and live boundary

The local recovery demo is labelled `simulated-protocol-harness`; its Git checkout, test execution, and receipt are real, but its messages are not Switch traffic. A live run is labelled `live-switch` in `.unseen/live-status.json` and the board, and requires the authenticated Core/WebSocket path. The live coordinator never deploys from chat: a human approval produces an auditable `release-preview` receipt only.

The native Switch endpoint is discovered from Switch Console metadata rather than guessed. If the diagnostic reports the endpoint but it is unreachable, start the Local server in Switch Console and rerun the diagnostic. No credentials, deployment, or mainnet action is part of this repository.

Official references used for the implementation:

- [Switch quickstart](https://docs.switchagents.ai/switch-rooms/getting-started)
- [Switch agent protocol](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol)
- [Switch agent connection](https://docs.switchagents.ai/switch-rooms/internals/agent-connection)
- [Switch agent events](https://docs.switchagents.ai/switch-rooms/internals/agent-events)
- [Flip the Switch hackathon](https://www.wemakedevs.org/hackathons/switch)
