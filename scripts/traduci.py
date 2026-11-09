#!/usr/bin/env python3
"""Traduzioni di GERICO: la versione inglese dei testi della redazione e quella italiana dei titoli che arrivano in inglese.

Uso:
    python3 scripts/traduci.py site/data

Legge i file pubblici in site/data e scrive due mappe {impronta del testo originale: traduzione}:
    site/data/tr/en.json  testi italiani della redazione (articoli, sommari, brevi, note dei mercati, agenda...) in inglese
    site/data/tr/it.json  titoli in inglese (calendario di Forex Factory, notizie di Yahoo Finance per il tono) in italiano
Il sito le applica quando carica i dati (G.load in common.js, con la stessa impronta cyrb53). Le mappe di prima fanno da
memoria: si traducono solo i testi nuovi, e restano solo i testi che ci sono ancora. Traduce Gemini (chiave GEMINI_API_KEY,
modello scelto da solo tra i «flash» disponibili o con GERICO_GEMINI_TESTO). Senza chiave, o se Gemini non risponde, i testi
nuovi restano nella lingua originale e il sito lo dice: il giro non fallisce mai per la traduzione.
Con SOLO_MODELLI=true elenca i modelli disponibili e basta."""
import json
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.request

# l'avanzamento si vede subito nel log di GitHub
sys.stdout.reconfigure(line_buffering=True)
API = os.environ.get("GERICO_GEMINI_API", "https://generativelanguage.googleapis.com/v1beta")
KEY = os.environ.get("GEMINI_API_KEY", "").strip()
# tempo massimo per tradurre in un giro: poi si salva quello che c'è e il giro dopo continua
BUDGET = float(os.environ.get("GERICO_TRADUZIONE_SECONDI", "660"))
INIZIO = time.time()

# quali campi di quali file: gli stessi di TR in site/assets/js/common.js
CAMPI = {
    # prima l'italiano (pochi titoli brevi), poi l'inglese (gli articoli): se il tempo finisce, il grosso continua al giro dopo
    "it": {"calendario": ["title"], "sentiment": ["title"]},
    "en": {
        "edition": ["title", "summary", "article", "view", "change", "open", "text", "point", "says", "angle"],
        "brevi": ["title"], "markets": ["summary", "label", "note", "why"], "agenda": ["event", "note"],
        "terminal": ["label", "note"], "titoli": ["why", "risk", "signal", "note"],
    },
}

ISTRUZIONI = {
    "en": (
        "You translate texts from GERICO, an Italian news site, into English. The input is a JSON object {id: Italian text}; "
        "reply only with a JSON object with exactly the same ids and the English translations.\n"
        "Rules: translate faithfully and completely, sentence by sentence: same facts, same numbers, same attributions "
        "(who says what), same order. Add nothing, leave nothing out, no comments or notes. Plain, neutral news English, "
        "British spelling. Keep the names of people, places, parties and news outlets as they are; use the usual English "
        "names of institutions (Camera dei deputati: Chamber of Deputies; BCE: ECB; Btp: BTP). Numbers in English format "
        "(1,5% becomes 1.5%; 2.000 becomes 2,000; 107 pb becomes 107 bp; 4.060,1 $ becomes $4,060.1). Dates like "
        "'9 November'. Keep the guillemets «» around quotes. Keep the line breaks: blank lines between paragraphs stay "
        "exactly where they are. Short labels stay short."
    ),
    "it": (
        "Traduci in italiano titoli di notizie finanziarie e nomi di eventi del calendario economico. L'input è un oggetto "
        "JSON {id: testo in inglese}; rispondi solo con un oggetto JSON con gli stessi id e le traduzioni.\n"
        "Regole: traduzione fedele e breve, in italiano semplice da notiziario economico, senza aggiunte né commenti. "
        "Le sigle restano (CPI, PPI, PMI, GDP diventa Pil, FOMC, Fed, BoE, BoJ, BCE per ECB, RBA). m/m resta m/m, y/y "
        "diventa a/a, q/q diventa t/t. «X Speaks» diventa «Parla X» con il ruolo in italiano (BOE Gov Bailey Speaks: "
        "Parla Bailey, governatore della BoE). I nomi di persone, società e testate restano. Numeri in formato italiano."
    ),
}

M32 = 0xFFFFFFFF


