#!/usr/bin/env python3
"""Legge ad alta voce il riepilogo del giorno: da site/data/riepilogo.json a site/audio/riepilogo.m4a.

Uso:
    python3 scripts/audio.py site            il riepilogo del giorno
    python3 scripts/audio.py site --prove    i primi due temi letti con più voci, in site/audio/prove/

Gira nel job «Dati del Terminal». Se il riepilogo non c'è, o l'audio è già quello del riepilogo attuale con la
stessa voce, non fa niente.

La voce è quella di Gemini 3.8 Flash TTS di Google (API Gemini, livello gratuito; la chiave sta nel segreto
GEMINI_API_KEY del repository, mai nel codice). Si legge un paragrafo per richiesta: dentro il paragrafo la voce lega
le frasi come una persona; tra un tema e l'altro c'è una pausa sempre uguale. Ogni pezzo deve durare quanto ci si
aspetta dal numero di parole, altrimenti si rifà. Se la chiave manca o il servizio non risponde, legge Nicola di
Kokoro (modello aperto, licenza Apache 2.0), che gira sul server senza servizi esterni; i file del modello si
scaricano dalle release di kokoro-onnx su GitHub e restano nella cache del job. Mai due voci nello stesso audio.
L'audio è AAC mono a 64 kbps: circa 480 KB al minuto. Scrive anche site/data/audio.json, che la prima pagina legge
per mostrare il pulsante «Ascolta»."""
import base64
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

# ---------- Gemini ----------
GEMINI_URL = os.environ.get("GERICO_GEMINI_URL", "https://generativelanguage.googleapis.com/v1beta/interactions")
GEMINI_MODEL = "gemini-3.8-flash-tts"
GEMINI_VOICE = os.environ.get("GERICO_VOCE", "").strip() or "Charon"   # maschile, «informativa»
# lo stile sta fuori dal testo (il testo si legge parola per parola) ed è una riga breve e sempre uguale:
# le indicazioni lunghe fanno cambiare la voce da un pezzo all'altro
STYLE = os.environ.get("GERICO_STILE", "").strip() or "Conduttore di un notiziario radio del mattino: calmo, cordiale e sicuro, ritmo naturale, senza enfasi."
GEMINI_CHAIN = "highpass=f=60,acompressor=threshold=-22dB:ratio=2:attack=10:release=120:makeup=1.5,loudnorm=I=-16:TP=-1.5:LRA=11"
PAUSE_TEMA = 0.7                       # tra un tema e l'altro (riga vuota nel testo)
WPS = (1.7, 4.2)                       # parole al secondo accettate: fuori da qui il pezzo ha saltato o aggiunto parole
TRIES = 4
# le voci della prova: maschili e femminili tra quelle adatte a leggere notizie
PROVE = ("Charon", "Sadaltager", "Iapetus", "Algieba", "Schedar", "Kore", "Sulafat", "Erinome")


def gemini_id(voice):
    return "gemini-38-" + voice.lower() + "-v1"


# ---------- Kokoro, la voce di riserva ----------
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


def per_voce(text):
    """Il testo per Gemini: com'è, con i simboli in parole. Niente grafie fonetiche: questa voce legge bene i nomi veri."""
    t = text.replace("’", "'").replace("–", ", ").replace("—", ", ").replace("«", "").replace("»", "")
    t = re.sub(r"\bGERICO\b", "Gèrico", t)
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"\s*%", " per cento", t)
    t = re.sub(r"\$\s*(\d[\d.,]*)", r"\1 dollari", t)
    t = re.sub(r"(\d[\d.,]*)\s*\$", r"\1 dollari", t)
    t = re.sub(r"€\s*(\d[\d.,]*)", r"\1 euro", t)
    t = re.sub(r"(\d[\d.,]*)\s*€", r"\1 euro", t)
    t = re.sub(r"(\d)[.:](\d{2})\b(?!\d)", r"\1 e \2", t)  # 14:30 -> 14 e 30
    return re.sub(r"\s+", " ", t).strip()


def find_audio(doc):
    """I dati dell'audio nella risposta: l'ultimo blocco audio dei passi del modello (API interactions); per sicurezza
    anche la forma di generateContent (inlineData)."""
    found = []
    def walk(x):
        if isinstance(x, dict):
            if x.get("type") == "audio" and isinstance(x.get("data"), str):
                found.append(x["data"])
            for k in ("inlineData", "inline_data"):
                if isinstance(x.get(k), dict) and isinstance(x[k].get("data"), str):
                    found.append(x[k]["data"])
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(doc.get("steps", doc))
    if not found:
        raise ValueError("risposta senza audio")
    return base64.b64decode(found[-1])


