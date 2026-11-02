#!/usr/bin/env python3
"""Crea le pagine di condivisione delle storie e la sitemap.

Uso:
    python3 scripts/share_pages.py site

storia.html si riempie con lo script, quindi WhatsApp, Telegram e iMessage vedono sempre lo stesso
titolo generico. Per ogni storia dell'edizione questo script scrive site/s/<id>.html: una pagina minima
con titolo e sintesi nei meta, che porta subito a storia.html?id=<id>. Il pulsante Condividi usa
l'indirizzo /s/<id>; storia.html?id= resta com'è.
Le pagine delle storie uscite dall'edizione restano: un link vecchio porta comunque alla storia,
o all'avviso che non c'è più.
Scrive anche site/sitemap.xml e la riga Sitemap di robots.txt.
L'indirizzo del sito lo prende da og:url di index.html (lo scrive set_site_url.py)."""
import html
import json
import os
import re
import sys

SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,150}$")
FALLBACK = "https://gerico.financialnews.workers.dev"
PAGES = ["", "terminal", "come-funziona"]

TEMPLATE = """<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>{title} · GERICO</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="GERICO">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{base}/s/{id}">
<meta property="og:image" content="{base}/assets/img/og-gerico.png">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=/storia.html?id={id}">
</head>
<body>
<p><a href="/storia.html?id={id}">{title}</a></p>
</body>
</html>
"""


def site_base(site):
    try:
        page = open(os.path.join(site, "index.html"), encoding="utf-8").read()
        m = re.search(r'<meta property="og:url" content="(https://[^"]+)"', page)
        if m:
            return m.group(1).rstrip("/")
    except OSError:
        pass
    return FALLBACK


def short(text, limit=200):
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


def main(site):
    edition_path = os.path.join(site, "data", "edition.json")
    try:
        with open(edition_path, encoding="utf-8") as f:
            ed = json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f"ERRORE: {edition_path} non si legge ({e})")
    base = site_base(site)
    out = os.path.join(site, "s")
    os.makedirs(out, exist_ok=True)
    live = ed.get("stories") or []
    stories = [s for s in live + (ed.get("archive") or []) if isinstance(s, dict)]
    written, skipped = 0, []
    for s in stories:
        sid = str(s.get("id") or "")
        if not SAFE_ID.match(sid) or not s.get("title"):
            skipped.append(sid or "(senza id)")
            continue
        page = TEMPLATE.format(title=html.escape(short(s["title"], 120)), desc=html.escape(short(s.get("summary"))),
                               base=base, id=sid)
        path = os.path.join(out, sid + ".html")
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != page:
            with open(path, "w", encoding="utf-8") as f:
                f.write(page)
            written += 1

    when = ed.get("generatedAt") or ""
    urls = [(f"{base}/{p}", when if p == "" else "") for p in PAGES]
    for s in live:
        sid = str(s.get("id") or "") if isinstance(s, dict) else ""
        if SAFE_ID.match(sid):
            urls.append((f"{base}/storia?id={sid}", str(s.get("updated") or "")))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, mod in urls:
        mod = mod if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$", mod) else ""
        lines.append(f"<url><loc>{html.escape(loc)}</loc>" + (f"<lastmod>{mod}</lastmod>" if mod else "") + "</url>")
    lines.append("</urlset>")
    sitemap = "\n".join(lines) + "\n"
    sm_path = os.path.join(site, "sitemap.xml")
    if not os.path.exists(sm_path) or open(sm_path, encoding="utf-8").read() != sitemap:
        with open(sm_path, "w", encoding="utf-8") as f:
            f.write(sitemap)

    robots_path = os.path.join(site, "robots.txt")
    robots = open(robots_path, encoding="utf-8").read() if os.path.exists(robots_path) else "User-agent: *\nAllow: /\n"
    want = f"Sitemap: {base}/sitemap.xml"
    new = re.sub(r"(?m)^Sitemap:.*\n?", "", robots).rstrip("\n") + "\n\n" + want + "\n"
    if new != robots:
        with open(robots_path, "w", encoding="utf-8") as f:
            f.write(new)

    print(f"Pagine di condivisione: {len(stories) - len(skipped)} storie, {written} pagine scritte o cambiate; sitemap con {len(urls)} indirizzi.")
    if skipped:
        print("  saltate (id non valido o senza titolo): " + ", ".join(skipped))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
