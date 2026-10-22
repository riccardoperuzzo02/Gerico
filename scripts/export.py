#!/usr/bin/env python3
"""Esporta il database di GERICO nei file pubblici del sito.

Uso:
    python3 scripts/export.py <cartella_dump> site/data

<cartella_dump> è la cartella creata leggendo il database dell'app con ArtifactData e out_dir:
    stories/<id>.json, markets/snapshot.json, agenda/today.json, meta/status.json
    e, quando esiste, terminal/snapshot.json.
Scrive edition.json, markets.json, agenda.json e terminal.json. Non tocca weights.json,
che si aggiorna a parte una volta al mese. Nel sito finiscono solo dati editoriali:
mai le preferenze degli utenti (data/users) né altro."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

STORY_FIELDS = ["id", "title", "section", "rank", "status", "summary", "facts", "divergences", "view", "open",
                "sources", "firstSeen", "updated", "change", "tags", "history", "notCovered"]
SOURCE_FIELDS = ["name", "kind", "country", "area", "url", "angle", "stance", "at", "date"]
ARCHIVE_DAYS = 7

# nome dell'indice nel database -> codice del quadrato nella mappa (l'ordine conta: i più specifici prima)
INDEX_CODES = [
    ("ftse mib", "ITA", "FTSE MIB"), ("ftse 100", "GBR", "FTSE 100"), ("dax", "DEU", "DAX"),
    ("cac", "FRA", "CAC 40"), ("aex", "NLD", "AEX"), ("smi", "CHE", "SMI"), ("tsx", "CAN", "S&P/TSX"),
    ("s&p 500", "USA", "S&P 500"), ("nikkei", "JPN", "Nikkei 225"), ("kospi", "KOR", "Kospi"),
    ("taiex", "TWN", "Taiex"), ("csi 300", "CHN", "CSI 300"), ("nifty", "IND", "Nifty 50"),
    ("bovespa", "BRA", "Bovespa"),
]


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def parse_time(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def clean_url(u):
    u = str(u or "").strip()
    return u if u.startswith("https://") or u.startswith("http://") else ""


def clean_story(raw, sid):
    s = {k: raw[k] for k in STORY_FIELDS if k in raw}
    s["id"] = sid
    srcs = []
    for src in raw.get("sources") or []:
        if not isinstance(src, dict):
            continue
        x = {k: src[k] for k in SOURCE_FIELDS if k in src}
        x["url"] = clean_url(x.get("url"))
        srcs.append(x)
    s["sources"] = srcs
    return s


def derive_terminal(markets):
    """Fallback finché il giro delle 7:18 non scrive terminal/snapshot: le variazioni dagli indici dei mercati."""
    indices = []
    seen = set()
    for c in (markets or {}).get("classes") or []:
        if c.get("key") != "indici":
            continue
        for it in c.get("items") or []:
            name = str(it.get("name", "")).lower()
            for key, code, label in INDEX_CODES:
                if key in name and code not in seen and isinstance(it.get("chg"), (int, float)):
                    seen.add(code)
                    entry = {"code": code, "index": label, "chg": it["chg"]}
                    for k in ("note", "story"):
                        if it.get(k):
                            entry[k] = it[k]
                    indices.append(entry)
                    break
    return {"asOf": (markets or {}).get("asOf"), "label": (markets or {}).get("label", ""),
            "indices": indices, "sources": (markets or {}).get("sources") or [], "derived": True}


def main(dump, out):
    now = datetime.now(timezone.utc)
    os.makedirs(out, exist_ok=True)
    stories_dir = os.path.join(dump, "stories")
    live, archive = [], []
    for name in sorted(os.listdir(stories_dir)) if os.path.isdir(stories_dir) else []:
        if not name.endswith(".json"):
            continue
        raw = load(os.path.join(stories_dir, name), {})
        if not isinstance(raw, dict) or not raw.get("title"):
            continue
        s = clean_story(raw, name[:-5])
        if s.get("status") == "live":
            live.append(s)
        else:
            upd = parse_time(s.get("updated"))
            if upd and now - upd <= timedelta(days=ARCHIVE_DAYS):
                archive.append(s)
    live.sort(key=lambda s: s.get("rank") or 99)
    archive.sort(key=lambda s: s.get("updated") or "", reverse=True)

    # ogni file si riscrive solo se il dump contiene i dati da cui nasce:
    # il giro delle 17:50 legge solo mercati e terminal e non deve svuotare l'edizione
    meta = load(os.path.join(dump, "meta", "status.json"), {}) or {}
    edition = None
    if live:
        edition = {"generatedAt": now.isoformat(timespec="seconds"), "lastRun": meta.get("lastRun"),
                   "outlets": meta.get("outlets") or [], "quality": meta.get("quality") or {},
                   "stories": live, "archive": archive}
    markets = load(os.path.join(dump, "markets", "snapshot.json"))
    agenda = load(os.path.join(dump, "agenda", "today.json"))
    terminal = load(os.path.join(dump, "terminal", "snapshot.json"))
    if terminal is None and markets is not None:
        terminal = derive_terminal(markets)

    files = {"edition.json": edition, "markets.json": markets, "agenda.json": agenda, "terminal.json": terminal}
    for fname, data in files.items():
        if data is None:
            print(f"  {fname}: nessun dato nel database, lascio il file com'era")
            continue
        path = os.path.join(out, fname)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
        print(f"  {fname}: {os.path.getsize(path):,} byte")
    print(f"Storie live: {len(live)}, archiviate negli ultimi {ARCHIVE_DAYS} giorni: {len(archive)}")
    if terminal:
        print(f"Indici per la mappa: {len(terminal.get('indices') or [])}" + (" (ricavati dai mercati)" if terminal.get("derived") else ""))
    if not os.path.exists(os.path.join(out, "weights.json")):
        print("ATTENZIONE: manca weights.json, la mappa del Terminal resterà vuota")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
