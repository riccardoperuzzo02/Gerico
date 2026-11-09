#!/usr/bin/env python3
"""Dentro gli indici della mappa del Terminal: i titoli di ogni indice, quanto pesano e come vanno oggi.

Uso:
    python3 scripts/indici.py site/data

Scrive site/data/indici/<CODICE>.json, un file per Paese della mappa (USA, JPN, GBR...), e site/data/indici/elenco.json
con gli indici che ci sono. Due lavori:
- la composizione, una volta ogni 4 settimane per indice (o sempre con INDICI_COMPOSIZIONE=1): l'elenco dei titoli da
  Wikipedia (per Corea, Taiwan e Cina, che lì non hanno l'elenco, i 30 titoli più grandi, scritti qui sotto) e da
  Yahoo Finance, per ogni titolo, il flottante (le azioni che si scambiano davvero), il settore e la valuta;
- i prezzi, a ogni giro: l'ultimo prezzo e la variazione della seduta di ogni titolo, con un download solo per indice.
Il peso di un titolo è flottante per prezzo sul totale dell'indice, come fanno gli indici veri, che però contano il
flottante a modo loro e mettono dei tetti: qui il peso è una stima. Il Nikkei 225 pesa il prezzo per il fattore di
aggiustamento di Nikkei; se i fattori non si trovano, la grandezza è la capitalizzazione e il sito lo dice.
Un indice che non si riesce ad aggiornare tiene i dati di prima. INDICI_SECONDI (420 di base) è il tempo massimo:
le composizioni che non ci stanno aspettano il giro dopo. INDICI_SOLO=USA,ITA limita il lavoro a quei codici.

Campi di ogni titolo: s simbolo di Yahoo Finance, t sigla di Borsa, n nome, x settore (di Yahoo, in inglese),
q azioni del flottante (o fattore del Nikkei), k valuta se non è quella dell'indice, w peso in %, c variazione della
seduta in %, p ultimo prezzo, d data del prezzo quando non è quella della seduta (allora c non c'è)."""
import html as H
import io
import json
import math
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.stdout.reconfigure(line_buffering=True)
ROME = ZoneInfo("Europe/Rome")
UA = {"User-Agent": "GERICO/1.0 (sito di notizie; mappa del Terminal)"}
GIORNI = 28
T0 = time.monotonic()
BUDGET = float(os.environ.get("INDICI_SECONDI") or 420)

