#!/usr/bin/env python3
"""Legge ad alta voce il riepilogo del giorno: da site/data/riepilogo.json a site/audio/riepilogo.m4a.

Uso:
    python3 scripts/audio.py site            il riepilogo del giorno
    python3 scripts/audio.py site --prove    i primi due temi letti con più voci, in site/audio/prove/

Gira nel job «Dati del Terminal». Se il riepilogo non c'è, o l'audio è già quello del riepilogo attuale con la
stessa voce, non fa niente. Fa anche la versione inglese, per chi legge il sito in inglese: il riepilogo tradotto da
Gemini (site/audio/riepilogo-en.json) e letto dalla stessa voce in site/audio/riepilogo-en.m4a; in audio.json sta sotto «en».

Si sente come un telegiornale: la sigla (segnali orari, il colpo dell'orchestra, la frase degli ottoni), la voce
che entra sulla battuta dopo mentre la musica resta sotto (un po' più presente sul saluto e sui titoli e nelle pause
tra un tema e l'altro), le notizie con le pause sempre uguali, poi la musica che risale, il conto alla rovescia e il
colpo finale. La musica è di GERICO (scripts/sigla.py, con le parti pronte in scripts/sigla/): archi, ottoni e
percussioni sono campioni di pubblico dominio dell'orchestra VSCO 2 CE, i suoni elettronici sono calcolati.

La voce è quella di Gemini 3.8 Flash TTS di Google (API Gemini, livello gratuito; la chiave sta nel segreto
GEMINI_API_KEY del repository, mai nel codice). Gemini spezza da sé i testi oltre le 1.900 lettere circa e lì la voce
cambia, quindi il riepilogo si legge in pezzi di al massimo PEZZO_LETTERE lettere, divisi tra un tema e l'altro (di
solito due richieste; il livello gratuito ne concede poche al giorno). Dentro il pezzo la voce lega le frasi come una
persona; poi si confronta la nota dei pezzi (nota, stessa_voce) e quello che si allontana troppo si rilegge, al
massimo RIFAI volte. Il montaggio rimette in ordine le pause: tra un tema e l'altro sempre la stessa, dentro il tema
mai troppo lunghe (ritma). Ogni pezzo deve durare quanto ci si aspetta dal numero di parole, altrimenti si rifà.
Se la chiave manca o il servizio non risponde, legge Nicola di
Kokoro (modello aperto, licenza Apache 2.0), che gira sul server senza servizi esterni; i file del modello si
scaricano dalle release di kokoro-onnx su GitHub e restano nella cache del job. Mai due voci nello stesso audio.
L'audio è AAC mono a 64 kbps: circa 480 KB al minuto. Scrive anche site/data/audio.json, che la prima pagina legge
per mostrare il pulsante «Ascolta»."""
import base64
import hashlib
import http.client
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
GEMINI_VOICE = os.environ.get("GERICO_VOCE", "").strip() or "Iapetus"  # maschile, «chiara»: scelta il 9 novembre fra otto voci
# lo stile sta fuori dal testo (il testo si legge parola per parola) ed è una riga breve e sempre uguale:
# le indicazioni lunghe fanno cambiare la voce da un pezzo all'altro
STYLE = os.environ.get("GERICO_STILE", "").strip() or "Conduttore del telegiornale in diretta: sicuro, autorevole e partecipe, dizione chiara, ritmo deciso."
# la versione inglese: lo stesso riepilogo tradotto da Gemini e letto dalla stessa voce, con lo stile in inglese
STYLE_EN = os.environ.get("GERICO_STILE_EN", "").strip() or "Live TV news anchor: confident, authoritative and engaged, clear diction, brisk pace. British English."
# la voce prima di andare sulla musica (il volume finale lo dà FINALE, sul montaggio intero)
GEMINI_CHAIN = "highpass=f=60,acompressor=threshold=-22dB:ratio=2:attack=10:release=120:makeup=1.5"
FINALE = "loudnorm=I=-16:TP=-2.5:LRA=11"  # -2,5 dBTP: l'AAC a 64 kbps alza un po' i picchi
PAUSE_TEMA = 0.75                      # tra un tema e l'altro, sempre questa
PAUSA_MAX, PAUSA_FRASE = 0.45, 0.36    # dentro un tema: una pausa più lunga di PAUSA_MAX diventa PAUSA_FRASE
# Gemini 3.8 TTS spezza da sé i testi lunghi, circa ogni 1.900 lettere (500 token), e legge ogni parte per conto suo:
# a quel punto la voce cambia nota e timbro (a metà di un tema, su una frase qualsiasi). Il riepilogo ha 2.600-2.900
# lettere, quindi si divide noi, tra un tema e l'altro, in pezzi che restano sotto quel limite
PEZZO_LETTERE = 1700                   # lettere al massimo per richiesta, contate sul testo che va alla voce
TOLLERANZA = 0.07                      # due pezzi della stessa voce: note entro il 7% (nei giorni buoni stanno entro il 4%)
RIFAI = 2                              # richieste in più, al massimo, per avere la stessa voce in tutti i pezzi
# la nota (frequenza fondamentale mediana) di ogni voce nei giorni in cui non cambiava: il pezzo più lontano si rifà
NOTA_ATTESA = {("Iapetus", "it"): 128.0, ("Iapetus", "en"): 132.0}
WPS = (2.1, 3.8)                       # parole al secondo accettate (le voci leggono a 2,7-3): fuori da qui ha saltato o aggiunto
TRIES = 4
# il livello gratuito dell'API ha poche richieste al giorno: si legge a pezzi di qualche tema (non un paragrafo per volta)
# e, finita la quota del giorno, si smette subito di chiedere
# le voci della prova: maschili e femminili tra quelle adatte a leggere notizie
PROVE = ("Charon", "Sadaltager", "Iapetus", "Algieba", "Schedar", "Kore", "Sulafat", "Erinome")  # una richiesta per voce


