# UNSEEN demo and submission checklist

## The two-minute story

1. In `release-room`, the release owner asks whether checkout commit `A` is safe.
2. The engineering agent reports the baseline test pass. UNSEEN shows support evidence is still missing.
3. The investigator finds the support acceptance requirement in `support-room` and sends its content digest through Switch.
4. The allowlisted runner executes the real refund regression against commit `A`; the test exits `1` and UNSEEN turns red.
5. The coding agent fixes the successive-refund bug and reports the new commit `B`.
6. UNSEEN supersedes `A`, independently runs baseline and refund tests against exact commit `B`, and shows both exit `0`.
7. The release owner requests a fresh challenge and approves `B` in `release-room`.
8. UNSEEN issues one execution capability, creates a receipt, and opens the counterfactual: without the recovered support fact, the release would have remained pending or been attempted without the gate.

## Local verification

```bash
npm ci
npm test
npm run demo
```

The local run is useful for judging the actual policy and runner behavior. Its Switch frames are a protocol harness and must be labelled that way.

## Live recording checklist

- [ ] Switch Console is signed in and the local server is running.
- [ ] Bundled Mattermost is linked and `release-room` / `support-room` are visible.
- [ ] The agent API key is in a local secret store, not the terminal recording.
- [ ] Real room IDs and opaque participant IDs are configured in the adapter.
- [ ] A real `@` mention receives a reply before recording the workflow.
- [ ] The camera shows the Switch room and UNSEEN board, not credentials.
- [ ] The failure output includes the exact commit SHA and test exit code.
- [ ] The repaired commit is visibly different and independently retested.
- [ ] The approval message includes the nonce-bound challenge fields, without showing any secret key.
- [ ] The final receipt and counterfactual are visible.
- [ ] The README links the official Switch docs and clearly distinguishes live evidence from the local harness.

## Submission claims to keep precise

Say “verified in the live Switch run” only after the adapter has been connected to the authenticated Switch bridge and the messages have been observed in Mattermost. Say “locally tested protocol harness” for `npm run demo` and the unit/integration tests. Do not describe the local harness as a Switch Console event.
