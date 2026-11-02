#!/usr/bin/env python3
"""Controlla e sistema il dump del database prima dell'export.

Uso:
    python3 scripts/check_dump.py <cartella_dump>

export.py non si tocca, quindi i dati scritti male si sistemano qui, prima dell'export:
- rank scritto come testo ("2") diventa un numero; un rank che non è un numero si toglie;
- un orario senza fuso (2026-11-02T07:26:58) prende il fuso di Roma di quel giorno;
- updated e firstSeen con il solo giorno (2026-11-02) diventano la mezzanotte di quel giorno, ora di Roma;
- updated che non è un testo si toglie: la storia archiviata resta fuori dall'archivio invece di fermare l'export.
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


def main(dump):
    if not os.path.isdir(dump):
        sys.exit(f"ERRORE: la cartella {dump} non esiste")
    notes, found = [], 0
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
            if where.startswith("stories" + os.sep):
                fix_story(doc, where, notes)
            fix_times(doc, where, notes)
            if len(notes) > before:
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
