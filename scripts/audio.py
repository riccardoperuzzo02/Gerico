#!/usr/bin/env python3
"""Legge ad alta voce il riepilogo del giorno: da site/data/riepilogo.json a site/audio/riepilogo.m4a.

Uso:
    python3 scripts/audio.py site

Gira nel job «Dati del Terminal». Se il riepilogo non c'è, o l'audio è già quello del riepilogo
attuale, non fa niente. La voce è Nicola di Kokoro (modello aperto, licenza Apache 2.0), che gira
sul server senza servizi esterni; i file del modello si scaricano dalle release di kokoro-onnx
su GitHub e restano nella cache del job. L'audio è AAC mono a 32 kbps: circa 240 KB al minuto.
Scrive anche site/data/audio.json, che la prima pagina legge per mostrare il pulsante «Ascolta»."""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
CACHE = os.path.expanduser("~/.cache/kokoro")
VOICE, LANG, SPEED = "im_nicola", "it", 1.0

# come si leggono sigle e simboli che la voce sbaglierebbe
SAY = [
    (r"S&P\s*500", "esse e pi cinquecento"), (r"S&P", "esse e pi"), (r"\bFtse\s*Mib\b", "Ftse Mib"),
    (r"\bEUR/USD\b", "euro dollaro"), (r"\bGBP/USD\b", "sterlina dollaro"), (r"\bUSD/JPY\b", "dollaro yen"),
    (r"\bUSD/CHF\b", "dollaro franco"), (r"\bAUD/USD\b", "dollaro australiano"), (r"\bUSD/CAD\b", "dollaro canadese"),
    (r"\bWti\b|\bWTI\b", "W T I"), (r"\bTTF\b", "T T F"), (r"\bBtp\b|\bBTP\b", "Btp"), (r"\bPil\b|\bPIL\b", "Pil"),
    (r"\bpb\b", "punti base"), (r"\bp\.p\.", "punti percentuali"), (r"\bmld\b", "miliardi"), (r"\bmln\b", "milioni"),
]


def speakable(text):
    t = text.replace("’", "'").replace("–", ", ").replace("—", ", ").replace("«", "").replace("»", "")
    for a, b in SAY:
        t = re.sub(a, b, t)
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)            # 3.956 -> 3956: la voce non legge il punto delle migliaia
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"\s*%", " per cento", t)
    t = re.sub(r"\$\s*(\d[\d.,]*)", r"\1 dollari", t)
    t = re.sub(r"(\d[\d.,]*)\s*\$", r"\1 dollari", t)
    t = re.sub(r"€\s*(\d[\d.,]*)", r"\1 euro", t)
    t = re.sub(r"(\d[\d.,]*)\s*€", r"\1 euro", t)
    t = re.sub(r"(\d)[.:](\d{2})\b(?!\d)", r"\1 e \2", t)  # 14:30 -> 14 e 30
    return re.sub(r"\s+", " ", t).strip()


def chunks(text, size=380):
    """Pezzi di qualche frase: la voce va meglio su testi brevi."""
    out, cur = [], ""
    for s in re.split(r"(?<=[.!?;:])\s+", text):
        if cur and len(cur) + len(s) > size:
            out.append(cur)
            cur = s
        else:
            cur = (cur + " " + s).strip()
    if cur:
        out.append(cur)
    return out


def model():
    os.makedirs(CACHE, exist_ok=True)
    for name in FILES:
        path = os.path.join(CACHE, name)
        if not os.path.exists(path) or os.path.getsize(path) < 1_000_000:
            urllib.request.urlretrieve(MODEL_URL + name, path + ".part")
            os.replace(path + ".part", path)
    from kokoro_onnx import Kokoro
    return Kokoro(os.path.join(CACHE, FILES[0]), os.path.join(CACHE, FILES[1]))


def main(site):
    data = os.path.join(site, "data")
    try:
        with open(os.path.join(data, "riepilogo.json"), encoding="utf-8") as f:
            rp = json.load(f)
    except (OSError, ValueError):
        print("Nessun riepilogo: niente audio da fare.")
        return
    try:
        with open(os.path.join(data, "audio.json"), encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    if old.get("source") == rp.get("asOf") and os.path.exists(os.path.join(site, "audio", "riepilogo.m4a")):
        print("L'audio è già quello del riepilogo attuale.")
        return
    import numpy as np
    import soundfile as sf
    t0 = time.time()
    k = model()
    parts, rate = [], 24000
    for c in chunks(speakable(rp["text"])):
        samples, rate = k.create(c, voice=VOICE, speed=SPEED, lang=LANG)
        parts.extend([samples, np.zeros(int(rate * 0.28), dtype=samples.dtype)])  # una pausa breve tra un pezzo e l'altro
    audio = np.concatenate(parts)
    os.makedirs(os.path.join(site, "audio"), exist_ok=True)
    dest = os.path.join(site, "audio", "riepilogo.m4a")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "r.wav")
        sf.write(wav, audio, rate)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "32k",
                        "-movflags", "+faststart", dest + ".tmp.m4a"], check=True)
    os.replace(dest + ".tmp.m4a", dest)
    with open(dest, "rb") as f:
        tag = hashlib.sha256(f.read()).hexdigest()[:10]
    info = {"asOf": datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds"), "source": rp.get("asOf"),
            "date": rp.get("date"), "title": rp.get("title") or "Il riepilogo di GERICO",
            "duration": round(len(audio) / rate), "src": "audio/riepilogo.m4a?v=" + tag, "voice": "Nicola, sintesi vocale Kokoro"}
    with open(os.path.join(data, "audio.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, separators=(",", ":"))
    print(f"::notice::audio.json: riepilogo letto in {info['duration']} s di audio, {os.path.getsize(dest) // 1024} KB, in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    try:
        main(sys.argv[1])
    except Exception as e:  # l'audio non deve fermare la pubblicazione dei dati
        print(f"::warning::audio: {type(e).__name__}: {e}")
