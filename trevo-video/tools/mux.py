#!/usr/bin/env python3
"""Mixa voz + efeitos (whoosh nos cortes, batida, ding do cartão final) e junta com os quadros.
Saída: trevo-estrada.mp4 (1080x1920, 30 fps, H.264 + AAC)."""
import json, os, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
SR = 44100
TL = json.load(open(os.path.join(BUILD, "timeline.json"), encoding="utf-8"))
total = TL["total"]
rng = np.random.default_rng(11)

# voz -> 44.1 kHz
v44 = os.path.join(BUILD, "voice44.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(BUILD, "voice.wav"), "-ar", str(SR), "-ac", "1", v44], check=True)
with wave.open(v44) as wf:
    voice = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
n = int(total * SR)
mix = np.zeros(n, dtype=np.float32)
mix[: min(n, len(voice))] += voice[:n]


def add(sig, t):
    a = int(t * SR)
    if a < 0:
        sig = sig[-a:]; a = 0
    b = min(n, a + len(sig))
    if b > a:
        mix[a:b] += sig[: b - a]


def whoosh(dur=0.5, amp=0.09):
    m = int(dur * SR)
    t = np.linspace(0, 1, m)
    noise = rng.standard_normal(m).astype(np.float32)
    cutoff = 500 + 5200 * np.sin(np.pi * t) ** 1.5          # varre grave -> agudo -> grave
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros(m, dtype=np.float32); acc = 0.0
    for i in range(m):                                       # passa-baixa com corte variável
        acc += alpha[i] * (noise[i] - acc); y[i] = acc
    env = np.sin(np.pi * t) ** 2
    y = y * env
    return (y / (np.max(np.abs(y)) + 1e-6) * amp).astype(np.float32)


def crash(amp=0.55):
    m = int(1.1 * SR); t = np.arange(m) / SR
    noise = rng.standard_normal(m).astype(np.float32)
    acc = 0.0; y = np.zeros(m, dtype=np.float32)
    for i in range(m):
        acc += 0.35 * (noise[i] - acc); y[i] = acc
    y *= np.exp(-t * 7)
    thump = np.sin(2 * np.pi * (45 + 80 * np.exp(-t * 18)) * t) * np.exp(-t * 6)
    crack = rng.standard_normal(m).astype(np.float32) * np.exp(-t * 60) * 0.6
    s = y * 0.8 + thump * 0.9 + crack
    return (s / (np.max(np.abs(s)) + 1e-6) * amp).astype(np.float32)


def ding(amp=0.10):
    m = int(0.9 * SR); t = np.arange(m) / SR
    s = (np.sin(2 * np.pi * 988 * t) + 0.5 * np.sin(2 * np.pi * 1480 * t)) * np.exp(-t * 5)
    return (s / np.max(np.abs(s)) * amp).astype(np.float32)


for sc in TL["scenes"][1:]:
    add(whoosh(), sc["t0"] - 0.28)
crash_t = next(s["crashT"] for s in TL["scenes"] if "crashT" in s)
add(crash(), crash_t - 0.03)
add(ding(), TL["scenes"][-1]["t1"] - 2.35)

peak = float(np.max(np.abs(mix)))
if peak > 0.95:
    mix *= 0.95 / peak
mix_path = os.path.join(BUILD, "mix.wav")
with wave.open(mix_path, "wb") as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes((mix * 32767).astype(np.int16).tobytes())

out = os.path.join(ROOT, "trevo-estrada.mp4")
subprocess.run([
    "ffmpeg", "-v", "error", "-y",
    "-framerate", str(TL["fps"]), "-i", os.path.join(BUILD, "frames2", "f_%05d.jpg"),
    "-i", mix_path,
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-af", "highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=2,loudnorm=I=-15:TP=-1.5:LRA=9",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", "-movflags", "+faststart", out,
], check=True)
print("ok ->", out, round(os.path.getsize(out) / 1e6, 1), "MB")