# codice della mappa -> indice, dove trovare l'elenco, suffisso di Yahoo Finance
INDICI = {
    "USA": {"index": "S&P 500", "wiki": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", "suffix": "", "dash": True},
    "JPN": {"index": "Nikkei 225", "wiki": "https://en.wikipedia.org/wiki/Nikkei_225", "suffix": ".T", "tyo": True,
            "nikkei": "https://indexes.nikkei.co.jp/en/nkave/index/component?idx=nk225"},
    "GBR": {"index": "FTSE 100", "wiki": "https://en.wikipedia.org/wiki/FTSE_100_Index", "suffix": ".L", "dash": True},
    "CAN": {"index": "S&P/TSX 60", "wiki": "https://en.wikipedia.org/wiki/S%26P/TSX_60", "suffix": ".TO", "dash": True},
    "FRA": {"index": "CAC 40", "wiki": "https://en.wikipedia.org/wiki/CAC_40", "suffix": ".PA", "tetto": 15},
    "CHE": {"index": "SMI", "wiki": "https://en.wikipedia.org/wiki/Swiss_Market_Index", "suffix": ".SW", "tetto": 18},
    "DEU": {"index": "DAX", "wiki": "https://en.wikipedia.org/wiki/DAX", "suffix": ".DE"},
    "IND": {"index": "Nifty 50", "wiki": "https://en.wikipedia.org/wiki/NIFTY_50", "suffix": ".NS"},
    "NLD": {"index": "AEX", "wiki": "https://en.wikipedia.org/wiki/AEX_index", "suffix": ".AS", "tetto": 15},
    "ITA": {"index": "FTSE MIB", "wiki": "https://en.wikipedia.org/wiki/FTSE_MIB", "suffix": ".MI", "fix": {"STM": "STMMI", "STLA": "STLAM"}, "tetto": 15},
    "BRA": {"index": "Ibovespa", "wiki": "https://pt.wikipedia.org/wiki/Ibovespa", "suffix": ".SA", "riserva": [
        ("PETR4", "Petrobras PN"), ("PETR3", "Petrobras ON"), ("VALE3", "Vale"), ("ITUB4", "Itaú Unibanco"), ("BBDC4", "Bradesco"),
        ("BBAS3", "Banco do Brasil"), ("B3SA3", "B3"), ("ABEV3", "Ambev"), ("WEGE3", "WEG"), ("ITSA4", "Itaúsa"), ("BPAC11", "BTG Pactual"),
("SUZB3", "Suzano"), ("RAIL3", "Rumo"), ("RENT3", "Localiza"), ("EQTL3", "Equatorial"), ("SBSP3", "Sabesp"),
        ("RADL3", "Raia Drogasil"), ("GGBR4", "Gerdau"), ("VBBR3", "Vibra Energia"), ("RDOR3", "Rede D'Or"), ("BBSE3", "BB Seguridade"),
        ("PRIO3", "Prio"), ("SANB11", "Santander Brasil"), ("CMIG4", "Cemig"), ("TIMS3", "TIM Brasil"), ("VIVT3", "Telefônica Brasil"),
        ("KLBN11", "Klabin"), ("LREN3", "Lojas Renner"), ("UGPA3", "Ultrapar"), ("TOTS3", "Totvs"), ("CSAN3", "Cosan")]},
    # senza l'elenco completo su Wikipedia: i titoli più grandi
    "KOR": {"index": "Kospi", "suffix": ".KS", "lista": [
        ("005930", "Samsung Electronics"), ("000660", "SK Hynix"), ("373220", "LG Energy Solution"), ("207940", "Samsung Biologics"),
        ("005380", "Hyundai Motor"), ("000270", "Kia"), ("068270", "Celltrion"), ("105560", "KB Financial"), ("055550", "Shinhan Financial"),
        ("005490", "POSCO Holdings"), ("035420", "Naver"), ("006400", "Samsung SDI"), ("051910", "LG Chem"), ("012330", "Hyundai Mobis"),
        ("028260", "Samsung C&T"), ("035720", "Kakao"), ("032830", "Samsung Life"), ("086790", "Hana Financial"), ("096770", "SK Innovation"),
        ("033780", "KT&G"), ("000810", "Samsung Fire & Marine"), ("329180", "HD Hyundai Heavy Industries"), ("012450", "Hanwha Aerospace"),
        ("034020", "Doosan Enerbility"), ("034730", "SK Inc"), ("066570", "LG Electronics"), ("316140", "Woori Financial"),
        ("015760", "Korea Electric Power"), ("138040", "Meritz Financial"), ("011200", "HMM")]},
    "TWN": {"index": "Taiex", "suffix": ".TW", "lista": [
        ("2330", "TSMC"), ("2317", "Hon Hai"), ("2454", "MediaTek"), ("2308", "Delta Electronics"), ("2382", "Quanta Computer"),
        ("2881", "Fubon Financial"), ("2882", "Cathay Financial"), ("2891", "CTBC Financial"), ("2412", "Chunghwa Telecom"),
        ("3711", "ASE Technology"), ("2303", "UMC"), ("2886", "Mega Financial"), ("1303", "Nan Ya Plastics"), ("2002", "China Steel"),
        ("1301", "Formosa Plastics"), ("2357", "Asustek"), ("3008", "Largan"), ("2884", "E.Sun Financial"), ("2892", "First Financial"),
        ("1216", "Uni-President"), ("2345", "Accton"), ("3231", "Wistron"), ("2395", "Advantech"), ("6669", "Wiwynn"), ("2379", "Realtek"),
        ("3034", "Novatek"), ("2327", "Yageo"), ("5880", "Taiwan Cooperative Financial"), ("2885", "Yuanta Financial"), ("2603", "Evergreen Marine")]},
    "CHN": {"index": "CSI 300", "suffix": "", "lista": [
        ("600519.SS", "Kweichow Moutai"), ("300750.SZ", "CATL"), ("601318.SS", "Ping An Insurance"), ("600036.SS", "China Merchants Bank"),
        ("000858.SZ", "Wuliangye"), ("601166.SS", "Industrial Bank"), ("600900.SS", "China Yangtze Power"), ("000333.SZ", "Midea"),
        ("601899.SS", "Zijin Mining"), ("600276.SS", "Jiangsu Hengrui"), ("601398.SS", "ICBC"), ("601288.SS", "Agricultural Bank of China"),
        ("601988.SS", "Bank of China"), ("601857.SS", "PetroChina"), ("600030.SS", "CITIC Securities"), ("002594.SZ", "BYD"),
        ("300059.SZ", "East Money"), ("600309.SS", "Wanhua Chemical"), ("000651.SZ", "Gree Electric"), ("601012.SS", "LONGi"),
        ("300760.SZ", "Mindray"), ("002415.SZ", "Hikvision"), ("600887.SS", "Yili"), ("601328.SS", "Bank of Communications"),
        ("600028.SS", "Sinopec"), ("601088.SS", "China Shenhua"), ("600050.SS", "China Unicom"), ("601628.SS", "China Life"),
        ("000001.SZ", "Ping An Bank"), ("002475.SZ", "Luxshare")]},
}


def resto():
    return BUDGET - (time.monotonic() - T0)


def adesso():
    return datetime.now(ROME).isoformat(timespec="seconds")


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
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) and v > 0 else None


