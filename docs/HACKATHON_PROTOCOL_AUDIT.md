# UNSEEN — Flip the Switch submission and protocol audit

Reviewed: 2026-11-05. Target: **Best Business Workflow ($2,000)**.
Basis: WeMakeDevs hackathon pages, official Switch documentation, Switch agent operations source, UNSEEN repository, and the user's observed Windows/Switch output.
Status: **audit, not proof of a working end-to-end live bridge**.

## 1. Official hackathon requirements

- Event: 2026-11-04 through 2026-11-07; deadline **2026-11-07 23:59 IST** (18:29 UTC, 19:29 Zurich/WAT).
- Entry must show **one human and at least one AI agent working on a real task through Switch in team chat**. Switch must be central, not decorative.
- Best Business Workflow evaluates practical use of agents and humans. Judging criteria on the event page are Switch centrality, technical execution/reproducibility, creativity/impact, and presentation. The page's displayed percentage values are 0%, so do **not** claim verified numeric weights.
- Submit **repository, demo video and README**. Build a real workflow during the event; earlier ideation is allowed.
- Console, Docker, and bundled Mattermost satisfy the local prerequisites; no VPS, company Slack, or custom chat bridge is required.
- Original product contract: evidence policy, two room roles, real failing refund regression, verified exact-commit repair, immutable human approval, local idempotent receipt. Never substitute simulated chat for real Switch events.

References:
- https://www.wemakedevs.org/hackathons/switch
- https://www.wemakedevs.org/hackathons/switch/resources
- https://www.wemakedevs.org/hackathons/switch/schedule
- https://www.wemakedevs.org/hackathons/switch/rules
- https://www.devtoolsacademy.com/hackathons/flip-the-switch

## 2. Official Switch resources reviewed

- Quickstart: https://docs.switchagents.ai/switch-rooms/getting-started
- Add a custom agent and room: https://docs.switchagents.ai/switch-rooms/getting-started/add-a-second-agent
- Switch framework (room ownership, references, permissions): https://docs.switchagents.ai/switch-rooms/building/index
- Payments-room example (similar human+agent handoff): https://docs.switchagents.ai/switch-rooms/building/payments-room
- Agent protocol: https://docs.switchagents.ai/switch-rooms/internals/agent-protocol
- WebSocket, liveness, claims and resume: https://docs.switchagents.ai/switch-rooms/internals/agent-connection
- Events, addressed flag, sender identities: https://docs.switchagents.ai/switch-rooms/internals/agent-events
- Workspace isolation and addressing: https://docs.switchagents.ai/switch-rooms/internals/identity-and-access
- Troubleshooting: https://docs.switchagents.ai/switch-rooms/resources/troubleshooting
- Hosting (native Core versus Gateway/dashboard): https://docs.switchagents.ai/switch-rooms/deploy/self-host
- Reference implementation and tests: https://github.com/sandbox-quantum/switch
- Official docs MCP for Codex: `codex mcp add switch-docs --url https://docs.switchagents.ai/mcp`

## 3. Why the repeated errors occurred

| Symptom | Root cause or evidence | Status |
| --- | --- | --- |
| Windows can reach Core while WSL can't | Different localhost network namespaces, not an installation failure | Mitigated with native-Windows Node bootstrap |
| Browser `/gateway/` returned Not Found | Console native Core serves APIs, not necessarily a Gateway web UI; guessed browser route was wrong | No further guessed URLs |
| Initial `list_rooms` appeared empty | The operation returns `{"result": [...]}`; older UNSEEN discovery parsed only direct room collections | Parser changed, live result still to verify |
| Discovery HTTP 400 | UNSEEN called zero-argument `list_participants` with unexpected `room_id` | Code changed to authenticated explicit-room GET; requires live retest |
| 47/48 Windows tests passed; dashboard 404 | `src/server.mjs` used Unix `/` as a Windows filesystem containment separator | Platform-safe path patch pushed; Windows rerun not yet observed |
| Gatekeeper cannot yet process authenticated commands | Rooms were invited but websocket is disconnected; actor sender-ID binding and addressing policy are unverified | **Open P0** |
| Agent invited but owned by Agent Bootstrap | Bootstrap key creates an owner under a non-admin account; membership and right to address are separate controls | **Open P0** |

## 4. Critical protocol contracts to verify, not guess

