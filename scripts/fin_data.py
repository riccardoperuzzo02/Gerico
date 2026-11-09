#!/usr/bin/env python3
"""Dati del Terminal da cinque fonti pubbliche, per il job «Dati del Terminal» di GitHub Actions.

Uso:
    python3 scripts/fin_data.py site/data
    FIN_ONLY=macro,sec python3 scripts/fin_data.py site/data    solo alcune parti (quotes, macro, sec, sentiment, calendario)
    FIN_ONLY=quotes python3 scripts/fin_data.py site/data       solo i prezzi: è il job leggero «Prezzi», ogni mezz'ora

Scrive in site/data:
- quotes.json     prezzi, variazioni e grafico di tre mesi da Yahoo Finance, con yfinance;
- macro.json      serie economiche della Fed di St. Louis (FRED), senza chiave;
- sec.json        gli ultimi documenti depositati alla SEC (EDGAR) da un gruppo di grandi società Usa;
- sentiment.json  le notizie di Yahoo Finance su alcuni mercati, con il tono di ogni titolo calcolato da FinBERT;
- calendario.json il calendario economico della settimana di Forex Factory, con gli orari in ora italiana.

Ogni parte va per conto suo. Se una fonte non risponde, il suo file resta quello di prima,
con lastError che dice quando e perché non si è aggiornato: il Terminal lo mostra.
Gli esiti escono come annotazioni di GitHub Actions (::notice:: e ::warning::)."""
import csv
import datetime as dt
import email.utils
import io
import json
import math
import os
import re
import sys
import time
import traceback
from urllib.parse import quote, urlparse
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import requests

ROME = ZoneInfo("Europe/Rome")
UTC = dt.timezone.utc
# la SEC chiede un User-Agent con un nome e un indirizzo: è quello dei commit di GERICO
UA = {"User-Agent": "GERICO Terminal gerico@users.noreply.github.com", "Accept-Encoding": "gzip, deflate"}


def now():
    return dt.datetime.now(ROME)


def iso(d):
    return d.astimezone(ROME).isoformat(timespec="seconds")


def num(x, sig=6):
    """Arrotonda a sig cifre significative: file più leggeri, nessuna precisione finta."""
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    if x == 0:
        return 0.0
    digits = sig - int(math.floor(math.log10(abs(x)))) - 1
    return round(x, max(0, min(digits, 8)))


def notice(msg):
    print("::notice::" + str(msg).replace("\n", " ")[:900], flush=True)


def warning(msg):
    print("::warning::" + str(msg).replace("\n", " ")[:900], flush=True)


def save(out, name, data):
    path = os.path.join(out, name)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(path + ".tmp", path)


def keep_old(out, name, err):
    """La fonte non ha risposto: il file di prima resta, con la data e il motivo del tentativo fallito."""
    warning(f"{name}: non aggiornato. {err}")
    path = os.path.join(out, name)
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        # il file non c'è mai stato (dai server di GitHub la SEC rifiuta le richieste): se ne scrive uno che dice «non
        # disponibile», così il sito nasconde il pannello senza chiedere a ogni visita un file che non esiste. Una volta
        # sola e senza ora: non produce un commit a ogni giro
        if name == "sec.json":
            save(out, name, {"asOf": None, "unavailable": True, "filings": []})
        return
    if isinstance(old, dict):
        if old.get("unavailable"):
            return
        old["lastError"] = {"at": iso(now()), "message": err[:300]}
        save(out, name, old)


def get(url, params=None, tries=3):
    for i in range(tries):
        try:
            r = requests.get(url, params=params, headers=UA, timeout=30)
            if r.status_code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(3 * (i + 1))
                continue
            r.raise_for_status()
            return r
        except requests.RequestException:
            if i == tries - 1:
                raise
            time.sleep(3 * (i + 1))


# ---------------------------------------------------------------- Yahoo Finance (yfinance)

