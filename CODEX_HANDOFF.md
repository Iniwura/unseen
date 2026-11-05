# UNSEEN — Current handoff

**Updated November 5, 2026.** Target: Flip the Switch, **Best Business Workflow ($2,000)**. Official deadline: **November 7, 2026 at 11:59 PM IST**.

## Actual verified state

UNSEEN is a Switch-connected, evidence-bound release gate for a fictional checkout/refund workflow. It gathers facts from distinct engineering and support agents in room-scoped Switch conversations, independently verifies the exact Git commit, blocks failures, accepts a human-requested repair review, and requires an authenticated human approval before issuing a read-only **release-preview** audit receipt.

The actual Switch/Mattermost run completed on **November 5**:

- Original unsafe Git SHA: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`; baseline PASS but independent successive-refund regression FAIL; **BLOCKED**.
- Repaired direct-child Git SHA: `f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078`; exact parent and changed files verified, both test commands PASS; original **SUPERSEDED**.
- Fresh agent evidence from the engineering and support rooms; Gatekeeper verified current digest and released a one-time challenge.
- Actual linked human approved the fresh challenge in Switch; Gatekeeper posted **UNSEEN AUTHORIZED**.
- Final actual audit receipt: `c79574fe-1be5-427f-8788-36f8a9b9620d`. This authorizes a **release preview** only; no production deployment or payment happened.

Read [live completion evidence](docs/LIVE_COMPLETION_RECEIPT_2026-11-05.md) and [recording guide](docs/SUBMISSION_DEMO_GUIDE.md). Local `localhost` Switch message links are not judge-accessible.

Prior CI milestone: **91 Node tests passed on Linux and Windows** before the editorial dashboard. The latest branch has more tests and must be judged by its actual Actions results.

## Visual state and reproduction

The editorial evidence dashboard uses typography and restrained layout inspired by VERRIS, with original UNSEEN interaction and real gate state. It is read-only and does not authorize a release.

**Real operator state:** `npm start` reads ignored `.unseen/state.json` on the original computer. Without this local store it correctly shows an empty state. Connection status must reflect actual Switch status, not a screenshot claim.

**Reproducible local protocol harness:** `npm ci && npm run demo:board` runs the real local Git/test regression and repair, saves the computed decisions to a **separate ignored harness store**, and opens the read-only dashboard at `http://127.0.0.1:4173`. The UI is visibly labeled **LOCAL PROTOCOL HARNESS**. This is not live Switch traffic and cannot replace live footage.

**Plain CLI regression:** `npm run demo` exercises the existing in-memory protocol harness and prints verified runner output without populating the main live store.

## Remaining submission tasks

1. Confirm CI on the final proposed commit; merge only passing PRs.
2. Capture the real Switch Console's blocked → repair → approval conversation, with a real participant and distinct agents visible. Show only a dashboard sourced from that same session, or keep the LOCAL PROTOCOL HARNESS disclosure visible.
3. Produce the final 75–100 second public screen recording. A private first-cut video is not public proof.
4. Update the README with the public recording URL, check repo accessibility, and complete the **official submission manually** before the deadline. The rules prohibit automated entry.

## Invariants: do not regress

- Never accept browser-originating approval or trust a claimed display name as human identity.
- Require exact SHA, fresh evidence digest, sender/room binding, and one-time nonce before authorization.
- Fixed allowlisted test commands only; never treat an agent's test-success assertion as independent verification.
- Preserve denied, blocked, and superseded records; never reset operator state just for a recording.
- Do not claim the locally generated protocol harness is live Switch traffic, or that the preview receipt is production deployment.
- Keep all `.env.local`, credentials, runner secrets, and raw local operational stores outside the public repo.
- The coding-agent slot was not bound in the completed live run. The repair came from the identified engineering agent.

## Design principle

Simple purpose. Simple architecture. Simple design. Simple implementation. Evidence and decision should be visible without unnecessary taglines or explanatory layers.

The repo is https://github.com/Iniwura/unseen. The official hackathon criteria are 30% Switch use, 25% technical execution, 25% creativity/impact, and 20% demo/README.
