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
        need(isinstance(ed.get("archive", []), list) if isinstance(ed, dict) else False, "edition.json: archive non è una lista")
    for name, key in (("markets.json", "classes"), ("agenda.json", "items"), ("terminal.json", "indices")):
        path = os.path.join(data, name)
        if not os.path.exists(path):
            warnings.append(f"{name}: manca")
            continue
        d = load(path)
        if d is not None:
            need(isinstance(d, dict) and isinstance(d.get(key), list), f"{name}: manca la lista {key}")
    path = os.path.join(data, "weights.json")
    if os.path.exists(path):
        d = load(path)
        if d is not None:
            need(isinstance(d, dict) and d.get("world") and d.get("europe"), "weights.json: mancano world o europe")
    else:
        warnings.append("weights.json: manca, la mappa del Terminal resterà vuota")
    for path in glob.glob(os.path.join(data, "*.json")):
        if os.path.basename(path) not in ("edition.json", "markets.json", "agenda.json", "terminal.json", "weights.json"):
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
    for page in pages:
        html = open(page, encoding="utf-8").read()
        base = os.path.dirname(page)
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
        scripts = re.findall(r"<script>(.*?)</script>", open(page, encoding="utf-8").read(), re.S)
        if csp is None:
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
