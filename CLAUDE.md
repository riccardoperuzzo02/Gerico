# GERICO

Sito di notizie in italiano e inglese, con il Terminal per i mercati. Pagine statiche in `site/` (HTML, CSS e JavaScript
senza framework e senza build) e un Worker Cloudflare in `worker/` per account, preferenze, visite e orari.
Il README spiega tutto il resto: leggilo solo per la parte che ti serve.

## Dove stanno le cose

- `site/` pagine, `site/assets/{css,js}`, `site/data/` dati generati dalla pipeline (non si modificano a mano)
- `worker/index.js` API e gestionale, `worker/orari.js` gli orari che avviano i workflow, `worker/schema.sql` il D1
- `scripts/` la pipeline in Python (`export.py`, `share_pages.py`, `audio.py`, `traduci.py`, `check_site.py`...)
- `redazione/*.md` i testi dei giri di Claude Code, `redazione/db/` il database della redazione (JSON)
- `.github/workflows/` i job; li avvia `worker/orari.js` con `workflow_dispatch`

## Regole fisse

- Rispondi in italiano, frasi semplici, niente tono da AI. Niente consigli di investimento, in nessun testo.
- Mai chiavi, token o email private nel repository: il repository è pubblico. I segreti stanno in GitHub e in Cloudflare.
- Lo screener (`screener/`) non va mai nel repository. I titoli da seguire restano spenti finché Riccardo non dice
  «attiva i titoli»; prima vanno rifatti `redazione/titoli.md` e `pipeline/prompt-titoli.md`.
- Niente cookie propri per chi non ha un account, niente analytics di terzi, font in locale. TradingView si carica solo
  dopo il clic di chi legge (consenso in `gerico.tv`).
- L'avviso «scritto con l'intelligenza artificiale, voce sintetica» sta solo nel piede delle pagine.
- Tutto deve stare nello schermo, dal telefono da 320 px in su: una fila di schede che non ci sta diventa un menu.
- Rispetta `prefers-reduced-motion`. Per le interfacce segui la skill `regole-design`.
- Niente loghi Apple o font SF, niente marchi di altre testate.

## Prima di ogni push su main

1. `python3 scripts/check_site.py site`
2. `node --check` sui file JS toccati
3. Se cambiano CSS o JS, alza la versione `?v=AAAAMMGG-N` in tutte le pagine (anche `worker/admin.html` e `sw.js`).
4. Dopo il push controlla che la build «Workers Builds: gerico» sia andata a buon fine.

Il messaggio di commit è in italiano e dice cosa cambia per chi legge il sito.

## Anteprima

`python3 -m http.server 8765 -d site`, oppure `npx wrangler dev` per account e gestionale (segreti di prova in `.dev.vars`).

## Voce del riepilogo

`scripts/audio.py`: Gemini TTS, di riserva Kokoro. Il testo passa da `scripts/pronuncia.py` prima della sintesi; le parole
lette male si aggiungono a `scripts/pronuncia.json`. Il workflow «Controllo della voce» trascrive l'audio e propone le correzioni.