QUOTES = [
    # tutte le Borse della mappa del Terminal (un indice per Paese) e quelle che la redazione cita di solito
    ("indici", "Indici", [
        ("^GSPC", "S&P 500"), ("^NDX", "Nasdaq 100"), ("^IXIC", "Nasdaq Composite"), ("^DJI", "Dow Jones"),
        ("^STOXX50E", "Euro Stoxx 50"), ("^GDAXI", "Dax"), ("FTSEMIB.MI", "Ftse Mib"), ("^FCHI", "Cac 40"),
        ("^FTSE", "Ftse 100"), ("^IBEX", "Ibex 35"), ("^SSMI", "Smi"), ("^AEX", "Aex"),
        ("^N225", "Nikkei 225"), ("^HSI", "Hang Seng"), ("000300.SS", "Csi 300"), ("000001.SS", "Shanghai Composite"), ("^KS11", "Kospi"),
        ("^TWII", "Taiex"), ("^NSEI", "Nifty 50"), ("^GSPTSE", "S&P/TSX"), ("^BVSP", "Bovespa")]),
    ("valute", "Valute", [
        ("EURUSD=X", "EUR/USD"), ("GBPUSD=X", "GBP/USD"), ("USDJPY=X", "USD/JPY"), ("AUDUSD=X", "AUD/USD"),
        ("USDCHF=X", "USD/CHF"), ("USDCAD=X", "USD/CAD"), ("NZDUSD=X", "NZD/USD"), ("EURGBP=X", "EUR/GBP"),
        ("DX-Y.NYB", "Indice del dollaro")]),
    ("tassi", "Rendimenti Usa", [
        ("^IRX", "Treasury 3 mesi"), ("^FVX", "Treasury 5 anni"), ("^TNX", "Treasury 10 anni"), ("^TYX", "Treasury 30 anni")]),
    ("materie", "Materie prime", [
        ("BZ=F", "Brent"), ("CL=F", "Wti"), ("TTF=F", "Gas TTF"), ("NG=F", "Gas Henry Hub"),
        ("GC=F", "Oro"), ("SI=F", "Argento"), ("HG=F", "Rame")]),
    ("cripto", "Cripto", [("BTC-USD", "Bitcoin"), ("ETH-USD", "Ether")]),
]
SPARK = 66  # circa tre mesi di sedute


def history(yf, sym):
    last = None
    for i in range(3):
        try:
            t = yf.Ticker(sym)
            # all'ultimo tentativo date di inizio e fine invece di period: a volte Yahoo risponde a period
            # con una serie monca (succede spesso al gas TTF), e con le date la risposta non viene dalla cache
            span = {"period": "6mo"} if i < 2 else {"start": (now() - dt.timedelta(days=190)).date().isoformat(),
                                                    "end": (now() + dt.timedelta(days=2)).date().isoformat()}
            h = t.history(interval="1d", auto_adjust=False, actions=False, **span)
            if h is not None and not h.empty and "Close" in h:
                h = h.dropna(subset=["Close"])
                if len(h) >= 2:
                    return t, h
                last = ValueError("serie troppo corta")
            else:
                last = ValueError("nessun dato")
        except Exception as e:  # yfinance alza eccezioni diverse per limiti di richieste e simboli sbagliati
            last = e
        time.sleep(4 * (i + 1))
    raise last


def market_time(ts):
    try:
        if hasattr(ts, "timestamp"):
            return iso(dt.datetime.fromtimestamp(ts.timestamp(), UTC))
        if ts:
            return iso(dt.datetime.fromtimestamp(int(float(ts)), UTC))
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    return ""


def market_state(meta):
    """«aperta» o «chiusa» in questo momento, dagli orari della seduta che Yahoo manda insieme ai prezzi ("" se mancano)"""
    reg = ((meta or {}).get("currentTradingPeriod") or {}).get("regular") or {}

    def sec(x):
        if hasattr(x, "timestamp"):
            return x.timestamp()
        return float(x)

    try:
        start, end = sec(reg.get("start")), sec(reg.get("end"))
    except (TypeError, ValueError):
        return ""
    t = time.time()
    return "aperta" if start <= t < end else "chiusa"


