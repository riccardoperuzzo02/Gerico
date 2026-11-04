#!/usr/bin/env python3
"""Screener dei «Titoli da seguire»: segnali di brevissimo periodo sui prezzi di titoli liquidi.

Uso:
    python3 scripts/screener.py screener

Gira nel job «Dati del Terminal», senza crediti Claude. Scarica un anno di prezzi giornalieri (yfinance)
per Ftse Mib, Euro Stoxx 50 e S&P 100, calcola alcuni segnali e scrive screener/candidati.json con i
15 titoli dal punteggio più alto. Il file sta fuori da site/: non è pubblico.
Lo legge l'attività programmata «GERICO titoli da seguire», che cerca la notizia dietro il segnale e
decide se pubblicare. Questo script non sceglie e non consiglia niente: misura.

Segnali (ognuno con il suo peso nel punteggio):
- rottura: chiusura sopra il massimo delle 20 sedute prima, con volumi almeno 1,5 volte la media (+2);
- salto e tenuta: nelle ultime 5 sedute un'apertura almeno il 3% sopra la chiusura prima, con volumi
  almeno doppi, e il prezzo ancora sopra l'apertura di quel giorno (+2);
- forza relativa: nelle ultime 20 sedute almeno 5 punti meglio del suo indice (+1);
- ritracciamento in trend: RSI a 2 periodi sotto 10 con il prezzo sopra la media a 200 sedute
  e la media a 50 sopra quella a 200 (+1,5);
- trend: prezzo sopra la media a 50 e la media a 50 sopra quella a 200 (+0,5); sotto la media a 200 (-1).
Esclusi: scambi medi sotto 5 milioni al giorno, salto oltre il 15% nell'ultima seduta, dati fermi."""
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")

