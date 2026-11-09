#!/usr/bin/env python3
"""Esporta il database di GERICO nei file pubblici del sito.

Uso:
    python3 scripts/export.py <cartella_dump> site/data

<cartella_dump> è la cartella creata leggendo il database dell'app con ArtifactData e out_dir:
    stories/<id>.json, markets/snapshot.json, agenda/today.json, meta/status.json
    e, quando esistono, terminal/snapshot.json e terminal/weights.json.
Scrive edition.json, markets.json, agenda.json, terminal.json e, se nel database ci sono i pesi
della mappa (aggiornati una volta al mese), weights.json. Un giro senza novità non cambia nessun file.
Nel sito finiscono solo dati editoriali: mai le preferenze degli utenti (data/users) né altro."""
import json
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone

from testo import pulisci, senza_lineette

STORY_FIELDS = ["id", "title", "section", "rank", "status", "summary", "article", "facts", "divergences", "view", "open",
                "sources", "firstSeen", "updated", "change", "tags", "themes", "history", "notCovered"]
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
    # niente lineette nei testi pubblicati (regola di stile della redazione)
    return pulisci(s)


# temi che non fanno da tema caldo: sono Paesi o aree troppo larghi per una scheda
GENERICI = {"stati uniti", "usa", "europa", "italia", "mondo", "economia", "mercati", "ue", "unione europea", "cina"}


def slug(t):
    t = unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40]


def tocca(s, t):
    """Una storia è del tema se lo ha in themes; le storie senza themes, e i temi ricavati dai tag, per parole chiave."""
    if isinstance(s.get("themes"), list) and not t.get("auto"):
        return t["id"] in s["themes"]
    txt = " ".join([s.get("title") or "", s.get("summary") or ""] + [str(x) for x in s.get("tags") or []]).lower()
    return any(k.lower() in txt for k in t["keywords"])


def temi_caldi(dump, live):
    """I 3 temi caldi delle schede della prima pagina: quelli della redazione (meta/temi) con almeno una storia live;
    finché mancano, i tag più presenti nelle storie live, pesati per importanza."""
    doc = load(os.path.join(dump, "meta", "temi.json")) or {}
    out = []
    for t in doc.get("temi") or [] if isinstance(doc, dict) else []:
        if not isinstance(t, dict):
            continue
        label = senza_lineette(str(t.get("label") or "").strip())[:24]
        tid = slug(t.get("id") or label)
        if not label or not tid or any(x["id"] == tid for x in out):
            continue
        kw = [str(k).strip() for k in t.get("keywords") or [] if str(k).strip()][:10] or [label]
        out.append({"id": tid, "label": label, "keywords": kw, "since": str(t.get("since") or "")[:10]})
    out = [t for t in out if any(tocca(s, t) for s in live)][:3]
    if len(out) < 3:
        peso = Counter()
        for s in live:
            r = s.get("rank") if isinstance(s.get("rank"), int) else 15
            for tag in s.get("tags") or []:
                if str(tag).strip().lower() not in GENERICI:
                    peso[str(tag).strip()] += max(1, 16 - r)
        for tag, _ in peso.most_common():
            if len(out) >= 3:
                break
            if any(x["id"] == slug(tag) or tag.lower() in (k.lower() for k in x["keywords"]) for x in out):
                continue
            out.append({"id": slug(tag), "label": tag, "keywords": [tag], "since": "", "auto": True})
    return out


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
                   "themes": temi_caldi(dump, live), "stories": live, "archive": archive}
    markets = load(os.path.join(dump, "markets", "snapshot.json"))
    agenda = load(os.path.join(dump, "agenda", "today.json"))
    terminal = load(os.path.join(dump, "terminal", "snapshot.json"))
    if terminal is None and markets is not None:
        terminal = derive_terminal(markets)

    weights = load(os.path.join(dump, "terminal", "weights.json"))
    if weights is not None and not (weights.get("world") and weights.get("europe")):
        print("  weights.json: pesi nel database incompleti, lascio il file com'era")
        weights = None

    files = {"edition.json": edition, "markets.json": markets, "agenda.json": agenda, "terminal.json": terminal,
             "weights.json": weights}
    for fname, data in files.items():
        if data is None:
            print(f"  {fname}: nessun dato nel database, lascio il file com'era")
            continue
        path = os.path.join(out, fname)
        if fname == "edition.json":
            # se l'edizione non è cambiata tengo l'ora di prima: così un giro senza novità non produce un commit
            old = load(path) or {}
            if {k: v for k, v in old.items() if k != "generatedAt"} == {k: v for k, v in data.items() if k != "generatedAt"}:
                data["generatedAt"] = old.get("generatedAt", data["generatedAt"])
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
        print(f"  {fname}: {os.path.getsize(path):,} byte")
    print(f"Storie live: {len(live)}, archiviate negli ultimi {ARCHIVE_DAYS} giorni: {len(archive)}")
    if edition:
        print("Temi caldi: " + ", ".join(t["label"] + (" (dai tag)" if t.get("auto") else "") for t in edition["themes"]))
    if terminal:
        print(f"Indici per la mappa: {len(terminal.get('indices') or [])}" + (" (ricavati dai mercati)" if terminal.get("derived") else ""))
    if not os.path.exists(os.path.join(out, "weights.json")):
        print("ATTENZIONE: manca weights.json, la mappa del Terminal resterà vuota")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
