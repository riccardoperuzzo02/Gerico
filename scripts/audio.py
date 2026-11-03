#!/usr/bin/env python3
"""Legge ad alta voce il riepilogo del giorno: da site/data/riepilogo.json a site/audio/riepilogo.m4a.

Uso:
    python3 scripts/audio.py site

Gira nel job «Dati del Terminal». Se il riepilogo non c'è, o l'audio è già quello del riepilogo
attuale, non fa niente. La voce è Nicola di Kokoro (modello aperto, licenza Apache 2.0), che gira
sul server senza servizi esterni; i file del modello si scaricano dalle release di kokoro-onnx
su GitHub e restano nella cache del job. L'audio è AAC mono a 64 kbps: circa 480 KB al minuto.
Scrive anche site/data/audio.json, che la prima pagina legge per mostrare il pulsante «Ascolta»."""
import hashlib
import json
import os
import re
import shutil
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
LANG = "it"
# Nicola con un po' di Sara (15%): l'intonazione varia di più e la voce resta maschile; un filo più veloce, frase per frase
VOICE_MIX = (("im_nicola", 0.85), ("if_sara", 0.15))
SPEED = 1.1
VOICE_ID = "kokoro-nicola85-sara15-v2"  # cambia quando cambia la voce: l'audio si rifà anche con lo stesso testo
# volume normalizzato (-16 LUFS, come i podcast), un po' di compressione e di presenza sulle medie
CHAIN = ("highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=80:makeup=2,"
         "equalizer=f=3200:t=q:w=1.2:g=2.5,loudnorm=I=-16:TP=-1.5:LRA=9")
PAUSE_SENT, PAUSE_PARA = 0.2, 0.55

# come si leggono sigle, nomi e simboli che la voce sbaglierebbe (controllati con i fonemi di espeak per l'italiano)
SAY = [
    (r"S&P\s*500", "esse e pi cinquecento"), (r"S&P", "esse e pi"), (r"\bFTSE\b|\bFtse\b", "Futsi"),
    (r"\bEUR/USD\b", "euro dollaro"), (r"\bGBP/USD\b", "sterlina dollaro"), (r"\bUSD/JPY\b", "dollaro yen"),
    (r"\bUSD/CHF\b", "dollaro franco"), (r"\bAUD/USD\b", "dollaro australiano"), (r"\bUSD/CAD\b", "dollaro canadese"),
    (r"\bWti\b|\bWTI\b", "W T I"), (r"\bTTF\b|\bTtf\b", "T T F"), (r"\bBtp\b|\bBTP\b", "Btp"), (r"\bPil\b|\bPIL\b", "Pil"),
    (r"\bpb\b", "punti base"), (r"\bp\.p\.", "punti percentuali"), (r"\bmld\b", "miliardi"), (r"\bmln\b", "milioni"),
    (r"\bBCE\b|\bBce\b", "bi ci e"), (r"\b([lL])'(?:UE|Ue)\b", r"\1'Unione europea"), (r"\bUE\b|\bUe\b", "Unione europea"),
    (r"\bFMI\b|\bFmi\b", "effe emme i"), (r"\bFBI\b|\bFbi\b", "effe bi ai"), (r"\bETF\b|\bEtf\b", "e ti effe"),
    (r"\bCEO\b|\b[Cc]eo\b", "amministratore delegato"), (r"\bchips?\b", "cip"), (r"\bspread\b", "sprèd"),
    (r"\bStoxx\b|\bSTOXX\b", "Stox"), (r"\bTreasury\b", "Trèsciuri"), (r"\bReuters\b", "Ròiters"), (r"\bBloomberg\b", "Blùmberg"),
    (r"\bJPMorgan\b|\bJP Morgan\b", "Gei Pi Morgan"), (r"\bSachs\b", "Saks"), (r"\bNvidia\b", "Envìdia"), (r"\bASML\b", "a esse emme elle"),
    (r"\bTrump\b", "Tramp"), (r"\bVance\b", "Vens"), (r"\bPowell\b", "Pàuel"), (r"\bBinance\b", "Bàinans"), (r"\bEisenkot\b", "Àisenkot"),
]
# espeak segna le parole che legge in inglese con (en) ... (it): la voce leggerebbe i segni come lettere, quindi si tolgono
FLAG = re.compile(r"\([a-z]{2,3}(?:-[a-z0-9]+)*\)")


UNITS = ("zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici "
         "diciassette diciotto diciannove").split()