1. **Registration:** `POST /agents` once using a registration key. Bootstrap-created Gatekeeper is *not admin-owned*. Preserve its existing API key; never re-register/rotate by default.
2. **Agent room discovery:** `POST /agents/{id}/ops/list_rooms` body `{}`, result in `{"result": [ { "room_id": ..., "name": ... } ]}`. Fail closed if either required room missing.
3. **Room participants:** `list_participants()` takes **zero args** and reads the session's currently connected room. For read-only cross-room enumeration use **GET `/agents/rooms/{room_id}/participants`** with bearer agent credentials, membership enforced.
4. **DO NOT confuse IDs:** the HTTP participant roster includes `agent_id` / internal IDs, while **message `payload.sender` is an opaque Switch client ID** (e.g. `@...:...`). Never auto-write a roster UUID into `SWITCH_RELEASE_OWNER_ID` or other trusted **sender** allowlists. Bind using independent authenticated event and account verification, not a display name guessed from a roster. If identity mapping is unresolved, human approval must stay disabled.
5. **Addressing:** rooms membership does not imply that messages are marked `addressed:true`. Inspect the Gatekeeper's `get_agent_detail` addressing policy. Default new agents may answer only their owner / owner agents, and this Gatekeeper is bootstrap-owned. Changing its authorization must use supported owner/admin controls, not a database edit or a spoofed agent.
6. **WS connection:** `/agents/{id}/connection/ws`, bearer API key, durable connection UUID, `scope=all`, correct room IDs. Trust **`connection_state.rooms`** returned by the server, not requested rooms. Refusals arrive as frames and close codes; a bare open socket does not prove room subscription.
7. **Pongs:** respond to `ping` promptly using the last fully processed cursor, **before** long runner work; otherwise the server evicts the client after missed heartbeats.
8. **Message routing:** process only authenticated `message` events with `payload.addressed === true`; handle the `@name` prefix that a chat mention can leave in the body; verify exact sender and room against configured policy. Do not accept role names as identity proof.
9. **Operations:** `read_context` allows an explicit `room_id`, but returns a timeline and is membership checked; `send_targeted_message` takes `body` and `target_names`/`target_roles`, **not** `room_id` or recipient UUID. The direct `POST /agents/{id}/message` endpoint can post by room ID.
10. **Safe recovery:** persist cursor only for fully handled events where practical; handle `gap` by re-reading both rooms and remaining fail-closed. Ignore duplicate and stale messages; never treat LLM summaries as verified test outcomes.

The operation definitions are source of truth:
https://github.com/sandbox-quantum/switch/blob/main/core/switch_core/bridges/agent/operations/definitions.py

The room participants route is:
https://github.com/sandbox-quantum/switch/blob/main/core/switch_core/bridges/agent/api/handlers.py

## 5. Stop/fix plan (P0 before polish)

1. **Freeze current setup:** Switch native Core v0.31.0, Console v0.40.1, Mattermost, Gatekeeper `d88a22ec-6691-4481-aaec-1e3e41ac55e0`, rooms `release-room` / `support-room`. No re-registration, reset, Docker reinstall or speculative endpoint paths.
2. **Protocol contract audit in code:** test each call against documented operation signatures; remove incorrect auto-binding of roster UUIDs to event sender allowlists; validate owner/addressing and actual room membership via read-only calls; repair heartbeat and mention body parsing before live trial.
3. **One secret-safe Windows doctor** should report separately: Core reachable; Gatekeeper valid; rooms discoverable; room membership; addressing policy; explicit sender identity binding; websocket `connection_state.rooms`; whether missing investigator/coder roles block the script. Do not log tokens or whole room messages.
4. **Minimal live vertical slice**: human sends a real addressed request, Gatekeeper receives it over authenticated Switch websocket, sees `addressed:true`, posts a real response; missing support evidence stays PENDING or BLOCKED. Capture event id and room proof.
5. **Then full P0 sequence**: Codex engineering evidence -> support investigator retrieves room-scoped requirement -> real failing refund regression -> blocked release -> committed repair -> exact SHA retest -> human nonce-bound approval -> one idempotent receipt. Report only observed outcomes.
6. **Before submission**: 100% relevant Node tests on Windows and Linux, real two-room smoke, clean-clone reproduction instructions, redacted demo video, public repo, concise README, final submission confirmation. If the multi-agent sequence remains unstable, scope-cut optional agents without weakening the fail-closed policy.

## 6. Current evidence boundaries

Confirmed by user's Windows output: native Core `/health` 200, local Docker reachable, Gatekeeper registered with credential saved only to ignored `.env.local`, Switch agent invites reported successful by real managed Codex agent, 47/48 tests passed before a platform path patch.

**Not confirmed:** a real connected UNSEEN websocket that processes an addressed owner message; exact opaque sender-ID allowlisting; Gatekeeper answering authorization; support-document retrieval; complete multi-agent recovery; live release receipt; Windows test suite after the path patch.

A local protocol simulation is not live Switch evidence. Do not describe the end-to-end flow as completed until these observations exist.

## 7. Submission priority

For Best Business Workflow, compelling evidence matters more than another UI redesign. The video should show three unmistakable frames: (1) green baseline but missing support evidence, (2) Switch handoff finding a failing refund regression and blocking execution, (3) real repair+reverification, human approval and one receipt. Keep README setup short; show verified constraints and no secrets.
