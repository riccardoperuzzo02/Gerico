# GERICO, sito pubblico

Le notizie del giorno in articoli scritti su tutte le fonti, con le voci di tutte le parti e la fonte di ogni dato; con il GERICO Terminal per i mercati.
Le pagine sono file statici: HTML, CSS e JavaScript senza framework e senza build. Un piccolo Worker su Cloudflare (`worker/`)
tiene solo gli account facoltativi, le preferenze, i conteggi delle visite e gli errori, nel database D1. Nessuna chiave nel repository.

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
scripts/mappe.py      la mappa sopra ogni articolo (site/img/storie), con i confini di Natural Earth in scripts/mappe
scripts/set_site_url.py  scrive l'indirizzo pubblico nelle anteprime di condivisione
pipeline/             i testi delle attività programmate su claude.ai, finché non passano su GitHub
worker/index.js       il Worker: /api/ (account con passkey, preferenze, visite, errori) e /admin, il gestionale
worker/webauthn.js    la verifica delle passkey (CBOR, chiavi COSE, firme ES256 e RS256 con WebCrypto)
worker/schema.sql     lo schema del database D1, in migrazioni numerate che il Worker applica da solo
worker/admin.html     la pagina del gestionale, che il Worker dà solo all'amministratore
```

## Da dove arrivano i dati

La redazione gira su GitHub Actions, nel workflow «Redazione» (`.github/workflows/redazione.yml`): ogni giorno alle 7:18
l'edizione completa e alle 13:18 l'aggiornamento di metà giornata, alle 9:47 le notizie nazionali di Stati Uniti, Regno
Unito, Francia, Germania e Spagna (storie con scope «paese», che vede solo chi ha scelto quel paese), nei giorni feriali alle
18:15 le chiusure delle Borse europee. Ogni giro avvia Claude Code con il suo testo in `redazione/` (`notizie.md`,
`paesi.md`, `chiusure.md`, `titoli.md`): legge le
testate e scrive il database, che è la cartella `redazione/db`, un file JSON per documento (`stories/<id>.json`,
`markets/snapshot.json`, `agenda/today.json`, `meta/status.json`, ...). Poi `python3 scripts/redazione.py pubblica <giro>`
cancella le storie archiviate da più di 7 giorni, esegue gli script di sempre (`check_dump.py`, `export.py`, `brevi.py`,
`riepilogo.py`, `titoli.py`, `share_pages.py`, `check_site.py`), scrive l'esito in `meta/status.json` (`lastPublish` o
`publishError`) e fa commit e push su main. Se è cambiato il riepilogo, avvia «Dati del Terminal», che lo legge con la voce
sintetica di Gemini (segreto `GEMINI_API_KEY`, livello gratuito; la voce si sceglie con la variabile `GERICO_VOCE` dopo il
workflow «Prova delle voci»); senza chiave, o se il servizio non risponde, legge Kokoro. Cloudflare ripubblica il sito da solo: verso le 7:30, le 9:50, le 13:30 e le 18:20.

Claude Code usa l'abbonamento Claude di Riccardo con il segreto `CLAUDE_CODE_OAUTH_TOKEN` (Settings › Secrets and variables ›
Actions), creato con `claude setup-token` e valido un anno: nessuna chat su claude.ai (se il token incollato va a capo, perché
il terminale lo spezza a 80 caratteri, il workflow toglie spazi e a capo prima di usarlo). Può scrivere solo in `redazione/db` e
usare solo `date` e gli script di `scripts/`; il token di GitHub lo vede solo il passo della pubblicazione. La trascrizione di
ogni giro resta 7 giorni tra gli artifact del run; le azioni negate a Claude sono elencate nel passo «Giro». Un giro che non
riesce a cominciare (token rifiutato, limite dell'abbonamento) non pubblica niente e il run risulta fallito. Il giro «prova»
(Actions › Redazione › Run workflow) controlla il token e la pubblicazione senza cambiare niente. GitHub ragiona in UTC: ogni giro ha un cron per l'ora legale e uno per l'ora solare, e
`scripts/redazione.py giro` fa partire solo quello giusto. Due giri non partono mai insieme (`concurrency`).

Fino al 10 novembre 2026 i giri erano attività programmate su claude.ai, che scrivevano nel database dell'app privata e
aprivano una chat a ogni giro (i loro testi restano in `pipeline/`). Quella sera le attività sono state spente, il loro
database è stato copiato in `redazione/db` e gli orari del workflow si sono accesi. Un cambio a un giro si fa nel suo file
di `redazione/`.

- `edition.json`: storie live in ordine di importanza, più le archiviate degli ultimi 7 giorni
- `markets.json`, `agenda.json`: mercati per classe e agenda del giorno
- `terminal.json`: variazioni degli indici della mappa (finché manca `terminal/snapshot` nel database, sono ricavate dai mercati)
- `weights.json`: pesi della mappa dai factsheet MSCI (documento `terminal/weights` del database), aggiornati una volta al mese
- `indici/<CODICE>.json`, `indici/elenco.json`: i titoli dentro gli indici della mappa (S&P 500, Nikkei 225, FTSE 100...), con
  peso stimato e variazione della seduta. Li scrive `scripts/indici.py` a ogni giro di «Dati del Terminal»: l'elenco dei titoli da
  Wikipedia ogni quattro settimane, flottante e prezzi da Yahoo Finance. Il workflow «Indici» rifà a mano le composizioni
- `tr/en.json`, `tr/it.json`: le traduzioni, vedi «Due lingue»
- `../img/storie/<id>.svg`: l'immagine di ogni storia live, una mappa del luogo disegnata da `scripts/mappe.py` durante
  `export.py`, con i paesi di `places` (sigle ISO, il primo è quello dove succede) e il punto di `city` {name, lat, lon}, che
  si disegna solo se cade nel paese. Confini: Natural Earth 4.1 (pubblico dominio) dal pacchetto world-atlas 2.0.2 (licenza
  ISC, in `scripts/mappe/LICENSE-world-atlas`); nomi dei paesi: tabella `scripts/mappe/paesi.json`, fatta da pycountry

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

poi apri http://127.0.0.1:8765/ (senza account: le richieste a /api/ non rispondono). Con gli account e il gestionale:
`npx wrangler dev` con un database D1 locale e i segreti di prova in `.dev.vars` (`ADMIN_TOKEN`, `STATS_SALT`), poi
http://localhost:8787/ (le passkey vogliono `localhost`, non `127.0.0.1`).

## Pubblicazione su Cloudflare

Compute › Workers & Pages › Create › Import a repository, repository `Gerico`, nome del progetto `gerico`.
Build command vuoto, Deploy command `npx wrangler deploy`: `wrangler.toml` dice a Cloudflare di pubblicare la cartella `site`
come file statici (gratis, senza limiti di traffico) e il Worker di `worker/index.js`, che risponde solo a `/api/*` e `/admin`
(`run_worker_first`): le altre pagine non passano dal Worker. Ogni push su `main` ripubblica il sito; la pipeline ne fa circa 50 al mese.

Gli account vogliono, una volta sola: il database (Storage & Databases › D1 › Create, nome `gerico`, posizione Europa; il suo
Database ID va in `wrangler.toml`) e due segreti del Worker (Workers & Pages › gerico › Settings › Variables and Secrets ›
Add, tipo Secret): `ADMIN_TOKEN`, il codice che l'amministratore scrive una volta in `/admin` dopo l'accesso con la sua
passkey (poi si può togliere), e `STATS_SALT`, una stringa casuale lunga da cui nasce il sale di ogni giorno per contare i
visitatori unici. Le tabelle le crea il Worker alla prima richiesta (`worker/schema.sql`).
In alternativa funziona anche Cloudflare Pages: Framework preset `None`, Build command `exit 0`, Build output directory `site`.
Quando il sito ha il suo indirizzo: `python3 scripts/set_site_url.py https://<indirizzo>` e push.
