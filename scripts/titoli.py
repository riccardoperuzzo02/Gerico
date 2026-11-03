#!/usr/bin/env python3
"""Copia i «Titoli da seguire» dal dump del database a site/data/titoli.json.

Uso:
    python3 scripts/titoli.py <cartella_dump> site/data

Legge <cartella_dump>/titoli/today.json, scritto dall'attività «GERICO titoli da seguire»:
{date, asOf, method, items: [{name, ticker, market, price, chg, at, signal, why, risk, horizon, sources, score}], note}.
Tiene al massimo 5 titoli e solo quelli completi: perché, rischio e almeno una fonte con l'indirizzo dell'articolo.
Scarta una voce che parla di comprare o vendere, di prezzi obiettivo o di stop: la sezione informa, non consiglia.
Se il dump non ha il documento, lascia il file com'era."""
import json
import os
import re
import sys
from datetime import datetime

BANNED = re.compile(r"\b(compra(re|te)?|acquista(re)?|vend(i|ere|ete)|prezzo obiettivo|target price|stop[ -]?loss|guadagn\w+ attes\w+)\b", re.I)
MARKETS = {"Milano", "Europa", "Usa"}


def clean(s, n):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


def item(x):
    if not isinstance(x, dict):
        return None
    name, ticker, why, risk = clean(x.get("name"), 60), clean(x.get("ticker"), 16), clean(x.get("why"), 160), clean(x.get("risk"), 120)
    if not (name and ticker and why and risk) or BANNED.search(why + " " + risk + " " + str(x.get("signal") or "")):
        return None
    srcs = []
    for s in x.get("sources") or []:
        url = str((s or {}).get("url") or "")
        if url.startswith("https://") and len(url) < 400:
            srcs.append({"name": clean(s.get("name"), 40), "url": url, "date": clean(s.get("date"), 25)})
    if not srcs:
        return None
    num = lambda v: float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
    return {"name": name, "ticker": ticker, "market": x.get("market") if x.get("market") in MARKETS else "",
            "price": num(x.get("price")), "chg": num(x.get("chg")), "at": clean(x.get("at"), 30),
            "signal": clean(x.get("signal"), 160), "why": why, "risk": risk, "horizon": clean(x.get("horizon") or "1-5 sedute", 20),
            "sources": srcs[:3]}


def main(dump, out):
    path = os.path.join(dump, "titoli", "today.json")
    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    except (OSError, ValueError):
        print("  titoli.json: nessun documento nel database, lascio il file com'era")
        return
    try:
        when = datetime.fromisoformat(str(doc.get("asOf")).replace("Z", "+00:00"))
    except ValueError:
        when = None
    if not when or not when.tzinfo:
        print("  titoli.json: ora senza fuso, lascio il file com'era")
        return
    items = [i for i in (item(x) for x in (doc.get("items") or [])[:8]) if i][:5]
    data = {"date": str(doc.get("date") or when.date().isoformat())[:10], "asOf": when.isoformat(timespec="seconds"),
            "method": clean(doc.get("method"), 120), "items": items, "note": clean(doc.get("note"), 200)}
    dest = os.path.join(out, "titoli.json")
    with open(dest + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(dest + ".tmp", dest)
    print(f"  titoli.json: {len(items)} titoli, del {data['asOf']}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
