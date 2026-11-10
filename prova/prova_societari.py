"""Prova (solo su questo ramo): com'è fatta la risposta di Yahoo per il calendario delle società."""
import json, os, sys, time, traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
import yfinance as yf

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
log = open(os.path.join(OUT, "riassunto.txt"), "w")
def say(*a):
    s = " ".join(str(x) for x in a); print(s); log.write(s + "\n"); log.flush()
say("yfinance", yf.__version__)
QUOTA = {"ITA": None, "USA": 50, "DEU": 15, "FRA": 15, "GBR": 15, "NLD": 8, "CHE": 8, "JPN": 10, "KOR": 5, "TWN": 5, "IND": 5, "CAN": 5, "BRA": 5}
uni = []
for code, n in QUOTA.items():
    d = json.load(open(f"site/data/indici/{code}.json"))
    its = sorted(d["items"], key=lambda x: -(x.get("w") or 0))
    for it in its[: n or len(its)]:
        uni.append({"code": code, "s": it["s"], "n": it["n"], "w": it.get("w")})
say("universo", len(uni))

def conv(v):
    if isinstance(v, (date, datetime)): return v.isoformat()
    if isinstance(v, (list, tuple)): return [conv(x) for x in v]
    if hasattr(v, "item"):
        try: return v.item()
        except Exception: pass
    return v if isinstance(v, (int, float, str, bool, type(None))) else repr(v)

raw = {"calendar": {}, "errors": {}, "info": {}, "vis_public": None, "vis_custom": None}
t0 = time.time()
def one(sym):
    last = None
    for k in range(3):
        try:
            c = yf.Ticker(sym).calendar
            return sym, {kk: conv(vv) for kk, vv in (c or {}).items()}, None
        except Exception as e:
            last = e; time.sleep(2 * (k + 1))
    return sym, None, f"{type(last).__name__}: {last}"
with ThreadPoolExecutor(max_workers=6) as ex:
    for sym, cal, err in ex.map(one, [u["s"] for u in uni]):
        if err: raw["errors"][sym] = err
        else: raw["calendar"][sym] = cal
say(f"calendari: {len(raw['calendar'])} letti, {len(raw['errors'])} errori, in {time.time() - t0:.0f} s")
for sym in list(raw["errors"])[:5]: say("  errore", sym, raw["errors"][sym][:200])
today = date.today()
soon = []
for u in uni:
    c = raw["calendar"].get(u["s"]) or {}
    ed = c.get("Earnings Date") or []
    ex_ = c.get("Ex-Dividend Date")
    if any(today.isoformat() <= x <= (today + timedelta(days=28)).isoformat() for x in ed) or (ex_ and today.isoformat() <= ex_ <= (today + timedelta(days=28)).isoformat()):
        soon.append(u["s"])
        say("  ", u["code"], u["s"], u["n"][:28], "| utili", ed, "eps", c.get("Earnings Average"), "ricavi", c.get("Revenue Average"), "| cedola", ex_, "pag.", c.get("Dividend Date"))
say("con appuntamenti nei prossimi 28 giorni:", len(soon))
say("chiavi viste:", sorted({k for c in raw["calendar"].values() for k in c}))

# valuta dei conti (info) per qualche titolo di Borse diverse
for sym in ["HSBA.L", "SHEL.L", "ROG.SW", "NESN.SW", "ASML.AS", "7203.T", "005930.KS", "2330.TW", "RELIANCE.NS", "RY.TO", "PETR4.SA", "AAPL", "ENI.MI", "SAP.DE"]:
    try:
        i = yf.Ticker(sym).info
        raw["info"][sym] = {k: conv(i.get(k)) for k in ("currency", "financialCurrency", "shortName", "longName", "exchange", "earningsTimestamp", "earningsTimestampStart", "earningsTimestampEnd", "isEarningsDateEstimate", "earningsCallTimestampStart", "dividendRate", "dividendYield", "lastDividendValue", "exDividendDate")}
        say("info", sym, json.dumps(raw["info"][sym], ensure_ascii=False)[:400])
    except Exception as e:
        say("info", sym, "ERRORE", type(e).__name__, str(e)[:200])

# calendario «visualization» pubblico (senza filtro per titolo)
try:
    cal = yf.Calendars(start=today.isoformat(), end=(today + timedelta(days=14)).isoformat())
    df = cal.get_earnings_calendar(filter_most_active=False, limit=100)
    rows = df.reset_index().astype(str).to_dict("records")
    raw["vis_public"] = rows
    say("visualization pubblico:", len(rows), "righe; colonne", list(df.reset_index().columns))
    for r in rows[:25]: say("  ", json.dumps(r, ensure_ascii=False)[:300])
    sfx = {}
    for r in rows:
        s = r.get("Symbol", ""); k = s.split(".")[-1] if "." in s else "US"; sfx[k] = sfx.get(k, 0) + 1
    say("  suffissi:", sfx)
except Exception as e:
    say("visualization pubblico ERRORE", type(e).__name__, str(e)[:300]); traceback.print_exc()

# calendario «visualization» con l'elenco dei titoli (metodo interno di yfinance)
try:
    from yfinance.calendars import CalendarQuery
    cal = yf.Calendars(start=(today - timedelta(days=3)).isoformat(), end=(today + timedelta(days=28)).isoformat())
    allrows = []
    syms = [u["s"] for u in uni]
    for i in range(0, len(syms), 60):
        q = CalendarQuery("and", [
            CalendarQuery("or", [CalendarQuery("eq", ["eventtype", "EAD"]), CalendarQuery("eq", ["eventtype", "ERA"])]),
            CalendarQuery("gte", ["startdatetime", (today - timedelta(days=3)).isoformat()]),
            CalendarQuery("lte", ["startdatetime", (today + timedelta(days=28)).isoformat()]),
            CalendarQuery("or", [CalendarQuery("eq", ["ticker", s]) for s in syms[i:i + 60]]),
        ])
        df = cal._get_data("sp_earnings", q, limit=100, force=True)
        rows = df.reset_index().astype(str).to_dict("records") if df is not None and len(df) else []
        say(f"visualization con titoli {i}-{i + 60}: {len(rows)} righe")
        allrows += rows
    raw["vis_custom"] = allrows
    for r in allrows[:40]: say("  ", json.dumps(r, ensure_ascii=False)[:300])
except Exception as e:
    say("visualization con titoli ERRORE", type(e).__name__, str(e)[:300]); traceback.print_exc()

json.dump(raw, open(os.path.join(OUT, "grezzo.json"), "w"), ensure_ascii=False, indent=1, default=str)
say("fine in", round(time.time() - t0), "s")
