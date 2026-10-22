# GERICO, sito pubblico

Le notizie del giorno confrontate tra le testate, con il GERICO Terminal per i mercati.
Sito statico: HTML, CSS e JavaScript senza framework e senza build. Nessun server, nessuna chiave nel repository.

## Struttura

```
site/                 la cartella pubblicata da Cloudflare Pages
  index.html          prima pagina (sezioni con #mondo, #italia, ... e #seguiti)
  storia.html?id=...  una storia: fatti, divergenze, parere, cronologia, fonti
  terminal.html       GERICO Terminal: mappa a quadrati, indici, valute, tassi, materie prime, agenda, notizie
  come-funziona.html, privacy.html, 404.html
  assets/             css, js, font (Atkinson Hyperlegible, licenza OFL) e immagini
  data/               i dati dell'edizione, scritti dalla pipeline
scripts/export.py     dal database dell'app di redazione ai file di site/data
scripts/set_site_url.py  scrive l'indirizzo pubblico nelle anteprime di condivisione
pipeline/             i testi delle attività programmate (7:18 e 17:50)
```

## Da dove arrivano i dati

La redazione vive nell'app privata su claude.ai. Ogni mattina alle 7:18 l'attività programmata aggiorna il suo database,
poi legge i documenti con `out_dir`, esegue `python3 scripts/export.py <cartella> site/data` e fa un commit con push.
Cloudflare Pages ripubblica il sito da solo. Nei giorni feriali alle 17:50 un giro breve aggiorna solo mercati e mappa.

- `edition.json`: storie live in ordine di importanza, più le archiviate degli ultimi 7 giorni
- `markets.json`, `agenda.json`: mercati per classe e agenda del giorno
- `terminal.json`: variazioni degli indici della mappa (finché manca `terminal/snapshot` nel database, sono ricavate dai mercati)
- `weights.json`: pesi della mappa dai factsheet MSCI, aggiornati una volta al mese

## Anteprima in locale

```
python3 -m http.server 8765 -d site
```

poi apri http://127.0.0.1:8765/

## Pubblicazione su Cloudflare Pages

Workers & Pages, Crea, Pages, Collega a Git, repository `gerico`. Impostazioni: nessun framework, nessun comando di build,
cartella di output `site`. Quando il sito ha il suo indirizzo: `python3 scripts/set_site_url.py https://<indirizzo>` e push.