def musica_id():
    """Sei caratteri che cambiano quando cambia la musica (le parti in scripts/sigla/): l'audio si rifà da solo."""
    h = hashlib.sha256()
    cartella = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sigla")
    for nome in ("apertura", "tappeto", "chiusura"):
        try:
            with open(os.path.join(cartella, nome + ".flac"), "rb") as f:
                h.update(f.read())
        except OSError:
            h.update(nome.encode())
    return h.hexdigest()[:6]


def gemini_id(voice, lingua="it"):
    # «voce1»: solo la voce, senza musica; «voce3»: pezzi sotto PEZZO_LETTERE con la stessa nota (24 novembre).
    # Cambiando questa sigla l'audio si rifà
    return "gemini-38-" + voice.lower() + "-voce3" + ("-en" if lingua == "en" else "")


# ---------- Kokoro, la voce di riserva ----------
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
CACHE = os.path.expanduser("~/.cache/kokoro")
LANG = "it"
# Nicola con un po' di Sara (15%): l'intonazione varia di più e la voce resta maschile; un filo più veloce, frase per frase
VOICE_MIX = (("im_nicola", 0.85), ("if_sara", 0.15))
SPEED = 1.1
VOICE_ID = "kokoro-nicola85-sara15-voce2"  # cambia con la voce o il montaggio: l'audio si rifà anche con lo stesso testo
# la riserva per l'inglese: George, voce britannica di Kokoro (il testo tradotto è in inglese britannico)
VOICE_MIX_EN, LANG_EN, VOICE_ID_EN = (("bm_george", 1.0),), "en-gb", "kokoro-george-voce2-en"
# un po' di compressione e di presenza sulle medie (il volume finale lo dà FINALE)
CHAIN = "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=80:makeup=2,equalizer=f=3200:t=q:w=1.2:g=2.5"
PAUSE_SENT, PAUSE_PARA = 0.3, PAUSE_TEMA

# come si leggono sigle, nomi e simboli che la voce sbaglierebbe: il dizionario sta in scripts/pronuncia.json
# (per Kokoro le grafie sono controllate con i fonemi di espeak per l'italiano)
import pronuncia  # noqa: E402
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
    t = pronuncia.prepara(t, "kokoro")
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)            # 3.956 -> 3956: la voce non legge il punto delle migliaia
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    # l'1,4 e dell'8: davanti alle cifre la voce leggerebbe l'apostrofo come «elle», quindi il numero va in lettere
    t = re.sub(r"\b([A-Za-zÀ-ÿ]*')(\d+)(?:,(\d+))?",
               lambda m: m.group(1) + words(int(m.group(2))) + (" virgola " + m.group(3) if m.group(3) else ""), t)
    t = re.sub(r"\s*%", " per cento", t)
    t = re.sub(r"\$\s*(\d(?:[\d.,]*\d)?)", r"\1 dollari", t)
    t = re.sub(r"(\d(?:[\d.,]*\d)?)\s*\$", r"\1 dollari", t)
    t = re.sub(r"€\s*(\d(?:[\d.,]*\d)?)", r"\1 euro", t)
    t = re.sub(r"(\d(?:[\d.,]*\d)?)\s*€", r"\1 euro", t)
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


def per_voce(text, voce="gemini"):
    """Il testo per Gemini: com'è, con i simboli in parole. Grafie fonetiche solo per le parole che il controllo della
    voce ha trovato lette male (scripts/pronuncia.json): questa voce legge bene quasi tutti i nomi veri."""
    t = text.replace("’", "'").replace("–", ", ").replace("—", ", ").replace("«", "").replace("»", "")
    t = pronuncia.prepara(t, voce)
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"(\d)\.(\d{3})\b", r"\1\2", t)
    t = re.sub(r"\s*%", " per cento", t)
    t = re.sub(r"\$\s*(\d(?:[\d.,]*\d)?)", r"\1 dollari", t)
    t = re.sub(r"(\d(?:[\d.,]*\d)?)\s*\$", r"\1 dollari", t)
    t = re.sub(r"€\s*(\d(?:[\d.,]*\d)?)", r"\1 euro", t)
    t = re.sub(r"(\d(?:[\d.,]*\d)?)\s*€", r"\1 euro", t)
    t = re.sub(r"(\d)[.:](\d{2})\b(?!\d)", r"\1 e \2", t)  # 14:30 -> 14 e 30
    return re.sub(r"\s+", " ", t).strip()


