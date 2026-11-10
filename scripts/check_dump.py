#!/usr/bin/env python3
"""Controlla e sistema il dump del database prima dell'export.

Uso:
    python3 scripts/check_dump.py <cartella_dump>

export.py non si tocca, quindi i dati scritti male si sistemano qui, prima dell'export:
- rank scritto come testo ("2") diventa un numero; un rank che non è un numero si toglie;
- un orario senza fuso (2026-11-02T07:26:58) prende il fuso di Roma di quel giorno;
- updated e firstSeen con il solo giorno (2026-11-02) diventano la mezzanotte di quel giorno, ora di Roma;
- updated che non è un testo si toglie: la storia archiviata resta fuori dall'archivio invece di fermare l'export;
- un orario nel futuro (più di due minuti dopo adesso) diventa adesso: la redazione a volte stima l'ora invece di
  leggerla, e il sito non deve dire «aggiornata alle 7:50» per una storia scritta alle 7:25;
- ogni campo prende la forma che il sito si aspetta: un testo dove serve un testo (sommario, articolo, parere, novità),
  una lista di testi dove serve una lista (temi, domande aperte), liste di voci fatte bene (fonti, fatti, storia delle
  modifiche, classi e voci dei mercati, eventi dell'agenda, indici della mappa). Le voci che non si possono
  sistemare si tolgono: una voce scritta male non deve fermare la pubblicazione né rompere una pagina.
Stampa una riga per ogni correzione e per ogni file che non si legge.
Esce con un errore solo se il dump è vuoto: vuol dire che la lettura del database non è andata."""
import json
import os
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
TIME_KEYS = {"updated", "firstSeen", "at", "asOf", "lastRun", "generatedAt", "runningSince"}
DAY_KEYS = {"updated", "firstSeen"}
NAIVE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$")
DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def with_zone(value):
    t = datetime.fromisoformat(value.replace(" ", "T"))
    return t.replace(tzinfo=ROME).isoformat(timespec="seconds")


def fix_times(obj, where, notes):
    """Aggiunge il fuso agli orari che non ce l'hanno, a ogni livello del documento."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in TIME_KEYS and isinstance(v, str):
                s = v.strip()
                try:
                    if NAIVE.match(s):
                        obj[k] = with_zone(s)
                    elif k in DAY_KEYS and DAY.match(s):
                        obj[k] = with_zone(s + "T00:00:00")
                    else:
                        continue
                except ValueError:
                    continue
                notes.append(f"{where}: {k} senza fuso, {v!r} -> {obj[k]!r}")
            else:
                fix_times(v, where, notes)
    elif isinstance(obj, list):
        for v in obj:
            fix_times(v, where, notes)


def adesso():
    """L'ora della pubblicazione; ADESSO (ISO 8601 con fuso) la sostituisce nelle prove."""
    v = os.environ.get("ADESSO")
    if v:
        return datetime.fromisoformat(v).astimezone(ROME)
    return datetime.now(ROME).replace(microsecond=0)