def one_quote(yf, sym, name, key):
    t, h = history(yf, sym)
    closes = [float(c) for c in h["Close"].tolist()]
    dates = [d.strftime("%Y-%m-%d") for d in h.index]
    if len(closes) < 2:
        raise ValueError("serie troppo corta")
    meta = getattr(t, "history_metadata", None) or {}
    last, prev = closes[-1], closes[-2]
    at = market_time(meta.get("regularMarketTime"))
    item = {"sym": sym, "name": name, "last": num(last), "prev": num(prev), "date": dates[-1], "at": at,
            "currency": meta.get("currency") or "", "url": "https://finance.yahoo.com/quote/" + quote(sym, safe="")}
    # apertura della seduta (quella di oggi se la Borsa ha già aperto) e Borsa aperta o chiusa adesso
    if "Open" in h:
        op = num(h["Open"].iloc[-1])
        if op:
            item["open"] = op
    state = market_state(meta)
    if state:
        item["state"] = state

    def pct(n):
        return round((last / closes[-1 - n] - 1) * 100, 2) if len(closes) > n and closes[-1 - n] else None

    def pts(n):  # rendimenti: variazione in punti base
        return round((last - closes[-1 - n]) * 100, 1) if len(closes) > n else None

    if key == "tassi":
        item.update(bp=pts(1), bp1w=pts(5), bp1m=pts(21), bp3m=pts(63))
    else:
        item.update(chg=pct(1), chg1w=pct(5), chg1m=pct(21), chg3m=pct(63))
    sp = closes[-SPARK:]
    item.update(spark=[num(c, 5) for c in sp], sparkFrom=dates[-len(sp)], hi=num(max(sp)), lo=num(min(sp)))
    return item


OLD = {}  # i file del giro prima, per tenere il dato vecchio di uno strumento che oggi non risponde


def fetch_quotes():
    import yfinance as yf
    before = {it.get("sym"): it for g in ((OLD.get("quotes.json") or {}).get("groups") or []) for it in (g.get("items") or [])}
    groups, errors, total, good = [], [], 0, 0
    today = now().date().isoformat()
    for key, label, items in QUOTES:
        rows = []
        for sym, name in items:
            total += 1
            try:
                q = one_quote(yf, sym, name, key)
                old = before.get(sym)
                # di notte Yahoo a volte toglie per qualche ora l'ultima seduta delle Borse europee:
                # il dato non torna indietro, resta quello già salvato
                if old and q["date"] < (old.get("date") or "") <= today:
                    notice(f"{sym}: Yahoo dà la seduta del {q['date']}, resta quella del {old['date']}")
                    q = old
                rows.append(q)
                good += 1
            except Exception as e:
                errors.append(f"{sym}: {type(e).__name__}: {e}"[:200])
                if before.get(sym):
                    rows.append(dict(before[sym], stale=True))  # resta il dato di prima, con la sua data
            time.sleep(0.5)
        if rows:
            groups.append({"key": key, "label": label, "items": rows})
    if good < total / 2:
        raise RuntimeError(f"solo {good} strumenti su {total}. Primo errore: {errors[0] if errors else '-'}")
    return {"source": {"name": "Yahoo Finance", "via": "yfinance", "url": "https://finance.yahoo.com/"},
            "groups": groups, "errors": errors}


# ---------------------------------------------------------------- FRED (Fed di St. Louis)

