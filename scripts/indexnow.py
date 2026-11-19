#!/usr/bin/env python3
"""Avvisa i motori di ricerca che usano IndexNow (Bing, Yandex, Seznam, Naver...) delle pagine nuove o cambiate.

Uso:
    python3 scripts/indexnow.py site <commit di partenza>

Gira nel workflow «Redazione» dopo la pubblicazione: confronta i file del sito tra il commit di partenza e quello
pubblicato, prende le pagine HTML cambiate (articoli in /s/, temi, archivio, prima pagina) e le manda a IndexNow.
Prima aspetta che Cloudflare abbia messo online la versione nuova, così il motore trova la pagina aggiornata.
La chiave sta in site/<chiave>.txt: non è un segreto, IndexNow la legge sul sito per sapere che l'avviso è nostro.
Google non usa IndexNow: per Google basta la sitemap, registrata in Search Console.
Un errore qui non ferma niente: al peggio i motori trovano le pagine con la sitemap, un po' più tardi."""
import json
import re
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from share_pages import site_base  # noqa: E402

KEY = "0a54b5bb45a29b00ca8f641eab0469fe"
ENDPOINT = "https://api.indexnow.org/indexnow"
ATTESA = 240  # secondi al massimo per vedere online la pagina nuova


DATA_MOD = re.compile(r'"dateModified":\s*"([^"]+)"')


def cambiate(site, inizio):
    """Le pagine HTML cambiate davvero dal commit di partenza, come indirizzi pubblici (senza .html).
    Ogni edizione riscrive tutte le pagine (versione dei file, collegamenti): si segnalano solo gli articoli nuovi o con
    una data di modifica nuova, i temi nuovi, la prima pagina e l'archivio."""
    righe = subprocess.run(["git", "diff", "--name-status", "--diff-filter=AM", inizio, "HEAD", "--", site],
                           capture_output=True, text=True, check=True).stdout.splitlines()
    base, urls = site_base(site), []
    for riga in righe:
        stato, f = riga.split("\t", 1)
        rel = os.path.relpath(f, site)
        if not rel.endswith(".html") or rel in ("404.html", "offline.html") or not os.path.exists(f):
            continue
        with open(f, encoding="utf-8") as h:
            testo = h.read()
        if 'name="robots" content="noindex' in testo[:4000]:
            continue  # le pagine escluse dai motori non si segnalano
        if stato == "M" and not (rel == "index.html" or rel.startswith("archivio")):
            if not rel.startswith("s/"):
                continue  # un tema già esistente: lo trovano dalla sitemap
            prima = subprocess.run(["git", "show", inizio + ":" + f], capture_output=True, text=True).stdout
            nuova, vecchia = DATA_MOD.search(testo), DATA_MOD.search(prima)
            if nuova and vecchia and nuova.group(1) == vecchia.group(1):
                continue  # stesso articolo, cambiati solo i dintorni
        path = "" if rel == "index.html" else rel[:-5]
        urls.append(base + "/" + path)
    return base, urls


def online(url, segno):
    """Aspetta che la pagina online contenga `segno` (un pezzo della versione nuova)."""
    fine = time.time() + ATTESA
    while time.time() < fine:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "GERICO-indexnow", "Cache-Control": "no-cache"})
            with urllib.request.urlopen(req, timeout=20) as r:
                if segno in r.read().decode("utf-8", "replace"):
                    return True
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(15)
    return False


def main(site, inizio):
    base, urls = cambiate(site, inizio)
    if not urls:
        print("IndexNow: nessuna pagina nuova da segnalare.")
        return
    # la versione dei file del sito cambia a ogni pubblicazione: quando la prima pagina online ha il commit nuovo
    # (la data dell'edizione nella sitemap), Cloudflare ha finito
    with open(os.path.join(site, "sitemap.xml"), encoding="utf-8") as f:
        sm = f.read()
    segno = sm.split("<lastmod>", 1)[1].split("</lastmod>", 1)[0] if "<lastmod>" in sm else ""
    if segno and not online(base + "/sitemap.xml", segno):
        print("::warning::IndexNow: la versione nuova non è ancora online dopo 4 minuti; segnalo lo stesso")
    host = base.split("://", 1)[1].split("/", 1)[0]
    body = {"host": host, "key": KEY, "keyLocation": base + "/" + KEY + ".txt", "urlList": urls[:10000]}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"::notice::IndexNow: {len(urls)} pagine segnalate (risposta {r.status})")
    except urllib.error.HTTPError as e:
        print(f"::warning::IndexNow risponde {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")
    except (urllib.error.URLError, OSError) as e:
        print(f"::warning::IndexNow non raggiungibile: {e}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    try:
        main(sys.argv[1], sys.argv[2])
    except Exception as e:  # noqa: BLE001  l'avviso ai motori non deve far fallire la pubblicazione
        print(f"::warning::IndexNow: {type(e).__name__}: {e}")
