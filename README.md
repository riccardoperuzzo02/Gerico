# GERICO, sito pubblico

Le notizie del giorno in articoli scritti su tutte le fonti, con le voci di tutte le parti e la fonte di ogni dato; con il GERICO Terminal per i mercati.
Sito statico: HTML, CSS e JavaScript senza framework e senza build. Nessun server, nessuna chiave nel repository.

## Struttura

```
site/                 la cartella pubblicata da Cloudflare
  index.html          prima pagina (sezioni con #mondo, #italia, ... e #seguiti)
  storia.html?id=...  una notizia: l'articolo di GERICO, cosa non si sa ancora, parere, cronologia, fonti
  terminal.html       GERICO Terminal: mappa a quadrati, indici, valute, tassi, materie prime, agenda, notizie
  come-funziona.html, privacy.html, 404.html
  assets/             css, js, font (Atkinson Hyperlegible e Newsreader, licenza OFL) e immagini
  data/               i dati dell'edizione, scritti dalla pipeline
redazione/            i testi dei giri (notizie, chiusure europee, titoli da seguire) e il database in redazione/db
scripts/redazione.py  quale giro fare, controllo del database, pubblicazione (workflow «Redazione»)
scripts/export.py     dal database della redazione ai file di site/data
scripts/set_site_url.py  scrive l'indirizzo pubblico nelle anteprime di condivisione
pipeline/             i testi delle attività programmate su claude.ai, finché non passano su GitHub
```

## Da dove arrivano i dati

La redazione gira su GitHub Actions, nel workflow «Redazione» (`.github/workflows/redazione.yml`): ogni giorno alle 7:18
l'edizione completa e alle 13:18 l'aggiornamento di metà giornata, nei giorni feriali alle 18:15 le chiusure delle Borse
europee. Ogni giro avvia Claude Code con il suo testo in `redazione/` (`notizie.md`, `chiusure.md`, `titoli.md`): legge le
testate e scrive il database, che è la cartella `redazione/db`, un file JSON per documento (`stories/<id>.json`,
`markets/snapshot.json`, `agenda/today.json`, `meta/status.json`, ...). Poi `python3 scripts/redazione.py pubblica <giro>`
cancella le storie archiviate da più di 7 giorni, esegue gli script di sempre (`check_dump.py`, `export.py`, `brevi.py`,
`riepilogo.py`, `titoli.py`, `share_pages.py`, `check_site.py`), scrive l'esito in `meta/status.json` (`lastPublish` o
`publishError`) e fa commit e push su main. Se è cambiato il riepilogo, avvia «Dati del Terminal», che lo legge con la voce
sintetica di Gemini (segreto `GEMINI_API_KEY`, livello gratuito; la voce si sceglie con la variabile `GERICO_VOCE` dopo il
workflow «Prova delle voci»); senza chiave, o se il servizio non risponde, legge Kokoro. Cloudflare ripubblica il sito da solo: verso le 7:30, le 13:30 e le 18:20.

Claude Code usa l'abbonamento Claude di Riccardo con il segreto `CLAUDE_CODE_OAUTH_TOKEN` (Settings › Secrets and variables ›
Actions), creato con `claude setup-token` e valido un anno: nessuna chat su claude.ai. Può scrivere solo in `redazione/db` e
usare solo `date` e gli script di `scripts/`; il token di GitHub lo vede solo il passo della pubblicazione. La trascrizione di
ogni giro resta 7 giorni tra gli artifact del run. Il giro «prova» (Actions › Redazione › Run workflow) controlla il token e
la pubblicazione senza cambiare niente. GitHub ragiona in UTC: ogni giro ha un cron per l'ora legale e uno per l'ora solare, e
`scripts/redazione.py giro` fa partire solo quello giusto. Due giri non partono mai insieme (`concurrency`).

Fino a novembre 2026 i giri erano attività programmate su claude.ai, che scrivevano nel database dell'app privata e aprivano
una chat a ogni giro. Gli orari del workflow si accendono quando quelle attività sono spente.

- `edition.json`: storie live in ordine di importanza, più le archiviate degli ultimi 7 giorni
- `markets.json`, `agenda.json`: mercati per classe e agenda del giorno
- `terminal.json`: variazioni degli indici della mappa (finché manca `terminal/snapshot` nel database, sono ricavate dai mercati)
- `weights.json`: pesi della mappa dai factsheet MSCI (documento `terminal/weights` del database), aggiornati una volta al mese
- `tr/en.json`, `tr/it.json`: le traduzioni, vedi «Due lingue»

I prezzi arrivano dalla Borsa, non dalle testate. Il workflow «Prezzi» (`.github/workflows/prezzi.yml`) gira ogni mezz'ora
nelle ore di mercato dei giorni feriali e scarica solo `quotes.json` con yfinance (Yahoo Finance): indici di tutte le Borse
della mappa, valute, tassi Usa, materie prime e cripto, con apertura, chiusura precedente e Borsa aperta o chiusa. Dura circa un
minuto. Lo stesso file lo scrive anche «Dati del Terminal» quattro volte al giorno, che fa anche il resto (macro, SEC, tono delle
notizie, riepilogo a voce, screener); i due non girano mai insieme. Sul sito i numeri di `quotes.json` hanno la precedenza su
quelli della redazione quando sono più recenti (`G.withQuotes` e `G.mapItems` in `common.js`): della redazione restano le
spiegazioni, le storie collegate e i dati che la Borsa non dà (Btp, Bund, spread). Le pagine aperte controllano ogni tre minuti
se sono usciti prezzi nuovi e li mostrano da sole. I timer di GitHub possono partire in ritardo, anche di un'ora: ogni prezzo
porta l'ora a cui si riferisce.

## Due lingue

Il sito si legge in italiano e in inglese: la lingua si sceglie nel menu (resta nel browser) o con `?lang=en` nell'indirizzo.
Le scritte dell'interfaccia stanno nel codice, accanto alla versione italiana (`G.L(italiano, inglese)` e il dizionario `EN`
in `common.js`, per le scritte fisse delle pagine e i nomi). Come funziona e Privacy hanno le due versioni nella pagina
(`data-only="it"` e `data-only="en"`). Date e numeri seguono la lingua.

I contenuti li traduce il workflow «Traduzione» (`.github/workflows/traduzione.yml`, `scripts/traduci.py`) dopo ogni edizione
e dopo i dati del Terminal: i testi della redazione dall'italiano all'inglese (`site/data/tr/en.json`) e i titoli che arrivano
in inglese, Forex Factory e Yahoo Finance, dall'inglese all'italiano (`site/data/tr/it.json`). Ogni file è una mappa
{impronta del testo originale: traduzione}, con la stessa impronta in Python e nel sito (`G.hash`, cyrb53); `G.load` la
applica ai campi da tradurre. Si traducono solo i testi nuovi, con Gemini (segreto `GEMINI_API_KEY`; il modello lo sceglie lo
script tra i «flash», o la variabile `GERICO_GEMINI_TESTO`; «Run workflow» con «modelli» li elenca). Un testo non ancora
tradotto resta nella lingua originale e, per le storie, il sito lo dice («in Italian»). Il riepilogo a voce resta in italiano.

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
