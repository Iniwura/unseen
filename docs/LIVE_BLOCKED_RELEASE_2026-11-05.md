# Live Switch release blocked: independent refund regression

**Date:** November 5, 2026  
**Source:** Operator-supplied screenshots of actual local Switch Console `release-room`, plus operator-supplied read-only local state diagnostics. This is an observed live Switch result, **not** a replayed fixture or a CI-only demo. The screenshot is retained in the conversation, not committed to GitHub.

## Exact release under review

- Candidate Git SHA: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`.
- Decision: `live-block-a9eb054a-9564-42bf-aaf1-c3b7ee5a9c8c`.
- Environment: local Switch Core `0.31.0`, Switch Console `0.40.1`, Gatekeeper connected to `release-room` and `support-room`.
- Scope: a deliberately vulnerable, persistent **demonstration** checkout under ignored `.unseen/live-checkout`; no customer payments or production deploy.

## Observed Switch conversation

1. The linked human `user` posted an addressed `UNSEEN/1 release_request` naming the exact candidate and decision.
2. The Gatekeeper requested evidence from `@ini-unseen-engineer`. Initial outbound addressing was denied by the recipient's owner-scoped policy, so the existing permission rules were supplemented with a Gatekeeper-only, room-scoped authorization. There was no blanket opening of recipient permissions.
3. Engineering posted a real, addressed `UNSEEN/1 evidence` for this decision in release-room. The Gatekeeper's own allowlisted runner replied:

   ```text
   UNSEEN verification PASS: engineering on a921b8a5d51c0a8a58fcdcd59c0963ac012d8627 (exit 0, output a7a362aae527ad2df03d56b7b602073c212f861c9b9ac7c0310288b14315fdf1).
   ```

4. The Gatekeeper posted that no verified support acceptance had yet been found and requested the evidence investigator in support-room.
5. The Gatekeeper posted in the real release-room:

   ```text
   UNSEEN BLOCKED decision live-block-a9eb054a-9564-42bf-aaf1-c3b7ee5a9c8c. The support regression failed on the exact candidate commit.
   ```

## Independently reported local decision state

The operator's `authorize:routing -- --apply` invocation later returned a **read-only recovery diagnostic**. The command **did not** retry or mutate permissions:

```json
{
  "connection": "connected",
  "authenticatedLiveSource": true,
  "subscribedRoomsCount": 2,
  "requiredRoomsPresent": true,
  "sameActiveDecision": true,
  "pendingVerification": null,
  "samePersistedDecisionCount": 1,
  "exactCandidateMatched": true,
  "decisionFinalized": false,
  "engineeringState": "VERIFIED_PASS",
  "supportState": "VERIFIED_FAIL"
}
```

Those requirement states imply `BLOCKED` under the project's release-policy state machine. The visible Gatekeeper `UNSEEN BLOCKED` post independently corroborates the state.

## Why the block was warranted

In the demonstration candidate, a captured 100-unit checkout with refund requests of 50 and 60 grants the second request **60**, exceeding the remaining balance of **50**. The refund invariant fails with `60 !== 50`, exit 1. The owner-authorized requirement was established prospectively in support-room as a **demonstration requirement**, not represented as a historical customer ticket.

## Verified scope and outstanding work

**Verified live:** authenticated Switch release request, real agent evidence exchange, Gatekeeper execution of the allowlisted baseline and regression commands against the exact vulnerable SHA, durable `VERIFIED_PASS` + `VERIFIED_FAIL` evidence states, and visible real-room `BLOCKED` decision.

**Not yet verified live:** coding agent or engineering repair of the persistent checkout, supersession of the blocked release, retesting the exact repaired SHA, a fresh support requirement verification against the repair, nonce-bound release-owner approval, and an audit receipt.

The blocked-only listener intentionally rejects approvals and remediation; do not weaken it to claim a completed end-to-end demonstration. Preserve the original blocked decision. A new repair phase must start only after an actual commit exists, must bind evidence to the new SHA, and must verify it independently.

No production release, fund movement or deployment occurred.
