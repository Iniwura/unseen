"""Produce six timeline-aware narration beats for the verified UNSEEN demo."""
from pathlib import Path
import asyncio
import json
import subprocess

OUT = Path("motion/narration/out")
OUT.mkdir(parents=True, exist_ok=True)

# These beat windows match the existing 78.07-second proof-led film.
BEATS = [
    (0.00, 12.40,
     "Your build can pass every test and still ship the wrong behavior. "
     "Because the rule that matters might live outside engineering."),
    (12.40, 26.50,
     "Here, support had a critical requirement. Total refunds can never exceed "
     "the original payment. UNSEEN recovered that rule from a separate Switch room."),
    (26.50, 40.80,
     "The baseline passed. But a second refund could push the total beyond what the customer paid. "
     "UNSEEN reproduced the failure on the exact commit, then blocked the release."),
    (40.80, 55.40,
     "Engineering fixed the calculation and submitted a new Git commit. "
     "UNSEEN didn't erase the blocked decision or blindly trust the patch. "
     "It verified the new revision independently."),
    (55.40, 65.00,
     "The baseline and refund regression passed. "
     "Fresh evidence from both teams was required before anyone could approve."),
    (65.00, 78.07,
     "Only then did the human owner authorize a release preview. "
     "The decision was recorded. Nothing deployed to production. "
     "UNSEEN. Evidence before permission."),
]

async def edge_render():
    import edge_tts
    for i, (_, __, line) in enumerate(BEATS, 1):
        output = OUT / f"beat_{i:02d}.mp3"
        for attempt in range(3):
            try:
                await edge_tts.Communicate(
                    line, voice="en-US-AndrewNeural",
                    rate="-7%", volume="+0%", pitch="-2Hz"
                ).save(str(output))
                if output.stat().st_size < 2500:
                    raise ValueError(f"Suspiciously small {output}")
                break
            except Exception as exc:
                print(f"Beat {i}, attempt {attempt+1}: {exc}", flush=True)
                if attempt == 2:
                    raise
                await asyncio.sleep(attempt + 1)
        print("Rendered", output, output.stat().st_size, flush=True)

def gtts_render():
    from gtts import gTTS
    for i, (_, __, line) in enumerate(BEATS, 1):
        output = OUT / f"beat_{i:02d}.mp3"
        if not output.exists() or output.stat().st_size < 2500:
            gTTS(text=line, lang="en", tld="com", slow=False).save(str(output))
        print("Fallback render",output,output.stat().st_size,flush=True)

if __name__ == "__main__":
    try:
        asyncio.run(edge_render())
        engine = "edge-tts/AndrewNeural"
    except Exception as exc:
        print("Edge unavailable; trying standard TTS backup:", exc, flush=True)
        gtts_render()
        engine = "gTTS"
    timings=[]
    for i,(start,stop,line) in enumerate(BEATS,1):
        p=OUT/f"beat_{i:02d}.mp3"
        duration=float(subprocess.check_output(
            ["ffprobe","-v","error","-show_entries","format=duration","-of","default=nokey=1:noprint_wrappers=1",str(p)],
            text=True).strip())
        timings.append({"file":p.name,"start":start,"end":stop,"duration":duration,"target":stop-start,"text":line})
    (OUT/"timings.json").write_text(json.dumps({"engine":engine,"beats":timings},indent=2))
    print(json.dumps(timings,indent=2),flush=True)
