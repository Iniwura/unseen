from pathlib import Path
import asyncio, json, subprocess
import edge_tts
OUT=Path("motion/judge-voice/out")
OUT.mkdir(parents=True,exist_ok=True)
BEATS=[
(0,"A green build is not the same as a safe release. The danger is often a requirement nobody tested, because it lives in another team's conversation. This is UNSEEN."),
(15,"Here is the product. A read-only release dashboard shows every candidate, its exact Git commit, and the evidence behind each decision. A reviewer can open a blocked decision and inspect exactly why."),
(30,"This checkout release passed its baseline tests. But support held a business rule. Total refunds must never exceed what a customer paid. UNSEEN's investigator recovered that requirement through Switch."),
(46,"One hundred captured. Fifty already refunded. Another sixty requested. That would make one hundred and ten refunded. The original code missed this cumulative limit. An independent regression failed on the submitted commit."),
(62,"UNSEEN blocked the release. Not a warning you can ignore. The gate stayed closed, and the original decision remained in the ledger. The dashboard exposes the failed support evidence and its audit trail."),
(78,"Engineering then repaired the refund calculation and submitted a new Git commit. Rather than trusting the claim, UNSEEN verified the exact revision and reran the baseline and boundary tests against that code."),
(94,"The repaired revision passed both engineering and support verification. The earlier failure was superseded, never erased. The dashboard moved to ready for approval, with evidence sources the reviewer could inspect."),
(109,"No agent silently approved a deployment. A human authorized the exact verified candidate through Switch. UNSEEN recorded that approval and issued a release preview receipt. This was a preview, not a production deployment."),
(125,"What changed? A business rule hidden in another room became a reproducible test, a prevented release, a verified repair, and a human controlled decision. UNSEEN. Evidence before permission. Built with Switch.")
]
async def main():
 for i,(start,s) in enumerate(BEATS):
  dst=OUT/f"beat_{i+1:02d}.mp3"
  for attempt in range(4):
   try:
    await edge_tts.Communicate(s,voice="en-US-AndrewNeural",rate="-7%",pitch="-2Hz").save(str(dst))
    if dst.stat().st_size<3500:raise ValueError("Too small")
    break
   except Exception as e:
    print(i+1,attempt,str(e),flush=True)
    if attempt==3:raise
    await asyncio.sleep(1+attempt)
  print("saved",dst,dst.stat().st_size,flush=True)
 (OUT/"script.json").write_text(json.dumps([{"start":start,"text":s} for start,s in BEATS],indent=2))
asyncio.run(main())