MILANO = [
    ("A2A.MI", "A2A"), ("AMP.MI", "Amplifon"), ("AZM.MI", "Azimut"), ("BAMI.MI", "Banco BPM"), ("BMED.MI", "Banca Mediolanum"),
    ("BMPS.MI", "Monte dei Paschi"), ("BPE.MI", "Bper Banca"), ("BC.MI", "Brunello Cucinelli"), ("BZU.MI", "Buzzi"), ("CPR.MI", "Campari"),
    ("DIA.MI", "DiaSorin"), ("ENEL.MI", "Enel"), ("ENI.MI", "Eni"), ("ERG.MI", "Erg"), ("RACE.MI", "Ferrari"), ("FBK.MI", "FinecoBank"),
    ("G.MI", "Generali"), ("HER.MI", "Hera"), ("IP.MI", "Interpump"), ("ISP.MI", "Intesa Sanpaolo"), ("INW.MI", "Inwit"),
    ("LDO.MI", "Leonardo"), ("LTMC.MI", "Lottomatica"), ("MB.MI", "Mediobanca"), ("MONC.MI", "Moncler"), ("NEXI.MI", "Nexi"),
    ("PIRC.MI", "Pirelli"), ("PST.MI", "Poste Italiane"), ("PRY.MI", "Prysmian"), ("REC.MI", "Recordati"), ("SPM.MI", "Saipem"),
    ("SRG.MI", "Snam"), ("STLAM.MI", "Stellantis"), ("STMMI.MI", "STMicroelectronics"), ("TEN.MI", "Tenaris"), ("TRN.MI", "Terna"),
    ("TIT.MI", "Telecom Italia"), ("UCG.MI", "UniCredit"), ("UNI.MI", "Unipol"), ("BGN.MI", "Banca Generali"), ("AVIO.MI", "Avio"),
    ("FCT.MI", "Fincantieri"),
]
EUROPA = [
    ("ADS.DE", "Adidas"), ("ADYEN.AS", "Adyen"), ("AD.AS", "Ahold Delhaize"), ("AI.PA", "Air Liquide"), ("AIR.PA", "Airbus"),
    ("ALV.DE", "Allianz"), ("ABI.BR", "AB InBev"), ("ASML.AS", "ASML"), ("CS.PA", "Axa"), ("BAS.DE", "Basf"), ("BAYN.DE", "Bayer"),
    ("BBVA.MC", "Bbva"), ("SAN.MC", "Banco Santander"), ("BMW.DE", "Bmw"), ("BNP.PA", "Bnp Paribas"), ("BN.PA", "Danone"),
    ("DB1.DE", "Deutsche Börse"), ("DBK.DE", "Deutsche Bank"), ("DHL.DE", "Dhl"), ("DTE.DE", "Deutsche Telekom"), ("EL.PA", "EssilorLuxottica"),
    ("FER.MC", "Ferrovial"), ("IBE.MC", "Iberdrola"), ("ITX.MC", "Inditex"), ("IFX.DE", "Infineon"), ("INGA.AS", "Ing"),
    ("KER.PA", "Kering"), ("OR.PA", "L'Oréal"), ("MC.PA", "Lvmh"), ("MBG.DE", "Mercedes-Benz"), ("MUV2.DE", "Munich Re"),
    ("NOKIA.HE", "Nokia"), ("NDA-FI.HE", "Nordea"), ("PRX.AS", "Prosus"), ("RMS.PA", "Hermès"), ("RHM.DE", "Rheinmetall"),
    ("SAF.PA", "Safran"), ("SAN.PA", "Sanofi"), ("SAP.DE", "Sap"), ("SU.PA", "Schneider Electric"), ("SIE.DE", "Siemens"),
    ("ENR.DE", "Siemens Energy"), ("TTE.PA", "TotalEnergies"), ("DG.PA", "Vinci"), ("VOW3.DE", "Volkswagen"), ("WKL.AS", "Wolters Kluwer"),
    ("ARGX.BR", "Argenx"), ("UMG.AS", "Universal Music"),
]
USA = [
    ("AAPL", "Apple"), ("ABBV", "AbbVie"), ("ABT", "Abbott"), ("ACN", "Accenture"), ("ADBE", "Adobe"), ("AIG", "Aig"), ("AMD", "Amd"),
    ("AMGN", "Amgen"), ("AMT", "American Tower"), ("AMZN", "Amazon"), ("AVGO", "Broadcom"), ("AXP", "American Express"), ("BA", "Boeing"),
    ("BAC", "Bank of America"), ("BK", "BNY"), ("BKNG", "Booking"), ("BLK", "BlackRock"), ("BMY", "Bristol Myers"), ("BRK-B", "Berkshire Hathaway"),
    ("C", "Citigroup"), ("CAT", "Caterpillar"), ("CL", "Colgate"), ("CMCSA", "Comcast"), ("COF", "Capital One"), ("COP", "ConocoPhillips"),
    ("COST", "Costco"), ("CRM", "Salesforce"), ("CSCO", "Cisco"), ("CVS", "Cvs Health"), ("CVX", "Chevron"), ("DE", "Deere"),
    ("DHR", "Danaher"), ("DIS", "Disney"), ("DUK", "Duke Energy"), ("EMR", "Emerson"), ("F", "Ford"), ("FDX", "FedEx"), ("GD", "General Dynamics"),
    ("GE", "GE Aerospace"), ("GILD", "Gilead"), ("GM", "General Motors"), ("GOOGL", "Alphabet"), ("GS", "Goldman Sachs"), ("HD", "Home Depot"),
    ("HON", "Honeywell"), ("IBM", "Ibm"), ("INTC", "Intel"), ("INTU", "Intuit"), ("ISRG", "Intuitive Surgical"), ("JNJ", "Johnson & Johnson"),
    ("JPM", "JPMorgan"), ("KO", "Coca-Cola"), ("LIN", "Linde"), ("LLY", "Eli Lilly"), ("LMT", "Lockheed Martin"), ("LOW", "Lowe's"),
    ("MA", "Mastercard"), ("MCD", "McDonald's"), ("MDLZ", "Mondelez"), ("MDT", "Medtronic"), ("MET", "MetLife"), ("META", "Meta"),
    ("MMM", "3M"), ("MO", "Altria"), ("MRK", "Merck"), ("MS", "Morgan Stanley"), ("MSFT", "Microsoft"), ("NEE", "NextEra"), ("NFLX", "Netflix"),
    ("NKE", "Nike"), ("NOW", "ServiceNow"), ("NVDA", "Nvidia"), ("ORCL", "Oracle"), ("PEP", "PepsiCo"), ("PFE", "Pfizer"), ("PG", "Procter & Gamble"),
    ("PLTR", "Palantir"), ("PM", "Philip Morris"), ("PYPL", "PayPal"), ("QCOM", "Qualcomm"), ("RTX", "Rtx"), ("SBUX", "Starbucks"),
    ("SCHW", "Charles Schwab"), ("SO", "Southern Company"), ("SPG", "Simon Property"), ("T", "AT&T"), ("TGT", "Target"), ("TMO", "Thermo Fisher"),
    ("TMUS", "T-Mobile US"), ("TSLA", "Tesla"), ("TXN", "Texas Instruments"), ("UBER", "Uber"), ("UNH", "UnitedHealth"), ("UNP", "Union Pacific"),
    ("UPS", "Ups"), ("USB", "U.S. Bancorp"), ("V", "Visa"), ("VZ", "Verizon"), ("WFC", "Wells Fargo"), ("WMT", "Walmart"), ("XOM", "Exxon Mobil"),
]
MARKETS = {"Milano": (MILANO, "FTSEMIB.MI", "€"), "Europa": (EUROPA, "^STOXX50E", "€"), "Usa": (USA, "^GSPC", "$")}


MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]


def it(x, d=1):
    return f"{x:.{d}f}".replace(".", ",")


def giorno(ts):
    d = ts.date() if hasattr(ts, "date") and callable(ts.date) else ts
    return f"{d.day} {MESI[d.month - 1]}"


def frame(data, sym):
    """Le colonne di un titolo dal risultato di yf.download, senza righe vuote."""
    try:
        df = data[sym] if sym in data.columns.get_level_values(0) else None
    except (KeyError, AttributeError):
        df = None
    if df is None or df.empty:
        return None
    df = df.dropna(subset=["Close"])
    return df if len(df) >= 30 else None


def rsi2(close):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=0.5, adjust=False).mean()
    down = (-d.clip(upper=0)).ewm(alpha=0.5, adjust=False).mean()
    rs = up / down.replace(0, float("nan"))
    return float((100 - 100 / (1 + rs)).fillna(100).iloc[-1])


def signals(df, bench_ret20):
    c, h, o, v = df["Close"], df["High"], df["Open"], df["Volume"].fillna(0)
    n = len(c)
    last, prev = float(c.iloc[-1]), float(c.iloc[-2])
    out = {"last": last, "chg": (last / prev - 1) * 100 if prev else None, "date": str(c.index[-1].date())}
    vavg = float(v.iloc[-21:-1].mean()) if n >= 21 else 0.0
    out["adv"] = float((c.iloc[-20:] * v.iloc[-20:]).mean()) / 1e6
    out["vratio"] = float(v.iloc[-1]) / vavg if vavg else None
    out["ret5"] = (last / float(c.iloc[-6]) - 1) * 100 if n >= 6 else None
    out["ret20"] = (last / float(c.iloc[-21]) - 1) * 100 if n >= 21 else None
    out["rs20"] = out["ret20"] - bench_ret20 if out["ret20"] is not None and bench_ret20 is not None else None
    sma50 = float(c.iloc[-50:].mean()) if n >= 50 else None
    sma200 = float(c.iloc[-200:].mean()) if n >= 200 else None
    out["sma50"], out["sma200"] = sma50, sma200
    out["rsi2"] = rsi2(c)
    sig, score = [], 0.0
    hh20 = float(h.iloc[-21:-1].max()) if n >= 21 else None
    if hh20 and last > hh20 and out["vratio"] and out["vratio"] >= 1.5:
        sig.append({"key": "rottura", "text": "Chiude sopra il massimo delle 20 sedute prima, con volumi " + it(out["vratio"]) + " volte la media"})
        score += 2
    for i in range(max(1, n - 5), n):
        gap = float(o.iloc[i]) / float(c.iloc[i - 1]) - 1
        va = float(v.iloc[max(0, i - 20):i].mean()) if i > 1 else 0
        if gap >= 0.03 and va and float(v.iloc[i]) >= 2 * va and last >= float(o.iloc[i]):
            sig.append({"key": "salto", "text": "Il " + giorno(c.index[i]) + " ha aperto " + it(gap * 100) + "% sopra la chiusura prima, con volumi " +
                        it(float(v.iloc[i]) / va) + " volte la media, e il prezzo tiene sopra l'apertura di quel giorno"})
            score += 2
            break
    if out["rs20"] is not None and out["rs20"] >= 5:
        sig.append({"key": "forza", "text": "Nelle ultime 20 sedute ha fatto " + it(out["rs20"]) + " punti meglio del suo indice"})
        score += 1
    if sma50 and sma200 and out["rsi2"] < 10 and last > sma200 and sma50 > sma200:
        sig.append({"key": "ritracciamento", "text": "In trend rialzista (sopra la media a 200 sedute) dopo un calo di pochi giorni: RSI a 2 periodi " + it(out["rsi2"], 0)})
        score += 1.5
    if sma50 and sma200:
        if last > sma50 > sma200:
            score += 0.5
        elif last < sma200:
            score -= 1
    out["signals"], out["score"] = sig, round(score, 2)
    return out


def earnings_soon(yf, sym, today):
    """Trimestrale nei prossimi 3 giorni? (dal calendario di Yahoo; se non risponde, non si sa)"""
    try:
        cal = yf.Ticker(sym).calendar or {}
        dates = cal.get("Earnings Date") or []
        if not isinstance(dates, (list, tuple)):
            dates = [dates]
        for d in dates:
            if hasattr(d, "date") and callable(d.date):
                d = d.date()
            if today <= d <= today + timedelta(days=3):
                return str(d)
    except Exception:
        return None
    return None


