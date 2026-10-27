#!/usr/bin/env python3
"""Scrive l'indirizzo pubblico del sito nelle pagine, per le anteprime di condivisione.

Uso: python3 scripts/set_site_url.py https://gerico.financialnews.workers.dev
Rende assoluto og:image e aggiunge og:url e il link canonico a ogni pagina HTML di site/.
Si può rilanciare quando cambia l'indirizzo (per esempio con un dominio personale)."""
import glob
import os
import re
import sys

if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
    sys.exit(__doc__)
base = sys.argv[1].rstrip("/")
root = os.path.join(os.path.dirname(__file__), "..", "site")
for path in sorted(glob.glob(os.path.join(root, "*.html"))):
    name = os.path.basename(path)
    # Cloudflare serve le pagine senza ".html" (terminal.html risponde come /terminal):
    # il canonico punta all'indirizzo finale.
    page = "" if name == "index.html" else name[:-5]
    html = open(path, encoding="utf-8").read()
    html = re.sub(r'<meta property="og:image" content="[^"]*">',
                  f'<meta property="og:image" content="{base}/assets/img/og-gerico.png">', html)
    html = re.sub(r'\n<meta property="og:url" content="[^"]*">', "", html)
    html = re.sub(r'\n<link rel="canonical" href="[^"]*">', "", html)
    # storia.html cambia contenuto con ?id=: un indirizzo fisso farebbe sembrare tutte le storie la stessa
    # pagina e, condividendo una storia, i social aprirebbero la pagina senza id.
    if name not in ("404.html", "storia.html"):
        html = html.replace('<meta property="og:image"',
                            f'<meta property="og:url" content="{base}/{page}">\n<link rel="canonical" href="{base}/{page}">\n<meta property="og:image"', 1)
    open(path, "w", encoding="utf-8").write(html)
    print("ok", name)