# id (con | le alternative, la prima che risponde), nome, unità, trasformazione, frequenza (g, s, m)
FRED = [
    ("DFEDTARU", "Fed: tasso massimo della forchetta", "%", None, "g"),
    ("ECBDFR", "BCE: tasso sui depositi", "%", None, "g"),
    ("DGS2", "Treasury 2 anni", "%", None, "g"),
    ("DGS10", "Treasury 10 anni", "%", None, "g"),
    ("T10Y2Y", "Curva Usa: 10 anni meno 2 anni", "pp", None, "g"),
    ("T10YIE", "Inflazione attesa Usa a 10 anni", "%", None, "g"),
    ("DTWEXBGS", "Dollaro contro le altre valute (indice Fed)", "", None, "g"),
    ("CPIAUCSL", "Inflazione Usa", "%", "yoy", "m"),
    ("CPILFESL", "Inflazione Usa di fondo", "%", "yoy", "m"),
    ("PCEPILFE", "Pce di fondo, l'inflazione che guarda la Fed", "%", "yoy", "m"),
    ("UNRATE", "Disoccupazione Usa", "%", None, "m"),
    ("PAYEMS", "Posti di lavoro Usa, nuovi nel mese", "mila", "diff", "m"),
    ("ICSA", "Richieste di sussidio Usa, settimana", "mila", "k", "s"),
    ("CP0000EZ19M086NEST|CP0000EZ20M086NEST", "Inflazione eurozona", "%", "yoy", "m"),
]
FRED_START = {"g": 400, "s": 800, "m": 1600}   # giorni di storia da scaricare
FRED_SPARK = {"g": 130, "s": 52, "m": 24}      # punti del grafico
FRED_OLD = {"g": 15, "s": 30, "m": 200}        # oltre questi giorni la serie è ferma: non si mostra


def fred_csv(sid, start):
    r = get("https://fred.stlouisfed.org/graph/fredgraph.csv", {"id": sid, "cosd": start})
    rows = list(csv.reader(io.StringIO(r.text)))
    out = []
    for row in rows[1:]:
        if len(row) < 2:
            continue
        try:
            out.append((row[0], float(row[1])))
        except ValueError:  # "." o vuoto: nessun dato quel giorno
            pass
    if not out:
        raise ValueError("nessun dato")
    return out


def transform(obs, how):
    if how == "yoy":
        by = dict(obs)
        res = []
        for d, v in obs:
            p = by.get(f"{int(d[:4]) - 1}{d[4:]}")
            if p:
                res.append((d, (v / p - 1) * 100))
        return res
    if how == "diff":
        return [(obs[i][0], obs[i][1] - obs[i - 1][1]) for i in range(1, len(obs))]
    if how == "k":
        return [(d, v / 1000) for d, v in obs]
    return obs


def fetch_macro():
    series, errors = [], []
    today = dt.date.today()
    for ids, name, unit, how, freq in FRED:
        start = (today - dt.timedelta(days=FRED_START[freq])).isoformat()
        got = None
        for sid in ids.split("|"):
            try:
                obs = transform(fred_csv(sid, start), how)
                if len(obs) < 2:
                    raise ValueError("serie troppo corta")
                age = (today - dt.date.fromisoformat(obs[-1][0])).days
                if age > FRED_OLD[freq]:
                    raise ValueError(f"ultimo dato del {obs[-1][0]}, serie ferma")
                got = (sid, obs)
                break
            except Exception as e:
                errors.append(f"{sid}: {type(e).__name__}: {e}"[:200])
            time.sleep(0.3)
        if not got:
            continue
        sid, obs = got
        tail = obs[-FRED_SPARK[freq]:]
        series.append({"id": sid, "name": name, "unit": unit, "freq": freq,
                       "date": obs[-1][0], "last": num(obs[-1][1], 5), "prevDate": obs[-2][0], "prev": num(obs[-2][1], 5),
                       "spark": [num(v, 4) for _, v in tail], "sparkFrom": tail[0][0],
                       "url": "https://fred.stlouisfed.org/series/" + sid})
    if len(series) < len(FRED) / 2:
        raise RuntimeError(f"solo {len(series)} serie su {len(FRED)}. Primo errore: {errors[0] if errors else '-'}")
    return {"source": {"name": "FRED, Fed di St. Louis", "url": "https://fred.stlouisfed.org/"}, "series": series, "errors": errors}


# ---------------------------------------------------------------- SEC EDGAR

SEC_WATCH = [("AAPL", "Apple"), ("MSFT", "Microsoft"), ("NVDA", "Nvidia"), ("AMZN", "Amazon"), ("GOOGL", "Alphabet"),
             ("META", "Meta"), ("TSLA", "Tesla"), ("BRK-B", "Berkshire Hathaway"), ("JPM", "JPMorgan"), ("AVGO", "Broadcom"),
             ("LLY", "Eli Lilly"), ("V", "Visa"), ("XOM", "ExxonMobil"), ("GS", "Goldman Sachs"), ("BAC", "Bank of America"),
             ("WMT", "Walmart"), ("NFLX", "Netflix"), ("AMD", "AMD"), ("ORCL", "Oracle"), ("COST", "Costco")]