def norm_cur(cur):
    """Valuta e divisore: i prezzi in pence (GBp) sono centesimi di sterlina."""
    cur = str(cur or "")
    return {"GBp": ("GBP", 100), "GBX": ("GBP", 100), "ZAc": ("ZAR", 100), "ILA": ("ILS", 100)}.get(cur, (cur.upper(), 1))


SUFFISSI = re.compile(r"(?:,?\s+(?:inc\.?|incorporated|corporation|corp\.?|company|co\.?|plc|p\.l\.c\.|s\.p\.a\.?|spa|ag|se|n\.v\.?|nv|"
                      r"s\.a\.?|sa|ltd\.?|limited|holdings?|group|co\.,?\s*ltd\.?|kgaa|& co\.?|oyj|asa|ab|a/s|s\.a\.b\. de c\.v\.|"
                      r"reit|trust|corp\.,? ltd\.?|ltd\.,?))+$", re.I)


# nomi che senza la forma societaria non si riconoscono più
NOMI = {"News": "News Corp", "Lloyds Banking": "Lloyds"}


def breve(nome):
    """Il nome da mostrare: senza le forme societarie («Apple Inc.» -> «Apple», «Alphabet Inc. (Class A)» -> «Alphabet A»)."""
    n = re.sub(r"\[[^\]]*\]", "", str(nome or "")).strip()
    n = re.sub(r"\s*\(the\)\s*$", "", n, flags=re.I)
    cls = re.search(r"\b(?:class|serie|series)\s+([A-Z])\b", n, re.I)
    n = re.sub(r"\s*\(?\b(?:class|serie|series)\s+[A-Z]\b\)?", "", n, flags=re.I).strip()
    prima = None
    while prima != n:
        prima = n
        n = SUFFISSI.sub("", n).strip(" ,.")
    n = re.sub(r"^the\s+", "", n, flags=re.I)
    if n.isupper() and " " in n and len(n) > 6:
        n = n.title()
    n = NOMI.get(n, n)
    if cls:
        n += " " + cls.group(1).upper()
    return n or str(nome or "")