def per_voce_en(text):
    """Il testo inglese per la voce: com'è, senza le virgolette basse; il nome si legge all'italiana."""
    t = text.replace("’", "'").replace("–", ", ").replace("—", ", ").replace("«", "").replace("»", "")
    t = re.sub(r"\bGERICO\b", "Gerico", t)
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


def ritma(y, rate, np, testi):
    """Le pause di un pezzo letto da Gemini, come in un notiziario. `testi` sono i paragrafi del pezzo: dove finisce
    ognuno si stima dalla sua lunghezza (le lettere lette fin lì sul totale), e il passaggio da un tema all'altro è la
    pausa più lunga vicino a quel punto; quelle pause durano tutte PAUSE_TEMA. Le altre, se superano PAUSA_MAX,
    scendono a PAUSA_FRASE. Restano 30 ms del suono originale ai due lati di ogni pausa, sfumati (niente tagli secchi).
    Torna l'audio e dove comincia ogni tema dopo il primo (in campioni)."""
    win = max(1, int(rate * 0.01))
    n = len(y) // win
    if n < 20:
        return y, []
    rms = np.sqrt(np.mean(y[: n * win].reshape(n, win) ** 2, axis=1))
    quiet = rms < max(1e-5, float(np.percentile(rms, 90)) * 10 ** (-35 / 20))
    gaps, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if j - i >= 12 and i > 0 and j < n:        # pause interne di almeno 120 ms
                gaps.append((i * win, j * win))
            i = j
        else:
            i += 1
    # dove ci si aspetta il passaggio tra un paragrafo e l'altro, e lì vicino la pausa più lunga (non già presa)
    lett = [len(t) for t in testi]
    tot, acc, lunghe = max(1, sum(lett)), 0, set()
    for k in range(len(lett) - 1):
        acc += lett[k]
        atteso = len(y) * acc / tot
        raggio = max(2.0 * rate, 0.18 * len(y) / max(1, len(lett)))
        vicine = [g for g in range(len(gaps)) if g not in lunghe and abs((gaps[g][0] + gaps[g][1]) / 2 - atteso) <= raggio]
        if not vicine:
            vicine = [g for g in range(len(gaps)) if g not in lunghe]
        if vicine:
            lunghe.add(max(vicine, key=lambda g: (gaps[g][1] - gaps[g][0]) - 0.15 * abs((gaps[g][0] + gaps[g][1]) / 2 - atteso)))
    edge = int(rate * 0.03)
    out, pos, size, marks = [], 0, 0, []
    for k, (a, b) in enumerate(gaps):
        dur = b - a
        want = int(rate * PAUSE_TEMA) if k in lunghe else int(rate * PAUSA_FRASE) if dur > rate * PAUSA_MAX else dur
        if want == dur:
            continue
        head = y[pos:a + edge].copy()
        head[-edge:] *= np.linspace(1, 0, edge)
        tail = y[b - edge:b].copy() * np.linspace(0, 1, edge)
        out += [head, np.zeros(max(0, want - 2 * edge), dtype=np.float32), tail]
        size += len(head) + max(0, want - 2 * edge) + edge
        pos = b
        if k in lunghe:
            marks.append(size)
    out.append(y[pos:])
    return np.concatenate(out).astype(np.float32), sorted(marks)


def gemini_piece(text, key, voice, np, sf, style=STYLE):
    body = {"model": GEMINI_MODEL,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                                                          "annotations": [{"type": "speech_metadata", "style": style}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]}}
    req = urllib.request.Request(GEMINI_URL, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=420) as r:
        doc = json.load(r)
    return pcm(find_audio(doc), np, sf)


class QuotaDelGiorno(RuntimeError):
    """Finite le richieste gratuite del giorno: riprovare adesso non serve."""


