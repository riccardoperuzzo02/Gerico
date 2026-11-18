#!/usr/bin/env python3
"""Il controllo della voce del riepilogo: cosa ha detto davvero la voce, e lo stesso minuto letto da più voci.

Uso:
    python3 scripts/voce_prova.py trascrivi site <cartella>    trascrive site/audio/riepilogo.m4a con whisperX, lo confronta
                                                               con il testo e scrive il rapporto; poi il primo minuto letto
                                                               da Gemini (tagliato dall'audio vero) e da Kokoro
    python3 scripts/voce_prova.py chatterbox site <cartella>   lo stesso minuto letto da Chatterbox Multilingual (voce
                                                               predefinita, mai voci clonate) e quanto ci mette

Gira nel workflow «Controllo della voce», che si avvia a mano e non pubblica niente: i file restano tra gli artifact del run.
Il rapporto elenca i punti dove la trascrizione non coincide con il testo, con il secondo dell'audio: lì la voce ha
letto male, oppure è la trascrizione a sbagliare. Si ascoltano e le parole lette male vanno in scripts/pronuncia.json."""
import difflib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio  # noqa: E402

MODELLO_WHISPER = os.environ.get("GERICO_WHISPER", "large-v3")
PAROLE_MINUTO = 140  # i primi temi fino a circa un minuto di voce


def minuto(paras, parole=PAROLE_MINUTO):
    """I primi paragrafi del riepilogo, fino a circa un minuto di lettura (mai un paragrafo a metà)."""
    out, n = [], 0
    for p in paras:
        out.append(p)
        n += len(p.split())
        if n >= parole:
            break
    return out


