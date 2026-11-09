# Gerico: identità «Quotidiano», bianco e blu navy

Scelta il 7 novembre 2026, dopo una prova da confrontare con la grafica di prima («Tratto», gialla, del 3 novembre). Le regole qui sotto valgono per sito, Terminal e immagini. I valori stanno in fondo a `site/assets/css/gerico.css`, nel blocco «grafica nuova», sotto la classe `nuova` che ogni pagina ha sull'`html`. Le regole delle grafiche di prima restano più su nel file e qui si scavalcano.

## Idea

Un'app di quotidiano: titoli con le grazie, riquadri bianchi che galleggiano su un fondo grigio chiaro, un solo colore, il blu navy, per il nome, le etichette e i comandi. Al buio il fondo diventa una notte blu navy e i comandi diventano bianchi. Dalle app dei giornali si prende il modo di impaginare, mai nomi, loghi o caratteri d'altri.

## Il nome

- «Gerico.» in Newsreader 750, taglio da titolo (opsz 72), spaziatura −0,018 em, tutto in blu navy compreso il punto; al buio e nel Terminal tutto bianco. Nel testo delle pagine resta GERICO: il CSS lo scrive in minuscolo con la prima lettera grande (`::first-letter`, quindi il nome è un blocco e non un flex).
- Sul telefono sta al centro della barra in alto, da solo (28 px); sul computer a sinistra (31 px).

## Colori

| Ruolo | Chiaro | Scuro (anche il Terminal) |
|---|---|---|
| Fondo (`--ground`) | #F2F2F2, grigio chiaro | #0A1428, notte blu navy |
| Riquadri (`--group`) | #FFFFFF con un'ombra appena | #111E38 con un filo bianco al 6% |
| Testo (`--ink`) | #121D36, nero con un fondo di navy | #EEF2F8 |
| Testo secondario (`--muted`) | #5F6780 | #95A1B9 |
| Navy (`--accent`): nome, etichette, pulsanti, link | #1B2F5B | bianco (#FFFFFF) |
| Su e giù (`--up`, `--down`) | #0B7A3B, #B42318 | i verdi e rossi del tema scuro |
| Muro delle testate | navy pieno chi concorda, #A9B8D8 in parte | bianco e #4F6390 |
| Parere (`--palm-weak`) | #EDF1F8 | #13213D |
| Stati del Terminal (`--t-accent`) | | #A9BDEB, azzurro tenue |

Un solo colore oltre al bianco, al grigio e al testo. Il verde e il rosso restano ai mercati. «Versioni diverse» resta in bruno (`--split`).

## Caratteri

- Titoli, sommari, nome e intestazioni dei blocchi: Newsreader (OFL), servito dal sito; titoli 600, il giorno in alto («Oggi», «Ieri») grande e leggero (400).
- Il resto, occhielli, righe di servizio, numeri, comandi: Atkinson Hyperlegible Next.
- Occhielli in parole normali: la sezione in un'etichetta navy con il filo (al buio bianca), poi l'ora in grigio. Sezioni della prima pagina in parole normali, la scelta in nero con un filo navy di 2 px sotto la parola.
- Cifre tabellari nei numeri che cambiano (prezzi, tempi del riepilogo).

## Spazi e forme

- Ogni storia è un riquadro con angoli da 22 px; tra un riquadro e l'altro 12 px; dentro 20 px (18 sul telefono).
- Ultim'ora: una pillola che galleggia sotto il nome, con l'etichetta navy.
- Margini laterali 16 px sul telefono. Aree da toccare di almeno 44 px.
- Barra in basso, solo sul telefono: Notizie, Terminal, Ascolta (il riepilogo a voce) e Menu, in una pillola di vetro; la voce scelta ha la sua pillola bianca. Resta ferma tra le pagine. La barra del riepilogo, di vetro anche lei con il pulsante navy, sale sopra di lei.

## Movimento