def fix_future(obj, where, notes, now):
    """Un orario più avanti di adesso non può essere vero (scritture, articoli, voci della storia): diventa adesso."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in TIME_KEYS and isinstance(v, str):
                try:
                    t = datetime.fromisoformat(v.strip().replace("Z", "+00:00"))
                except ValueError:
                    continue
                if t.tzinfo is not None and (t - now).total_seconds() > 120:
                    obj[k] = now.isoformat(timespec="seconds")
                    notes.append(f"{where}: {k} {v!r} è nel futuro, diventa {obj[k]!r}")
            else:
                fix_future(v, where, notes, now)
    elif isinstance(obj, list):
        for v in obj:
            fix_future(v, where, notes, now)


def fix_story(doc, where, notes):
    if "rank" in doc:
        r = doc["rank"]
        if isinstance(r, bool) or not isinstance(r, (int, float, str)):
            del doc["rank"]
            notes.append(f"{where}: rank {r!r} non è un numero, tolto")
        elif isinstance(r, float):
            if r.is_integer():
                doc["rank"] = int(r)
                notes.append(f"{where}: rank {r!r} -> {doc['rank']}")
            else:
                del doc["rank"]
                notes.append(f"{where}: rank {r!r} non è un intero, tolto")
        elif isinstance(r, str):
            if r.strip().isdigit():
                doc["rank"] = int(r.strip())
                notes.append(f"{where}: rank scritto come testo {r!r} -> {doc['rank']}")
            else:
                del doc["rank"]
                notes.append(f"{where}: rank {r!r} non è un numero, tolto")
    if "updated" in doc and not isinstance(doc["updated"], str):
        notes.append(f"{where}: updated {doc['updated']!r} non è un orario, tolto")
        del doc["updated"]
    # il titolo è un testo: un numero si scrive come testo, il resto si toglie (export.py salta la storia senza titolo)
    if "title" in doc and not isinstance(doc["title"], str):
        t = doc["title"]
        if isinstance(t, (int, float)) and not isinstance(t, bool):
            doc["title"] = str(t)
        else:
            del doc["title"]
        notes.append(f"{where}: title {t!r} non è un testo, {'scritto come testo' if 'title' in doc else 'tolto'}")
    for k, sep in (("summary", " "), ("article", "\n\n"), ("view", "\n\n"), ("change", " ")):
        if k in doc:
            fix_text(doc, k, sep, where, notes)
    for k in ("tags", "themes", "open"):
        if k in doc:
            fix_strings(doc, k, where, notes)
    if "section" in doc and not isinstance(doc["section"], str):
        notes.append(f"{where}: section {doc['section']!r} non è un testo, tolta")
        del doc["section"]
    if "sources" in doc:
        fix_items(doc, "sources", where, notes, need=("name",), texts=("name", "kind", "country", "area", "url", "angle", "stance", "at", "date"))
    if "facts" in doc:
        fix_items(doc, "facts", where, notes, need=("text",), texts=("text",))
        for f in doc["facts"]:
            fix_who(f)
    if "history" in doc:
        fix_items(doc, "history", where, notes, need=("at", "text"), texts=("at", "text"))
    # campi del formato vecchio, ancora nelle storie di prima: testate che non ne parlano (testi) e punti di divergenza
    if "notCovered" in doc:
        fix_strings(doc, "notCovered", where, notes)
    if "divergences" in doc:
        fix_items(doc, "divergences", where, notes, need=("point",), texts=("point",))
        for dv in doc["divergences"]:
            if "positions" in dv:
                fix_items(dv, "positions", where + " divergences", notes, need=("says",), texts=("says",))
                for ps in dv["positions"]:
                    fix_who(ps)


def fix_who(x):
    """who è una lista di nomi di fonti (o un nome solo): via quello che non è un testo."""
    w = x.get("who")
    if isinstance(w, list):
        good = [n for n in w if isinstance(n, str) and n.strip()]
        if good != w:
            x["who"] = good
    elif w is not None and not isinstance(w, str):
        x.pop("who")


def fix_text(doc, k, sep, where, notes):
    """Il campo k diventa un testo: una lista di testi si unisce, il resto si svuota."""
    v = doc[k]
    if isinstance(v, str):
        return
    if isinstance(v, list) and v and all(isinstance(x, str) for x in v):
        doc[k] = sep.join(x.strip() for x in v if x.strip())
        notes.append(f"{where}: {k} era una lista di testi, unita")
    else:
        doc[k] = ""
        if v is not None:
            notes.append(f"{where}: {k} {str(v)[:40]!r} non è un testo, svuotato")


def fix_strings(doc, k, where, notes):
    """Il campo k diventa una lista di testi non vuoti: un testo solo diventa una lista di uno."""
    v = doc[k]
    if isinstance(v, str):
        doc[k] = [v.strip()] if v.strip() else []
        notes.append(f"{where}: {k} era un testo solo, messo in una lista")
    elif not isinstance(v, list):
        doc[k] = []
        if v is not None:
            notes.append(f"{where}: {k} non è una lista, svuotato")
    else:
        good = [x.strip() for x in v if isinstance(x, str) and x.strip()]
        if len(good) != len(v) or good != v:
            if len(good) != len(v):
                notes.append(f"{where}: {k} con {len(v) - len(good)} voci che non sono testi, tolte")
            doc[k] = good


def to_number(v):
    """Un numero scritto come testo ("1,2", "-0.4%", "+16") torna numero; None se non lo è."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v if v == v and abs(v) != float("inf") else None
    if isinstance(v, str):
        t = v.strip().replace("%", "").replace("−", "-").replace("+", "").replace(" ", "")
        if re.fullmatch(r"-?\d+(,\d+)?", t):
            t = t.replace(",", ".")
        try:
            return float(t) if t else None
        except ValueError:
            return None
    return None


def fix_items(doc, k, where, notes, need=(), texts=(), numbers=()):
    """Il campo k diventa una lista di voci (oggetti) con i campi di need scritti come testo non vuoto. I campi di
    texts che non sono testi si tolgono (un numero si scrive come testo); quelli di numbers tornano numeri o si tolgono."""
    v = doc.get(k)
    if not isinstance(v, list):
        if v is not None:
            notes.append(f"{where}: {k} non è una lista, svuotato")
        doc[k] = []
        return
    out, drop, touch = [], 0, 0
    for x in v:
        if not isinstance(x, dict):
            drop += 1
            continue
        for t in texts:
            if t in x and not isinstance(x[t], str):
                if isinstance(x[t], (int, float)) and not isinstance(x[t], bool):
                    x[t] = str(x[t])
                else:
                    del x[t]
                touch += 1
        for n in numbers:
            if n in x and (isinstance(x[n], bool) or not isinstance(x[n], (int, float))):
                val = to_number(x[n])
                if val is None:
                    del x[n]
                else:
                    x[n] = val
                touch += 1
        if any(not (isinstance(x.get(n), str) and x[n].strip()) for n in need):
            drop += 1
            continue
        out.append(x)
    if drop:
        notes.append(f"{where}: {k} con {drop} voci scritte male, tolte")
    if touch:
        notes.append(f"{where}: {k} con {touch} campi del tipo sbagliato, sistemati")
    doc[k] = out