def older_than_saved(path, dates):
    """I mercati per cui i dati appena letti sono più vecchi di quelli nel file già salvato."""
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        return []
    saved = dict(old.get("dates") or {})
    if not saved:  # file di prima della versione con «dates»: le date dei candidati
        for c in old.get("candidates") or []:
            if c.get("market") and c.get("date"):
                saved[c["market"]] = max(saved.get(c["market"], c["date"]), c["date"])
    today = datetime.now(ROME).date().isoformat()
    return [f"{m} {d} invece di {saved[m]}" for m, d in sorted(dates.items())
            if saved.get(m) and d < saved[m] <= today]


def main(outdir):
    import yfinance as yf
    t0 = time.time()
    now = datetime.now(ROME)
    syms, meta = [], {}
    for market, (lst, bench, cur) in MARKETS.items():
        for sym, name in lst:
            if sym not in meta:
                meta[sym] = {"name": name, "market": market, "bench": bench, "cur": cur}
                syms.append(sym)
    benches = sorted({b for _, b, _ in MARKETS.values()})
    # date di inizio e fine invece di period="1y": con period Yahoo risponde da una copia in cache
    # che al mattino può non avere ancora l'ultima seduta europea
    start = (now - timedelta(days=380)).date().isoformat()
    end = (now + timedelta(days=2)).date().isoformat()
    data = yf.download(syms + benches, start=start, end=end, interval="1d", group_by="ticker", auto_adjust=True,
                       threads=True, progress=False)
    bret = {}
    for b in benches:
        df = frame(data, b)
        bret[b] = (float(df["Close"].iloc[-1]) / float(df["Close"].iloc[-21]) - 1) * 100 if df is not None and len(df) >= 21 else None
    rows, latest = [], None
    for sym in syms:
        df = frame(data, sym)
        if df is None:
            continue
        m = meta[sym]
        try:
            s = signals(df, bret.get(m["bench"]))
        except Exception as e:  # un titolo con dati strani non ferma gli altri
            print(f"::warning::screener: {sym}: {type(e).__name__}: {e}")
            continue
        s.update({"sym": sym, "name": m["name"], "market": m["market"], "currency": m["cur"]})
        rows.append(s)
        latest = max(latest or s["date"], s["date"])
    fresh = [r for r in rows if r["date"] >= str((datetime.fromisoformat(latest) - timedelta(days=4)).date())] if latest else []
    ok = [r for r in fresh if r["adv"] >= 5 and (r["chg"] is None or r["chg"] <= 15) and r["signals"]]
    ok.sort(key=lambda r: (r["score"], r["rs20"] or 0), reverse=True)
    top = [r for r in ok if r["score"] >= 2][:15]
    today = now.date()
    for r in top:
        r["earningsSoon"] = earnings_soon(yf, r["sym"], today)
        for k in ("last", "chg", "adv", "vratio", "ret5", "ret20", "rs20", "sma50", "sma200", "rsi2"):
            if isinstance(r.get(k), float):
                r[k] = None if math.isnan(r[k]) else round(r[k], 4 if k == "last" else 2)
    dates = {}  # l'ultima seduta letta per ogni mercato
    for r in rows:
        dates[r["market"]] = max(dates.get(r["market"], r["date"]), r["date"])
    out = {"asOf": now.isoformat(timespec="seconds"), "dataDate": latest, "dates": dates, "universe": len(syms),
           "scanned": len(rows), "withSignal": len(ok),
           "benchmarks": {b: (round(v, 2) if v is not None else None) for b, v in bret.items()},
           "method": "screener v1: rottura, salto e tenuta, forza relativa, ritracciamento in trend (vedi scripts/screener.py)",
           "candidates": top}
    path = os.path.join(outdir, "candidati.json")
    back = older_than_saved(path, dates)
    if back:
        # di notte Yahoo a volte toglie per qualche ora l'ultima seduta: resta il file con i dati più recenti
        print("::notice::screener: Yahoo dà sedute più vecchie di quelle già salvate (" + "; ".join(back) + "), resta il file di prima")
        return
    os.makedirs(outdir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"::notice::screener: {len(rows)} titoli letti su {len(syms)}, {len(ok)} con un segnale, {len(top)} candidati, in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    try:
        main(sys.argv[1])
    except Exception as e:  # lo screener non deve fermare la pubblicazione dei dati
        print(f"::warning::screener: {type(e).__name__}: {e}")
