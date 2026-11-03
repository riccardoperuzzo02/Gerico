"""Campioni della voce con Chatterbox multilingue (Resemble AI, licenza MIT), sul server di GitHub.

python prove/chatterbox.py prove/out
Usa il timbro di Nicola (prove/ref_nicola.wav, fatto con Kokoro) e legge prove/testo.txt
con due impostazioni: normale ed espressiva. Scrive i file m4a e report-chatterbox.json."""
import functools
import json
import os
import re
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
import torch
from num2words import num2words

sys.path.insert(0, "scripts")
import audio  # noqa: E402  speakable(): sigle, per cento, valute, numeri dopo l'apostrofo

torch.load = functools.partial(torch.load, map_location="cpu")  # i pesi sono salvati per la GPU
from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
TEXT = open("prove/testo.txt", encoding="utf-8").read().strip()
REF = "prove/ref_nicola.wav"


def in_lettere(t):
    """Chatterbox legge le lettere, non le cifre: i numeri diventano parole."""
    def dec(m):
        a, b = m.group(1), m.group(2)
        tail = " ".join(num2words(int(c), lang="it") for c in b) if b.startswith("0") else num2words(int(b), lang="it")
        return num2words(int(a), lang="it") + " virgola " + tail
    t = re.sub(r"(\d+),(\d+)", dec, t)
    return re.sub(r"\d+", lambda m: num2words(int(m.group(0)), lang="it"), t)


def ffmpeg():
    try:
        return audio.ffmpeg()
    except Exception:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()


t0 = time.time()
torch.manual_seed(0)
model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
RATE = model.sr
report = {"caricamento_s": round(time.time() - t0), "sr": RATE, "torch_threads": torch.get_num_threads()}

for name, ex, cfg in (("2-chatterbox", 0.5, 0.5), ("3-chatterbox-espressiva", 0.7, 0.35)):
    t1 = time.time()
    parts = []
    paras = [p for p in re.split(r"\n\s*\n", TEXT) if p.strip()]
    for para in paras:
        sents = [s for s in re.split(r"(?<=[.!?])\s+", in_lettere(audio.speakable(para))) if s.strip()]
        for i, s in enumerate(sents):
            wav = model.generate(s, language_id="it", audio_prompt_path=REF, exaggeration=ex, cfg_weight=cfg)
            parts.append(wav.squeeze(0).cpu().numpy().astype(np.float32))
            parts.append(np.zeros(int(RATE * (0.2 if i < len(sents) - 1 else 0.55)), dtype=np.float32))
    y = np.concatenate(parts[:-1])
    wav_path = os.path.join(OUT, name + ".wav")
    sf.write(wav_path, y / max(1e-6, np.max(np.abs(y))) * 0.9, RATE)
    subprocess.run([ffmpeg(), "-loglevel", "error", "-y", "-i", wav_path, "-af",
                    "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=80:makeup=2,"
                    "equalizer=f=3200:t=q:w=1.2:g=2.5,loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", "24000",
                    "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
                    os.path.join(OUT, name + ".m4a")], check=True)
    os.remove(wav_path)
    secs = time.time() - t1
    report[name] = {"durata_s": round(len(y) / RATE, 1), "generazione_s": round(secs),
                    "volte_il_tempo_reale": round(secs / (len(y) / RATE), 2), "exaggeration": ex, "cfg_weight": cfg}
    print(name, report[name], flush=True)

json.dump(report, open(os.path.join(OUT, "report-chatterbox.json"), "w"), indent=1)
print(json.dumps(report, indent=1))
