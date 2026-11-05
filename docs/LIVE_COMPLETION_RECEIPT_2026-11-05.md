# UNSEEN: live Switch recovery completed and authorized

**Date observed:** November 5, 2026  
**Evidence class:** Real Switch/Mattermost transcript supplied by the operator, plus real authenticated Gatekeeper messages and previous operator-provided terminal results. This is not a CI simulation. Raw local Switch permalinks are accessible only while the operator's local server is running; they are **not public judge links**.

## Final observed result

On the actual local Switch Console, the linked human `user` sent an exact, evidence-bound approval message in `release-room` at **11:12 AM**. The next real Gatekeeper message at **11:12 AM** states:

> UNSEEN AUTHORIZED f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078. Auditable receipt c79574fe-1be5-427f-8788-36f8a9b9620d created; no deployment was performed.

- **Human approval local permalink:** `http://localhost:64822/switch/pl/9699r7b69fy3drzd41ascpwk3y`
- **Gatekeeper receipt local permalink:** `http://localhost:64822/switch/pl/oawpdmgtpbf78quxc9dd7k9pww`
- **Authorized repaired candidate SHA:** `f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078`
- **Repaired review decision:** `repair-67f48203-1b45-4912-87ca-d3a25affd293`
- **Final auditable receipt ID:** `c79574fe-1be5-427f-8788-36f8a9b9620d`
- **Result:** release-preview authorization and an audit receipt, **not a production deployment or payment**.

For privacy and operational security, this file intentionally does **not** reproduce the single-use approval nonce, the entire user approval command, local session credentials, or agent API keys.

## Evidence-backed sequence

1. **Human business requirement.** The owner authored the demo checkout refund acceptance requirement in real `support-room`: cumulative refunds must not exceed the captured payment. The investigator cited the real Switch owner-authored source and refused to invent a historic customer support ticket. See [Support requirement](LIVE_SUPPORT_REQUIREMENT_2026-11-05.md).
2. **Live release blocked.** In `release-room` the human submitted a real `release_request` for `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`, decision `live-block-a9eb054a-9564-42bf-aaf1-c3b7ee5a9c8c`. The engineering baseline passed, the real successive-refund regression failed, and Gatekeeper posted an actual **UNSEEN BLOCKED** message. See [Blocked evidence](LIVE_BLOCKED_RELEASE_2026-11-05.md).
3. **Agent-authored repair.** The real Switch engineering agent committed the repair as direct child `f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078` inside an independent, persistent demonstration checkout. Its claim was logged separately, not treated as proof by itself. See [Engineering repair report](LIVE_REPAIR_AGENT_REPORT_2026-11-05.md).
4. **Independent repaired-SHA verification.** Gatekeeper checked the exact Git parent, clean checkout and expected modified files, and ran both allowlisted test commands on the repaired SHA. It posted real Switch verification **PASS** for both. The original decision was preserved as **SUPERSEDED**. Gatekeeper created repaired decision `repair-67f48203-1b45-4912-87ca-d3a25affd293`, then requested fresh engineering and support evidence through Switch.
5. **Fresh evidence and challenge.** Fresh addressed agent reports were received in the real rooms, independently verified by Gatekeeper, and the repaired decision became **READY_FOR_APPROVAL**. An initial human approval failed closed with `STALE_EVIDENCE`. The implementation was corrected to rotate the one-time challenge whenever canonical evidence changes and to accept a refresh request only from the authenticated linked release owner.
6. **Human-approved preview receipt.** The linked human requested the latest challenge, sent the current exact approval command in `release-room`, and Gatekeeper responded with **UNSEEN AUTHORIZED** and receipt `c79574fe-1be5-427f-8788-36f8a9b9620d`. No deployment occurred.

## What this proves, and what it does not

**Live confirmed:** Switch as the actual multi-agent transport and authorization boundary; a human owner + engineering and support agents; independent fixed-command tests against exact Git commits; durable blocked/superseded decisions; new evidence collection on a repaired SHA; stale-digest rejection and fresh approval challenge; and a real human-authorized preview receipt delivered to the Switch room.

**Not claimed:** real customer transactions, on-chain payments, deployment, a historical customer ticket, or a third-party public attestation of the operator's local Switch server. A coding-agent role was *not* bound; remediation was performed by the named engineering agent and sent for an explicit human-requested independent review. The development suite's separate `npm run demo` uses a **local protocol harness**, which must not be confused with this completed live Switch run.

## Reproducible local proof

- Run `npm test` and `npm run demo` from the public UNSEEN repository to review test coverage and the clearly labeled **local protocol harness**.
- Run `npm start` locally, then open `http://127.0.0.1:4173/` to inspect the **read-only** decision board. The real local `.unseen/state.json` is needed to show this specific operator session; it is deliberately ignored and not distributed.
- The board supports `GET /api/state`, `GET /api/decisions/:decisionId`, and `GET /api/decisions/:decisionId/audit`. The first reports decisions, and the latter two expose the exact decision and its audit events from a user's **own** saved local run.
- **For public judges:** record a screen-share video of the actual Switch Console message timeline and decision board, because the local `http://localhost:64822` permalinks are not accessible externally. Do not publish the local `.env.local` or the raw store if it includes operational secrets.

## Last verified engineering baseline

Following the stale-evidence challenge fix, GitHub Actions passed **91/91 Node tests on Windows and Linux**, and the independent local refund-recovery demo still reproduced the original block. This CI test evidence is separate from the live Switch receipt and should be described as such.

This source log is an operator-transcribed record supported by supplied screenshots and chat messages. Public video capture is the remaining demonstration artifact; no submission or video has yet been asserted to exist.
