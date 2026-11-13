// Gli orari di GERICO. Cloudflare chiama il Worker ogni minuto, puntuale; qui si decide quali workflow di GitHub far
// partire in quel minuto (GitHub da solo fa partire i suoi cron quando può, a volte con ore di ritardo o mai).
// Serve il segreto GITHUB_AVVIO: un token di GitHub limitato a questo repository, con il solo permesso «Actions:
// read and write». Senza il segreto non parte niente da qui e restano gli orari di GitHub.
const REPO = "riccardoperuzzo02/Gerico";
const FERIALI = [1, 2, 3, 4, 5];

// ora di Roma (cambia da sola con l'ora legale)
const ROMA = [
  { wf: "redazione.yml", ore: [[7, 18]], inputs: { giro: "notizie", variante: "7:18" } },
  { wf: "redazione.yml", ore: [[9, 47]], inputs: { giro: "paesi" } },
  { wf: "redazione.yml", ore: [[13, 18]], inputs: { giro: "notizie", variante: "13:18" } },
  // i risultati dei dati usciti nell'agenda del Terminal: dopo i dati europei di mattina e dopo quelli americani delle 14:30
  { wf: "redazione.yml", ore: [[12, 10], [15, 40]], giorni: FERIALI, inputs: { giro: "agenda" } },
  // alle 19:30 il giro riparte solo se alle 18:45 gli articoli di chiusura non c'erano ancora (lo decide redazione.py)
  { wf: "redazione.yml", ore: [[18, 45], [19, 30]], giorni: FERIALI, inputs: { giro: "chiusure" } }
];
// ora UTC, come erano scritti nei workflow
const mezzore = [];
for (let h = 6; h <= 21; h++) mezzore.push([h, 7], [h, 37]);
const UTC = [
  { wf: "prezzi.yml", ore: mezzore, giorni: FERIALI },
  { wf: "paesi.yml", ore: [5, 7, 9, 11, 13, 15, 17, 19, 21].map((h) => [h, 17]) },
  { wf: "dati-terminal.yml", ore: [[5, 47], [11, 17], [16, 52], [21, 23]], giorni: FERIALI },
  { wf: "dati-terminal.yml", ore: [[9, 13]], giorni: [6] }
];

const GIORNI = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fRoma = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function quandoRoma(ms) {
  const p = {};
  for (const x of fRoma.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { h: Number(p.hour), m: Number(p.minute), g: GIORNI[p.weekday] };
}
const tocca = (riga, q) => (!riga.giorni || riga.giorni.includes(q.g)) && riga.ore.some(([h, m]) => h === q.h && m === q.m);

// i workflow da far partire nel minuto ms
export function daAvviare(ms) {
  const d = new Date(ms), utc = { h: d.getUTCHours(), m: d.getUTCMinutes(), g: d.getUTCDay() }, roma = quandoRoma(ms);
  return ROMA.filter((r) => tocca(r, roma)).concat(UTC.filter((r) => tocca(r, utc))).map((r) => ({ wf: r.wf, inputs: r.inputs || {} }));
}

export async function avvia(env, ms, annota) {
  if (!env.GITHUB_AVVIO) return [];
  const fatti = [];
  for (const a of daAvviare(ms)) {
    let esito = "";
    for (let prova = 0; prova < 3 && esito !== "ok"; prova++) {
      try {
        const r = await fetch("https://api.github.com/repos/" + REPO + "/actions/workflows/" + a.wf + "/dispatches", {
          method: "POST",
          headers: { Authorization: "Bearer " + String(env.GITHUB_AVVIO).trim(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gerico-orari", "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "main", inputs: a.inputs })
        });
        esito = r.status === 204 ? "ok" : "GitHub ha risposto " + r.status;
        // un token sbagliato o senza permessi non migliora riprovando
        if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 422) break;
      } catch (e) { esito = String((e && e.message) || e); }
    }
    fatti.push({ wf: a.wf, giro: a.inputs.giro || "", esito });
    if (esito !== "ok" && annota) await annota("Orari: " + a.wf + (a.inputs.giro ? " (" + a.inputs.giro + ")" : "") + " non è partito: " + esito, a.wf);
  }
  return fatti;
}
