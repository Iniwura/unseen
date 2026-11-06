# UNSEEN: judge-facing walkthrough and recording guide

**Hackathon:** Flip the Switch (WeMakeDevs × DevTools Academy × Switch)  
**Target track:** Best Business Workflow  
**Current video:** A **140-second narrated MP4** now exists as a local export and dashboard-replay/real-Switch proof cut. The 75–100-second table below remains an *older suggested structure*, not the final film's actual timing. The video must still be uploaded to a publicly accessible site and submitted manually. See [the judge's guide](JUDGE_START_HERE.md).

**Recorded live result:** The actual Gatekeeper authorized the repaired checkout preview with audit receipt `c79574fe-1be5-427f-8788-36f8a9b9620d`. **No production deployment occurred.**

## One-sentence submission description

UNSEEN is a Switch-native, evidence-driven release gate that catches missing business acceptance requirements, blocks unsafe code even when the basic tests are green, coordinates a real engineering repair, independently retests the exact Git commit, and requires human sign-off before creating an auditable release-preview receipt.

## Show, don't tell: recommended 75–100 second recorded walkthrough

| Time | What to show on screen | Suggested voiceover |
| --- | --- | --- |
| 0–10 sec | Real Switch Console, `release-room` and `support-room`; Gatekeeper and engineering agents visible | “UNSEEN is a release gate operated by real agents and a person through Switch, not a standalone chatbot.” |
| 10–24 sec | Owner-authored support requirement and investigator's report | “Support confirms the actual acceptance rule: cumulative refunds cannot exceed the captured amount.” |
| 24–40 sec | Gatekeeper's real engineering baseline PASS and **UNSEEN BLOCKED** message; optional board status | “A basic test passes, but a second refund overpays. The Gatekeeper runs the regression on the exact Git SHA and blocks the release.” |
| 40–58 sec | Engineering agent's actual repair message and repaired commit SHA | “Engineering fixes the remaining-balance calculation and commits a new version without rewriting the blocked history.” |
| 58–77 sec | Gatekeeper's verified repair PASS, original **SUPERSEDED**, fresh agent evidence and READY_FOR_APPROVAL | “UNSEEN checks the real parent commit, reruns the fixed test and requires new evidence for the repaired SHA.” |
| 77–95 sec | Human's live approval and Gatekeeper's **UNSEEN AUTHORIZED** receipt | “The human approves the evidence-bound preview. Gatekeeper issues audit receipt c79574fe… and deploys nothing.” |

These are **timestamps for an edit**, not a claim that a video already exists. Trim downtime and unrelated permission troubleshooting from the judge-facing cut; the live proof remains preserved in the project documentation.

## Final visual checklist

- Capture real Switch Console, not a simulated transcript.
- Zoom to at least readable message sizes, showing exact candidate short SHAs, status transitions and the final receipt.
- Include the support investigator as a **different named agent** in the support room.
- Show the **real Switch → Gatekeeper** path and the human role.
- Display the read-only UNSEEN board only if it accurately shows the same saved decision state. Do not imply a detached copy is live.
- End with a still frame of the Gatekeeper's final **UNSEEN AUTHORIZED** receipt.
- Hide local credentials, all bearer tokens and `.env.local`. There is no need to show any approval nonce.
- Clearly say “release-preview authorization, no deployment.”
- Make the screen recording publicly viewable to judges. Do not submit `localhost` permalinks as proof.

## Reproducibility cutaway

Judges who do not have the original local Switch server can run `npm ci && npm run demo:board` to inspect the **local harness** state in the same UI. In the final video, use the real Switch Console for the human and agent messages. When showing a harness board, retain its visible **LOCAL PROTOCOL HARNESS** disclosure; never edit this label out or imply the preview shows the real session. The operator's live `.unseen/state.json` is not included in the public repository.

## Submission package

- Repository: https://github.com/Iniwura/unseen
- Start here: [README](../README.md)
- Exact real Switch receipt: [Live completion record](LIVE_COMPLETION_RECEIPT_2026-11-05.md)
- Original blocked proof: [Live BLOCKED release](LIVE_BLOCKED_RELEASE_2026-11-05.md)
- One-command reproducibility: `npm install --ignore-scripts && npm test && npm run demo`. The last command is **a local harness**, not a claim of actual Switch traffic.
- **Still needed:** a public video URL and completion of the hackathon's official human submission form. No video or submission has been claimed.

**Official schedule:** submissions close **November 7, 2026 at 11:59 PM IST**. The official hackathon asks for the repo, demo video and README. Enter and submit through the official hackathon site. Automation/bot submission is prohibited by official rules.

## Evaluator distinctions

UNSEEN's novel value is the *blind spot recovery*: the code's apparent green baseline is not enough when the support requirement is missing or contradicted. Switch matters because evidence comes from distinct room-scoped agents and a real human approval, with authenticated messages becoming replayable gate decisions. The repaired result is a safely authorized **preview** with a receipt, not a simulated production deployment.
