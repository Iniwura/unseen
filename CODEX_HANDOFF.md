# UNSEEN — Codex execution handoff

We're inside the Flip the Switch hackathon window (Nov 4–7, 2026). The owner has locked the UNSEEN Blind-Spot Recovery workflow for **Best Business Workflow**.

## Implementation checkpoint — 2026-11-04

The repository now contains the durable fail-closed gate, the current Switch WebSocket/HTTP client, authenticated frame ingestor, atomic JSON state store, allowlisted real process runner, nonce-bound Switch human approval, one-use execution receipt, read-only board, adversarial tests, and `npm run demo` actual-code recovery workflow. The original 20 Phase 1 tests are preserved and pass alongside the new security and integration tests.

Live Switch Console / Docker / Mattermost verification is still outstanding. This environment has no Docker executable in WSL and no Switch credentials. The local demo and Switch adapter tests are explicitly labelled as a protocol harness; they are not evidence of live Switch traffic.

## Goal

Implement a genuine Switch-powered human/AI release-readiness workflow. The Node.js gate in `src/gate.mjs` is now durable and fail-closed, and `src/switch-client.mjs` / `src/switch-ingest.mjs` implement the current authenticated adapter boundary. Live Switch traffic still needs host setup and must never be conflated with the local protocol harness in `demo/recovery.mjs`.

## Run the starting checks

```bash
node --version
npm test
npm run demo
```

## Required order of implementation

1. Verify the current official Switch docs: https://docs.switchagents.ai/switch-rooms/getting-started and https://docs.switchagents.ai/switch-rooms/internals/agent-protocol. The protocol currently describes agent WebSocket events and HTTP operations; don't copy outdated marketing-page SSE claims.
2. Verify Windows host has Docker Desktop running, Switch Console installed and Codex authenticated. Use official Switch Console on the host and bundled Mattermost; do not require a VPS.
3. Use Console to create a real human + Codex agent `release-room` and prove a reply to an actual mention. Add a `support-room` and permitted Evidence Investigator agent.
4. Establish actual event-origin and room-membership validation. The `discover` method accepts untrusted caller parameters and is NOT a security boundary; only call it after trusted Switch event ingestion with dedupe, sender and room mapping.
5. Replace `recordInternalVerification`'s caller-supplied exit code with an **allowlisted real process runner**. Bind output hashes, actual candidate Git commit hash, policy version, and source reference. Prevent arbitrary shell command input and avoid running untrusted code on the host without isolation.
6. Build a small fictional checkout/refund repo with a successive-partial-refund bug, passing baseline tests and a separately supplied support regression. Recovery must happen through an authorized agent in `support-room`, not by reading a prebundled script in the dashboard.
7. Implement approval ONLY after verifying a real Switch event's human identity, nonce, decision ID, exact commit SHA and evidence digest. Never accept an LLM's natural-language approval, a claimed display name, or a fake event. Use restricted single-use execution capability and idempotent local preview receipt.
8. UI is a restrained read-only board: evidence graph, missing/blocked/ready state, verified action timeline, proof/replay. Switch remains central, not a decorative chat screenshot.
9. Make the demo reproducible with one reset command, automated tests for forged/replayed/stale evidence, and clear README showing real screenshots and command outputs. No made-up logs or claims. Do not submit the entry automatically; the participant must submit themselves.

## Critical constraints

- Preserve **fail closed** semantics. Never weaken the gate to get a green screenshot.
- Treat every claim of a passed external system as unverified until run locally and evidenced.
- Tests must not conflate simulation, pure-model checks, and live integration.
- No secret tokens or keys in a public repo.
- Follow the organizer's current requirements and submission deadline: Nov 7, 2026, 11:59 PM IST.

## User design preference

Aim for Linear / Apple Notes simplicity. Clear purpose, architecture and interface. Remove unnecessary taglines and secondary labels. The read-only board is shipped, but do not present its local harness state as live Switch evidence.

## Remaining before submission

1. Install Docker Desktop and the official Switch Console on Windows; sign in to Codex.
2. Create `release-room` and `support-room` in bundled Mattermost, register the UNSEEN agent once, and capture the real room and participant IDs.
3. Run the adapter against the authenticated Switch bridge and record a real human mention, investigator handoff, and approval. Keep all credentials out of the repo and recording.
4. Capture the live demo, screenshots, and command output. Label the local harness and live run separately in the submission.
5. If the release action will run untrusted candidate code outside a container, add a container or equivalent sandbox before production use; the current runner is allowlisted but intentionally reports this host-execution boundary.
