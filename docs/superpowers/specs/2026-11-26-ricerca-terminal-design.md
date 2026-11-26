# Ricerca nel Terminal

26 novembre 2026. Approvato da Riccardo nella chat: proposta di base più la ricerca in diretta dei titoli fuori dagli indici.

## Perché

Riccardo vuole un Terminal più utile: un piccolo campo di ricerca sempre sullo schermo, per trovare in fretta un titolo
o qualunque altra cosa (una valuta, un evento, una voce del glossario, una notizia).

## Approcci

1. Solo i dati che GERICO ha già, tutto nel browser: i 1.193 titoli dei 13 indici della mappa, i 45 strumenti di «Prezzi
   e grafici», trimestrali e cedole, agenda, glossario, notizie. Veloce e senza costi, ma i titoli fuori da quegli indici
   non si trovano.
2. **Scelto.** Il primo, più una ricerca in diretta su Yahoo Finance fatta dal Worker per tutti gli altri titoli, ETF e
   fondi. Trova molto di più. Ogni ricerca passa da Yahoo e può smettere di funzionare se Yahoo la blocca: allora restano i
   risultati di GERICO e una riga che lo dice.
3. Scartato: la ricerca di TradingView. Si carica solo dopo il consenso ai suoi cookie e non dà dati da mostrare nelle
   nostre pagine.

## Obiettivi

- Il campo è sempre in vista, anche scorrendo: sul computer nella prima riga dell'intestazione, sul telefono accanto a
  «Vai a una sezione». Tutto sta nello schermo da 320 px.
- I risultati compaiono mentre si scrive, a gruppi: titoli, strumenti, trimestrali e cedole, agenda, glossario, notizie,
  sezioni, altri titoli da Yahoo Finance.
- Tastiera: «/» porta al campo, le frecce scelgono, Invio apre, Esc chiude. Lettori di schermo: combobox con listbox.
- Un titolo dei 13 indici si apre nella mappa del suo indice con la scheda: prezzo, variazione, peso, settore, prossima
  trimestrale o cedola, notizie di GERICO che lo citano, link a Yahoo Finance.
- Un titolo trovato su Yahoo si apre in un foglio: prezzo, variazione del giorno, una settimana, un mese, tre mesi,
  grafico di tre mesi, minimo e massimo di 52 settimane, Borsa, tipo, valuta, notizie di GERICO che lo citano.
- Il vecchio campo «Vai a» se ne va: i comandi (mappa europa, agenda, eurusd…) diventano risultati.

## Non obiettivi

- Niente segnali, niente consigli, niente «titoli da seguire» (restano spenti).
- Niente ricerche salvate o cronologia.

## Anti-obiettivi

- Il browser non manda a nessun altro quello che si cerca: la ricerca nei dati di GERICO resta nel browser, quella su
  Yahoo passa dal nostro server e Yahoo non vede chi cerca.
- Il Terminal non deve diventare più lento: i dati dei titoli si caricano solo quando si usa la ricerca.

## Come

- Worker: `GET /api/cerca?q=` (ricerca di Yahoo) e `GET /api/titolo?s=` (prezzi di tre mesi di Yahoo). Non usano il
  database. Tempo massimo 4 secondi, memoria di qualche minuto nel Worker e nel browser, pausa di un minuto se Yahoo
  risponde 429. Le ricerche non si annotano da nessuna parte.
- Pagina Privacy aggiornata con la ricerca dei titoli.

## Lasciato a chi costruisce

Punteggi e ordine dei risultati, quanti per gruppo, testi delle righe, aspetto secondo le regole di disegno.
