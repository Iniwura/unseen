# Support-room requirement was authored and reviewed

**Observed:** 5 November 2026. The human operator supplied the Switch/Mattermost report attributed to `switch-buddy-admin` at local permalink `http://localhost:64822/switch/pl/9chbmnu4miyo5jin4i9e6r8dpw`.

## Confirmed by the support agent

- The **owner-authored** Switch source message in `support-room` has message identifier `sw_dcb1a077ada96e36be62e334a753ff57`. This is a new **demonstration** business requirement, not a historical customer ticket.
- Candidate: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`.
- Acceptance criterion: total successful refunds must never exceed the original captured amount. With a capture of 100 and successive requests of 50 and 60, correct approved values are 50 and 50; total 100.
- Requirement is **release blocking** and needs independent verification before approval.
- The support agent **could not verify** this candidate SHA against its checkout, and explicitly recommended the release remain blocked. It did not approve or deploy anything.

## Provenance / limitations

The agent's report was observed through the operator's local Switch UI; the Gatekeeper has not yet connected its trusted `support` role to this agent's actual WebSocket event `sender`, and no UNSEEN ingestor has accepted this response as verified support evidence. The legitimate owner-authored source establishes the acceptance rule for this demonstration but does not prove the code passes that rule.

**Keep unchanged:** vulnerable candidate Git SHA `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`. It must remain unapproved and not repaired until the Gatekeeper's original failing test is captured in the live workflow.

## Next

Use Switch's authenticated event history to bind actual agent senders safely; then issue an addressed Gatekeeper release request for the **candidate checkout SHA** (not UNSEEN's product-repo SHA). Engineering evidence must trigger the independent baseline runner. The support requirement must trigger its **independent failing refund runner**, producing a live `BLOCKED` decision before any coding-agent remediation.

Do not claim a complete live run or promote the candidate based on this report alone.
