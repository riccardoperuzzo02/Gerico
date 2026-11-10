-- GERICO: lo schema del database D1 (binding DB), in migrazioni numerate.
-- Il Worker le applica da solo, una volta, alla prima richiesta: la tabella versione ricorda l'ultima applicata.
-- Una migrazione nuova si aggiunge in fondo con il numero dopo; quelle vecchie non si cambiano più.
-- Le ore sono millisecondi dal 1970 (Date.now()); i giorni sono date di Roma, «2026-11-10».

-- migrazione 1: account, passkey, sessioni, limiti, visite, errori
CREATE TABLE IF NOT EXISTS utenti (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT,
  admin INTEGER NOT NULL DEFAULT 0,
  creato INTEGER NOT NULL,
  ultimo INTEGER NOT NULL,
  prefs TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS credenziali (
  id TEXT PRIMARY KEY,
  utente TEXT NOT NULL,
  chiave TEXT NOT NULL,
  alg INTEGER NOT NULL,
  contatore INTEGER NOT NULL DEFAULT 0,
  trasporti TEXT NOT NULL DEFAULT '[]',
  sincronizzata INTEGER NOT NULL DEFAULT 0,
  creata INTEGER NOT NULL,
  usata INTEGER
);
CREATE INDEX IF NOT EXISTS credenziali_utente ON credenziali (utente);
CREATE TABLE IF NOT EXISTS sessioni (
  hash TEXT PRIMARY KEY,
  utente TEXT NOT NULL,
  creata INTEGER NOT NULL,
  scade INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessioni_utente ON sessioni (utente);
CREATE TABLE IF NOT EXISTS sfide (
  id TEXT PRIMARY KEY,
  sfida TEXT NOT NULL,
  tipo TEXT NOT NULL,
  dati TEXT NOT NULL DEFAULT '{}',
  scade INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS limiti (
  chiave TEXT NOT NULL,
  minuto INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (chiave, minuto)
);
CREATE TABLE IF NOT EXISTS visite (
  giorno TEXT NOT NULL,
  pagina TEXT NOT NULL,
  paese TEXT NOT NULL,
  lingua TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (giorno, pagina, paese, lingua, dispositivo)
);
CREATE TABLE IF NOT EXISTS unici (
  giorno TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (giorno, hash)
);
CREATE TABLE IF NOT EXISTS giorni (
  giorno TEXT PRIMARY KEY,
  unici INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS errori (
  firma TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  messaggio TEXT NOT NULL,
  file TEXT NOT NULL DEFAULT '',
  riga INTEGER NOT NULL DEFAULT 0,
  pagina TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL,
  primo INTEGER NOT NULL,
  ultimo INTEGER NOT NULL
);
