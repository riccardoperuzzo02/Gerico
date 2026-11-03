#!/usr/bin/env python3
"""Come sono andati i «Titoli da seguire»: rendimento dopo 1, 3 e 5 sedute, rispetto al loro indice.

Uso:
    python3 scripts/titoli_storico.py site/data

Gira nel job «Dati del Terminal». Legge site/data/titoli.json (i titoli pubblicati) e aggiorna
site/data/titoli-storico.json: per ogni titolo pubblicato il prezzo di partenza (l'ultima chiusura
prima della pubblicazione) e, quando ci sono, i rendimenti dopo 1, 3 e 5 sedute con quelli del suo indice.
In cima un riassunto sugli ultimi 20 titoli che hanno il dato a 5 sedute. Senza questo conto
la sezione non avrebbe modo di dire se funziona."""
import json
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BENCH = {"Milano": "FTSEMIB.MI", "Europa": "^STOXX50E", "Usa": "^GSPC"}
STEPS = (1, 3, 5)


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def closes(yf, sym, start):
    df = yf.download(sym, start=start, interval="1d", auto_adjust=True, progress=False)
    if df is None or df.empty:
        return []
    c = df["Close"]
    if hasattr(c, "columns"):  # con un solo simbolo yfinance può dare comunque due livelli di colonne
        c = c.iloc[:, 0]
    return [(str(i.date()), float(v)) for i, v in c.dropna().items()]


def after(series, day, k):
    """La chiusura k sedute dopo il giorno di riferimento (escluso), e quella del giorno di riferimento o prima."""
    base = [v for d, v in series if d <= day]
    nxt = [v for d, v in series if d > day]
    return (base[-1] if base else None), (nxt[k - 1] if len(nxt) >= k else None)


def main(data_dir):
    import yfinance as yf
    path = os.path.join(data_dir, "titoli-storico.json")
    hist = load(path, {"items": []})
    items = hist.get("items") or []
    have = {(i["date"], i["ticker"]) for i in items}
    cur = load(os.path.join(data_dir, "titoli.json"), {})
    for x in cur.get("items") or []:
        key = (cur.get("date"), x.get("ticker"))
        if key[0] and key[1] and key not in have and x.get("market") in BENCH:
            # riferimento: il giorno di borsa della pubblicazione o, la mattina prima dell'apertura, quello prima
            items.append({"date": key[0], "ticker": key[1], "name": x.get("name"), "market": x.get("market"),
                          "ref": str(x.get("at") or cur.get("asOf"))[:10], "r": {}, "b": {}})
            have.add(key)
    todo = [i for i in items if len(i.get("r") or {}) < len(STEPS)]
    cache = {}
    for i in todo:
        start = str((datetime.fromisoformat(i["ref"]) - timedelta(days=7)).date())
        for sym, field in ((i["ticker"], "r"), (BENCH[i["market"]], "b")):
            if (sym, start) not in cache:
                try:
                    cache[(sym, start)] = closes(yf, sym, start)
                except Exception as e:
                    print(f"::warning::titoli-storico: {sym}: {type(e).__name__}: {e}")
                    cache[(sym, start)] = []
            series = cache[(sym, start)]
            for k in STEPS:
                p0, pk = after(series, i["ref"], k)
                if p0 and pk:
                    i[field][str(k)] = round((pk / p0 - 1) * 100, 2)
    items = items[-120:]
    done = [i for i in items if "5" in i["r"] and "5" in i["b"]][-20:]
    better = sum(1 for i in done if i["r"]["5"] > i["b"]["5"])
    excess = round(sum(i["r"]["5"] - i["b"]["5"] for i in done) / len(done), 2) if done else None
    out = {"asOf": datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds"),
           "summary": {"n": len(done), "better": better, "avgExcess": excess}, "items": items}
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(path + ".tmp", path)
    print(f"::notice::titoli-storico: {len(items)} titoli, {len(done)} con il dato a 5 sedute, {better} meglio dell'indice")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if not os.path.exists(os.path.join(sys.argv[1], "titoli.json")) and not os.path.exists(os.path.join(sys.argv[1], "titoli-storico.json")):
        print("Nessun titolo pubblicato: niente storico da aggiornare.")
        sys.exit(0)
    try:
        main(sys.argv[1])
    except Exception as e:  # lo storico non deve fermare la pubblicazione dei dati
        print(f"::warning::titoli-storico: {type(e).__name__}: {e}")
