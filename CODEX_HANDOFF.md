# UNSEEN — Codex execution handoff

We're inside the Flip the Switch hackathon window (Nov 4–7, 2026). The owner has locked the UNSEEN Blind-Spot Recovery workflow for **Best Business Workflow**.

## Goal

Implement a genuine Switch-powered human/AI release-readiness workflow. The offline Node.js gate in `src/gate.mjs` is a small foundation, **not** an authenticated Switch integration. All current verification reports in `demo/blocked.mjs` are synthetic fixtures and must never be described as real Switch events.

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

Aim for Linear / Apple Notes simplicity. Clear purpose, architecture and interface. Remove unnecessary taglines and secondary labels. No UI until the real Switch flow and authorization checks can be demonstrated.