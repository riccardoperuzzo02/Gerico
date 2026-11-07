# GERICO: identità «Tratto»

Scelta il 3 novembre 2026 fra tre rifiniture di «Evidenziatore». Le regole qui sotto valgono per sito, Terminal, immagini e audio. I valori stanno in `site/assets/css/gerico.css` (blocco «identità Tratto» in fondo).

## Idea

GERICO legge più testate e mette in evidenza i fatti condivisi. Il segno è il tratto dell'evidenziatore: si usa per dire «questo conta», non per decorare.

## Colori

| Ruolo | Chiaro | Scuro e Terminal |
|---|---|---|
| Fondo (`--ground`) | #FAF8F3, color carta | #0B0B0C, nero inchiostro |
| Riquadri (`--group`) | #FFFFFF con filo #E4DFD3 | #161618 con filo #26262A |
| Testo (`--ink`) | #0B0B0C | #F5F5F2 |
| Evidenziatore (`--hl`) | #FFD60A | #FFD60A |
| Tratto sotto il nome (`--band-color`) | #FFD60A | #3B350B, oliva scuro |
| Nome (`--brand`) | #0B0B0C | #FFD60A |
| Su e giù (`--up`, `--down`) | #0B7A3B, #B42318 | i verdi e rossi del tema scuro |

Un solo giallo. Il giallo non si usa per i testi su fondo chiaro (non si legge): lì si usa il tratto sotto il testo.

## Il tratto

- Dove sì: il nome GERICO; il titolo d'apertura della prima pagina; la sezione negli occhielli; la sezione attiva (linea di 4 px); la selezione del testo; la sottolineatura dei link; l'avanzamento del riepilogo a voce.
- Dove no: titoli delle altre notizie, pulsanti, numeri dei mercati, etichette di stato.
- Forma: copre la metà bassa delle lettere (dal 52% al 94% dell'altezza), con le punte oblique (2%). Al buio il nome diventa giallo e il tratto oliva scuro.
- È un `::before` dietro al testo: si anima con `transform: scaleX()` da sinistra.

## Caratteri

- Atkinson Hyperlegible Next, servito dal sito (nessun font esterno).
- Titoli 800, spaziatura stretta (da −0,02 a −0,03 em). Testo 400. Occhielli 800 maiuscoli con spaziatura 0,06 em.
- Cifre tabellari nei numeri che cambiano (prezzi, tempi del riepilogo).

## Spazi e forme

- Raggio dei riquadri 14 px; riquadri bianchi con un filo da 1 px, senza ombre in chiaro.
- Margini laterali 16 px sul telefono.
- Aree da toccare di almeno 44 px.
- Aria: righe dell'elenco a 24 px, blocchi a 38-44 px l'uno dall'altro, riquadri con 20 px dentro (16 sul telefono, 12 sotto i 360 px). Le regole stanno in fondo a `gerico.css`, sotto «più aria».

## Movimento

- Quattro durate: `--t-1` 140 ms (risposte al tocco), `--t-2` 220 ms (piccoli cambi), `--t-3` 360 ms (pannelli), `--t-4` 560 ms (passaggi grandi); `--t-push` 380 ms per le pagine.
- Curve: `--ease` per quasi tutto, `--ease-emph` per il tratto, `--ease-exit` per ciò che esce, `--ease-push` (parte svelta e si posa piano) per pagine, sezioni e indicatori (`--snap`). Niente rimbalzi.
- Solo `transform` e `opacity`. Con «riduci movimento» resta una dissolvenza breve.
- Pagine sul telefono: si spingono come in un'app. Avanti la nuova entra intera da destra e la vecchia scivola un po' sotto; indietro la pagina in cima esce a destra. La barra in alto e quella del riepilogo restano ferme. Sul computer le pagine scivolano di poco e si incrociano.
- Notizie e Terminal stanno una accanto all'altra (il Terminal a destra, come nell'interruttore) e si spingono intere, barra in alto compresa.
- Swipe (sezioni della prima pagina, mappa e grafici del Terminal, storie): il contenuto sta attaccato al dito, uno a uno, e quello accanto entra dal lato, intero, a 28 px di distanza, insieme all'indicatore delle schede. Al rilascio prosegue con la velocità del dito e si posa come una molla senza rimbalzo (`G.swipeAnim`: curva `linear()` a punti, 0,26-0,76 s, più breve se il colpo è veloce); passa con un colpo deciso o oltre un terzo della larghezza. La pagina accanto copre quella sotto e resta finché la vera è disegnata. Oltre l'ultima pagina fa resistenza, come su iOS. Una sezione nuova comincia dall'inizio, sotto la barra delle sezioni. Toccando una sezione succede lo stesso dello swipe (sezione accanto già pronta, stessa molla, con la spinta di un colpo deciso). Durante lo swipe la pagina non scorre su e giù, nemmeno con il dito in diagonale. Nel Terminal la vista della mappa (mappa, legenda, valori, dettaglio) e il gruppo dei grafici si sfogliano interi; se il contenuto che arriva è più alto o più basso, lo spazio si adegua con la stessa molla e quello che sta sotto non salta mai. Le viste accanto si preparano a pagina ferma.
- Barra delle sezioni sul telefono: scorre da un bordo all'altro dello schermo, libera (niente aggancio alle schede, niente sfumatura con una maschera: su iOS rende a scatti un elemento che scorre). La scheda scelta va al centro; durante lo swipe la barra scorre con il dito, l'indicatore la segue e il colore dei due nomi passa dall'uno all'altro.
- Entrata: a ogni nuova apertura del sito il tratto attraversa il nome al centro, il nome aspetta che le notizie siano pronte (al massimo 1,5 s), va al suo posto e le notizie salgono a cascata.

