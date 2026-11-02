#!/usr/bin/env python3
"""Copia le notizie brevi del giro delle notizie dal dump del database a site/data/brevi.json.

Uso:
    python3 scripts/brevi.py <cartella_dump> site/data

Legge <cartella_dump>/brevi/today.json, scritto dal giro delle notizie. Tiene solo le brevi
con un titolo e l'indirizzo di un articolo (non di una prima pagina), senza doppioni e senza
quelle che ripetono una storia live dell'edizione già esportata. Al massimo 20, le più recenti prima.
Se il dump non ha brevi, lascia il file com'era."""
import json
import os
import re
import sys
from datetime import datetime
from urllib.parse import urlparse

SECTIONS = {"mondo", "italia", "economia", "mercati", "tecnologia"}


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def front_page(u):
    """Una prima pagina o una pagina di sezione: domani dirà altro (stessa regola del sito, G.isFrontPage)."""
    try:
        p = urlparse(u)
    except ValueError:
        return True
    segs = [s for s in p.path.split("/") if s]
    if not segs:
        return True
    last = segs[-1].lower()
    if re.match(r"^(index|default|home)(\.\w+)?$", last):
        return True
    digits = re.search(r"\d", p.path)
    if not digits and "-" not in last and re.search(r"\.s?html?$", last):
        return True
    return len(segs) <= 2 and not digits and last.count("-") <= 2


def norm(t):
    return re.sub(r"\W+", " ", str(t).lower()).strip()


def when(v):
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else None
    except ValueError:
        return None


def main(dump, out):
    doc = load(os.path.join(dump, "brevi", "today.json"))
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        print("  brevi.json: nessuna breve nel database, lascio il file com'era")
        return
    edition = load(os.path.join(out, "edition.json")) or {}
    taken = set()
    for s in edition.get("stories") or []:
        for src in s.get("sources") or []:
            if isinstance(src, dict) and src.get("url"):
                taken.add(src["url"].split("#")[0].rstrip("/"))
    items, seen, dropped = [], set(), 0
    for it in doc["items"]:
        if not isinstance(it, dict):
            dropped += 1
            continue
        title = re.sub(r"\s+", " ", str(it.get("title") or "")).strip()
        url = str(it.get("url") or "").strip()
        key = url.split("#")[0].rstrip("/")
        if not title or not re.match(r"^https?://", url) or front_page(url) or key in taken \
                or key in seen or norm(title) in seen:
            dropped += 1
            continue
        seen.update({key, norm(title)})
        at = it.get("at") if when(it.get("at")) else ""
        section = it.get("section") if it.get("section") in SECTIONS else "mondo"
        items.append({"title": title[:140], "section": section, "source": str(it.get("source") or "").strip()[:60],
                      "url": url, "at": at})
    items.sort(key=lambda x: when(x["at"]).timestamp() if x["at"] else 0, reverse=True)
    data = {"asOf": doc.get("asOf") or "", "date": doc.get("date") or "", "items": items[:20]}
    path = os.path.join(out, "brevi.json")
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(path + ".tmp", path)
    print(f"  brevi.json: {len(data['items'])} brevi" + (f", {dropped} scartate (senza articolo, doppie o già storie)" if dropped else ""))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