SEC_FORMS = {"8-K": "Evento da comunicare", "8-K/A": "Correzione di un evento comunicato",
             "10-Q": "Relazione trimestrale", "10-Q/A": "Correzione della relazione trimestrale",
             "10-K": "Relazione annuale", "10-K/A": "Correzione della relazione annuale"}
SEC_ITEMS = {"1.01": "accordo importante", "1.02": "fine di un accordo importante", "1.05": "incidente informatico",
             "2.01": "acquisizione o cessione conclusa", "2.02": "risultati del trimestre", "2.03": "nuovo debito",
             "2.04": "debito da rimborsare in anticipo", "2.05": "costi di ristrutturazione", "2.06": "svalutazioni",
             "3.01": "rischio di uscita dalla Borsa", "3.02": "vendita di azioni fuori mercato", "3.03": "cambio nei diritti degli azionisti",
             "4.01": "cambio di revisore", "4.02": "bilanci passati da correggere", "5.01": "cambio di controllo",
             "5.02": "cambi tra dirigenti o consiglieri", "5.03": "modifiche allo statuto", "5.05": "codice etico",
             "5.07": "voto degli azionisti", "5.08": "data dell'assemblea", "7.01": "comunicazione al mercato",
             "8.01": "altri eventi", "9.01": "bilanci e allegati"}
SEC_DAYS = 30


def sec_what(form, items):
    codes = [c.strip() for c in str(items or "").split(",") if c.strip()]
    if form.startswith("8-K"):
        named = [SEC_ITEMS.get(c, "punto " + c) for c in codes if c != "9.01"] or [SEC_ITEMS.get(c, c) for c in codes]
        if named:
            text = ", ".join(named)
            return text[:1].upper() + text[1:], codes
    return SEC_FORMS.get(form, form), codes


SEC_UAS = ["GERICO Terminal gerico@users.noreply.github.com", "GERICO gerico@users.noreply.github.com",
           "Mozilla/5.0 (compatible; GERICO/1.0; +https://gerico.financialnews.workers.dev) gerico@users.noreply.github.com"]
sec_ua = [None]


def sec_get(url):
    """La SEC rifiuta le richieste senza un User-Agent che dica chi è: si prova la forma che ha già funzionato, poi le altre."""
    tried = []
    for ua in ([sec_ua[0]] if sec_ua[0] else []) + [u for u in SEC_UAS if u != sec_ua[0]]:
        r = requests.get(url, headers={"User-Agent": ua, "Accept-Encoding": "gzip, deflate"}, timeout=30)
        if r.status_code == 200:
            if sec_ua[0] != ua:
                sec_ua[0] = ua
                notice(f"SEC: risponde con User-Agent «{ua}»")
            return r
        title = re.search(r"<title>(.*?)</title>", r.text or "", re.S | re.I)
        tried.append(f"{r.status_code} ({(title.group(1).strip() if title else (r.text or '')[:80]).strip()}, server {r.headers.get('server', '?')})")
        time.sleep(1)
    raise RuntimeError("SEC: " + "; ".join(tried))