def _senza_accenti(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _numero(m):
    """Un numero scritto in cifre dalla trascrizione, in lettere come nel testo del riepilogo."""
    intero, dec = m.group(1).replace(".", ""), m.group(2)
    out = audio.words(int(intero)) if len(intero) < 7 else intero
    if dec:
        zeri = len(dec) - len(dec.lstrip("0"))
        out += " virgola " + " ".join(["zero"] * zeri) + (" " + audio.words(int(dec)) if dec.strip("0") else "")
    return " " + out + " "


def parole(testo):
    """Le parole di un testo pronte per il confronto: minuscole, senza accenti e punteggiatura, numeri in lettere."""
    t = testo.replace("’", "'").replace("%", " per cento ")
    t = re.sub(r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?", _numero, t)
    t = _senza_accenti(t.lower())
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return t.split()


def confronta(testo, sentite):
    """Dove la trascrizione non coincide con il testo. `sentite` sono le parole di whisperX ({word, start, end, score}).
    Torna l'elenco dei punti diversi, ciascuno con il secondo in cui comincia, il testo e quello che si è sentito."""
    attese = parole(testo)
    udite, tempi, punti = [], [], []
    for w in sentite:
        for p in parole(w.get("word", "")):
            udite.append(p)
            tempi.append((w.get("start"), w.get("end"), w.get("score")))
    sm = difflib.SequenceMatcher(a=attese, b=udite, autojunk=False)
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "equal":
            continue
        scritto, sentito = " ".join(attese[a0:a1]), " ".join(udite[b0:b1])
        if scritto.replace(" ", "") == sentito.replace(" ", ""):
            continue  # «dopo borsa» e «dopoborsa»: è la stessa cosa
        # il secondo della prima parola sentita lì; se la voce ha saltato una parola, quello della parola prima
        vicino = [tempi[i] for i in range(b0, min(len(tempi), max(b1, b0 + 1)))] + ([tempi[b0 - 1]] if b0 else [])
        start = next((t[0] for t in vicino if t[0] is not None), None)
        score = [t[2] for t in tempi[b0:b1] if t[2] is not None]
        punti.append({"secondo": round(start, 1) if start is not None else None, "testo": scritto, "sentito": sentito,
                      "sicurezza": round(min(score), 2) if score else None,
                      "prima": " ".join(attese[max(0, a0 - 4):a0]), "dopo": " ".join(attese[a1:a1 + 4])})
    uguali = sum(b.size for b in sm.get_matching_blocks())
    return punti, uguali / max(1, len(attese)), sm


def fine_di(n_parole, sm, sentite_tempi):
    """Il secondo in cui la voce finisce le prime `n_parole` parole del testo (per tagliare il minuto di Gemini)."""
    best = None
    for blk in sm.get_matching_blocks():
        if blk.size and blk.a < n_parole:
            ultima = min(blk.a + blk.size, n_parole) - 1
            j = blk.b + (ultima - blk.a)
            if j < len(sentite_tempi) and sentite_tempi[j][1] is not None:
                best = sentite_tempi[j][1]
    return best


def rapporto(punti, quota, modello, durata):
    righe = [f"# Controllo della voce del riepilogo", "",
             f"Trascrizione con whisperX ({modello}) di {durata:.0f} secondi di audio. Parole uguali al testo: {quota:.0%}.", "",
             "Ogni riga è un punto da ascoltare: la voce ha letto male, oppure ha sbagliato la trascrizione (succede spesso con",
             "i nomi stranieri). Quelle vere vanno in scripts/pronuncia.json.", "",
             "| secondo | nel testo | sentito | sicurezza | dove |", "|---:|---|---|---:|---|"]
    for p in punti:
        sec = "" if p["secondo"] is None else f"{int(p['secondo'] // 60)}:{p['secondo'] % 60:04.1f}"
        righe.append(f"| {sec} | {p['testo'] or '—'} | {p['sentito'] or '—'} | {p['sicurezza'] if p['sicurezza'] is not None else ''} | …{p['prima']} **·** {p['dopo']}… |")
    if not punti:
        righe.append("| | nessuna differenza | | | |")
    return "\n".join(righe) + "\n"


def leggi_riepilogo(site):
    with open(os.path.join(site, "data", "riepilogo.json"), encoding="utf-8") as f:
        return json.load(f)


def trascrivi(site, out):
    import numpy as np
    import soundfile as sf
    import whisperx
    os.makedirs(out, exist_ok=True)
    rp = leggi_riepilogo(site)
    sorgente = os.path.join(site, "audio", "riepilogo.m4a")
    with open(os.path.join(site, "data", "audio.json"), encoding="utf-8") as f:
        info = json.load(f)
    if info.get("source") != rp.get("asOf"):
        print("::warning::l'audio non è del riepilogo attuale: il confronto non vale")
    t0 = time.time()
    try:
        model = whisperx.load_model(MODELLO_WHISPER, "cpu", compute_type="int8", language="it", vad_method="silero")
    except TypeError:  # le versioni senza vad_method
        model = whisperx.load_model(MODELLO_WHISPER, "cpu", compute_type="int8", language="it")
    voce = whisperx.load_audio(sorgente)
    res = model.transcribe(voce, batch_size=8, language="it")
    ma, meta = whisperx.load_align_model(language_code="it", device="cpu")
    al = whisperx.align(res["segments"], ma, meta, voce, "cpu", return_char_alignments=False)
    sentite = [w for s in al["segments"] for w in s.get("words", [])]
    durata = len(voce) / 16000
    print(f"trascrizione: {len(sentite)} parole in {time.time() - t0:.0f} s")
    testo = audio.per_voce(rp["text"])
    punti, quota, sm = confronta(testo, sentite)
    with open(os.path.join(out, "trascrizione.txt"), "w", encoding="utf-8") as f:
        f.write(" ".join(s["text"].strip() for s in al["segments"]) + "\n")
    with open(os.path.join(out, "differenze.json"), "w", encoding="utf-8") as f:
        json.dump({"riepilogo": rp.get("asOf"), "voce": info.get("voice"), "modello": MODELLO_WHISPER,
                   "uguali": round(quota, 3), "punti": punti}, f, ensure_ascii=False, indent=1)
    testo_rapporto = rapporto(punti, quota, MODELLO_WHISPER, durata)
    with open(os.path.join(out, "rapporto.md"), "w", encoding="utf-8") as f:
        f.write(testo_rapporto)
    print(testo_rapporto)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(testo_rapporto)

    # lo stesso minuto: Gemini tagliato dall'audio vero, poi Kokoro
    paras = minuto(audio.paragraphs(rp["text"]))
    n = len(parole(audio.per_voce("\n\n".join(paras))))
    tempi = [(w.get("start"), w.get("end")) for w in sentite for _ in parole(w.get("word", ""))]
    fine = fine_di(n, sm, tempi)
    if fine:
        subprocess.run([audio.ffmpeg(), "-loglevel", "error", "-y", "-i", sorgente, "-t", f"{fine + 0.4:.2f}",
                        "-c", "copy", os.path.join(out, "1-gemini.m4a")], check=True)
    with open(os.path.join(out, "minuto.txt"), "w", encoding="utf-8") as f:
        f.write("\n\n".join(paras) + "\n")
    t0 = time.time()
    y, rate, _ = audio.kokoro_audio(paras, np)
    calcolo = time.time() - t0
    durata_k, _ = audio.pubblica(y, rate, audio.CHAIN, os.path.join(out, "2-kokoro.m4a"), np, sf)
    tempi_voci = {"gemini": {"secondi": round(fine or 0, 1), "nota": "tagliato dall'audio pubblicato"},
                  "kokoro": {"secondi": durata_k, "calcolo": round(calcolo, 1)}}
    with open(os.path.join(out, "tempi-1.json"), "w", encoding="utf-8") as f:
        json.dump(tempi_voci, f, ensure_ascii=False, indent=1)
    print(json.dumps(tempi_voci, ensure_ascii=False))


def frasi_chatterbox(testo):
    """Chatterbox va meglio su frasi brevi: si legge una frase per volta (quelle lunghe si spezzano alle virgole)."""
    return audio.sentences(testo)


def chatterbox(site, out):
    import numpy as np
    import soundfile as sf
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    os.makedirs(out, exist_ok=True)
    rp = leggi_riepilogo(site)
    paras = minuto(audio.paragraphs(rp["text"]))
    torch.manual_seed(0)
    t0 = time.time()
    try:
        model = ChatterboxMultilingualTTS.from_pretrained(device="cpu", t3_model="v3")
    except TypeError:  # le versioni con un solo modello
        model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    carica = time.time() - t0
    rate, parti = model.sr, []
    t0 = time.time()
    for i, para in enumerate(paras):
        if i:
            parti[-1] = np.zeros(int(rate * audio.PAUSE_TEMA), dtype=np.float32)
        for frase in frasi_chatterbox(audio.per_voce(para, "chatterbox")):
            # nessun audio di riferimento: la voce predefinita del modello, mai la voce di un'altra persona
            wav = model.generate(frase, language_id="it")
            parti += [wav.squeeze().cpu().numpy().astype(np.float32), np.zeros(int(rate * 0.3), dtype=np.float32)]
    calcolo = time.time() - t0
    y = np.concatenate(parti[:-1])
    durata, _ = audio.pubblica(y, rate, audio.GEMINI_CHAIN, os.path.join(out, "3-chatterbox.m4a"), np, sf)
    tempi = {"chatterbox": {"secondi": durata, "calcolo": round(calcolo, 1), "caricamento": round(carica, 1),
                            "volte_il_tempo_reale": round(calcolo / max(1, len(y) / rate), 2), "cpu": os.cpu_count()}}
    with open(os.path.join(out, "tempi-2.json"), "w", encoding="utf-8") as f:
        json.dump(tempi, f, ensure_ascii=False, indent=1)
    print(json.dumps(tempi, ensure_ascii=False))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            c = tempi["chatterbox"]
            f.write(f"Chatterbox: {c['secondi']} s di voce in {c['calcolo']:.0f} s di calcolo su {c['cpu']} CPU "
                    f"({c['volte_il_tempo_reale']} volte il tempo reale), più {c['caricamento']:.0f} s per caricare il modello.\n")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("trascrivi", "chatterbox"):
        sys.exit(__doc__)
    (trascrivi if sys.argv[1] == "trascrivi" else chatterbox)(sys.argv[2], sys.argv[3])
