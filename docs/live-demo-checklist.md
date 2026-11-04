# UNSEEN live demonstration checklist

Use this checklist for a recording or judge review. Keep the board and both Switch rooms visible, and show the source of every result.

## Before recording

- Start Switch Console Local server and confirm `npm run diagnose:switch` reports the discovered Core endpoint as reachable.
- Run `npm run register:switch` once, then `npm run discover:switch`; do not show `.env.local`, API keys, registration tokens, or browser storage.
- Configure only the exact IDs returned by authenticated discovery: release/support rooms, release owner, engineering agent, evidence investigator, and coding agent.
- Point `UNSEEN_CHECKOUT_ROOT` at the clean candidate checkout and run `npm test`.
- Start the read-only board and `npm run connect:switch`; confirm the board label is `live-switch` and the connection shows both subscribed rooms.

## Required live sequence

1. The human release owner posts an addressed `release_request` for the exact candidate SHA in `release-room`.
2. UNSEEN replies in Switch, records the decision, and asks engineering for baseline evidence.
3. After engineering evidence, UNSEEN visibly asks the evidence investigator in `support-room` for the missing support requirement.
4. The investigator posts addressed evidence; the allowlisted runner executes the real regression against the exact SHA.
5. The regression failure is visible in Switch and the release remains `BLOCKED` on the board.
6. The coding agent repairs the bug and posts the exact new commit SHA.
7. UNSEEN independently reruns both allowlisted checks against the repaired SHA.
8. UNSEEN posts an exact SHA/evidence-digest/nonce approval challenge; the human approves that exact challenge in `release-room`.
9. UNSEEN posts the receipt ID and `release-preview` result. Confirm no deployment occurred.

## Evidence to preserve

- The Switch room URLs and timestamps for each human/agent message.
- The live board status transitions: `PENDING` → `BLOCKED` → `READY_FOR_APPROVAL` → `EXECUTED`.
- Exact candidate and repaired SHAs, runner command names, exit codes, and output digests.
- The final receipt ID and audit export. Redact all tokens, API keys, cookies, and local `.env.local` contents.

## Recovery proof (optional but recommended)

- Stop and restart the bridge process or interrupt its WebSocket connection.
- Confirm it reconnects with the persisted cursor/generation.
- Inject or observe a cursor gap, confirm both room contexts reload, and verify the workflow remains paused until fresh addressed evidence is received.