def yahoo(sym, conf):
    """Il simbolo di Yahoo da quello della Borsa: suffisso, punti in trattini dove serve, eccezioni note."""
    s = re.sub(r"\[[^\]]*\]", "", str(sym)).strip().upper().replace(" ", "")
    s = re.sub(r"^[A-Z]+:", "", s).rstrip(".")
    s = (conf.get("fix") or {}).get(s, s)
    if conf.get("dash"):
        s = s.replace(".", "-")
    suf = conf.get("suffix") or ""
    # un titolo di un'altra Borsa (ArcelorMittal «MT.AS» nel CAC 40, Airbus «AIR.PA» nel DAX) resta com'è
    if suf and not s.endswith(suf) and (conf.get("dash") or not re.search(r"\.[A-Z]{1,3}$", s)):
        s += suf
    return s


def sigla(s, conf):
    """La sigla di Borsa da mostrare: AAPL, BRK.B, ENI, 7203."""
    suf = conf.get("suffix") or ""
    t = s[: -len(suf)] if suf and s.endswith(suf) else re.sub(r"\.[A-Z]{1,3}$", "", s) if not conf.get("dash") else s
    return t.replace("-", ".") if conf.get("dash") else t


def pagina(url):
    import requests
    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    return r.text


def colonne(t):
    import pandas as pd
    if isinstance(t.columns, pd.MultiIndex):
        t.columns = [" ".join(str(x) for x in c if not str(x).startswith("Unnamed")) for c in t.columns]
    return [re.sub(r"\[[^\]]*\]", "", str(c)).strip().lower() for c in t.columns]


def da_wikipedia(conf):
    """[(simbolo di Yahoo, nome)] dalla tabella dei componenti: la prima con una colonna del simbolo e una del nome."""
    import pandas as pd
    html = pagina(conf["wiki"])
    if conf.get("tyo"):
        # il Nikkei 225 su Wikipedia è un elenco: «Canon Inc. (TYO: 7751)»
        testo = H.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<(?:/li|br\s*/?|/p|/tr|/td|/dd)>", "\n", html, flags=re.I)))
        out = {}
        for m in re.finditer(r"([^\n()]{2,90}?)\s*\(\s*(?:TYO|TSE)\s*:\s*([0-9]{3}[0-9A-Z])\s*\)", testo):
            out.setdefault(m.group(2) + conf["suffix"], m.group(1).strip(" ,;·•-"))
        return list(out.items())
    viste = []
    for t in pd.read_html(io.StringIO(html), flavor="lxml"):
        low = colonne(t)
        viste.append(f"{len(t)} righe: {', '.join(low)[:100]}")
        si = next((i for i, c in enumerate(low) if re.search(r"ticker|symbol|simbolo|código|codigo|^code$|epic|sigla", c)), None)
        ni = next((i for i, c in enumerate(low) if i != si and re.search(r"company|security|constituent|empresa|^name$|nome|ação|acao|società|issuer", c)), None)
        if si is None or ni is None or len(t) < 15:
            continue
        out = []
        for row in t.itertuples(index=False):
            s, n = str(row[si]).strip(), str(row[ni]).strip()
            if not s or s.lower() == "nan" or len(s) > 14 or not re.search(r"[A-Za-z0-9]", s):
                continue
            out.append((yahoo(s, conf), "" if n.lower() == "nan" else n))
        out = list(dict(out).items())
        if len(out) >= 15:
            return out
    raise RuntimeError("nessuna tabella con simbolo e nome (" + " | ".join(viste[:8]) + ")")