- Quattro durate: `--t-1` 140 ms (risposte al tocco), `--t-2` 220 ms (piccoli cambi), `--t-3` 360 ms (pannelli), `--t-4` 560 ms (passaggi grandi); `--t-push` 380 ms per le pagine.
- Curve: `--ease` per quasi tutto, `--ease-emph` per il tratto, `--ease-exit` per ciò che esce, `--ease-push` (parte svelta e si posa piano) per pagine, sezioni e indicatori (`--snap`). Niente rimbalzi.
- Solo `transform` e `opacity`. Con «riduci movimento» resta una dissolvenza breve.
- Pagine sul telefono: si spingono come in un'app. Avanti la nuova entra intera da destra e la vecchia scivola un po' sotto; indietro la pagina in cima esce a destra. La barra in alto, la barra in basso e quella del riepilogo restano ferme. Sul computer le pagine scivolano di poco e si incrociano.
- Notizie e Terminal sono due schede: la pagina vecchia sfuma in 140 ms, la nuova compare in 270 ms con un leggero avvicinamento (dal 98,5%), attraverso il colore di fondo della pagina nuova; la barra in basso resta ferma e sfuma da un colore all'altro.
- Tema chiaro o scuro e dimensione del testo: la pagina vecchia sfuma sopra la nuova in 320 ms. Niente cerchi, niente scorci.
- Swipe (sezioni della prima pagina, mappa e grafici del Terminal, storie): il contenuto sta attaccato al dito, uno a uno, e quello accanto entra dal lato, intero, a 28 px di distanza, insieme all'indicatore delle schede. Al rilascio prosegue con la velocità del dito e si posa come una molla senza rimbalzo (`G.swipeAnim`: curva `linear()` a punti, 0,26-0,76 s, più breve se il colpo è veloce); passa con un colpo deciso o oltre un terzo della larghezza. La pagina accanto copre quella sotto e resta finché la vera è disegnata. Oltre l'ultima pagina fa resistenza, come su iOS. Una sezione nuova comincia dall'inizio, sotto la barra delle sezioni. Toccando una sezione succede lo stesso dello swipe (sezione accanto già pronta, stessa molla, con la spinta di un colpo deciso). Durante lo swipe la pagina non scorre su e giù, nemmeno con il dito in diagonale. Nel Terminal la vista della mappa (mappa, legenda, valori, dettaglio) e il gruppo dei grafici si sfogliano interi; se il contenuto che arriva è più alto o più basso, lo spazio si adegua con la stessa molla e quello che sta sotto non salta mai. Le viste accanto si preparano a pagina ferma.
- Barra delle sezioni sul telefono: scorre da un bordo all'altro dello schermo, libera (niente aggancio alle schede, niente sfumatura con una maschera: su iOS rende a scatti un elemento che scorre). La scheda scelta va al centro; durante lo swipe la barra scorre con il dito, l'indicatore la segue e il colore dei due nomi passa dall'uno all'altro.
- Entrata: a ogni nuova apertura del sito il nome compare al centro e il punto arriva con un piccolo scatto; il nome aspetta che le notizie siano pronte (al massimo 1,5 s), va al suo posto e le notizie salgono a cascata.

## Voce

- Riepilogo a voce: Gemini 3.8 Flash TTS di Google, voce Charon (maschile, «informativa») finché non se ne sceglie un'altra con la variabile `GERICO_VOCE`; stile in una riga fissa (conduttore di un notiziario radio del mattino, calmo e cordiale, ritmo naturale, senza enfasi), fuori dal testo. Un paragrafo per richiesta, silenzi tagliati in testa e in coda, 0,7 s tra un tema e l'altro; volume a −16 LUFS, compressione morbida, AAC 64 kbps.
- Controlli: ogni pezzo fra 1,7 e 4,2 parole al secondo, altrimenti si rifà (fino a 4 volte); se non va, tutto il riepilogo lo legge la voce di riserva. Mai due voci nello stesso audio.
- Voce di riserva: Nicola di Kokoro con il 15% di Sara, velocità 1,1, frase per frase, con le grafie fonetiche dei nomi stranieri.
- Sigla: due note di marimba (la e mi), 1,25 s, generate in `scripts/audio.py`.
- Testo per l'orecchio: frasi brevi, passaggi tra i temi, numeri raggruppati, sigle scritte come si leggono. Per la voce di Gemini i nomi restano veri (Trump, Reuters); GERICO si legge «Gèrico».

## Tono dei testi

Italiano semplice, come una persona che spiega a un collega. Niente aggettivi enfatici né frasi fatte. I fatti prima, le interpretazioni dopo e dichiarate. Mai consigli di comprare o vendere.

## Icone e immagini

- Icona: quadrato blu navy con la G bianca di Newsreader (`favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, quest'ultima senza angoli: li arrotonda iOS).
- Immagine di condivisione (`og-gerico.png`, 1200×630): fondo grigio chiaro, un riquadro bianco con «Gerico.» in navy, la frase sotto e la riga di mattoncini delle testate.
- Nessun logo o simbolo di altri (niente icone Apple, niente marchi di altri giornali).
