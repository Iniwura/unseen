# UNSEEN — Judge's one-page guide

**Track:** Flip the Switch / Best Business Workflow ($2,000)  
**Project:** [UNSEEN](https://github.com/Iniwura/unseen)  
**Demo video:** [Watch 2:20 UNSEEN walkthrough](https://youtu.be/EjP9Qr8VPoY) (uploaded by entrant; logged-out playback should be checked)  
**Submission deadline:** November 7, 2026 at 11:59 PM IST.

## What is it?

UNSEEN is a human-controlled, Switch-native release gate. A passing CI baseline is not enough: it recovers business acceptance criteria from a separate team chat, independently tests the exact Git commit, blocks an unsafe release, verifies a repair and requires human sign-off on the corrected evidence before issuing a **release-preview receipt**.

## The actual Switch workflow (completed November 5)

1. A human release owner submitted a checkout commit in `release-room` through Switch.
2. An engineering agent provided baseline evidence. The basic test passed.
3. A support investigator recovered an **owner-authored demo requirement** from `support-room`: cumulative refunds cannot exceed the original captured payment. This was not a historical customer support ticket.
4. UNSEEN reran the fixed refund regression against the exact original commit `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`. It failed, and Gatekeeper posted **UNSEEN BLOCKED**.
5. The **engineering agent** (not a separate coding-agent role) committed a repair `f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078`. The Gatekeeper independently verified ancestry and reran both tests, preserving the old record as `SUPERSEDED`.
6. Fresh engineering/support messages arrived through Switch. A linked **human** approved the exact repaired artifact after evidence checks. Gatekeeper posted **UNSEEN AUTHORIZED**, receipt `c79574fe-1be5-427f-8788-36f8a9b9620d`.

**Outcome:** authorized **release preview only**. No production deployment, customer payment, or real customer incident is claimed.

[Read the detailed observed proof](LIVE_COMPLETION_RECEIPT_2026-11-05.md).

## Inspect the actual product

UNSEEN has a **read-only decision dashboard** with a release spotlight, decision ledger, evidence graph, audit trail and counterfactual.

From a fresh clone with Node.js 20+:

```bash
npm ci
npm test
npm run demo:board
```

Open `http://127.0.0.1:4173`. The board shows actual **locally executed harness** decisions and visibly labels them `LOCAL PROTOCOL HARNESS`. The harness cannot demonstrate authenticated Switch events; it is only a reproducible offline technical walkthrough. It does **not** overwrite the operator's private live-session state.

For the **authenticated Switch** integration, see [README Switch setup](../README.md#switch-setup) and [the real completion record](LIVE_COMPLETION_RECEIPT_2026-11-05.md). Judges cannot open the operator's `localhost` Switch Console links, so the public demo video should show actual recorded room messages.

## Why Switch is essential

The release owner and independent engineering/support agents operate in different Switch/Mattermost rooms. UNSEEN uses authenticated Switch sender identities, room-scoped roles and addressed messages to make distinct claims available to the Gatekeeper. Removing Switch removes the real cross-room evidence collection and human approval transport. The offline harness is an explicitly labeled substitute only for reproducibility.

## Trust boundaries

- The original checkout is a deliberately vulnerable reproducible example, not a real production incident.
- The human's approval nonce, credentials and raw local state are never part of the public demo package.
- This project does not deploy to production automatically. Dashboard buttons cannot approve a release.
- The specific operator-session checkout SHAs are preserved in the completion record, but the separate persistent operator checkout is not publicly distributed. A fresh clone can reproduce the *workflow behavior* with new locally generated SHAs, not cryptographically re-run the exact private live checkout.

## What to submit

- [Public repository](https://github.com/Iniwura/unseen).
- [Final **2:20** demo video](https://youtu.be/EjP9Qr8VPoY) showing real Switch proof and labeled dashboard replay. Entrant should verify logged-out playback and HD before submission.
- This page and [README](../README.md).
- Official human-registered hackathon submission form. **Automated/bot submissions are prohibited by the official rules.**

[Official hackathon rules](https://www.wemakedevs.org/hackathons/switch/rules) · [Evaluation criteria](https://www.devtoolsacademy.com/hackathons/flip-the-switch)
