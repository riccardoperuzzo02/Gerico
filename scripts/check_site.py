#!/usr/bin/env python3
"""Controlla il sito prima di pubblicarlo.

Uso:
    python3 scripts/check_site.py site

Si ferma con un errore (codice 1) se:
- un file di site/data non si legge come JSON o non ha la forma che le pagine si aspettano;
- l'edizione non ha storie;
- uno script ha un errore di sintassi (controllo fatto con node, se c'è);
- una pagina chiama un file del sito che non esiste;
- uno script scritto dentro una pagina non ha il suo hash nella Content-Security-Policy di _headers.
Gli avvisi (per esempio versioni ?v= diverse tra le pagine) non fermano la pubblicazione."""
import base64
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

errors, warnings = [], []


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        errors.append(f"{path}: non si legge come JSON ({e})")
        return None


def need(cond, msg):
    if not cond:
        errors.append(msg)


def check_data(site):
    data = os.path.join(site, "data")
    ed = load(os.path.join(data, "edition.json"))
    if ed is not None:
        stories = ed.get("stories") if isinstance(ed, dict) else None
        need(isinstance(stories, list) and stories, "edition.json: nessuna storia")
        for s in stories or []:
            need(isinstance(s, dict) and isinstance(s.get("id"), str) and s.get("id") and isinstance(s.get("title"), str),
                 f"edition.json: storia senza id o titolo ({str(s)[:80]})")
            if isinstance(s, dict):
                need(isinstance(s.get("sources", []), list), f"edition.json: {s.get('id')}: sources non è una lista")
                need(isinstance(s.get("facts", []), list), f"edition.json: {s.get('id')}: facts non è una lista")
                r = s.get("rank")
                need(r is None or (isinstance(r, int) and not isinstance(r, bool)), f"edition.json: {s.get('id')}: rank {r!r} non è un numero intero")
                # la forma che le pagine si aspettano (check_dump.py la sistema prima: qui è l'ultimo controllo)
                sid = s.get("id")
                for k in ("summary", "article", "view", "change", "section", "updated", "firstSeen"):
                    need(s.get(k) is None or isinstance(s[k], str), f"edition.json: {sid}: {k} non è un testo")
                for k in ("tags", "themes", "open", "notCovered"):
                    need(s.get(k) is None or (isinstance(s[k], list) and all(isinstance(x, str) for x in s[k])), f"edition.json: {sid}: {k} non è una lista di testi")
                for k in ("sources", "facts", "history", "divergences"):
                    need(s.get(k) is None or (isinstance(s[k], list) and all(isinstance(x, dict) for x in s[k])), f"edition.json: {sid}: {k} non è una lista di voci")
                need(all(isinstance(h.get("at"), str) and isinstance(h.get("text"), str) for h in s.get("history") or [] if isinstance(h, dict)),
                     f"edition.json: {sid}: history con una voce senza ora o senza testo")
                img = s.get("img")
                if img is not None:
                    src = str((img or {}).get("src") or "").split("?")[0] if isinstance(img, dict) else ""
                    need(src.startswith("img/storie/") and os.path.exists(os.path.join(site, src)),
                         f"edition.json: {s.get('id')}: l'immagine {src or '(vuota)'} non c'è")
        need(isinstance(ed.get("archive", []), list) if isinstance(ed, dict) else False, "edition.json: archive non è una lista")
        th = ed.get("themes", []) if isinstance(ed, dict) else []
        need(isinstance(th, list) and len(th) <= 3 and all(isinstance(t, dict) and t.get("id") and t.get("label") for t in th),
             "edition.json: themes deve essere una lista di al massimo 3 temi con id e label")
    for name, key in (("markets.json", "classes"), ("agenda.json", "items"), ("terminal.json", "indices")):
        path = os.path.join(data, name)
        if not os.path.exists(path):
            warnings.append(f"{name}: manca")
            continue
        d = load(path)
        if d is not None:
            need(isinstance(d, dict) and isinstance(d.get(key), list), f"{name}: manca la lista {key}")
            rows = d.get(key) if isinstance(d, dict) and isinstance(d.get(key), list) else []
            need(all(isinstance(x, dict) for x in rows), f"{name}: {key} con voci che non sono voci")
            if name == "markets.json":
                for c in rows:
                    if isinstance(c, dict):
                        its = c.get("items")
                        need(isinstance(its, list) and all(isinstance(i, dict) and isinstance(i.get("name"), str) for i in its), f"{name}: classe {c.get('key')!r} con voci senza nome")
                        need(all(not isinstance(i, dict) or all(i.get(n) is None or (isinstance(i[n], (int, float)) and not isinstance(i[n], bool)) for n in ("chg", "bp")) for i in its or []),
                             f"{name}: classe {c.get('key')!r} con una variazione che non è un numero")
            elif name == "agenda.json":
                need(all(isinstance(i, dict) and isinstance(i.get("event"), str) for i in rows), f"{name}: un evento senza nome")
            elif name == "terminal.json":
                need(all(isinstance(i, dict) and isinstance(i.get("code"), str) and (i.get("chg") is None or (isinstance(i["chg"], (int, float)) and not isinstance(i["chg"], bool))) for i in rows),
                     f"{name}: un indice senza codice o con una variazione che non è un numero")
            for k in ("label", "summary"):
                need(not isinstance(d, dict) or d.get(k) is None or isinstance(d[k], str), f"{name}: {k} non è un testo")
    path = os.path.join(data, "weights.json")
    if os.path.exists(path):
        d = load(path)
        if d is not None:
            need(isinstance(d, dict) and d.get("world") and d.get("europe"), "weights.json: mancano world o europe")
    else:
        warnings.append("weights.json: manca, la mappa del Terminal resterà vuota")
    # file facoltativi: le brevi del giro delle notizie e i dati del job «Dati del Terminal»
    optional = (("brevi.json", "items"), ("quotes.json", "groups"), ("macro.json", "series"),
                ("sec.json", "filings"), ("sentiment.json", "assets"), ("titoli.json", "items"), ("titoli-storico.json", "items"),
                ("calendario.json", "items"))
    for name, key in optional:
        path = os.path.join(data, name)
        if os.path.exists(path):
            d = load(path)
            if d is not None:
                need(isinstance(d, dict) and isinstance(d.get(key), list), f"{name}: manca la lista {key}")
    path = os.path.join(data, "audio.json")
    if os.path.exists(path):
        d = load(path)
        src = str((d or {}).get("src") or "").split("?")[0]
        need(bool(src) and os.path.exists(os.path.join(site, src)), f"audio.json: il file audio {src or '(vuoto)'} non c'è")
        en = (d or {}).get("en")
        if en is not None:
            src = str((en or {}).get("src") or "").split("?")[0]
            need(isinstance(en, dict) and bool(src) and os.path.exists(os.path.join(site, src)), f"audio.json: il file audio inglese {src or '(vuoto)'} non c'è")
    optional = optional + (("riepilogo.json", None),)
    for name, _ in optional[-1:]:
        path = os.path.join(data, name)
        if os.path.exists(path):
            d = load(path)
            need(isinstance(d, dict) and isinstance(d.get("text"), str) and len(d["text"]) > 100, f"{name}: manca il testo")
    # dentro gli indici della mappa (scripts/indici.py): un file per indice e l'elenco
    for path in sorted(glob.glob(os.path.join(data, "indici", "*.json"))):
        name, d = "indici/" + os.path.basename(path), load(path)
        if d is None:
            continue
        if name == "indici/elenco.json":
            need(isinstance(d, dict) and isinstance(d.get("indici"), dict), f"{name}: manca indici")
            continue
        items = d.get("items") if isinstance(d, dict) else None
        need(isinstance(items, list) and items and all(isinstance(x, dict) and x.get("s") and isinstance(x.get("w"), (int, float)) for x in items),
             f"{name}: titoli senza simbolo o peso")
    # trimestrali e cedole delle società della mappa (scripts/societari.py)
    path = os.path.join(data, "societari.json")
    if os.path.exists(path):
        d = load(path)
        items = d.get("items") if isinstance(d, dict) else None
        need(isinstance(items, list), "societari.json: manca la lista items")
        day = re.compile(r"^\d{4}-\d{2}-\d{2}$")
        for i, x in enumerate(items if isinstance(items, list) else []):
            ok = (isinstance(x, dict) and x.get("kind") in ("utili", "cedola") and isinstance(x.get("date"), str) and day.match(x["date"])
                  and all(isinstance(x.get(k), str) and x[k] for k in ("sym", "name", "code"))
                  and all(isinstance(x[k], (int, float)) and not isinstance(x[k], bool) for k in ("eps", "lo", "hi", "rev", "actual", "surprise") if k in x)
                  and all(isinstance(x[k], str) for k in ("when", "period", "cur", "index", "pay") if k in x))
            need(ok, f"societari.json: la voce {i} non ha la forma giusta ({str(x)[:80]})")
    # le brevi dei paesi della scelta in alto (scripts/paesi.py): un file per paese e l'indice
    for path in sorted(glob.glob(os.path.join(data, "paesi", "*.json"))):
        name, d = "paesi/" + os.path.basename(path), load(path)
        if d is None:
            continue
        if name == "paesi/indice.json":
            need(isinstance(d, dict) and isinstance(d.get("countries"), dict), f"{name}: manca countries")
            continue
        items = d.get("items") if isinstance(d, dict) else None
        need(isinstance(items, list) and isinstance(d.get("code"), str) and len(d["code"]) == 2, f"{name}: manca la sigla o la lista items")
        for i, x in enumerate(items if isinstance(items, list) else []):
            need(isinstance(x, dict) and all(isinstance(x.get(k), str) and x[k] for k in ("title", "url", "at", "source"))
                 and re.match(r"^https?://", x["url"]) and all(isinstance(x[k], str) for k in ("it", "en") if k in x),
                 f"{name}: la voce {i} non ha la forma giusta ({str(x)[:80]})")
    known = {"edition.json", "markets.json", "agenda.json", "terminal.json", "weights.json", "audio.json", "societari.json"} | {n for n, _ in optional}
    for path in glob.glob(os.path.join(data, "*.json")):
        if os.path.basename(path) not in known:
            load(path)


