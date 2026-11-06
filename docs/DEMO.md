# UNSEEN — Verified demo and submission checklist

**Official track:** Flip the Switch / Best Business Workflow.

For the concise judge's guide, see [JUDGE_START_HERE.md](JUDGE_START_HERE.md).

## The recorded story — November 5, 2026

1. The **human release owner** posted the checkout release request in Switch `release-room`, bound to vulnerable commit `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`.
2. The **engineering agent** supplied engineering baseline evidence. The baseline passed.
3. In `support-room`, the **support investigator** recovered the owner-authored refund rule: cumulative refunds must not exceed captured payment. This was a demo requirement, not a real customer support ticket.
4. The Gatekeeper independently ran the fixed regression against the exact original checkout. It failed; the original decision became **BLOCKED**.
5. The **engineering agent** authored the repair commit `f1f440a8f8a1f71052e27d6bad4c8c5acbd9e078`. No separate coding agent was authorized for this specific live flow.
6. The Gatekeeper checked the repair's exact parent, contents and tests. It kept the original decision as **SUPERSEDED** and opened a new evidence review. Engineering and support agents supplied fresh messages on the new revision.
7. A human explicitly approved the current verified repair, with a fresh single-use challenge bound to that SHA and evidence. The Gatekeeper issued receipt `c79574fe-1be5-427f-8788-36f8a9b9620d`.
8. Final outcome: **release-preview authorization only**. No production deployment, payment, or historical customer incident.

This is documented as a **real Switch/Mattermost local session** in [LIVE_COMPLETION_RECEIPT_2026-11-05.md](LIVE_COMPLETION_RECEIPT_2026-11-05.md). The operator's local `localhost` links are not public.

## Reproduce the behavior without private Switch credentials

```bash
npm ci
npm test
npm run demo:board
```

Open `http://127.0.0.1:4173` in a browser. This is a functioning read-only dashboard fed by a **locally executed protocol harness**, not a live Switch session. It explicitly displays the provenance label. A fresh run produces new temporary checkout SHAs; it does not recover the separate operator's authenticated Switch data.

For live configuration see [the README Switch setup](../README.md#switch-setup) and official Switch docs. A person must provide real room memberships, linked human authorization and agent IDs on their own local Switch server.

## Final publication checklist

- [x] Public repo, reproducible harness and real Switch evidence documented.
- [x] Verified live blocked → repaired → authorized **preview** story.
- [x] Green GitHub CI for Linux and Windows (95 tests each; zero known production dependency advisories at last run).
- [x] Prepared 2-minute-20-second MP4 with narrator and an explanatory dashboard replay.
- [ ] Upload MP4 to a **publicly viewable** video URL and test playback in a logged-out browser.
- [ ] Put the public video link in the README and official entry.
- [ ] Complete the official hackathon entry **manually** under the entrant's real identity and confirm the submission is accepted.
- [ ] Verify entry eligibility and prize-verification details personally.

## Claims and security

Keep the video labels `Dashboard replay` and `Local protocol harness` visible where appropriate. Use the real Switch recording for authentic room messages. Never show API keys, full approval commands, one-use approval nonce, bearer tokens, or the operator's raw `.unseen` state. Approval through Switch does not mean an actual production deployment.

Do not imply a coding agent authored the recorded repair. It was authored by the **engineering agent**, and Gatekeeper independently verified the result.

[Official hackathon](https://www.wemakedevs.org/hackathons/switch) · [submission requirements](https://www.devtoolsacademy.com/hackathons/flip-the-switch)
