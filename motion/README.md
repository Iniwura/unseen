# UNSEEN — reference-led Remotion motion study

An **actual Remotion project**, separate from the product runtime, for a 12-second animation prototype. It uses the approved Storyboard A story and the existing UNSEEN visual language. It does **not** create new release decisions or claim the recreated interface is a live Switch recording.

## Primary style reference

The user's uploaded 44-second **Alysis** film: white negative space, crisp typography, natural UI motion, generous holds and minimal ornament. Secondary influence: the user's longer Articul8/Bivia film for schematic transitions. Neither film nor its assets are copied into this repository.

## Facts re-typeset from verified UNSEEN proof

- Original candidate: `a921b8a5d51c0a8a58fcdcd59c0963ac012d8627`
- Baseline passed but independently run successive-refund regression failed.
- Owner-authored support requirement: cumulative refunds must not exceed captured payment.
- Local reproducible example: 100 captured, 50 refunded, 60 requested; faulty calculation attempts 110 cumulative.
- Actual Gatekeeper blocked original candidate. The *real* Switch Console recording is separate and is required in the full demo.
- This short study deliberately does **not** depict human approval, deployment or a fabricated live status.

See [live Switch completion receipt](../docs/LIVE_COMPLETION_RECEIPT_2026-11-05.md).

## Production

Requires Node 20+ and npm access.

```bash
cd motion
npm install
npm run studio
npm run render
```

Render output: `motion/out/UNSEEN_Proof_Study.mp4`. GitHub Actions workflow `Render UNSEEN Motion Study` publishes the MP4 as an artifact on the motion branch.

## Safety and editorial boundary

This is a **re-typeset graphic explanation**, not a screenshot, direct quote, or transcript of Switch traffic. The complete demo must show the original operator-recorded Switch footage, with approval nonce redacted, for all actual gate decisions and the human receipt. No confidential approval command is included. Color uses UNSEEN ink/off-white/lime, with muted red for blocked states.

## Motion parameters

1920 × 1080, 30 fps, 360 frames, four independent timeline sections: baseline, recovered rule, regression, blocked. Every animated element is driven by Remotion `useCurrentFrame()`, `interpolate()`, `spring()`, and CSS transforms. No exported still frames are panned or zoomed.