def fetch_sec():
    # dai server di GitHub la SEC risponde spesso «Request Rate Threshold Exceeded»: il blocco è per indirizzo,
    # riprovare nello stesso giro non serve. Il file di prima resta e il Terminal dice da quando.
    tickers = sec_get("https://www.sec.gov/files/company_tickers.json").json()
    cik_of = {str(v.get("ticker", "")).upper(): int(v["cik_str"]) for v in tickers.values() if v.get("cik_str")}
    since = (dt.date.today() - dt.timedelta(days=SEC_DAYS)).isoformat()
    filings, errors, ok = [], [], 0
    for tk, name in SEC_WATCH:
        cik = cik_of.get(tk) or cik_of.get(tk.replace("-", "."))
        if not cik:
            errors.append(f"{tk}: CIK non trovato")
            continue
        try:
            rec = sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json").json()["filings"]["recent"]
            ok += 1
        except Exception as e:
            errors.append(f"{tk}: {type(e).__name__}: {e}"[:200])
            continue
        finally:
            time.sleep(0.15)  # la SEC chiede al massimo 10 richieste al secondo
        n = len(rec.get("form", []))
        for i in range(n):
            form, day = rec["form"][i], rec["filingDate"][i]
            if form not in SEC_FORMS or day < since:
                continue
            acc = rec["accessionNumber"][i]
            doc = (rec.get("primaryDocument") or [""] * n)[i]
            folder = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/"
            what, codes = sec_what(form, (rec.get("items") or [""] * n)[i])
            filings.append({"ticker": tk, "company": name, "form": form, "date": day,
                            "accepted": (rec.get("acceptanceDateTime") or [""] * n)[i], "report": (rec.get("reportDate") or [""] * n)[i],
                            "items": codes, "what": what, "url": folder + doc if doc else folder + acc + "-index.htm"})
    if ok < len(SEC_WATCH) / 2:
        raise RuntimeError(f"risposte solo per {ok} società su {len(SEC_WATCH)}. Primo errore: {errors[0] if errors else '-'}")
    filings.sort(key=lambda f: (f["date"], f["accepted"]), reverse=True)
    for f in filings:
        f.pop("accepted", None)
    return {"source": {"name": "SEC EDGAR", "url": "https://www.sec.gov/edgar/search/"}, "days": SEC_DAYS,
            "companies": [n for _, n in SEC_WATCH], "filings": filings[:40], "errors": errors}


# ---------------------------------------------------------------- notizie di Yahoo Finance e FinBERT

# simbolo, nome, parole che il titolo deve contenere per parlare davvero di quel mercato
SENTIMENT = [("^GSPC", "Borsa Usa", r"s&p|stocks?\b|wall street|dow\b|nasdaq|equit|market"),
             ("DX-Y.NYB", "Dollaro", r"dollar|greenback|\bdxy\b|\bfed\b|powell"),
             ("^TNX", "Treasury", r"treasur|yields?\b|bonds?\b|\bfed\b"),
             ("EURUSD=X", "EUR/USD", r"\beuro\b|eur/usd|eurusd|\becb\b|lagarde"),
             ("GBPUSD=X", "GBP/USD", r"pound|sterling|gbp|bank of england|\bboe\b"),
             ("USDJPY=X", "USD/JPY", r"\byen\b|jpy|bank of japan|\bboj\b"),
             ("GC=F", "Oro", r"gold|bullion|xau|precious"),
             ("CL=F", "Petrolio", r"\boil\b|crude|brent|wti|opec"),
             ("BTC-USD", "Bitcoin", r"bitcoin|\bbtc\b|crypto"),
             ("^STOXX50E", "Borse europee", r"europe|stoxx|\bdax\b|ftse|\bcac\b|\becb\b")]
MODEL = "ProsusAI/finbert"
NEWS_HOURS = 72


def parse_news(raw):
    """yfinance ha cambiato forma alle notizie più volte: legge quella nuova (content) e quella vecchia."""
    out = []
    for n in raw or []:
        c = n.get("content") if isinstance(n.get("content"), dict) else n
        title = (c.get("title") or "").strip()
        url = ((c.get("canonicalUrl") or {}).get("url") or (c.get("clickThroughUrl") or {}).get("url") or c.get("link") or "")
        who = (c.get("provider") or {}).get("displayName") or c.get("publisher") or ""
        at = c.get("pubDate") or c.get("displayTime") or ""
        if not at and c.get("providerPublishTime"):
            try:
                at = dt.datetime.fromtimestamp(int(c["providerPublishTime"]), UTC).isoformat()
            except (TypeError, ValueError, OverflowError):
                at = ""
        try:
            when = dt.datetime.fromisoformat(str(at).replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=UTC)
        except ValueError:
            continue
        if title and url.startswith("http"):
            out.append({"title": title, "publisher": who, "url": url, "when": when})
    return out


WIRE = re.compile(r"^[A-Z]{2}-[A-Z0-9-]+$")  # codici di agenzia come «BC-OILS»: non sono titoli