def fix_top_texts(doc, keys, where, notes):
    for k in keys:
        if k in doc and not isinstance(doc[k], str):
            v = doc[k]
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                doc[k] = str(v)
            else:
                del doc[k]
            notes.append(f"{where}: {k} {str(v)[:40]!r} non è un testo, {'scritto come testo' if k in doc else 'tolto'}")


def fix_asof(doc, where, notes):
    """asOf deve essere un orario che si legge: se no si toglie (il sito scrive che l'ora non c'è, invece di rompersi)."""
    v = doc.get("asOf")
    if v is None:
        return
    try:
        ok = isinstance(v, str) and bool(datetime.fromisoformat(v.strip().replace("Z", "+00:00")))
    except ValueError:
        ok = False
    if not ok:
        notes.append(f"{where}: asOf {str(v)[:40]!r} non è un orario, tolto")
        del doc["asOf"]


def fix_markets(doc, where, notes):
    fix_top_texts(doc, ("label", "summary"), where, notes)
    fix_asof(doc, where, notes)
    fix_items(doc, "classes", where, notes, need=("key",), texts=("key", "label", "note"))
    for c in doc["classes"]:
        fix_items(c, "items", where + " " + c["key"], notes, need=("name",), texts=("name", "value", "note", "why", "story"), numbers=("chg", "bp"))
    if "sources" in doc:
        fix_items(doc, "sources", where, notes, need=("name",), texts=("name", "url"))


IMPACTS = ("alto", "medio", "basso")


def fix_agenda(doc, where, notes):
    fix_top_texts(doc, ("date",), where, notes)
    fix_asof(doc, where, notes)
    fix_items(doc, "items", where, notes, need=("event",), texts=("time", "country", "currency", "event", "expected", "previous", "actual", "impact"))
    for it in doc["items"]:
        t = it.get("time")
        if t and not re.fullmatch(r"([01]?\d|2[0-3]):[0-5]\d", t.strip()):
            notes.append(f"{where}: orario {t!r} di «{it['event'][:40]}» non valido, tolto")
            it["time"] = ""
        if it.get("impact") not in IMPACTS:
            it["impact"] = "basso"
    if "sources" in doc:
        fix_items(doc, "sources", where, notes, need=("name",), texts=("name", "url"))


def fix_terminal(doc, where, notes):
    fix_top_texts(doc, ("label",), where, notes)
    fix_asof(doc, where, notes)
    fix_items(doc, "indices", where, notes, need=("code",), texts=("code", "index", "time", "note", "story"), numbers=("chg",))
    if "sources" in doc:
        fix_items(doc, "sources", where, notes, need=("name",), texts=("name", "url"))


def main(dump):
    if not os.path.isdir(dump):
        sys.exit(f"ERRORE: la cartella {dump} non esiste")
    notes, found, now = [], 0, adesso()
    for root, _dirs, files in os.walk(dump):
        for name in sorted(files):
            if not name.endswith(".json"):
                continue
            path = os.path.join(root, name)
            where = os.path.relpath(path, dump)
            found += 1
            try:
                with open(path, encoding="utf-8") as f:
                    doc = json.load(f)
            except (OSError, ValueError) as e:
                notes.append(f"{where}: non si legge ({e}); export.py lo salterà")
                continue
            if not isinstance(doc, dict):
                notes.append(f"{where}: non è un documento; export.py lo salterà")
                continue
            before = len(notes)
            snap = json.dumps(doc, sort_keys=True, ensure_ascii=False)
            if where.startswith("stories" + os.sep):
                fix_story(doc, where, notes)
            elif where == os.path.join("markets", "snapshot.json"):
                fix_markets(doc, where, notes)
            elif where == os.path.join("agenda", "today.json"):
                fix_agenda(doc, where, notes)
            elif where == os.path.join("terminal", "snapshot.json"):
                fix_terminal(doc, where, notes)
            fix_times(doc, where, notes)
            fix_future(doc, where, notes, now)
            if len(notes) > before or json.dumps(doc, sort_keys=True, ensure_ascii=False) != snap:
                tmp = path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(doc, f, ensure_ascii=False, indent=1)
                os.replace(tmp, path)
    if not found:
        sys.exit(f"ERRORE: nella cartella {dump} non c'è nessun documento: la lettura del database non è andata")
    for n in notes:
        print("  " + n)
    print(f"Dump controllato: {found} documenti, {len(notes)} correzioni.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
