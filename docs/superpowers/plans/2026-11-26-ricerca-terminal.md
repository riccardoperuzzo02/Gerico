# Ricerca nel Terminal: piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un campo di ricerca sempre in vista nel Terminal che trova titoli, strumenti, eventi, voci e notizie, più i titoli fuori indice da Yahoo Finance.

**Architecture:** la ricerca nei dati di GERICO gira nel browser (`site/assets/js/ricerca.js`, funzioni pure più l'interfaccia). Il Worker aggiunge due rotte senza database (`worker/yahoo.js`) per la ricerca e i prezzi di Yahoo. `terminal.js` espone a `ricerca.js` le azioni che già sa fare (aprire un indice su un titolo, un grafico, una sezione).

**Tech Stack:** JavaScript senza framework né build, Cloudflare Worker, `node --test` per le prove delle funzioni pure, Playwright con Chrome per le prove nella pagina.

**Spec:** `docs/superpowers/specs/2026-11-26-ricerca-terminal-design.md`

## Global Constraints

- Testi in italiano e inglese con `G.L(it, en)`; nessun consiglio di investimento, nessun segnale; «titoli da seguire» resta spento.
- Tutto nello schermo da 320 px; `prefers-reduced-motion` rispettato; regole di disegno (OKLCH con riserva, bordi in trasparenza, angoli come il resto del Terminal `html.nuova`: dritti).
- Il browser chiama solo `/api/*` del sito (CSP `connect-src 'self'`): nessuna chiamata a terzi dal browser.
- Niente segreti nel repository; le ricerche non si annotano (né nel database né negli errori).
- Prima del push: `python3 scripts/check_site.py site`, `node --check` sui JS toccati, versione `?v=20261126-1` in tutte le pagine, `worker/admin.html` e `sw.js`; dopo il push, build «Workers Builds: gerico» riuscita.

## Review Focus

- Yahoo non risponde, va in timeout o dà 429/403: restano i risultati di GERICO e una riga lo dice, niente attesa infinita (Task 1 e Task 3).
- Telefono da 320 px con la tastiera aperta: il campo resta in vista, l'elenco scorre, niente righe che escono dallo schermo (Task 3).
- Testi con accenti, simboli e spazi («Société Générale», «S&P», «eur/usd», «^GSPC», «BRK-B»): si trovano e il Worker li valida (Task 1 e Task 2).
- Si scrive in fretta: le risposte vecchie non coprono quelle nuove (Task 3).
- Si sceglie un titolo mentre si è dentro un altro indice, o un indice che non si carica: si passa all'indice giusto, o compare la frase di indice non disponibile (Task 4).

---

### Task 1: Worker, ricerca e prezzi da Yahoo

**Files:**
- Create: `worker/yahoo.js`
- Modify: `worker/index.js` (import; in `api()` le due rotte prima del controllo `env.DB`)
- Test: `tests/yahoo.test.mjs`

**Interfaces:**
- Produces: `GET /api/cerca?q=` → `{ q, risultati: [{ s, n, b, k }] }` (simbolo, nome, Borsa, tipo tra `azione etf fondo indice valuta cripto future`), al massimo 8, `Cache-Control: private, max-age=600`.
- Produces: `GET /api/titolo?s=` → `{ s, n, b, k, cur, p, t, prev, c, c1w, c1m, c3m, lo, hi, lo52, hi52, spark, url }`, `Cache-Control: private, max-age=120`.
- Errori: 400 `{ errore: "testo" | "simbolo" }`, 502 `{ errore: "yahoo" }`, 503 `{ errore: "pausa" }` (un minuto dopo un 429).
- Funzioni esportate: `testoRicerca(q) -> string`, `simboloValido(s) -> boolean`, `leggiRicerca(json) -> Array`, `leggiGrafico(json) -> object|null`, `rispondiYahoo(url, fetchFn) -> Promise<Response>`.

- [ ] Prove: `leggiRicerca` tiene EQUITY/ETF/MUTUALFUND/INDEX/CURRENCY/CRYPTOCURRENCY/FUTURE, scarta OPTION e doppioni, usa `longname` poi `shortname`, massimo 8. `leggiGrafico`: prezzo da `regularMarketPrice`; `prev` è la chiusura dell'ultima barra con data (fuso della Borsa) prima di quella di `regularMarketTime`; `c` in percentuale a due decimali; `c1w/c1m/c3m` dalle chiusure di 5, 21 e tutte le barre prima; `spark` al massimo 66 punti; `null` senza prezzo. `simboloValido`: sì a `ENI.MI`, `^GSPC`, `EURUSD=X`, `BRK-B`, `M&M.NS`; no a `../x`, vuoto, più di 24 caratteri. `testoRicerca`: toglie i caratteri di controllo, taglia a 60, vuoto se meno di 1 carattere. Con un `fetchFn` finto che dà 429 la risposta è 503 e la chiamata dopo non tocca `fetchFn`.
- [ ] `node --test tests/` → falliscono.
- [ ] Scrivere `worker/yahoo.js`: `fetch` con User-Agent da browser, `AbortController` a 4000 ms, memoria `Map` con scadenza (ricerca 10 min, prezzi 2 min, al più 300 voci), pausa di 60 s dopo un 429.
- [ ] `node --test tests/` → passano. `wrangler dev` in locale: `/api/cerca?q=` → 400, `/api/titolo?s=../x` → 400, `/api/cerca?q=eni` → 502 `yahoo` (dalla sandbox Yahoo non si raggiunge).
- [ ] Commit, push, build riuscita; prova dal vivo di `/api/cerca?q=eni` e `/api/titolo?s=ENI.MI`. Se Yahoo blocca il Worker, fermarsi e dirlo a Riccardo prima del resto.

### Task 2: il motore della ricerca nel browser

**Files:**
- Create: `site/assets/js/ricerca.js` (parte pura in cima)
- Test: `tests/ricerca.test.mjs` (carica il file in `vm` con un `G` finto)

**Interfaces:**
- Produces: `G.ricercaIndice({ indici, quotes, societari, agenda, calendario, glossario }) -> indice` e `G.ricercaTrova(indice, q) -> { ws, titoli, strumenti, societa, agenda, glossario, sezioni }`; ogni riga `{ tipo, id, nome, sotto, valore?, cambio?, rif }` con `rif` che dice cosa aprire (`{ code, sym }`, `{ sym }`, `{ so }`, `{ cmd }`, `{ gl }`).
- Consumes: `G.cerca.norm` (common.js) per togliere accenti e maiuscole.

- [ ] Prove: «eni» mette Eni (ENI.MI, FTSE MIB) prima di «Enel»; «AAPL» trova Apple col ticker esatto in cima; «societe generale» trova Société Générale; «eurusd» e «eur/usd» trovano EUR/USD; «oro» trova l'oro; «agenda» dà la sezione; «spread» la voce del glossario; ogni parola deve esserci; al massimo 6 titoli e 4 per gli altri gruppi; testo di una lettera → gruppi vuoti tranne i ticker esatti.
- [ ] `node --test tests/` → falliscono. Scrivere le funzioni. `node --test tests/` → passano.

### Task 3: il campo nella barra in alto

**Files:**
- Modify: `site/terminal.html` (modulo `#t-cerca` nella riga dell'orologio; via il vecchio `.t-tools`; `ricerca.js` dopo `terminal.js`)
- Modify: `site/assets/js/ricerca.js` (interfaccia), `site/assets/css/gerico.css` (blocco «Ricerca nel Terminal (26 novembre)»)
- Test: `tests/ricerca_pagina.py` (Playwright: 320, 390 e 1280 px, italiano e inglese)

**Interfaces:**
- Consumes: Task 1 (`/api/cerca`), Task 2, `G.cerca.trova` per le notizie, `G.term` del Task 4.
- Produces: combobox `#tq` con listbox `#tq-l`; «/» porta al campo (ascoltatore in cattura su `window`, prima della ricerca delle notizie).

- [ ] Prove nella pagina: il campo si vede dopo aver scorso di 2000 px a 320/390/1280; «eni» mostra Eni tra i titoli entro 300 ms; frecce + Invio aprono la riga scelta; Esc chiude; con `/api/cerca` che risponde 502 compare «Yahoo Finance non risponde ora» e i risultati di GERICO restano; a 320 px nessun elemento più largo dello schermo e l'elenco sta sopra la barra delle schede in basso; scrivendo «e», «en», «eni» di fila resta l'elenco di «eni».
- [ ] Sul telefono il campo sta nella riga di «Vai a una sezione» (scritta accorciata in «Sezioni»), sul computer nella prima riga: un solo modulo spostato con `matchMedia("(min-width: 1000px)")`.
- [ ] I dati dei titoli (13 file `indici/*`) si caricano al primo uso del campo, non all'apertura della pagina.

### Task 4: cosa si apre

**Files:**
- Modify: `site/assets/js/terminal.js` (`G.term`, `enter(code, { sel })`, scheda del titolo più ricca)
- Modify: `site/assets/js/ricerca.js` (foglio del titolo da Yahoo con `G.conto.foglio` e `G.spark`)

**Interfaces:**
- Produces: `G.term = { titolo(code, sym), strumento(sym), comando(cmd), societa(kind) }`.
- Consumes: `/api/titolo` del Task 1.

- [ ] Prove nella pagina: scegliendo «Eni» si apre il FTSE MIB con Eni scelto e la scheda dice prezzo, variazione, peso e, se c'è, la prossima trimestrale o cedola; da dentro il DAX scegliendo «Apple» si passa all'S&P 500; scegliendo un titolo di Yahoo si apre il foglio con prezzo, variazione, tre mesi e il link a Yahoo; con `/api/titolo` in errore il foglio lo dice.

### Task 5: Privacy, versioni, pubblicazione

**Files:**
- Modify: `site/privacy.html` (italiano e inglese, data «26 novembre / November 2026»), tutte le pagine con `?v=`, `worker/admin.html`, `site/sw.js`

- [ ] `python3 scripts/check_site.py site` senza errori; `node --check` su `ricerca.js`, `terminal.js`, `worker/yahoo.js`, `worker/index.js`; `node --test tests/` passa; Playwright del Task 3 e 4 passa.
- [ ] Commit in italiano che dice cosa cambia per chi legge; push; build riuscita; prova dal vivo della ricerca.