def retry_wait(e, body, attempt):
    """Quanto aspettare dopo un 429 o un errore del servizio: quello che dice Google (Retry-After o retryDelay), al massimo 90 s."""
    wait = e.headers.get("Retry-After") if e.headers else None
    if wait and wait.isdigit():
        return min(90.0, float(wait))
    m = re.search(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', body)
    if m:
        return min(90.0, float(m.group(1)) + 1)
    return 10.0 * (attempt + 1)


def gemini_read(text, key, voice, np, sf, style=STYLE):
    """Un pezzo letto da Gemini, con i controlli: durata giusta per il numero di parole, niente silenzio vuoto.
    Gli errori di quota al minuto e del servizio aspettano e riprovano; finita la quota del giorno, o con chiave o modello
    sbagliati, si ferma subito."""
    words = len(text.split())
    last = None
    for attempt in range(TRIES):
        try:
            y, rate = gemini_piece(text, key, voice, np, sf, style)
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
            body = e.read()[:2000].decode("utf-8", "replace")
            if e.code in (400, 401, 403, 404):
                raise RuntimeError(f"Gemini risponde {e.code}: {body[:300]}") from None
            if e.code == 429 and re.search(r"per.?day|PerDay|daily", body, re.I):
                raise QuotaDelGiorno("finite le richieste gratuite di oggi: " + " ".join(body.split())[:300]) from None
            last = RuntimeError(f"HTTP {e.code}: {' '.join(body.split())[:300]}")
            time.sleep(retry_wait(e, body, attempt))
        except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError, KeyError, RuntimeError) as e:  # rete che si interrompe a metà compresa
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Gemini non ha letto il pezzo dopo {TRIES} tentativi: {type(last).__name__}: {last}")


def pieces(paras, misura=len):
    """I paragrafi in pezzi di al massimo PEZZO_LETTERE lettere (`misura` le conta sul testo che va alla voce), tagliando
    solo tra un tema e l'altro: il minor numero di pezzi e, fra le divisioni possibili, quella con il pezzo più lungo
    più corto (pezzi simili). Dentro un pezzo la riga vuota fa fare alla voce la pausa tra i temi, tra un pezzo e
    l'altro la mette il montaggio. Un paragrafo da solo più lungo del limite si divide tra una frase e l'altra."""
    from itertools import combinations
    parti = []
    for p in paras:
        if misura(p) <= PEZZO_LETTERE:
            parti.append(p)
            continue
        cur = ""
        for s in re.split(r"(?<=[.!?])\s+", p):
            if cur and misura(cur + " " + s) > PEZZO_LETTERE:
                parti.append(cur)
                cur = s
            else:
                cur = (cur + " " + s).strip()
        if cur:
            parti.append(cur)
    lung = [misura(p) + 2 for p in parti]   # +2: la riga vuota tra due temi
    n = len(parti)
    for k in range(1, n + 1):
        migliore = None
        for tagli in combinations(range(1, n), k - 1):
            bordi = (0,) + tagli + (n,)
            massimo = max(sum(lung[a:b]) for a, b in zip(bordi, bordi[1:]))
            if massimo <= PEZZO_LETTERE + 2 and (migliore is None or massimo < migliore[0]):
                migliore = (massimo, bordi)
        if migliore:
            bordi = migliore[1]
            return ["\n\n".join(parti[a:b]) for a, b in zip(bordi, bordi[1:])]
    return parti


def nota(y, rate, np):
    """La nota della voce in Hz: la mediana della frequenza fondamentale sui tratti parlati (YIN semplificato, a 8 kHz).
    Serve a confrontare due pezzi letti dalla stessa voce: se uno è molto più alto o più basso, la voce è cambiata.
    Torna 0 se non c'è abbastanza parlato per misurarla."""
    y = np.asarray(y, dtype=np.float64)
    if rate % 8000 == 0 and rate > 8000:
        q = rate // 8000
        k = np.arange(-24, 25)
        y = np.convolve(y, np.sinc(k / q) / q * np.hanning(len(k)), mode="same")[::q]  # passa basso, poi un campione ogni q
    elif rate != 8000:
        y = np.interp(np.linspace(0, len(y) - 1, int(round(len(y) * 8000 / rate))), np.arange(len(y)), y)
    sr, W, H = 8000, 320, 80                  # finestre di 40 ms, passo di 10 ms
    tmin, tmax = sr // 300, sr // 65          # voci tra 65 e 300 Hz
    L = W + tmax
    n = (len(y) - L) // H
    if n < 50:
        return 0.0
    fr = y[np.arange(L)[None, :] + H * np.arange(n)[:, None]]
    fr = fr - fr.mean(axis=1, keepdims=True)
    rms = np.sqrt(np.mean(fr[:, :W] ** 2, axis=1))
    fr = fr[rms > np.percentile(rms, 90) * 0.1]   # solo dove si parla
    if len(fr) < 50:
        return 0.0
    r = np.fft.irfft(np.conj(np.fft.rfft(fr[:, :W], 1024)) * np.fft.rfft(fr, 1024), 1024)[:, : tmax + 1]
    c = np.cumsum(fr ** 2, axis=1)
    t = np.arange(tmax + 1)
    et = c[:, W - 1 + t] - np.concatenate([np.zeros((len(fr), 1)), c[:, t[1:] - 1]], axis=1)
    d = c[:, W - 1][:, None] + et - 2 * r     # differenza tra la finestra e la stessa spostata di t campioni
    dn = np.ones_like(d)
    dn[:, 1:] = d[:, 1:] / np.maximum(np.cumsum(d[:, 1:], axis=1) / np.arange(1, tmax + 1), 1e-12)
    out = []
    for row in dn:
        cand = np.flatnonzero(row[tmin:tmax] < 0.15)
        if len(cand):
            j = tmin + cand[0]
            while j + 1 < tmax and row[j + 1] < row[j]:
                j += 1
            out.append(sr / j)
    return float(np.median(out)) if len(out) > 30 else 0.0


