"""Testi di GERICO che vanno sul sito: niente lineette lunghe o medie come punteggiatura, una scelta di stile.

La redazione ha la regola nel prompt; questo è il controllo finale, prima della pubblicazione:
«X — Y» e «X – Y» diventano «X, Y»; tra due parole o due numeri senza spazi («Iran–Usa», «10–12») la lineetta
diventa un trattino; una lineetta all'inizio o alla fine di una frase sparisce."""
import re

LINEETTE = "—–"


def senza_lineette(t):
    if not isinstance(t, str) or not any(c in t for c in LINEETTE):
        return t
    t = re.sub(r"(?<=[^\s—–])[—–](?=[^\s—–])", "-", t)
    t = re.sub(r"(^|\n)[ \t]*[—–]+[ \t]*", r"\1", t)
    t = re.sub(r"[ \t]*[—–]+[ \t]*(?=$|\n)", "", t)
    t = re.sub(r"[ \t]*[—–]+[ \t]*", ", ", t)
    t = re.sub(r",[ \t]*(?=[,.;:!?»)])", "", t)
    t = re.sub(r"([(«])[ \t]*,[ \t]*", r"\1", t)
    return t


def pulisci(x):
    """Stringhe, liste e dizionari, in profondità (le chiavi e gli indirizzi non si toccano)."""
    if isinstance(x, str):
        return x if re.match(r"^https?://", x) else senza_lineette(x)
    if isinstance(x, list):
        return [pulisci(v) for v in x]
    if isinstance(x, dict):
        return {k: (v if k in ("url", "id", "s", "sym") else pulisci(v)) for k, v in x.items()}
    return x