def check_scripts(site):
    node = shutil.which("node")
    files = sorted(glob.glob(os.path.join(site, "assets", "js", "*.js")))
    if not node:
        warnings.append("node non c'è: salto il controllo della sintassi degli script")
        return
    for path in files:
        r = subprocess.run([node, "--check", path], capture_output=True, text=True)
        if r.returncode != 0:
            errors.append(f"{path}: errore di sintassi\n{r.stderr.strip()[:600]}")


REF = re.compile(r'\b(?:src|href)="([^"]+)"')


def check_pages(site):
    versions = {}
    pages = sorted(glob.glob(os.path.join(site, "*.html")) + glob.glob(os.path.join(site, "s", "*.html")))
    # il gestionale non sta in site/: lo manda il Worker (worker/admin.html), ma usa gli stessi file e la stessa versione
    admin = os.path.join(os.path.dirname(os.path.abspath(site)), "worker", "admin.html")
    if os.path.exists(admin):
        pages.append(admin)
    for page in pages:
        html = open(page, encoding="utf-8").read()
        base = site if page == admin else os.path.dirname(page)
        for ref in REF.findall(html):
            if re.match(r"^(?:[a-z]+:|//|#)", ref, re.I):
                continue
            path = ref.split("#")[0].split("?")[0]
            if not path:
                continue
            m = re.search(r"\?v=([\w.-]+)", ref)
            if m and path.endswith((".css", ".js")):
                versions.setdefault(m.group(1), set()).add(os.path.relpath(page, site))
            target = os.path.normpath(os.path.join(site if path.startswith("/") else base, path.lstrip("/")))
            if not (os.path.exists(target) or os.path.exists(target + ".html")):
                errors.append(f"{os.path.relpath(page, site)}: chiama {ref}, che non esiste")
    if len(versions) > 1:
        warnings.append("versioni ?v= diverse tra le pagine: " + ", ".join(f"{v} in {len(p)} pagine" for v, p in versions.items()))
    return len(pages)