def publisher(url):
    host = urlparse(url).netloc.lower().removeprefix("www.")
    return "Yahoo Finance" if "yahoo." in host else host


def rss_news(sym):
    r = get("https://feeds.finance.yahoo.com/rss/2.0/headline", {"s": sym, "region": "US", "lang": "en-US"})
    out = []
    for it in ElementTree.fromstring(r.content).iter("item"):
        title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
        try:
            when = email.utils.parsedate_to_datetime(it.findtext("pubDate") or "")
        except (TypeError, ValueError):
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        if title and link.startswith("http"):
            out.append({"title": title, "publisher": (it.findtext("source") or "").strip(), "url": link, "when": when})
    return out


def fetch_sentiment():
    import torch
    import yfinance as yf
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    tok = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL)
    model.eval()
    names = {i: str(l).lower() for i, l in model.config.id2label.items()}

    def classify(texts):
        res = []
        for i in range(0, len(texts), 16):
            enc = tok(texts[i:i + 16], padding=True, truncation=True, max_length=96, return_tensors="pt")
            with torch.no_grad():
                probs = torch.softmax(model(**enc).logits, dim=-1).tolist()
            res.extend({names[j]: p for j, p in enumerate(row)} for row in probs)
        return res

    cutoff = dt.datetime.now(UTC) - dt.timedelta(hours=NEWS_HOURS)
    assets, errors = [], []
    found = []
    for sym, label, words in SENTIMENT:
        got, how = [], []
        try:
            t = yf.Ticker(sym)
            raw = t.get_news(count=20) if hasattr(t, "get_news") else t.news
            got = parse_news(raw)
            how.append(f"yfinance {len(raw or [])}/{len(got)}")
            if raw and not got:
                first = raw[0] if isinstance(raw[0], dict) else {}
                how.append("chiavi " + ",".join(list(first.keys())[:8]) + " / " + ",".join(list((first.get("content") or {}).keys())[:12]))
        except Exception as e:
            how.append(f"yfinance {type(e).__name__}: {str(e)[:80]}")
        time.sleep(0.5)
        if len(got) < 3:
            try:
                extra = rss_news(sym)
                how.append(f"rss {len(extra)}")
                got += extra
            except Exception as e:
                how.append(f"rss {type(e).__name__}: {str(e)[:80]}")
            time.sleep(0.5)
        found.append(f"{sym}: " + ", ".join(how))
        seen, news, off = set(), [], 0
        for n in sorted(got, key=lambda x: x["when"], reverse=True):
            key = n["url"].split("?")[0]
            if n["when"] < cutoff or key in seen or n["title"].lower() in seen or WIRE.match(n["title"]):
                continue
            # il feed di Yahoo mescola notizie generiche: conta solo quelle che parlano di questo mercato
            if not re.search(words, n["title"], re.I):
                off += 1
                continue
            if not n["publisher"]:
                n["publisher"] = publisher(n["url"])
            seen.update({key, n["title"].lower()})
            news.append(n)
        found[-1] += f", pertinenti {len(news)}, fuori tema {off}"
        if len(news) < 3:
            errors.append(f"{sym}: solo {len(news)} notizie pertinenti nelle ultime {NEWS_HOURS} ore")
            continue
        probs = classify([n["title"] for n in news])
        counts = {"positive": 0, "negative": 0, "neutral": 0}
        for n, p in zip(news, probs):
            lab = max(p, key=p.get)
            counts[lab] = counts.get(lab, 0) + 1
            n.update(label=lab, p=round(p[lab], 2), score=round(p.get("positive", 0) - p.get("negative", 0), 3))
        score = sum(n["score"] for n in news) / len(news)
        assets.append({"sym": sym, "name": label, "n": len(news), "pos": counts["positive"], "neg": counts["negative"],
                       "neu": counts["neutral"], "score": round(score, 3),
                       "news": [{"title": n["title"], "publisher": n["publisher"], "url": n["url"], "at": iso(n["when"]),
                                 "label": n["label"], "p": n["p"]} for n in news[:8]]})
    notice("Notizie trovate. " + " | ".join(found))
    if len(assets) < 3:
        raise RuntimeError(f"notizie solo per {len(assets)} mercati. Primo errore: {errors[0] if errors else '-'}")
    return {"source": {"name": "Yahoo Finance", "via": "yfinance", "url": "https://finance.yahoo.com/news/"},
            "model": {"name": "FinBERT", "id": MODEL, "url": "https://huggingface.co/" + MODEL},
            "hours": NEWS_HOURS, "assets": assets, "errors": errors}