def pcm(raw, np, sf):
    """WAV con intestazione (risposta normale) oppure PCM a 16 bit, 24 kHz, mono senza intestazione."""
    if raw[:4] == b"RIFF":
        y, rate = sf.read(io.BytesIO(raw), dtype="float32", always_2d=False)
        if y.ndim > 1:
            y = y.mean(axis=1)
        return y.astype(np.float32), rate
    return np.frombuffer(raw[: len(raw) // 2 * 2], dtype="<i2").astype(np.float32) / 32768.0, 24000


def trim(y, rate, np, keep=0.04):
    """Toglie il silenzio in testa e in coda (sotto -45 dB dal picco, a finestre di 10 ms): le pause le decide il montaggio."""
    if not len(y):
        return y
    win = max(1, int(rate * 0.01))
    n = len(y) // win
    if n < 2:
        return y
    rms = np.sqrt(np.mean(y[: n * win].reshape(n, win) ** 2, axis=1))
    on = np.where(rms > max(1e-4, float(np.max(np.abs(y))) * 10 ** (-45 / 20)))[0]
    if not len(on):
        return y[:0]
    a = max(0, on[0] * win - int(rate * keep))
    b = min(len(y), (on[-1] + 1) * win + int(rate * keep))
    return y[a:b]


def gemini_piece(text, key, voice, np, sf):
    body = {"model": GEMINI_MODEL,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                                                          "annotations": [{"type": "speech_metadata", "style": STYLE}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]}}
    req = urllib.request.Request(GEMINI_URL, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        doc = json.load(r)
    return pcm(find_audio(doc), np, sf)


def gemini_read(text, key, voice, np, sf):
    """Un paragrafo letto da Gemini, con i controlli: durata giusta per il numero di parole, niente silenzio vuoto.
    Gli errori di quota e del servizio aspettano e riprovano; chiave o modello sbagliati fermano subito."""
    words = len(text.split())
    last = None
    for attempt in range(TRIES):
        try:
            y, rate = gemini_piece(text, key, voice, np, sf)
            y = trim(y, rate, np)
            dur = len(y) / rate
            if dur < 0.5 or float(np.max(np.abs(y))) < 0.01:
                raise ValueError("audio vuoto")
            wps = words / dur
            if not WPS[0] <= wps <= WPS[1]:
                raise ValueError(f"{dur:.1f} s per {words} parole ({wps:.1f} al secondo)")
            return y, rate
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404):
                raise RuntimeError(f"Gemini risponde {e.code}: {e.read()[:300]!r}") from None
            wait = e.headers.get("Retry-After") if e.headers else None
            time.sleep(min(60, float(wait)) if wait and wait.isdigit() else 8 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, RuntimeError) as e:
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Gemini non ha letto il pezzo dopo {TRIES} tentativi: {type(last).__name__}: {last}")


def gemini_audio(paras, key, voice, np, sf):
    """Tutto il riepilogo con Gemini: sigla, poi un paragrafo per richiesta con la pausa tra i temi."""
    rate = 24000
    parts = []
    for i, para in enumerate(paras):
        y, rate = gemini_read(per_voce(para), key, voice, np, sf)
        if i:
            parts.append(np.zeros(int(rate * PAUSE_TEMA), dtype=np.float32))
        parts.append(y)
    head = [jingle(np, rate), np.zeros(int(rate * 0.35), dtype=np.float32)]
    return np.concatenate(head + parts), rate


def kokoro_audio(paras, np):
    k = model()
    style = lambda v: k.get_voice_style(v) if hasattr(k, "get_voice_style") else k.voices[v]
    voice = sum(w * style(v) for v, w in VOICE_MIX)
    rate = 24000
    parts = [jingle(np, rate), np.zeros(int(rate * 0.35), dtype=np.float32)]
    # frase per frase: ogni frase ha la sua intonazione; pausa breve tra le frasi, più lunga tra un tema e l'altro (riga vuota)
    for para in paras:
        for s in sentences(speakable(para)):
            phonemes = FLAG.sub("", k.tokenizer.phonemize(s, lang=LANG))
            samples, rate = k.create(phonemes, voice=voice, speed=SPEED, is_phonemes=True)
            parts.extend([samples.astype(np.float32), np.zeros(int(rate * PAUSE_SENT), dtype=np.float32)])
        parts[-1] = np.zeros(int(rate * PAUSE_PARA), dtype=np.float32)
    return np.concatenate(parts[:-1]), rate


def encode(audio, rate, dest, chain, np, sf):
    """WAV normalizzato, poi ffmpeg: catena del suono, AAC mono a 64 kbps, pronto per lo streaming."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "r.wav")
        sf.write(wav, audio / max(1e-6, float(np.max(np.abs(audio)))) * 0.9, rate)
        subprocess.run([ffmpeg(), "-loglevel", "error", "-y", "-i", wav, "-af", chain, "-ar", str(rate), "-ac", "1",
                        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", dest + ".tmp.m4a"], check=True)
    os.replace(dest + ".tmp.m4a", dest)


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


def paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


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
    dest = os.path.join(site, "audio", "riepilogo.m4a")
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    want = gemini_id(GEMINI_VOICE) if key else VOICE_ID
    same_text = old.get("source") == rp.get("asOf") and os.path.exists(dest)
    if same_text and old.get("voiceId") == want:
        print("L'audio è già quello del riepilogo attuale.")
        return
    import numpy as np
    import soundfile as sf
    t0 = time.time()
    paras = paragraphs(rp["text"])
    audio = None
    if key:
        try:
            audio, rate = gemini_audio(paras, key, GEMINI_VOICE, np, sf)
            label, vid, chain = GEMINI_VOICE + ", voce sintetica di Google (Gemini)", gemini_id(GEMINI_VOICE), GEMINI_CHAIN
        except Exception as e:  # noqa: BLE001  qualunque errore del servizio: legge la voce di riserva
            print(f"::warning::audio: Gemini non ha letto il riepilogo ({type(e).__name__}: {e}); legge Kokoro")
            if same_text and old.get("voiceId") == VOICE_ID:
                print("L'audio di riserva per questo riepilogo c'è già: resta quello.")
                return
    if audio is None:
        audio, rate = kokoro_audio(paras, np)
        label, vid, chain = "Nicola, sintesi vocale Kokoro", VOICE_ID, CHAIN
    os.makedirs(os.path.join(site, "audio"), exist_ok=True)
    encode(audio, rate, dest, chain, np, sf)
    with open(dest, "rb") as f:
        tag = hashlib.sha256(f.read()).hexdigest()[:10]
    info = {"asOf": datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds"), "source": rp.get("asOf"),
            "date": rp.get("date"), "title": rp.get("title") or "Il riepilogo di GERICO",
            "duration": round(len(audio) / rate), "src": "audio/riepilogo.m4a?v=" + tag, "voice": label, "voiceId": vid}
    with open(os.path.join(data, "audio.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, separators=(",", ":"))
    print(f"::notice::audio.json: riepilogo letto da {label} in {info['duration']} s di audio, {os.path.getsize(dest) // 1024} KB, in {time.time() - t0:.0f} s")


def prove(site):
    """La prova delle voci: i primi due temi del riepilogo letti con ogni voce, in site/audio/prove/<voce>.m4a.
    Le voci si possono scegliere con GERICO_PROVE (separate da virgola); senza, quelle di PROVE."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        sys.exit("Manca GEMINI_API_KEY: la prova delle voci usa l'API Gemini.")
    with open(os.path.join(site, "data", "riepilogo.json"), encoding="utf-8") as f:
        rp = json.load(f)
    import numpy as np
    import soundfile as sf
    voices = [v.strip() for v in os.environ.get("GERICO_PROVE", "").split(",") if v.strip()] or list(PROVE)
    out = os.path.join(site, "audio", "prove")
    os.makedirs(out, exist_ok=True)
    paras = paragraphs(rp["text"])[:2]
    done = []
    for v in voices:
        try:
            audio, rate = gemini_audio(paras, key, v, np, sf)
        except Exception as e:  # noqa: BLE001  una voce che non va non ferma le altre
            print(f"::warning::prova di {v}: {type(e).__name__}: {e}")
            continue
        encode(audio, rate, os.path.join(out, v.lower() + ".m4a"), GEMINI_CHAIN, np, sf)
        done.append({"voice": v, "src": "audio/prove/" + v.lower() + ".m4a", "duration": round(len(audio) / rate)})
        print(f"  {v}: {done[-1]['duration']} s")
    with open(os.path.join(out, "prove.json"), "w", encoding="utf-8") as f:
        json.dump({"asOf": datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds"), "style": STYLE, "voices": done},
                  f, ensure_ascii=False, indent=1)
    print(f"::notice::prova delle voci: {len(done)} su {len(voices)} in site/audio/prove/")
    if not done:
        sys.exit(1)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    if "--prove" in sys.argv:
        prove(args[0])
        sys.exit(0)
    try:
        main(args[0])
    except Exception as e:  # l'audio non deve fermare la pubblicazione dei dati
        print(f"::warning::audio: {type(e).__name__}: {e}")