## Voce

- Riepilogo a voce: Nicola di Kokoro con il 15% di Sara, velocità 1,1, letto frase per frase; volume a −16 LUFS, AAC 64 kbps.
- Sigla: due note di marimba (la e mi), 1,25 s, generate in `scripts/audio.py`.
- Testo per l'orecchio: frasi brevi, passaggi tra i temi, numeri raggruppati, sigle scritte come si leggono.

## Tono dei testi

Italiano semplice, come una persona che spiega a un collega. Niente aggettivi enfatici né frasi fatte. I fatti prima, le interpretazioni dopo e dichiarate. Mai consigli di comprare o vendere.

## Icone e immagini

- Icona: quadrato giallo con la G nera. Nessun logo o simbolo di altri (niente icone Apple).
- Immagine di condivisione: fondo chiaro, GERICO con il tratto, la riga di mattoncini delle testate.

## Prova grafica (7 novembre)

Una prima pagina di prova da confrontare con quella di adesso. Si accende con `?prova=1` in fondo all'indirizzo (resta accesa nella scheda finché non la chiudi) e si spegne con `?prova=0` o dal menu, «Torna alla grafica di adesso». Senza prova il sito è identico a prima: tutte le regole stanno in fondo a `gerico.css` sotto `html.prova`, e la barra in basso esiste solo in prova.

- Titoli, sommari e intestazioni dei blocchi in Newsreader (OFL, servito dal sito, si scarica solo in prova), peso 600; il giorno in alto grande e leggero (400). Il resto resta in Atkinson Hyperlegible Next.
- Fondo grigio carta (#F1F0EC; al buio #0B0B0C), ogni storia un riquadro bianco con angoli da 22 px e un'ombra appena (al buio un filo).
- Ultim'ora come pillola che galleggia; sezioni in parole normali, la scelta in nero con un tratto giallo sottile sotto la parola.
- Sul telefono il nome sta al centro, da solo. Notizie, Terminal, Ascolta (il riepilogo a voce) e Menu stanno in una barra a pillola in basso, che resta ferma tra le pagine; la voce scelta ha la sua pillola bianca. La barra del riepilogo sale sopra di lei.
- Il nome GERICO e il giallo evidenziatore restano i nostri: delle app dei quotidiani si prende solo il modo di impaginare, nessun marchio.
