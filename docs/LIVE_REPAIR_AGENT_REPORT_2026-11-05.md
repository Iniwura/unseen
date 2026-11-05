# Live Switch engineering repair: attributed report

**Observed:** 5 November 2026. **Provenance:** Operator-provided `ini-unseen-engineer` message from real local Switch Console `release-room`, local permalink `http://localhost:64822/switch/pl/edfqyy3bkifbfdwxrxoy6d7ieo`. This report is evidence *attributed to the engineering agent*, **not** Gatekeeper-run verification of the repaired commit yet.

- Original blocked candidate: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`.
- New repaired Git commit: `f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078`.
- Commit message: `fix: cap cumulative refunds at captured amount`.
- Claimed Git relation: original candidate is the preserved parent of the repaired commit, inside ignored separate `.unseen/live-checkout`.
- Claimed changed files: `src/refund.mjs` (remaining refundable amount = nonnegative captured minus prior refunds) and `test/refund-regression.test.mjs` (fully refunded boundary case).
- Reported baseline test: `node --test test/gate.test.mjs` **1/1 passing**.
- Reported refund test: `node --test test/refund-regression.test.mjs` **2/2 passing**, including repeated partial refunds and zero after fully refunded.
- Reported working tree: clean.
- Agent reports **no** changes to UNSEEN's main repository, approvals or deployments.

## Trust boundary and next independent step

The user-provided agent message does not itself authorize a release, supersede the blocked decision, or prove the repaired commit passed the Gatekeeper's allowlisted runner. Its source must be matched to the already bound Switch engineering sender. The Gatekeeper must independently confirm a clean exact repaired HEAD, that the original blocked SHA is an actual ancestor, and that both allowlisted tests execute and pass. Only then may an authenticated, current human release-owner request initiate a new evidence review. Fresh engineering and support evidence must be collected and verified on the repaired SHA, and a separate nonce-bound human approval must occur before any preview receipt.

No customer funds, production deployment or actual launch is involved.
