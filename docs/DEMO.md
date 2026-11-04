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
npm run replay
```

The local run is useful for judging the actual policy and runner behavior. Its Switch frames are a protocol harness and must be labelled that way.

To clear only durable local state before replaying the bridge, run `npm run reset:local`. For host setup, copy `.env.example` to `.env.local` and run `npm run diagnose:switch`; the diagnostic reports presence and reachability only, never secret values.

## Live recording checklist

- [ ] Switch Console is signed in, the local server is running, and `npm run diagnose:switch` reports the authenticated bridge reachable.
- [ ] Bundled Mattermost is linked and `release-room` / `support-room` are visible.
- [ ] The agent API key is in a local secret store, not the terminal recording.
- [ ] Real room IDs and opaque participant IDs are configured in the adapter.
- [ ] A real `@` mention receives a visible UNSEEN reply before recording the workflow.
- [ ] The camera shows the Switch room and UNSEEN board, not credentials.
- [ ] Human release owner requests checkout commit `A` in `release-room`.
- [ ] UNSEEN visibly requests missing engineering/support evidence; the investigator retrieves support evidence through Switch.
- [ ] The real allowlisted regression fails with exit code `1` against exact commit `A`, and the release gate blocks.
- [ ] The coding agent reports repaired exact commit `B`; UNSEEN supersedes `A` and reruns both independent checks on `B`.
- [ ] The approval message includes the nonce-bound challenge fields, without showing any secret key.
- [ ] The human approves exact commit `B` in `release-room`; the final receipt contains the same SHA and evidence digest.
- [ ] Disconnect/reconnect or a controlled cursor gap is shown as recovery, with no automatic approval or release during the gap.
- [ ] The final receipt, audit trail, and counterfactual are visible.
- [ ] The README links the official Switch docs and clearly distinguishes live evidence from the local harness.

## Evidence labels

- `live-switch`: an event observed from the bearer-authenticated Switch WebSocket and a real room/participant mapping.
- `simulated-or-unverified`: local protocol fixtures, unit tests, and `npm run demo`.
- Never use a local receipt, fixture ID, or test output as evidence that Switch collaboration happened.

## Submission claims to keep precise

Say “verified in the live Switch run” only after the adapter has been connected to the authenticated Switch bridge and the messages have been observed in Mattermost. Say “locally tested protocol harness” for `npm run demo` and the unit/integration tests. Do not describe the local harness as a Switch Console event.