def gemini_audio(paras, key, voice, np, sf, lingua="it"):
    """Tutto il riepilogo con Gemini: i pezzi uno dopo l'altro, con le pause rimesse in ordine (ritma) e la stessa
    pausa tra un pezzo e l'altro. Torna la voce, la frequenza e dove comincia ogni tema dopo il primo."""
    # Un testo corto va in una richiesta sola. Uno lungo, letto tutto insieme, Gemini lo spezza da sé (vedi
    # PEZZO_LETTERE) e la voce cambia a metà di un tema: lo dividiamo noi tra un tema e l'altro e poi controlliamo che
    # tutti i pezzi abbiano la stessa voce (gemini_leggi). Se la lettura intera non riesce, si torna ai pezzi.
    prep = per_voce_en if lingua == "en" else per_voce
    if sum(len(prep(p)) + 2 for p in paras) <= PEZZO_LETTERE + 2:
        try:
            return gemini_leggi(["\n\n".join(paras)], key, voice, np, sf, lingua)
        except QuotaDelGiorno:
            raise
        except RuntimeError as e:
            print(f"::warning::audio: la lettura in una richiesta sola non è riuscita ({e}); leggo a pezzi")
            time.sleep(5)
    return gemini_leggi(pieces(paras, lambda p: len(prep(p))), key, voice, np, sf, lingua)


def stessa_voce(letti, rileggi, voice, lingua, np):
    """Gemini non legge mai due volte con la stessa identica voce: da una richiesta all'altra la nota può salire o
    scendere anche del 20%. `letti` sono i pezzi letti (audio, frequenza, nota). Finché la nota più alta supera la più
    bassa di oltre TOLLERANZA, si rilegge il pezzo più lontano dalla nota solita della voce (NOTA_ATTESA; per una voce
    senza nota solita, il primo pezzo fa da riferimento) e si tiene la lettura più vicina. Al massimo RIFAI richieste
    in più: finite quelle, o finita la quota del giorno, restano le letture migliori."""
    attesa = NOTA_ATTESA.get((voice, lingua))
    note = lambda: [x[2] for x in letti]  # noqa: E731
    for _ in range(RIFAI):
        n = note()
        if min(n) <= 0 or max(n) / min(n) - 1 <= TOLLERANZA:
            break
        centro = attesa or n[0]
        j = max(range(len(n)), key=lambda k: (abs(np.log(n[k] / centro)), k))
        time.sleep(3)
        try:
            nuovo = rileggi(j)
        except Exception as e:  # noqa: BLE001  quota finita o servizio occupato: si tiene quello che c'è
            print(f"  pezzo {j + 1} non riletto: {type(e).__name__}: {e}")
            break
        print(f"  pezzo {j + 1} riletto: {nuovo[2]:.0f} Hz (prima {n[j]:.0f} Hz)")
        if abs(np.log(nuovo[2] / centro)) < abs(np.log(n[j] / centro)):
            letti[j] = nuovo
    n = note()
    if min(n) > 0:
        scarto = max(n) / min(n) - 1
        msg = f"note dei pezzi {', '.join(f'{x:.0f}' for x in n)} Hz, scarto {100 * scarto:.0f}%"
        print(f"::warning::audio ({lingua}): la voce cambia ancora tra i pezzi ({msg})" if scarto > TOLLERANZA else f"  stessa voce: {msg}")
    return letti


def gemini_leggi(pezzi, key, voice, np, sf, lingua="it"):
    prep, style = (per_voce_en, STYLE_EN) if lingua == "en" else (per_voce, STYLE)

    def leggi(piece):
        y, rate = gemini_read("\n\n".join(prep(p) for p in piece.split("\n\n")), key, voice, np, sf, style)
        return y, rate, nota(y, rate, np)

    letti = []
    for i, piece in enumerate(pezzi):
        if i:
            time.sleep(3)  # niente raffiche: il livello gratuito conta anche le richieste al minuto
        letti.append(leggi(piece))
    if len(letti) > 1:
        letti = stessa_voce(letti, lambda j: leggi(pezzi[j]), voice, lingua, np)
    rate = letti[0][1]
    parts, marks, size = [], [], 0
    for i, (piece, (y, _, _)) in enumerate(zip(pezzi, letti)):
        y, dentro = ritma(y, rate, np, [prep(p) for p in piece.split("\n\n")])
        if i:
            parts.append(np.zeros(int(rate * PAUSE_TEMA), dtype=np.float32))
            size += int(rate * PAUSE_TEMA)
            marks.append(size)
        marks += [size + m for m in dentro]
        parts.append(y)
        size += len(y)
    return np.concatenate(parts), rate, marks


