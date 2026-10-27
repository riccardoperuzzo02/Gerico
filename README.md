# GERICO, sito pubblico

Le notizie del giorno confrontate tra le testate, con il GERICO Terminal per i mercati.
Sito statico: HTML, CSS e JavaScript senza framework e senza build. Nessun server, nessuna chiave nel repository.

## Struttura

```
site/                 la cartella pubblicata da Cloudflare
  index.html          prima pagina (sezioni con #mondo, #italia, ... e #seguiti)
  storia.html?id=...  una storia: fatti, divergenze, parere, cronologia, fonti
  terminal.html       GERICO Terminal: mappa a quadrati, indici, valute, tassi, materie prime, agenda, notizie
  come-funziona.html, privacy.html, 404.html
  assets/             css, js, font (Atkinson Hyperlegible, licenza OFL) e immagini
  data/               i dati dell'edizione, scritti dalla pipeline
scripts/export.py     dal database dell'app di redazione ai file di site/data
scripts/set_site_url.py  scrive l'indirizzo pubblico nelle anteprime di condivisione
pipeline/             i testi delle attività programmate (7:18, 17:50 e pubblicazione)
```

## Da dove arrivano i dati

La redazione vive nell'app privata su claude.ai e scrive solo nel suo database: ogni mattina alle 7:18 l'edizione completa,
nei giorni feriali alle 17:50 le chiusure delle Borse europee. Alle 7:45 e alle 18:45 un'attività separata e breve legge il
database con `out_dir`, esegue `python3 scripts/export.py <cartella> site/data` e, se qualcosa è cambiato, fa un commit con push.
Cloudflare ripubblica il sito da solo. La pubblicazione sta in un'attività a parte perché nei giri lunghi il passaggio su GitHub
falliva; se una mattina non c'è niente di nuovo, l'export non cambia nessun file e non parte nessun commit.

- `edition.json`: storie live in ordine di importanza, più le archiviate degli ultimi 7 giorni
- `markets.json`, `agenda.json`: mercati per classe e agenda del giorno
- `terminal.json`: variazioni degli indici della mappa (finché manca `terminal/snapshot` nel database, sono ricavate dai mercati)
- `weights.json`: pesi della mappa dai factsheet MSCI (documento `terminal/weights` del database), aggiornati una volta al mese

## Anteprima in locale

```
python3 -m http.server 8765 -d site
```

poi apri http://127.0.0.1:8765/

## Pubblicazione su Cloudflare

Compute › Workers & Pages › Create › Import a repository, repository `Gerico`, nome del progetto `gerico`.
Build command vuoto, Deploy command `npx wrangler deploy`: `wrangler.toml` dice a Cloudflare di pubblicare la cartella `site`
come file statici (gratis, senza limiti di traffico). Ogni push su `main` ripubblica il sito; la pipeline ne fa circa 50 al mese.
In alternativa funziona anche Cloudflare Pages: Framework preset `None`, Build command `exit 0`, Build output directory `site`.
Quando il sito ha il suo indirizzo: `python3 scripts/set_site_url.py https://<indirizzo>` e push.
