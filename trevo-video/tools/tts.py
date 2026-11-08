#!/usr/bin/env python3
"""Gera a narração (edge-tts, pt-BR) cena a cena e monta:
  build/timeline.json  -> cenas, tempos de cada palavra, tags e eventos
  build/voice.wav      -> narração completa (24 kHz mono) já alinhada à timeline
"""
import asyncio, json, os, subprocess, sys, unicodedata
import numpy as np
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
VOICE_DIR = os.path.join(BUILD, "voice")
SR = 24000
LEAD = 0.18      # respiro antes da fala de cada cena
os.makedirs(VOICE_DIR, exist_ok=True)

script = json.load(open(os.path.join(ROOT, "script.json"), encoding="utf-8"))
FPS = script["fps"]
PROXY = os.environ.get("HTTPS_PROXY")


def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    return "".join(c for c in w if unicodedata.category(c) != "Mn" and c.isalnum())


async def synth(i, scene):
    mp3 = os.path.join(VOICE_DIR, f"{i:02d}_{scene['id']}.mp3")
    comm = edge_tts.Communicate(
        scene["text"], script["voice"], rate=script["rate"], pitch=script["pitch"],
        boundary="WordBoundary", proxy=PROXY,
    )
    words = []
    with open(mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    return mp3, words


def decode(mp3):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", mp3, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768.0


async def main():
    results = []
    for i, sc in enumerate(script["scenes"]):
        for attempt in range(4):
            try:
                mp3, words = await synth(i, sc)
                break
            except Exception as e:  # rede instável: tenta de novo
                print("retry", i, e, file=sys.stderr)
                await asyncio.sleep(2 * (attempt + 1))
        else:
            raise SystemExit("falha ao sintetizar cena %d" % i)
        audio = decode(mp3)
        results.append((mp3, words, audio))
        print(f"cena {i} {sc['id']}: voz {len(audio)/SR:.2f}s, {len(words)} palavras")

    voice_total = sum(len(a) / SR for _, _, a in results) + LEAD * len(results)
    pad = (script["total"] - voice_total) / len(results)
    print(f"voz total {voice_total:.2f}s -> pausa extra por cena {pad:.2f}s")
    if not (0.05 <= pad <= 1.2):
        raise SystemExit("ajuste 'rate' no script.json (pausa fora da faixa)")

    total_samples = int(round(script["total"] * SR))
    voice = np.zeros(total_samples, dtype=np.float32)
    scenes, t = [], 0.0
    for i, (sc, (mp3, words, audio)) in enumerate(zip(script["scenes"], results)):
        dur = len(audio) / SR + LEAD + pad
        if i == len(results) - 1:
            dur = script["total"] - t
        a0 = int(round((t + LEAD) * SR))
        voice[a0:a0 + len(audio)] += audio[: max(0, total_samples - a0)]
        absw = [{"t": round(t + LEAD + w["t"], 3), "d": round(w["d"], 3), "w": w["w"]} for w in words]
        tags = []
        for tg in sc.get("tags", []):
            hit = next((w for w in absw if norm(w["w"]) == norm(tg["word"])), None)
            if hit:
                tags.append({"t": hit["t"], "label": tg["label"]})
            else:
                print("AVISO: tag sem palavra", tg, file=sys.stderr)
        scene = {"id": sc["id"], "t0": round(t, 3), "t1": round(t + dur, 3), "dur": round(dur, 3),
                 "text": sc["text"], "words": absw, "tags": tags}
        if "crashWord" in sc:
            hit = next((w for w in absw if norm(w["w"]) == norm(sc["crashWord"])), absw[-1])
            scene["crashT"] = hit["t"]
        scenes.append(scene)
        t += dur

    peak = float(np.max(np.abs(voice))) or 1.0
    voice = voice / peak * 0.92
    import wave
    with wave.open(os.path.join(BUILD, "voice.wav"), "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes((voice * 32767).astype(np.int16).tobytes())

    json.dump({"fps": FPS, "total": script["total"], "scenes": scenes},
              open(os.path.join(BUILD, "timeline.json"), "w"), ensure_ascii=False, indent=1)
    for s in scenes:
        print(f"{s['id']:12s} {s['t0']:6.2f} -> {s['t1']:6.2f}  tags={[ (x['label'], x['t']) for x in s['tags']]}")


asyncio.run(main())
