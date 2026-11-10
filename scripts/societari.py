#!/usr/bin/env python3
"""Trimestrali e cedole delle società della mappa del Terminal: quando escono i conti, cosa si aspetta il mercato,
quando si stacca la cedola.

Uso:
    python3 scripts/societari.py site/data

Scrive site/data/societari.json. Le società sono quelle degli indici della mappa (site/data/indici/<CODICE>.json):
tutte quelle del Ftse Mib e le più grandi delle altre Borse, quante ne dice QUANTE. Tre letture da Yahoo Finance,
con yfinance:
- il calendario delle trimestrali (quello di finance.yahoo.com/calendar/earnings), solo per queste società: giorno,
  prima dell'apertura o dopo la chiusura, utile per azione atteso e, per i conti usciti da pochi giorni, quello vero;
- il calendario di ogni società: le stime più basse e più alte dell'utile, i ricavi attesi, lo stacco della cedola e
  il pagamento; e la data della trimestrale, se il calendario sopra non risponde;
- la scheda delle società con una trimestrale in arrivo: se la data è ancora una stima di Yahoo e in che valuta sono
  i conti.
Se una lettura non va si usano le altre, e per le società che non hanno risposto restano gli appuntamenti già letti.
Se non va nessuna, il file resta com'era, con l'errore.

Campi di ogni voce: kind ("utili" | "cedola"), date (AAAA-MM-GG, giorno italiano), sym (Yahoo Finance), name, code
(codice della mappa), index. Per gli utili: when ("prima" dell'apertura, "dopo" la chiusura, "HH:MM" ora italiana o
""), period ("Q3 2026", "H1 2027"), eps (utile per azione atteso), lo e hi (le stime più basse e più alte), rev
(ricavi attesi), cur (valuta dei conti), stima (true: data stimata da Yahoo, non ancora confermata dalla società),
actual e surprise (utile vero e scarto in % sull'atteso) quando i conti sono usciti. Per le cedole: pay (pagamento)."""
import json
import math
import os
import re
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.stdout.reconfigure(line_buffering=True)
ROME = ZoneInfo("Europe/Rome")
FILE = "societari.json"
# quante società per indice, dalle più grandi; None = tutte
QUANTE = {"ITA": None, "USA": 50, "DEU": 15, "FRA": 15, "GBR": 15, "NLD": 8, "CHE": 8, "JPN": 10, "KOR": 5, "TWN": 5,
          "IND": 5, "CAN": 5, "BRA": 5}
INDIETRO = 3    # i conti usciti negli ultimi giorni restano, con il risultato
AVANTI = 28     # quanto avanti si guarda
VALUTE = {"USD", "EUR", "GBP", "CHF", "JPY", "KRW", "TWD", "INR", "CAD", "BRL", "CNY", "HKD", "DKK", "SEK", "NOK", "AUD"}


def notice(msg):
    print(f"::notice::societari: {msg}")


def warning(msg):
    print(f"::warning::societari: {msg}")


def carica(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def salva(path, dato):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dato, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def num(v):
    """Un numero vero (non NaN, non infinito) o None: Yahoo manda anche "nan", 0 per «non c'è» e testi."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def giorno(v):
    """Una data da quello che manda yfinance (date, datetime, Timestamp, testo ISO) -> date, o None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if hasattr(v, "to_pydatetime"):
        try:
            return v.to_pydatetime().date()
        except (ValueError, TypeError):
            return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(v).strip())
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