def check_csp(site):
    """Ogni script scritto dentro una pagina deve avere il suo hash nella CSP di _headers, se no il browser lo blocca."""
    path = os.path.join(site, "_headers")
    if not os.path.exists(path):
        warnings.append("_headers: manca")
        return
    rules, cur = {}, None
    for raw in open(path, encoding="utf-8").read().splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw[0].isspace():
            cur = raw.strip()
            rules.setdefault(cur, [])
        elif cur:
            rules[cur].append(raw.strip())
    for page in sorted(glob.glob(os.path.join(site, "*.html"))):
        name = os.path.basename(page)
        url = "/" if name == "index.html" else "/" + name
        csp = next((h.split(":", 1)[1] for h in rules.get(url, []) if h.lower().startswith("content-security-policy:")), None)
        # le regole con l'asterisco di Cloudflare (/archivio-*): valgono per tutte le pagine che cominciano così
        if csp is None:
            csp = next((h.split(":", 1)[1] for k, hs in rules.items() if k.endswith("*") and k != "/*" and url.startswith(k[:-1])
                        for h in hs if h.lower().startswith("content-security-policy:")), None)
        scripts = re.findall(r"<script>(.*?)</script>", open(page, encoding="utf-8").read(), re.S)
        if csp is None:
            if name.startswith("google") and name.endswith(".html"):  # il file di verifica di Google Search Console
                continue
            warnings.append(f"{name}: nessuna CSP in _headers per {url}")
            continue
        for body in scripts:
            h = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode() + "'"
            if h not in csp:
                errors.append(f"{name}: lo script dentro la pagina è cambiato e il suo hash {h} non è nella CSP di _headers: il browser lo bloccherebbe")


def main(site):
    if not os.path.isdir(site):
        sys.exit(f"ERRORE: la cartella {site} non esiste")
    check_data(site)
    check_scripts(site)
    check_csp(site)
    n = check_pages(site)
    for w in warnings:
        print("  avviso: " + w)
    if errors:
        for e in errors:
            print("  ERRORE: " + e)
        sys.exit(f"Controllo del sito: {len(errors)} errori. Non pubblicare.")
    print(f"Controllo del sito: tutto a posto ({n} pagine, {len(warnings)} avvisi).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