def fattori_nikkei(url, suffix):
    """{simbolo: fattore di aggiustamento} dalla pagina dei componenti di Nikkei, se c'è la colonna del fattore."""
    import pandas as pd
    html = pagina(url)
    try:
        tabelle = pd.read_html(io.StringIO(html), flavor="lxml")
    except Exception:
        tabelle = []
    print(f"    pagina dei componenti di Nikkei: {len(html)} caratteri, {len(tabelle)} tabelle")
    out = {}
    for t in tabelle:
        low = colonne(t)
        print(f"    tabella di Nikkei: {len(t)} righe: {', '.join(low)[:140]}")
        ci = next((i for i, c in enumerate(low) if "code" in c), None)
        fi = next((i for i, c in enumerate(low) if re.search(r"adjust|paf|factor", c)), None)
        if ci is None or fi is None:
            continue
        for row in t.itertuples(index=False):
            code, f = str(row[ci]).strip(), num(str(row[fi]).replace(",", ""))
            m = re.match(r"^([0-9]{3}[0-9A-Z])", code)
            if m and f:
                out[m.group(1) + suffix] = f
    if not out:
        m = re.search(r"adjust", html, re.I)
        print("    nessun fattore di aggiustamento" + (": " + re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html[max(0, m.start() - 200): m.start() + 300]))[:300] if m else ""))
    return out


def scheda(yf, s):
    """Flottante, azioni, valuta, nome, settore e prezzo di un titolo da Yahoo Finance."""
    info = {}
    for prova in range(3):
        try:
            info = yf.Ticker(s).get_info() or {}
            break
        except Exception as e:
            lento = "rate" in str(e).lower() or "too many" in str(e).lower()
            time.sleep((8 if lento else 1.5) * (prova + 1))
    out = {"float": num(info.get("floatShares")), "shares": num(info.get("sharesOutstanding")) or num(info.get("impliedSharesOutstanding")),
           "cur": info.get("currency") or "", "nome": info.get("shortName") or info.get("longName") or "", "settore": info.get("sector") or "",
           "prezzo": num(info.get("regularMarketPrice")) or num(info.get("currentPrice")) or num(info.get("previousClose"))}
    if not out["shares"] or not out["cur"] or not out["prezzo"]:
        try:
            fi = yf.Ticker(s).fast_info
            for k, src in (("shares", "shares"), ("cur", "currency"), ("prezzo", "last_price")):
                if not out[k]:
                    try:
                        out[k] = fi[src] if k == "cur" else num(fi[src])
                    except Exception:
                        pass
        except Exception:
            pass
    return out


def composizione(yf, code, conf, prima):
    fonte, top = "Wikipedia", 0
    if conf.get("lista"):
        elenco, fonte, top = [(s if "." in s else s + conf["suffix"], n) for s, n in conf["lista"]], "GERICO", len(conf["lista"])
    else:
        try:
            elenco = da_wikipedia(conf)
            if len(elenco) < 15:
                raise RuntimeError(f"solo {len(elenco)} titoli")
        except Exception as e:
            if not conf.get("riserva"):
                raise
            print(f"  {code}: elenco di Wikipedia non trovato ({e}), uso quello di riserva")
            elenco, fonte, top = [(s + conf["suffix"], n) for s, n in conf["riserva"]], "GERICO", len(conf["riserva"])
    t = time.monotonic()
    paf = {}
    if conf.get("nikkei"):
        try:
            paf = fattori_nikkei(conf["nikkei"], conf["suffix"])
        except Exception as e:
            print(f"    fattori del Nikkei non trovati ({e})")
    simboli = [s for s, _ in elenco]
    with ThreadPoolExecutor(4) as ex:
        schede = dict(zip(simboli, ex.map(lambda s: scheda(yf, s), simboli)))
    valute = Counter(sc["cur"] for sc in schede.values() if sc.get("cur"))
    main = valute.most_common(1)[0][0] if valute else ""
    vecchi = {x["s"]: x for x in (prima or {}).get("items") or []}
    items, flott, nik = [], 0, 0
    for s, n in elenco:
        sc = schede.get(s) or {}
        if paf:
            q = paf.get(s)
            nik += 1 if q else 0
        else:
            fl, sh = sc.get("float"), sc.get("shares")
            q = fl if fl and sh and 0.05 <= fl / sh <= 1.05 else sh
            flott += 1 if q and q == fl else 0
        if not q:
            continue
        it = {"s": s, "t": sigla(s, conf), "n": breve(n) if n else breve(sc.get("nome")) or sigla(s, conf),
              "q": round(q, 4) if paf else int(q)}
        if sc.get("settore"):
            it["x"] = sc["settore"]
        if sc.get("cur") and sc["cur"] != main:
            it["k"] = sc["cur"]
        old = vecchi.get(s, {})
        p = sc.get("prezzo") or old.get("p")
        if p:
            it["p"] = round(p, 4)
        if "c" in old:
            it["c"] = old["c"]
        items.append(it)
    if len(items) < 10:
        raise RuntimeError(f"dati di Yahoo per pochi titoli ({len(items)} su {len(elenco)})")
    metodo = "prezzo" if paf else "quota" if conf.get("nikkei") else "flottante" if flott >= 0.7 * len(items) else "capitalizzazione"
    print(f"  {code} {conf['index']}: {len(items)} titoli su {len(elenco)} nell'elenco ({fonte}), pesi: {metodo}"
          f"{f', fattori Nikkei per {nik}' if paf else f', flottante per {flott}'}, valuta {main}, {time.monotonic() - t:.0f} s")
    return {"code": code, "index": conf["index"], "pesiAsOf": adesso(), "fonte": fonte, "metodo": metodo, "top": top, "cur": main, "items": items}


