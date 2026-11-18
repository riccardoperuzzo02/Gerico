"""Come si leggono le parole che una voce sbaglierebbe: sigle, nomi stranieri, accenti.

Il dizionario sta in scripts/pronuncia.json: ogni regola ha «da» (un'espressione regolare), «a» (il testo da leggere) e
«voci» (gemini, kokoro, chatterbox). Si applicano in ordine, prima della sintesi, solo quelle della voce che legge.
Le parole da aggiungere le propone il workflow «Controllo della voce» (scripts/voce_prova.py), che trascrive l'audio
e lo confronta con il testo."""
import json
import os
import re

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pronuncia.json")
_regole = {}


def regole(voce):
    """Le regole di una voce, già compilate (il file si legge una volta sola)."""
    if voce not in _regole:
        with open(FILE, encoding="utf-8") as f:
            doc = json.load(f)
        _regole[voce] = [(re.compile(r["da"]), r["a"]) for r in doc["regole"] if voce in r.get("voci", ())]
    return _regole[voce]


def prepara(testo, voce):
    """Il testo con le parole del dizionario riscritte come le deve leggere quella voce."""
    for rx, a in regole(voce):
        testo = rx.sub(a, testo)
    return testo
