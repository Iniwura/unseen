# UNSEEN: real Switch fail-closed release proof

**Date:** 2026-11-05  
**Source:** Human-operated Switch Console run, with terminal transcript and screenshot supplied by the project operator. This document preserves the observed output. It is not a claim that GitHub Actions reproduced the operator's local Switch run.

## Setup and what actually ran

- Switch Console Desktop: **0.40.1**
- Local Switch Core: **0.31.0**
- Room: **release-room** (Switch/Mattermost)
- Gatekeeper: the already registered external **UNSEEN Gatekeeper**, linked through the authenticated Switch agent API and WebSocket
- Human sender: linked Mattermost account **user**
- Scoped Gatekeeper addressing: administrator-authorized **only for the linked account in release-room**, preserving the pre-existing rules
- Check: `npm.cmd run smoke:release` (non-deployment, fail-closed live integration proof)

## Observed authenticated request

The human posted an explicitly addressed Switch message in release-room:

```text
@unseen-gatekeeper UNSEEN/1 {"kind":"release_request","decisionId":"switch-live-c4f2d8e7-6686-42a8-a620-61074dbcb53b","sha":"b2f571da50c4c3b642b22e60dfd7dee9888c23ff"}
```

Switch delivered the event with sequence **9007194959773699**. The connected script checked the exact opaque sender, room, addressed status, decision nonce and Git commit.

The Gatekeeper replied in the **actual release-room** (not a test fixture):

> UNSEEN LIVE GATE: switch-live-c4f2d8e7-6686-42a8-a620-61074dbcb53b is PENDING_EVIDENCE for b2f571da50c4c3b642b22e60dfd7dee9888c23ff. Engineering and support proof are MISSING. Approval and execution are prohibited. No deployment occurred.

The terminal result was:

```json
{
  "check": "UNSEEN authenticated live release gate",
  "connection": "authenticated-both-rooms",
  "owner": "configured",
  "decision": "persisted-pending-evidence",
  "switchReply": "confirmed-posted",
  "result": "live-fail-closed-verified",
  "decisionId": "switch-live-c4f2d8e7-6686-42a8-a620-61074dbcb53b",
  "sha": "b2f571da50c4c3b642b22e60dfd7dee9888c23ff",
  "eventId": 9007194959773699,
  "outcome": "verified"
}
```

## What this proves

1. Switch is essential: the Gatekeeper received a real authorized message over its authenticated connection to Switch, with both release and support rooms subscribed.
2. The release decision was persisted against an exact Git SHA.
3. Both evidence requirements remained **missing** and the decision remained **PENDING_EVIDENCE**; the Gatekeeper did **not** approve, execute, or deploy.
4. A reply appeared in the real Switch/Mattermost channel and the HTTP send was acknowledged.
5. This was a user-initiated request by a linked, scoped participant, not a locally forged protocol frame.

## What remains unverified live

- Engineering agent sender binding and evidence response.
- Support-room investigator response and independently verified refund-regression failure.
- Real remediation commit, two-pass revalidation and human nonce-bound approval through Switch.
- Final one-use execution receipt and recorded full live demonstration.

Local test/harness behavior for these stages must **not** be represented as a complete live Switch workflow. Until the steps above run, this record is evidence for the **fail-closed entry point only**.

## Reproduce safely

From an existing, properly configured local Switch server (credentials stored only in ignored `.env.local`):

```powershell
npm.cmd run smoke:release
```

The current script intentionally requires an exact authenticated `SWITCH_RELEASE_OWNER_ID` provided by the operator and prints a fresh challenge to post from the linked Mattermost account. Do not publish credentials or assume a roster UUID is the authenticated sender ID.

The smoke creates a separate local proof state at `.unseen/live-proof-gate.json`; it does not deploy or authorize a release.