def impronta(s):
    """cyrb53 sulle unità UTF-16, in base 36: la stessa di G.hash nel sito."""
    b = s.encode("utf-16-le")
    h1, h2 = 0xDEADBEEF, 0x41C6CE57
    for ch in struct.unpack("<%dH" % (len(b) // 2), b):
        h1 = ((h1 ^ ch) * 2654435761) & M32
        h2 = ((h2 ^ ch) * 1597334677) & M32
    h1 = ((h1 ^ (h1 >> 16)) * 2246822507) & M32
    h1 ^= ((h2 ^ (h2 >> 13)) * 3266489909) & M32
    h2 = ((h2 ^ (h2 >> 16)) * 2246822507) & M32
    h2 ^= ((h1 ^ (h1 >> 13)) * 3266489909) & M32
    n = 4294967296 * (2097151 & h2) + h1
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if not n:
            return out


def testi(dato, campi):
    """I testi da tradurre: i valori stringa dei campi scelti, a qualunque profondità (come il giro di G.load)."""
    want, out = set(campi), []

    def giro(o, chiave):
        if isinstance(o, list):
            for x in o:
                if isinstance(x, str):
                    if chiave in want and x.strip():
                        out.append(x)
                else:
                    giro(x, chiave)
        elif isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str):
                    if k in want and v.strip():
                        out.append(v)
                else:
                    giro(v, k)
    giro(dato, "")
    return out


def carica(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def chiedi(url, body=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET",
                                 headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def versione(nome):
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", nome)
    return float(m.group(1)) if m else 0.0


# per tradurre contano la velocità e la disponibilità sul livello gratuito più dell'ultima versione: prima questi, se ci sono
PREFERITI = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]


def modelli():
    """I modelli «flash» che scrivono testo: prima i PREFERITI disponibili, poi gli altri dal più nuovo."""
    scelto = os.environ.get("GERICO_GEMINI_TESTO", "").strip()
    if scelto:
        return [scelto]
    nomi = []
    try:
        url = API + "/models?pageSize=1000"
        while url:
            doc = chiedi(url, timeout=30)
            for m in doc.get("models") or []:
                nome = str(m.get("name", "")).replace("models/", "")
                metodi = m.get("supportedGenerationMethods") or []
                if "generateContent" in metodi and "flash" in nome and not re.search(r"tts|image|audio|live|embed|thinking|native|robotics|omni|transcribe", nome):
                    nomi.append(nome)
            tok = doc.get("nextPageToken")
            url = API + "/models?pageSize=1000&pageToken=" + tok if tok else ""
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"  elenco dei modelli non riuscito ({e}): uso quelli di riserva")
    if not nomi:
        return PREFERITI[:4]
    primi = [n for n in PREFERITI if n in nomi]
    altri = sorted(set(nomi) - set(primi), key=lambda n: (("lite" in n), bool(re.search(r"preview|exp", n)), -versione(n), n))
    return (primi + altri)[:5]


class QuotaFinita(RuntimeError):
    pass


# per tradurre non serve ragionare a lungo: si chiede il minimo, nella forma che il modello accetta
# per tradurre non serve ragionare a lungo: si chiede il minimo, nella forma che il modello accetta
def forme_pensiero(modello):
    if re.search(r"gemini-2\.5|latest", modello):
        return [{"thinkingBudget": 0}, None]
    return [{"thinkingLevel": "minimal"}, {"thinkingLevel": "low"}, {"thinkingBudget": 0}, None]


pensiero = {}


class Occupato(RuntimeError):
    """Il modello è lento o sovraccarico (tempo scaduto, 503, troppe richieste al minuto): meglio passare al successivo."""


def traduci_lotto(lotto, lingua, modello):
    """Un lotto {id: testo} tradotto. Con la quota del giorno finita alza QuotaFinita; con il modello lento o sovraccarico,
    dopo due tentativi, Occupato."""
    forme, guasti = forme_pensiero(modello), 0
    while True:
        k = pensiero.get(modello, 0)
        gen = {"responseMimeType": "application/json", "temperature": 0.2}
        if forme[k]:
            gen["thinkingConfig"] = forme[k]
        body = {
            "systemInstruction": {"parts": [{"text": ISTRUZIONI[lingua]}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(lotto, ensure_ascii=False)}]}],
            "generationConfig": gen,
        }
        try:
            doc = chiedi(f"{API}/models/{modello}:generateContent", body, timeout=90)
            parti = ((doc.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
            testo = "".join(p.get("text", "") for p in parti if not p.get("thought")).strip()
            testo = re.sub(r"^```(?:json)?\s*|\s*```$", "", testo)
            out = json.loads(testo)
            return {k: v for k, v in out.items() if k in lotto and isinstance(v, str) and v.strip()}
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:400]
            if e.code == 429 and re.search(r"per ?day|PerDay|daily", msg, re.I):
                raise QuotaFinita(msg)
            # il modello non accetta questa forma del «pensiero»: si prova la successiva, senza contarla come errore
            if e.code == 400 and re.search(r"think", msg, re.I) and k < len(forme) - 1:
                pensiero[modello] = k + 1
                continue
            if e.code in (400, 401, 403, 404):
                print(f"  {modello}: errore {e.code}: {msg[:200]}")
                raise
            guasti += 1
            if guasti >= 2:
                raise Occupato(f"errore {e.code}")
            m = re.search(r'"retryDelay":\s*"(\d+)s"', msg)
            attesa = min(30, int(m.group(1)) + 1) if m else 10
            print(f"  {modello}: errore {e.code}, riprovo tra {attesa} s")
            time.sleep(attesa)
        except (urllib.error.URLError, OSError) as e:
            guasti += 1
            if guasti >= 2:
                raise Occupato(str(e))
            print(f"  {modello}: {e}, riprovo")
        except (ValueError, KeyError, IndexError) as e:
            guasti += 1
            if guasti >= 2:
                return {}
            print(f"  {modello}: risposta non valida ({e}), riprovo")


def lotti(nuovi, limite=4000):
    """I testi nuovi in lotti di al massimo `limite` caratteri: le risposte restano brevi e un errore costa poco."""
    lotto, peso = {}, 0
    for k, v in nuovi.items():
        if lotto and peso + len(v) > limite:
            yield lotto
            lotto, peso = {}, 0
        lotto[k] = v
        peso += len(v)
    if lotto:
        yield lotto


def main(cartella):
    if os.environ.get("SOLO_MODELLI", "").lower() == "true":
        if not KEY:
            sys.exit("Manca GEMINI_API_KEY")
        doc = chiedi(API + "/models?pageSize=1000", timeout=30)
        for m in doc.get("models") or []:
            print(m.get("name"), ",".join(m.get("supportedGenerationMethods") or []))
        print("Scelti per la traduzione:", ", ".join(modelli()))
        return
    os.makedirs(os.path.join(cartella, "tr"), exist_ok=True)
    elenco = modelli() if KEY else []
    quota = False
    for lingua, file in CAMPI.items():
        uscita = os.path.join(cartella, "tr", lingua + ".json")
        prima = carica(uscita, {}) or {}
        voci = {}
        for nome, campi in file.items():
            dato = carica(os.path.join(cartella, nome + ".json"))
            if dato is None:
                continue
            for t in testi(dato, campi):
                voci[impronta(t)] = t
        mappa = {k: prima[k] for k in voci if isinstance(prima.get(k), str)}
        nuovi = {k: v for k, v in voci.items() if k not in mappa}

        def salva():
            tmp = uscita + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(dict(sorted(mappa.items())), f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, uscita)

        fatti = 0
        if nuovi and not KEY:
            print(f"  {lingua}: {len(nuovi)} testi nuovi, ma manca GEMINI_API_KEY: restano nella lingua originale")
        elif nuovi and not quota:
            tutti = list(lotti(nuovi))
            for n, lotto in enumerate(tutti, 1):
                if time.time() - INIZIO > BUDGET:
                    print(f"  {lingua}: tempo finito, i testi rimasti li traduce il giro dopo")
                    break
                ok, t0, usato = {}, time.time(), ""
                for modello in list(elenco):
                    try:
                        ok, usato = traduci_lotto(lotto, lingua, modello), modello
                        break
                    except QuotaFinita as e:
                        print(f"  {modello}: quota del giorno finita ({str(e)[:160]})")
                        elenco.remove(modello)
                    except Occupato as e:
                        print(f"  {modello}: lento o sovraccarico ({e}), provo il modello dopo")
                        elenco.remove(modello)
                        elenco.append(modello)
                    except urllib.error.HTTPError as e:
                        print(f"  {modello}: errore {e.code}, provo il modello dopo")
                        elenco.remove(modello)
                if not elenco:
                    quota = True
                    print("  nessun modello disponibile: i testi rimasti restano nella lingua originale")
                    break
                mappa.update(ok)
                fatti += len(ok)
                salva()
                print(f"  {lingua} lotto {n}/{len(tutti)}: {len(ok)} su {len(lotto)} in {time.time() - t0:.0f} s ({usato or 'nessun modello'})")
                time.sleep(4)
        salva()
        print(f"{lingua}: {len(voci)} testi, {len(voci) - len(nuovi)} già tradotti, {fatti} tradotti adesso, "
              f"{len(voci) - len(mappa)} ancora nella lingua originale")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