def prezzi(yf, dato):
    """Ultimo prezzo e variazione della seduta di ogni titolo, poi i pesi con i prezzi nuovi."""
    import pandas as pd
    items, main = dato["items"], dato.get("cur") or ""
    mm = norm_cur(main)[0]
    serve = {norm_cur(x["k"])[0] for x in items if x.get("k")} - {mm, ""}
    fx_sym = {c: f"{c}{mm}=X" for c in serve}
    simboli = [x["s"] for x in items] + list(fx_sym.values())
    df = yf.download(simboli, period="7d", interval="1d", group_by="ticker", auto_adjust=False, threads=True, progress=False)

    def chiusure(s):
        try:
            c = (df[s] if isinstance(df.columns, pd.MultiIndex) else df)["Close"].dropna()
            return c if len(c) else None
        except Exception:
            return None
    serie = {s: chiusure(s) for s in simboli}
    fx = {c: float(serie[sym].iloc[-1]) for c, sym in fx_sym.items() if serie.get(sym) is not None}
    # la seduta dell'indice: la data più recente che ha almeno metà dei titoli
    date = Counter(str(serie[x["s"]].index[-1])[:10] for x in items if serie.get(x["s"]) is not None)
    if not date:
        raise RuntimeError("nessun prezzo")
    tot = sum(date.values())
    seduta = next((d for d in sorted(date, reverse=True) if date[d] >= 0.5 * tot), date.most_common(1)[0][0])
    for x in items:
        c = serie.get(x["s"])
        x.pop("d", None)
        if c is None:
            x.pop("c", None)
            continue
        ultimo = str(c.index[-1])[:10]
        x["p"] = round(float(c.iloc[-1]), 4)
        if ultimo == seduta and len(c) >= 2 and float(c.iloc[-2]) > 0:
            x["c"] = round((float(c.iloc[-1]) / float(c.iloc[-2]) - 1) * 100, 2)
        else:
            x.pop("c", None)
            x["d"] = ultimo

    def valore(x):
        if not x.get("p"):
            return 0
        maj, div = norm_cur(x.get("k") or main)
        r = 1 if maj == mm else fx.get(maj)
        return x["q"] * x["p"] / div * r if r else 0
    tot = sum(valore(x) for x in items) or 1
    pesi = {x["s"]: valore(x) / tot * 100 for x in items}
    tetto = (INDICI.get(dato.get("code")) or {}).get("tetto")
    if tetto:
        # come l'indice: nessun titolo sopra il tetto, quello che avanza va agli altri in proporzione
        for _ in range(20):
            sopra = {s for s, w in pesi.items() if w > tetto + 1e-9}
            if not sopra:
                break
            liberi = sum(w for s, w in pesi.items() if w < tetto - 1e-9)
            extra = sum(pesi[s] - tetto for s in sopra)
            for s in pesi:
                pesi[s] = tetto if s in sopra else pesi[s] + (extra * pesi[s] / liberi if liberi and pesi[s] < tetto - 1e-9 else 0)
        dato["tetto"] = tetto
    for x in items:
        x["w"] = round(pesi[x["s"]], 4)
    dato["items"] = sorted((x for x in items if x["w"] > 0), key=lambda x: -x["w"])
    con = [x for x in dato["items"] if isinstance(x.get("c"), (int, float))]
    sw = sum(x["w"] for x in con)
    dato.update({"asOf": adesso(), "date": seduta, "copertura": round(sw, 1),
                 "stima": round(sum(x["w"] * x["c"] for x in con) / sw, 2) if sw else None})
    print(f"  {dato['code']}: prezzi di {len(con)} titoli su {len(dato['items'])}, seduta del {seduta}, variazione stimata {dato['stima']}%")


