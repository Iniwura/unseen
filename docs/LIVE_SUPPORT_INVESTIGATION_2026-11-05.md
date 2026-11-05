# UNSEEN: real support-agent investigation and evidence boundary

**Observed:** November 5, 2026. **Source:** User-provided Mattermost transcript from `switch-buddy-admin`, local message permalink `http://localhost:64822/switch/pl/zh1kkahyf3re7ek5yjcaoso43e`. Attribution and message contents come from the operator's observed Switch UI; the Gatekeeper has **not yet cryptographically or protocol-bound** this agent's opaque sender ID to the investigator role.

## Reported findings

- Candidate requested: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`.
- Repository artifact `demo/recovery.mjs` defines a fixture: captured = 100, first refund = 50, second request = 60, expected second refund = 50, cumulative refunded = 100.
- `test/security.test.mjs` describes the invariant "refunds never exceed the captured amount."
- `src/gate.mjs` binds the support requirement to `support-room` and the refund-regression command.
- Acceptance criterion *represented by those fixture artifacts*: the cumulative refunded amount must not exceed the captured amount; each succeeding refund is capped by the remaining refundable balance.
- **No authoritative business/customer/support requirement was available.** The `support-room` lacked a source ticket, specification, or requirement-bearing message. The support agent expressly refused to describe fixture text as independent business evidence.
- **No exact-SHA checkout verification by this agent.** Its available Git checkout was at `637f0babb2ccf3e6e85f05335239b5dc6d2f2582`, not the candidate SHA. It did not reproduce the refund test.
- The agent recommended **KEEP THE RELEASE BLOCKED** until a human-approved business acceptance requirement and independently checked exact-SHA refund regression were available.

## What this does and does not prove

This was a real, appropriately skeptical Switch agent review identifying two distinct missing pieces. It is not an independently attested support evidence event accepted by Gatekeeper, nor a verification run at the candidate SHA. Do not use its message as a passing `support` evidence claim.

A product owner may **prospectively** establish a business acceptance rule for the *demonstration scenario* by authoring it in `support-room` under their own linked account. That would be new, owner-authored evidence, not a rediscovered pre-existing customer ticket. Keep that distinction visible. The subsequent investigator must cite the genuine source message and the independent runner must execute the candidate's real regression before the Gatekeeper may mark it verified or blocked.

## Recommended next action

Have the operator author an explicit acceptance rule in `support-room`, with exact numerical boundary and candidate SHA. Independently record its Switch message permalink, author and timestamp. Ask `switch-buddy-admin` to inspect that *new* owner-authored source and report what it actually supports. Separately validate the exact-SHA regression through the Gatekeeper's allowlisted runner. Do not change the candidate or approve a release before the blocked-decision evidence is recorded.