def kokoro_audio(paras, np, lingua="it"):
    k = model()
    style = lambda v: k.get_voice_style(v) if hasattr(k, "get_voice_style") else k.voices[v]
    mix, lang, prep = (VOICE_MIX_EN, LANG_EN, per_voce_en) if lingua == "en" else (VOICE_MIX, LANG, speakable)
    voice = sum(w * style(v) for v, w in mix)
    rate = 24000
    parts, marks = [], []
    # frase per frase: ogni frase ha la sua intonazione; pausa breve tra le frasi, più lunga tra un tema e l'altro (riga vuota)
    for i, para in enumerate(paras):
        if i:
            parts[-1] = np.zeros(int(rate * PAUSE_PARA), dtype=np.float32)
            marks.append(sum(len(x) for x in parts))
        for s in sentences(prep(para)):
            phonemes = FLAG.sub("", k.tokenizer.phonemize(s, lang=lang))
            samples, rate = k.create(phonemes, voice=voice, speed=SPEED, is_phonemes=True)
            parts.extend([samples.astype(np.float32), np.zeros(int(rate * PAUSE_SENT), dtype=np.float32)])
    return np.concatenate(parts[:-1]), rate, marks


def encode(audio, rate, dest, chain, np, sf):
    """WAV normalizzato, poi ffmpeg: catena del suono (sul montaggio, FINALE), AAC mono a 64 kbps, pronto per lo streaming."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "r.wav")
        sf.write(wav, audio / max(1e-6, float(np.max(np.abs(audio)))) * 0.9, rate)
        subprocess.run([ffmpeg(), "-loglevel", "error", "-y", "-i", wav, "-af", chain, "-ar", str(rate), "-ac", "1",
                        "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", dest + ".tmp.m4a"], check=True)
    os.replace(dest + ".tmp.m4a", dest)


def filtro(y, rate, chain, np, sf, out=None):
    """Una catena di ffmpeg su un pezzo di audio in memoria (la voce prima di andare sulla musica); con `out` la
    porta anche a quella frequenza (la musica è a 48 kHz)."""
    with tempfile.TemporaryDirectory() as tmp:
        a, b = os.path.join(tmp, "a.wav"), os.path.join(tmp, "b.wav")
        sf.write(a, y, rate, subtype="FLOAT")
        subprocess.run([ffmpeg(), "-loglevel", "error", "-y", "-i", a, "-af", chain, "-ar", str(out or rate), "-ac", "1",
                        "-c:a", "pcm_f32le", b], check=True)
        z, _ = sf.read(b, dtype="float32", always_2d=False)
    return z


def apertura(paras):
    """Quanti paragrafi fanno l'apertura (il saluto e, se ci sono, i titoli): lì la musica sta un po' più alta."""
    return 2 if len(paras) > 2 and re.match(r"\s*(In apertura|I titoli)\b", paras[1]) else 1


def monta(voce, rate, marks, aperti, np):
    """La voce sulla musica, come in un telegiornale. La sigla: il levare con i segnali orari, il colpo
    dell'orchestra e la frase degli ottoni, al volume della voce. Sulla battuta dopo entra la voce e sotto comincia
    il tappeto: -16 dB rispetto alla voce sul saluto e sui titoli, poi -22 dB sulle notizie, -18 dB nelle pause tra
    un tema e l'altro. Dopo l'ultima parola il tappeto risale (-6 dB) e, sulla prima battuta utile, parte la
    chiusura: il conto alla rovescia e il colpo finale. `rate` è quella della musica (sigla.SR)."""
    import sigla
    ap, tp, ch = sigla.parti(rate)
    L = len(tp)
    bar = sigla.BAR * rate
    t_tp = int(round(sigla.TAPPETO * rate))
    ingresso = int(round(sigla.VOCE * rate))
    fine_voce = ingresso + len(voce)
    # la chiusura comincia su una battuta del tappeto, almeno 0,35 secondi dopo l'ultima parola
    t_ch = t_tp + int(round(np.ceil((fine_voce + 0.35 * rate - t_tp) / bar) * bar))
    n = t_ch + len(ch)

    # livelli: la voce fa da riferimento (le parti parlate, senza i bassi); la musica si misura allo stesso modo
    def forza(x):
        x = sigla.filtra(x.astype(np.float64), rate, alto=150)
        w = int(rate * 0.05)
        m = len(x) // w
        r = np.sqrt(np.mean(x[: m * w].reshape(m, w) ** 2, axis=1))
        on = r[r > np.percentile(r, 95) * 0.1]
        return float(np.sqrt(np.mean(on ** 2))) if len(on) else 1e-6
    rv = forza(voce)
    g_piena = rv / forza(ap) * 10 ** (-1 / 20)  # sigla e chiusura: la stessa scala, come le ha scritte sigla.py
    g_ap, g_corpo, g_pausa, g_risale = (rv / forza(tp) * 10 ** (db / 20) for db in (-16, -22, -18, -6))

    def rampa(g, a, b, v0, v1):
        a, b = max(0, int(a)), max(int(a) + 1, int(b))
        g[a:min(b, len(g))] = np.linspace(v0, v1, b - a)[: max(0, min(b, len(g)) - a)]
        g[min(b, len(g)):] = v1

    gt = np.zeros(n, dtype=np.float32)
    rampa(gt, t_tp, t_tp + 0.03 * rate, 0.0, g_ap)
    fine_ap = ingresso + (marks[aperti - 1] if len(marks) >= aperti else min(len(voce), int(6 * rate)))
    rampa(gt, fine_ap - 0.6 * rate, fine_ap + 0.6 * rate, g_ap, g_corpo)
    risale = fine_voce + int(0.1 * rate)
    rampa(gt, risale, risale + 0.4 * rate, g_corpo, g_risale)
    rampa(gt, t_ch, t_ch + 0.2 * rate, g_risale, 0.0)
    # nelle pause tra un tema e l'altro il tappeto sale un poco, come quando il conduttore passa la parola
    for m in marks[aperti:]:
        a, b = ingresso + m - int(PAUSE_TEMA * rate), ingresso + m
        if a > fine_ap + 0.6 * rate and b < risale:
            gt[a:b] *= (1 + (g_pausa / g_corpo - 1) * np.hanning(b - a)).astype(np.float32)
    idx = (np.arange(n) - t_tp) % L
    mix = gt * tp[idx]
    mix[: len(ap)] += g_piena * ap[:n]
    mix[t_ch:t_ch + len(ch)] += g_piena * ch[: n - t_ch]
    mix[ingresso:ingresso + len(voce)] += voce
    return mix.astype(np.float32)


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


def pubblica(audio, rate, chain, dest, np, sf):
    """Solo la voce, con la sua catena e a 48 kHz: niente sigla e niente musica sotto (11 novembre 2026); un attimo di
    silenzio prima e dopo. Il montaggio con la musica resta in monta(), se un giorno servisse di nuovo.
    Torna la durata in secondi e l'impronta del file (per l'indirizzo, così il browser non tiene quello vecchio)."""
    import sigla
    voce = filtro(audio, rate, chain, np, sf, out=sigla.SR)
    pausa = np.zeros(int(0.3 * sigla.SR), dtype=voce.dtype)
    audio, rate = np.concatenate([pausa, voce, pausa]), sigla.SR
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    encode(audio, rate, dest, FINALE, np, sf)
    with open(dest, "rb") as f:
        tag = hashlib.sha256(f.read()).hexdigest()[:10]
    return round(len(audio) / rate), tag


def adesso():
    return datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")


def italiano(site, rp, old, key, np, sf):
    """L'audio italiano: torna le sue informazioni per audio.json (quelle di prima se non c'era niente da rifare)."""
    dest = os.path.join(site, "audio", "riepilogo.m4a")
    base = {k: v for k, v in old.items() if k != "en"}
    want = gemini_id(GEMINI_VOICE) if key else VOICE_ID
    same_text = old.get("source") == rp.get("asOf") and os.path.exists(dest)
    if same_text and old.get("voiceId") == want:
        print("L'audio italiano è già quello del riepilogo attuale.")
        return base
    t0 = time.time()
    paras = paragraphs(rp["text"])
    audio = None
    if key:
        try:
            audio, rate, marks = gemini_audio(paras, key, GEMINI_VOICE, np, sf)
            label, vid, chain = GEMINI_VOICE + ", voce sintetica di Google (Gemini)", gemini_id(GEMINI_VOICE), GEMINI_CHAIN
        except Exception as e:  # noqa: BLE001  qualunque errore del servizio: legge la voce di riserva
            print(f"::warning::audio: Gemini non ha letto il riepilogo ({type(e).__name__}: {e}); legge Kokoro")
            if same_text and old.get("voiceId") == VOICE_ID:
                print("L'audio di riserva per questo riepilogo c'è già: resta quello.")
                return base
    if audio is None:
        audio, rate, marks = kokoro_audio(paras, np)
        label, vid, chain = "Nicola, sintesi vocale Kokoro", VOICE_ID, CHAIN
    durata, tag = pubblica(audio, rate, chain, dest, np, sf)
    info = {"asOf": adesso(), "source": rp.get("asOf"), "date": rp.get("date"), "title": rp.get("title") or "Il riepilogo di GERICO",
            "duration": durata, "src": "audio/riepilogo.m4a?v=" + tag, "voice": label, "voiceId": vid}
    print(f"::notice::audio: riepilogo italiano letto da {label} in {durata} s di audio, {os.path.getsize(dest) // 1024} KB, in {time.time() - t0:.0f} s")
    return info


def traduzione(rp, cache):
    """Il riepilogo in inglese, tradotto da Gemini con le regole delle traduzioni del sito (scripts/traduci.py) e
    tenuto in site/audio/riepilogo-en.json: si traduce una volta sola per riepilogo."""
    try:
        with open(cache, encoding="utf-8") as f:
            c = json.load(f)
        if c.get("source") == rp.get("asOf") and c.get("text"):
            return c
    except (OSError, ValueError):
        pass
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import traduci
    lotto = {"title": rp.get("title") or "Il riepilogo di GERICO", "text": rp["text"]}
    for modello in traduci.modelli():
        try:
            out = traduci.traduci_lotto(lotto, "en", modello)
        except Exception as e:  # noqa: BLE001  un modello che non va: si prova il successivo
            print(f"  traduzione con {modello} non riuscita: {type(e).__name__}: {str(e)[:160]}")
            continue
        testo = (out.get("text") or "").strip()
        # la traduzione deve avere tutti i paragrafi e una lunghezza simile all'originale, se no si prova un altro modello
        if testo and len(paragraphs(testo)) == len(paragraphs(rp["text"])) and 0.6 < len(testo) / max(1, len(rp["text"])) < 1.5:
            c = {"source": rp.get("asOf"), "date": rp.get("date"), "asOf": adesso(), "model": modello,
                 "title": (out.get("title") or "GERICO's briefing").strip(), "text": testo}
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            with open(cache, "w", encoding="utf-8") as f:
                json.dump(c, f, ensure_ascii=False, indent=1)
                f.write("\n")
            return c
        print(f"  traduzione con {modello} incompleta: provo il modello dopo")
    return None


def inglese(site, rp, old_en, key, np, sf):
    """L'audio inglese, per chi legge il sito in inglese: il riepilogo tradotto e letto dalla stessa voce (Kokoro di
    riserva, con una voce britannica). Senza chiave di Gemini non si traduce: chi legge in inglese ascolta l'italiano."""
    if not key:
        return None
    dest = os.path.join(site, "audio", "riepilogo-en.m4a")
    want = gemini_id(GEMINI_VOICE, "en")
    same_text = old_en.get("source") == rp.get("asOf") and os.path.exists(dest)
    if same_text and old_en.get("voiceId") == want:
        print("L'audio inglese è già quello del riepilogo attuale.")
        return old_en
    t0 = time.time()
    tr = traduzione(rp, os.path.join(site, "audio", "riepilogo-en.json"))
    if not tr:
        print("::warning::audio: il riepilogo non si è potuto tradurre in inglese; chi legge in inglese ascolta l'italiano")
        return old_en if same_text else None
    paras = paragraphs(tr["text"])
    audio = None
    try:
        audio, rate, marks = gemini_audio(paras, key, GEMINI_VOICE, np, sf, lingua="en")
        label, vid, chain = GEMINI_VOICE + ", Google synthetic voice (Gemini)", want, GEMINI_CHAIN
    except Exception as e:  # noqa: BLE001
        print(f"::warning::audio: Gemini non ha letto il riepilogo inglese ({type(e).__name__}: {e}); legge Kokoro")
        if same_text and old_en.get("voiceId") == VOICE_ID_EN:
            return old_en
    if audio is None:
        audio, rate, marks = kokoro_audio(paras, np, "en")
        label, vid, chain = "George, Kokoro speech synthesis", VOICE_ID_EN, CHAIN
    durata, tag = pubblica(audio, rate, chain, dest, np, sf)
    print(f"::notice::audio: riepilogo inglese letto da {label} in {durata} s di audio, in {time.time() - t0:.0f} s")
    return {"asOf": adesso(), "source": rp.get("asOf"), "date": rp.get("date"), "title": tr["title"], "duration": durata,
            "src": "audio/riepilogo-en.m4a?v=" + tag, "voice": label, "voiceId": vid}


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
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    import numpy as np
    import soundfile as sf
    info = italiano(site, rp, old, key, np, sf)
    # l'inglese dopo l'italiano e per conto suo: se non riesce, l'audio italiano esce lo stesso
    try:
        en = inglese(site, rp, old.get("en") or {}, key, np, sf)
    except Exception as e:  # noqa: BLE001
        print(f"::warning::audio inglese: {type(e).__name__}: {e}")
        en = old.get("en") if (old.get("en") or {}).get("source") == rp.get("asOf") else None
    if en:
        info["en"] = en
    if info and info != old:
        with open(os.path.join(data, "audio.json"), "w", encoding="utf-8") as f:
            json.dump(info, f, ensure_ascii=False, separators=(",", ":"))


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
            audio, rate, _ = gemini_audio(paras, key, v, np, sf)
        except QuotaDelGiorno as e:
            print(f"::warning::prova di {v}: {e}; le altre voci domani")
            break
        except Exception as e:  # noqa: BLE001  una voce che non va non ferma le altre
            print(f"::warning::prova di {v}: {type(e).__name__}: {e}")
            continue
        encode(audio, rate, os.path.join(out, v.lower() + ".m4a"), GEMINI_CHAIN + "," + FINALE, np, sf)
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
