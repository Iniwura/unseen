# UNSEEN — Phase 1 Core (Nov 4, 2026)

**Hackathon:** Flip the Switch (Best Business Workflow). **Status:** Offline policy-model implementation and tests ONLY. It is **not** an integrated Switch product or finished submission.

## Run

Requires Node.js 20+; no npm install or external dependencies.

```bash
npm test
npm run demo
```

The demo uses clearly labeled synthetic fixtures, including an invented 40-character SHA and **synthetic** verification outcomes. Nothing is presented as a Switch event or a real test run.

## Implemented

- Required contributions for engineering and support; explicit unknown vs failed evidence
- Source-room association and event deduplication as a pure model
- Allowlisted verification command identifiers and exact SHA binding (contract checks only)
- Contradictory source evidence blocking, supersession, and auditable model transitions
- **Fail-closed execution**: always denied until real authenticated Switch approval and restricted executor exist

## Not implemented or verified

- Switch Console / local Docker / Mattermost runtime (not accessible to this environment)
- Authentic Switch room events, identities, and agent API authentication
- Independent Git checkout + real test execution and report hashing
- Authenticated approval, nonce binding, one-time execution receipts, durable storage
- Production dashboard, fresh-clone integration QA, submission video

**Security warning:** `recordInternalVerification` is intentionally an **internal contract stub**. It currently accepts caller-supplied results, so exposing it over HTTP would be unsafe. Bind it exclusively to an actual sandboxed allowlisted test runner before any real decision. Likewise, `discover` expects authenticated Switch source metadata from a future adapter; passing arbitrary strings is not origin authentication.

## Next milestone

1. Install Docker Desktop and the official Switch Console on Windows; sign in to Codex.
2. Create a Switch expert room in bundled Mattermost; confirm a real `@` mention and reply.
3. Create `release-room` and `support-room` and verify permitted information transfer.
4. Add a trusted Switch adapter and real runner (SHA checkout/test exit code/immutable output digest).
5. Replace execution denial with a capability-restricted, challenge-bound human authorization path **only after** identity verification.

This repository is a foundation for later work, not a claim of having met the hackathon's Switch requirement.