# ---------------------------------------------------------------- Forex Factory (calendario economico)

# il feed pubblico della settimana in corso: titolo, valuta, data con il fuso di New York, impatto, previsione, precedente
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
FF_IMPACT = {"high": "alto", "medium": "medio", "low": "basso", "holiday": "festivo"}


def fetch_calendar():
    r = get(FF_URL)
    try:
        raw = r.json()
    except ValueError:
        # quando limita le richieste Forex Factory risponde con una pagina HTML invece che con il JSON
        raise RuntimeError(f"risposta non JSON (HTTP {r.status_code})")
    if not isinstance(raw, list):
        raise RuntimeError("risposta senza elenco di eventi")
    items = []
    for x in raw:
        if not isinstance(x, dict):
            continue
        try:
            when = dt.datetime.fromisoformat(str(x.get("date") or "")).astimezone(ROME)
        except ValueError:
            continue
        title = re.sub(r"\s+", " ", str(x.get("title") or "")).strip()
        if not title:
            continue
        items.append({"date": when.date().isoformat(), "time": when.strftime("%H:%M"),
                      "currency": str(x.get("country") or "").strip().upper()[:4], "title": title[:120],
                      "impact": FF_IMPACT.get(str(x.get("impact") or "").strip().lower(), "basso"),
                      "forecast": str(x.get("forecast") or "").strip()[:24],
                      "previous": str(x.get("previous") or "").strip()[:24]})
    if not items:
        raise RuntimeError("nessun evento leggibile")
    items.sort(key=lambda i: (i["date"], i["time"]))
    return {"source": {"name": "Forex Factory", "url": "https://www.forexfactory.com/calendar"},
            "tz": "Europe/Rome", "items": items}


# ---------------------------------------------------------------- avvio

PARTS = [("quotes", "quotes.json", fetch_quotes), ("macro", "macro.json", fetch_macro),
         ("sentiment", "sentiment.json", fetch_sentiment), ("sec", "sec.json", fetch_sec),
         ("calendario", "calendario.json", fetch_calendar)]


def summary(key, d):
    if key == "quotes":
        return f"{sum(len(g['items']) for g in d['groups'])} strumenti"
    if key == "macro":
        return f"{len(d['series'])} serie"
    if key == "sec":
        return f"{len(d['filings'])} documenti"
    if key == "calendario":
        return f"{len(d['items'])} eventi, {sum(1 for i in d['items'] if i['impact'] == 'alto')} ad alto impatto"
    return f"{len(d['assets'])} mercati, {sum(a['n'] for a in d['assets'])} titoli"


def main(out):
    only = {p.strip() for p in os.environ.get("FIN_ONLY", "").split(",") if p.strip()}
    os.makedirs(out, exist_ok=True)
    done = 0
    for key, fname, fn in PARTS:
        if only and key not in only:
            continue
        t0 = time.time()
        try:
            with open(os.path.join(out, fname), encoding="utf-8") as f:
                OLD[fname] = json.load(f)
        except (OSError, ValueError):
            OLD[fname] = None
        try:
            data = {"asOf": iso(now()), **fn()}
            save(out, fname, data)
            done += 1
            errs = data.get("errors") or []
            notice(f"{fname}: aggiornato in {time.time() - t0:.0f} s, {summary(key, data)}"
                   + (f". Mancano: {'; '.join(errs[:6])}" if errs else "."))
        except Exception as e:
            traceback.print_exc()
            keep_old(out, fname, f"{type(e).__name__}: {e}")
    if not done:
        sys.exit("Nessuna fonte ha risposto.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