def main(cartella):
    import yfinance as yf
    out = os.path.join(cartella, "indici")
    os.makedirs(out, exist_ok=True)
    # INDICI_COMPOSIZIONE: «1» o «tutti» rifà tutte le composizioni, «FRA,DEU» solo quelle
    rifai = (os.environ.get("INDICI_COMPOSIZIONE") or "").strip().upper()
    forza = rifai in ("1", "TUTTI", "ALL")
    rifai = {c.strip() for c in rifai.split(",") if c.strip()} if not forza else set()
    solo = {c.strip().upper() for c in (os.environ.get("INDICI_SOLO") or "").split(",") if c.strip()}
    codici = [c for c in INDICI if not solo or c in solo]
    dati = {c: carica(os.path.join(out, c + ".json")) for c in codici}

    def eta(c):
        try:
            return (datetime.now(timezone.utc) - datetime.fromisoformat(dati[c]["pesiAsOf"])).days
        except Exception:
            return 10 ** 6
    # prima le composizioni più vecchie: se il tempo finisce, le altre aspettano il giro dopo
    for c in sorted((c for c in codici if forza or c in rifai or eta(c) >= GIORNI), key=lambda c: -eta(c)):
        if resto() < BUDGET * 0.4:
            print(f"  {c}: composizione rimandata al giro dopo (tempo finito)")
            continue
        try:
            dati[c] = composizione(yf, c, INDICI[c], dati[c])
        except Exception as e:
            print(f"  {c}: composizione non aggiornata ({e})" + (", tengo quella di prima" if dati[c] else ""))
    for c in codici:
        d = dati[c]
        if not d or not d.get("items"):
            continue
        if resto() < 15:
            print(f"  {c}: prezzi rimandati al giro dopo (tempo finito)")
        else:
            try:
                prezzi(yf, d)
            except Exception as e:
                print(f"  {c}: prezzi non aggiornati ({e})")
        salva(os.path.join(out, c + ".json"), d)
    # quali indici ci sono, per il Terminal: un file piccolo
    elenco = {}
    for c in INDICI:
        d = carica(os.path.join(out, c + ".json"))
        if d and d.get("items"):
            elenco[c] = {"index": d.get("index"), "n": len(d["items"]), "top": d.get("top", 0), "date": d.get("date", ""), "asOf": d.get("asOf", "")}
    salva(os.path.join(out, "elenco.json"), {"asOf": adesso(), "indici": elenco})
    print(f"Fatto in {time.monotonic() - T0:.0f} s: {len(elenco)} indici.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