def istante(v):
    """L'ora dell'evento come datetime con fuso (UTC se non lo dice), o None."""
    if v is None:
        return None
    if hasattr(v, "to_pydatetime"):
        try:
            v = v.to_pydatetime()
        except (ValueError, TypeError):
            return None
    if not isinstance(v, datetime):
        try:
            v = datetime.fromisoformat(str(v).strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def nome_base(n):
    """Lo stesso gruppo quotato due volte (Shell a Londra e ad Amsterdam, Alphabet A e C, Petrobras ON e PN): una volta sola."""
    s = re.sub(r"[^a-z0-9 ]", " ", str(n).lower())
    parole = s.split()
    while len(parole) > 1 and parole[-1] in {"a", "b", "c", "on", "pn", "pna", "pnb", "unit", "units", "n", "reg", "class"}:
        parole.pop()
    return " ".join(parole)


def universo(cartella):
    """Le società da seguire, dagli elenchi degli indici della mappa: [{s, n, code, index}]."""
    out, visti = [], set()
    for code, quante in QUANTE.items():
        d = carica(os.path.join(cartella, "indici", code + ".json"))
        if not d or not isinstance(d.get("items"), list):
            continue
        its = [x for x in d["items"] if isinstance(x, dict) and x.get("s") and x.get("n")]
        its.sort(key=lambda x: -(num(x.get("w")) or 0))
        for x in its[: quante or len(its)]:
            k = nome_base(x["n"])
            if k in visti:
                continue
            visti.add(k)
            out.append({"s": str(x["s"]), "n": str(x["n"])[:60], "code": code, "index": str(d.get("index") or code)[:30]})
    return out


# ---------------------------------------------------------------- letture da Yahoo Finance

def in_parallelo(fn, lista, quanti=6):
    with ThreadPoolExecutor(max_workers=quanti) as ex:
        return list(ex.map(fn, lista))


def riprova(fn, volte=3):
    err = None
    for k in range(volte):
        try:
            return fn()
        except Exception as e:  # Yahoo a volte risponde male o limita: si riprova poco dopo
            err = e
            time.sleep(1.5 * (k + 1))
    raise err


def leggi_calendari(yf, simboli):
    """Il calendario di ogni società: {simbolo: dict}, e gli errori."""
    def uno(s):
        try:
            c = riprova(lambda: yf.Ticker(s).calendar)
            return s, (c if isinstance(c, dict) else {}), None
        except Exception as e:
            return s, None, f"{type(e).__name__}: {str(e)[:120]}"
    cal, err = {}, {}
    for s, c, e in in_parallelo(uno, simboli):
        if e:
            err[s] = e
        else:
            cal[s] = c
    return cal, err


def leggi_trimestrali(yf, simboli, da, a):
    """Il calendario delle trimestrali di Yahoo, solo per questi simboli: righe {Symbol, Event Start Date, Timing,
    EPS Estimate, Reported EPS, Surprise(%), Event Name}. yfinance non ha un modo pubblico per filtrare per titolo:
    si usa la sua richiesta interna, e se cambia si va avanti con i calendari delle società."""
    from yfinance.calendars import CalendarQuery
    cal = yf.Calendars(start=da.isoformat(), end=a.isoformat())
    righe = []
    for i in range(0, len(simboli), 60):
        q = CalendarQuery("and", [
            CalendarQuery("or", [CalendarQuery("eq", ["eventtype", "EAD"]), CalendarQuery("eq", ["eventtype", "ERA"])]),
            CalendarQuery("gte", ["startdatetime", da.isoformat()]),
            CalendarQuery("lte", ["startdatetime", a.isoformat()]),
            CalendarQuery("or", [CalendarQuery("eq", ["ticker", s]) for s in simboli[i:i + 60]]),
        ])
        df = riprova(lambda: cal._get_data("sp_earnings", q, limit=100, force=True))
        if df is not None and len(df):
            righe += df.reset_index().to_dict("records")
    return righe


def leggi_schede(yf, simboli):
    """Dalla scheda di ogni società: se la prossima trimestrale è una stima e la valuta dei conti."""
    def uno(s):
        try:
            i = riprova(lambda: yf.Ticker(s).info, volte=2) or {}
            return s, {k: i.get(k) for k in ("isEarningsDateEstimate", "earningsTimestampStart", "earningsTimestamp", "financialCurrency")}
        except Exception:
            return s, None
    return {s: v for s, v in in_parallelo(uno, simboli, quanti=4) if v}


# ---------------------------------------------------------------- composizione

def periodo(nome):
    """«Q3 2026 Earnings Announcement» -> «Q3 2026»; «H1 2027 ...» -> «H1 2027»; altrimenti ""."""
    m = re.match(r"^\s*(Q[1-4]|H[12]|FY)\s*(\d{4})\b", str(nome or ""))
    return f"{m[1]} {m[2]}" if m else ""


def quando(timing, t):
    """Prima dell'apertura, dopo la chiusura, un'ora vera (in ora italiana) o niente."""
    tm = str(timing or "").upper()
    if tm == "BMO":
        return "prima"
    if tm == "AMC":
        return "dopo"
    if tm == "TAS" and t:
        return t.astimezone(ROME).strftime("%H:%M")
    return ""


def tondo(x, cifre=4):
    return None if x is None else float(f"{x:.{cifre}g}")


def componi(uni, cal, righe, schede, oggi, vecchio=None, cal_err=(), trim_ok=True):
    """Le voci del calendario, dalle tre letture. vecchio: il file di prima, per le società che non hanno risposto."""
    per_s = {u["s"]: u for u in uni}
    da, a = oggi - timedelta(days=INDIETRO), oggi + timedelta(days=AVANTI)
    voci, utili_di = [], {}

    def base(u, kind, d):
        return {"kind": kind, "date": d.isoformat(), "sym": u["s"], "name": u["n"], "code": u["code"], "index": u["index"]}

    # 1. le trimestrali dal calendario di Yahoo
    for r in righe:
        u = per_s.get(str(r.get("Symbol") or ""))
        if not u:
            continue
        timing = str(r.get("Timing") or "").upper()
        t = istante(r.get("Event Start Date"))
        if not t:
            continue
        # senza un'ora vera (TNS) l'ora del calendario è finta: conta solo il giorno che dice Yahoo
        d = t.date() if timing not in ("BMO", "AMC", "TAS") else t.astimezone(ROME).date()
        if not da <= d <= a or u["s"] in utili_di:
            continue
        v = base(u, "utili", d)
        v.update({"when": quando(timing, t), "period": periodo(r.get("Event Name"))})
        eps, act, sur = num(r.get("EPS Estimate")), num(r.get("Reported EPS")), num(r.get("Surprise(%)"))
        if eps is not None:
            v["eps"] = tondo(eps)
        if act is not None and d <= oggi:
            v["actual"] = tondo(act)
            if sur is not None:
                v["surprise"] = round(sur, 1)
        utili_di[u["s"]] = v
        voci.append(v)

    # 2. dal calendario di ogni società: stime, ricavi, cedole; la trimestrale se il calendario sopra non l'aveva
    for u in uni:
        c = cal.get(u["s"])
        if c is None:
            continue
        date_utili = [x for x in (giorno(e) for e in (c.get("Earnings Date") or [])) if x]
        lo, hi, avg, rev = (num(c.get(k)) for k in ("Earnings Low", "Earnings High", "Earnings Average", "Revenue Average"))
        v = utili_di.get(u["s"])
        prossima = min(date_utili) if date_utili else None
        if v is None and not trim_ok and prossima and oggi <= prossima <= a:
            v = base(u, "utili", prossima)
            v.update({"when": "", "period": ""})
            if len(date_utili) > 1:  # un intervallo di giorni: la società non ha ancora detto quale
                v["stima"] = True
            utili_di[u["s"]] = v
            voci.append(v)
        # le stime del calendario sono della prossima trimestrale: valgono solo se è la stessa
        if v is not None and prossima and abs((prossima - date.fromisoformat(v["date"])).days) <= 3 and "actual" not in v:
            if "eps" not in v and avg is not None:
                v["eps"] = tondo(avg)
            if lo is not None and hi is not None and lo < hi:
                v["lo"], v["hi"] = tondo(lo), tondo(hi)
            if rev is not None and rev > 0:
                v["rev"] = tondo(rev, 3)
        ex, pay = giorno(c.get("Ex-Dividend Date")), giorno(c.get("Dividend Date"))
        if ex and oggi <= ex <= a:
            w = base(u, "cedola", ex)
            if pay and ex <= pay <= ex + timedelta(days=90):
                w["pay"] = pay.isoformat()
            voci.append(w)

    # 3. dalla scheda: data ancora da confermare e valuta dei conti
    for s, v in utili_di.items():
        sc = schede.get(s) or {}
        cur = str(sc.get("financialCurrency") or "").upper()
        if cur in VALUTE:
            v["cur"] = cur
        ts = num(sc.get("earningsTimestampStart")) or num(sc.get("earningsTimestamp"))
        if ts and isinstance(sc.get("isEarningsDateEstimate"), bool) and "actual" not in v:
            d = datetime.fromtimestamp(ts, timezone.utc).date()
            if abs((d - date.fromisoformat(v["date"])).days) <= 1:
                if sc["isEarningsDateEstimate"]:
                    v["stima"] = True
                else:
                    v.pop("stima", None)

    # 4. le società che non hanno risposto: restano gli appuntamenti già letti, se sono ancora nel periodo
    if vecchio and isinstance(vecchio.get("items"), list):
        mancano = set(cal_err) | ({u["s"] for u in uni} if not trim_ok else set())
        presenti = {(v["kind"], v["sym"]) for v in voci}
        for o in vecchio["items"]:
            if not isinstance(o, dict) or o.get("sym") not in mancano or (o.get("kind"), o.get("sym")) in presenti:
                continue
            d = giorno(o.get("date"))
            if d and (oggi <= d <= a if o.get("kind") == "cedola" else da <= d <= a) and o.get("sym") in per_s:
                voci.append(o)
                presenti.add((o.get("kind"), o.get("sym")))

    voci.sort(key=lambda v: (v["date"], v["kind"] != "utili", v["code"] != "ITA", v["name"]))
    return voci


def main(cartella):
    t0 = time.time()
    oggi = datetime.now(ROME).date()
    path = os.path.join(cartella, FILE)
    vecchio = carica(path)
    uni = universo(cartella)
    if not uni:
        warning("nessun elenco degli indici della mappa: il file resta com'era")
        return
    import yfinance as yf
    simboli = [u["s"] for u in uni]
    errori = []
    cal, cal_err = leggi_calendari(yf, simboli)
    if cal_err:
        errori.append(f"calendario di {len(cal_err)} società su {len(simboli)}")
    try:
        righe, trim_ok = leggi_trimestrali(yf, simboli, oggi - timedelta(days=INDIETRO), oggi + timedelta(days=AVANTI)), True
    except Exception as e:
        traceback.print_exc()
        righe, trim_ok = [], False
        errori.append(f"calendario delle trimestrali: {type(e).__name__}: {str(e)[:120]}")
    if not cal and not trim_ok:
        warning("Yahoo non ha risposto: il file resta com'era. " + "; ".join(errori))
        if vecchio:
            vecchio["lastError"] = {"at": datetime.now(ROME).isoformat(timespec="seconds"), "message": "; ".join(errori)[:300]}
            salva(path, vecchio)
        return
    # la scheda solo per le società con una trimestrale nel periodo (poche): stima o data confermata, valuta dei conti
    prima = componi(uni, cal, righe, {}, oggi, None, cal_err, trim_ok)
    con_utili = sorted({v["sym"] for v in prima if v["kind"] == "utili"})[:90]
    schede = leggi_schede(yf, con_utili)
    voci = componi(uni, cal, righe, schede, oggi, vecchio, cal_err, trim_ok)
    out = {"asOf": datetime.now(ROME).isoformat(timespec="seconds"),
           "source": {"name": "Yahoo Finance", "url": "https://finance.yahoo.com/calendar/earnings"},
           "from": (oggi - timedelta(days=INDIETRO)).isoformat(), "to": (oggi + timedelta(days=AVANTI)).isoformat(),
           "universe": len(uni), "items": voci}
    if errori:
        out["errors"] = errori
    salva(path, out)
    n_u = sum(1 for v in voci if v["kind"] == "utili")
    notice(f"{n_u} trimestrali ({sum(1 for v in voci if 'actual' in v)} già uscite, {sum(1 for v in voci if v.get('stima'))} con la data stimata), "
           f"{len(voci) - n_u} cedole, su {len(uni)} società, in {time.time() - t0:.0f} s"
           + (f". Mancano: {'; '.join(errori)}" if errori else "."))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
