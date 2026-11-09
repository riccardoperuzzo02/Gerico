#!/usr/bin/env python3
"""Copia il testo del riepilogo audio dal dump del database a site/data/riepilogo.json.

Uso:
    python3 scripts/riepilogo.py <cartella_dump> site/data

Legge <cartella_dump>/riepilogo/today.json, scritto dal giro delle notizie: {date, asOf, title, text}.
Lo copia solo se ha un testo vero (almeno 400 caratteri) e l'ora con il fuso. Se il dump non ha il
riepilogo, lascia il file com'era. L'audio lo fa poi il job «Dati del Terminal» con scripts/audio.py."""
import json
import os
import re
import sys
from datetime import datetime

from testo import senza_lineette


def main(dump, out):
    path = os.path.join(dump, "riepilogo", "today.json")
    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    except (OSError, ValueError):
        print("  riepilogo.json: nessun riepilogo nel database, lascio il file com'era")
        return
    text = senza_lineette(re.sub(r"[ \t]+", " ", str(doc.get("text") or "")).strip())
    try:
        when = datetime.fromisoformat(str(doc.get("asOf")).replace("Z", "+00:00"))
    except ValueError:
        when = None
    if len(text) < 400 or not when or not when.tzinfo:
        print(f"  riepilogo.json: testo troppo corto ({len(text)} caratteri) o ora senza fuso, lascio il file com'era")
        return
    data = {"date": str(doc.get("date") or when.date().isoformat())[:10], "asOf": when.isoformat(timespec="seconds"),
            "title": str(doc.get("title") or "Il riepilogo di GERICO")[:120], "text": text[:6000]}
    dest = os.path.join(out, "riepilogo.json")
    with open(dest + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(dest + ".tmp", dest)
    print(f"  riepilogo.json: {len(text.split())} parole, del {data['asOf']}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
