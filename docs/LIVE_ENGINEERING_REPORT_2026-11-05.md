# Live Switch engineering report: vulnerable refund candidate

**Observed in conversation:** November 5, 2026.  
**Origin:** Message attributed by the local Switch/Mattermost UI to the configured `ini-unseen-engineer` agent. The human operator supplied the message transcript and its local permalink. This is a **real agent-reported investigation**, but the Gatekeeper has **not yet ingested or independently bound** the engineering agent's opaque Switch sender ID to the release-gate role.

**Local Mattermost source:** `http://localhost:64822/switch/pl/rbwo5njjp3do3gryddmayp6qah` (accessible only when the local Switch server is running; not a public link).

## Candidate identification

- Separate, persistent, ignored checkout: `.unseen/live-checkout`.
- Exact initial candidate SHA: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`.
- Commit message: `checkout: vulnerable candidate awaiting evidence`.
- Agent reported clean working tree and matching Git HEAD on `master`.
- Agent reported **no modifications, repairs, approvals or deployments**.

## Reported real tests

| Command | Observed result | Assertions |
| --- | --- | --- |
| `node --test test/gate.test.mjs` | PASS, 1 passed, 0 failed | Checkout refund function is available |
| `node --test test/refund-regression.test.mjs` | FAIL, 0 passed, 1 failed, exit 1 | Successive refunds never exceed captured amount |

The reported failure was at `test/refund-regression.test.mjs:7:10`:

```text
Expected: 50
Actual:   60
60 !== 50
ERR_ASSERTION (strictEqual)
```

The refund implementation caps **each individual refund** at the captured amount but does not subtract already-refunded value. A 100-unit captured order refunds 50 followed by an incorrect 60, bringing the cumulative refund to 110. The test correctly expects the second refund to be 50 at most.

## Proof boundaries

This supports **engineering investigation by a real Switch agent** on the exact prepared candidate. It does **not** yet establish that UNSEEN Gatekeeper has ingested an authenticated engineering evidence event, that support-room evidence has been independently provided, or that the full workflow has entered a live `BLOCKED` state from both required sources.

Keep the vulnerable checkout unchanged until the Gatekeeper's live approval-policy flow has recorded the original failure. The next phase is a **separate support investigator** documenting the acceptance requirement, followed by exact Switch role binding, a live blocked decision, a repaired commit, fresh verification and explicit human approval.

This document is an attributed transcript and should not be presented as an independently cryptographically attested agent report. No credentials or private account identifiers are included.