TENS = ("", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta")


def words(n):
    """Un numero intero in lettere (fino a 999.999), per i casi in cui la voce leggerebbe male le cifre."""
    if n < 20:
        return UNITS[n]
    if n < 100:
        t, u = divmod(n, 10)
        w = TENS[t][:-1] if u in (1, 8) else TENS[t]
        return w + ("tré" if u == 3 else UNITS[u] if u else "")
    if n < 1000:
        c, r = divmod(n, 100)
        return ("cento" if c == 1 else UNITS[c] + "cento") + (words(r) if r else "")
    if n < 1_000_000:
        m, r = divmod(n, 1000)
        return ("mille" if m == 1 else words(m) + "mila") + (words(r) if r else "")
    return str(n)


def speakable(text):
    t = text.replace("’", "'").replace("–", ", ").replace("—", ", ").replace("«", "").replace("»", "")
    for a, b in SAY:
        t = re.sub(a, b, t)
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)            # 3.956 -> 3956: la voce non legge il punto delle migliaia
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    # l'1,4 e dell'8: davanti alle cifre la voce leggerebbe l'apostrofo come «elle», quindi il numero va in lettere
    t = re.sub(r"\b([A-Za-zÀ-ÿ]*')(\d+)(?:,(\d+))?",
               lambda m: m.group(1) + words(int(m.group(2))) + (" virgola " + m.group(3) if m.group(3) else ""), t)
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


def sentences(text):
    """Frasi del testo già pronto per la voce; quelle molto lunghe si spezzano alle virgole."""
    out = []
    for s in re.split(r"(?<=[.!?])\s+", text):
        s = s.strip()
        while len(s) > 300:
            cut = max(s.rfind(", ", 0, 300), s.rfind("; ", 0, 300))
            if cut < 80:
                break
            out.append(s[:cut + 1])
            s = s[cut + 2:]
        if s:
            out.append(s)
    return out


def jingle(np, rate):
    """La sigla di GERICO: due note brevi (la e mi), suono di marimba fatto con numpy. Niente file con diritti."""
    def note(f, dur=0.9):
        t = np.arange(int(rate * dur)) / rate
        env = np.minimum(t / 0.004, 1.0)
        y = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.32) + 0.32 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.09)
             + 0.06 * np.sin(2 * np.pi * 9.9 * f * t) * np.exp(-t / 0.04))
        return (env * y).astype(np.float32)
    out = np.zeros(int(rate * 1.25), dtype=np.float32)
    for start, f in ((0.0, 440.0), (0.17, 659.25)):
        n = note(f)
        i = int(rate * start)
        out[i:i + len(n)] += n[: len(out) - i]
    return out / np.max(np.abs(out)) * 0.45


def ffmpeg():
    """Il ffmpeg del sistema, se c'è; altrimenti quello del pacchetto imageio-ffmpeg (sul server di GitHub non c'è)."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


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
    if old.get("source") == rp.get("asOf") and old.get("voiceId") == VOICE_ID and os.path.exists(os.path.join(site, "audio", "riepilogo.m4a")):
        print("L'audio è già quello del riepilogo attuale.")
        return
    import numpy as np
    import soundfile as sf
    t0 = time.time()
    k = model()
    style = lambda v: k.get_voice_style(v) if hasattr(k, "get_voice_style") else k.voices[v]
    voice = sum(w * style(v) for v, w in VOICE_MIX)
    rate = 24000
    parts = [jingle(np, rate), np.zeros(int(rate * 0.35), dtype=np.float32)]
    # frase per frase: ogni frase ha la sua intonazione; pausa breve tra le frasi, più lunga tra un tema e l'altro (riga vuota)
    paras = [p for p in re.split(r"\n\s*\n", rp["text"]) if p.strip()]
    for para in paras:
        for s in sentences(speakable(para)):
            phonemes = FLAG.sub("", k.tokenizer.phonemize(s, lang=LANG))
            samples, rate = k.create(phonemes, voice=voice, speed=SPEED, is_phonemes=True)
            parts.extend([samples.astype(np.float32), np.zeros(int(rate * PAUSE_SENT), dtype=np.float32)])
        parts[-1] = np.zeros(int(rate * PAUSE_PARA), dtype=np.float32)
    audio = np.concatenate(parts[:-1])
    os.makedirs(os.path.join(site, "audio"), exist_ok=True)
    dest = os.path.join(site, "audio", "riepilogo.m4a")
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "r.wav")
        sf.write(wav, audio / max(1e-6, float(np.max(np.abs(audio)))) * 0.9, rate)
        subprocess.run([ffmpeg(), "-loglevel", "error", "-y", "-i", wav, "-af", CHAIN, "-ar", str(rate), "-ac", "1",
                        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", dest + ".tmp.m4a"], check=True)
    os.replace(dest + ".tmp.m4a", dest)
    with open(dest, "rb") as f:
        tag = hashlib.sha256(f.read()).hexdigest()[:10]
    info = {"asOf": datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds"), "source": rp.get("asOf"),
            "date": rp.get("date"), "title": rp.get("title") or "Il riepilogo di GERICO",
            "duration": round(len(audio) / rate), "src": "audio/riepilogo.m4a?v=" + tag, "voice": "Nicola, sintesi vocale Kokoro",
            "voiceId": VOICE_ID}
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
