/* GERICO Terminal: che cosa indica un evento dell'agenda e che effetti ha di solito sui mercati.
   Spiegazioni scritte a mano, valide in generale (non sono previsioni né consigli): la reazione vera di un mercato
   dipende anche da quanto il dato era già scontato. Si riconosce l'evento dal titolo, in italiano o in inglese. */
(function () {
  const G = (window.G = window.G || {});

  // [riconoscimento, italiano {c: cosa misura, e: perché conta, s: se sopra le attese, g: se sotto}, inglese {...}]
  // l'ordine conta: il primo che riconosce il titolo vince (i «core» e i PPI prima dei CPI, i discorsi prima di tutto)
  const T = [
    ["tassi", /decisione (sui|dei) tassi|tassi di interesse|interest rate|rate decision|rate statement|policy rate|bank rate|cash rate|fomc (statement|press)/i,
      { c: "La decisione della banca centrale sul tasso di riferimento, cioè il prezzo del denaro per banche, imprese e famiglie.",
        e: "È l'evento che pesa di più: dà il tono a tutti i mercati. Conta quasi quanto la decisione la frase con cui la banca descrive i passi successivi.",
        s: "Un tasso più alto di quanto previsto, o un tono più severo, tende a sostenere la valuta e a far salire i rendimenti dei titoli di Stato, con pressione sulle azioni.",
        g: "Un tasso più basso del previsto, o un tono più morbido, tende ad indebolire la valuta e a far scendere i rendimenti; le azioni spesso lo accolgono bene." },
      { c: "The central bank's decision on its policy rate, the price of money for banks, firms and households.",
        e: "It is the heaviest event of the calendar: it sets the tone for every market. The wording about next steps matters almost as much as the decision.",
        s: "A rate higher than expected, or a harsher tone, tends to support the currency and push government bond yields up, with pressure on stocks.",
        g: "A rate lower than expected, or a softer tone, tends to weaken the currency and push yields down; stocks often welcome it." }],
    ["verbali", /verbali|minutes|account of the/i,
      { c: "Il resoconto della riunione della banca centrale: chi voleva cosa e come è andata la discussione.",
        e: "Non cambia i tassi, ma mostra se il consiglio è diviso e in che direzione si sta spostando, e quindi cosa aspettarsi alla riunione dopo.",
        s: "Verbali più severi di quanto si pensasse (più voci per tassi alti) tendono a sostenere la valuta.", g: "Verbali più morbidi del previsto tendono ad indebolire la valuta." },
      { c: "The record of the central bank's meeting: who wanted what and how the discussion went.",
        e: "It does not change rates, but it shows whether the board is split and where it is heading, hence what to expect next time.",
        s: "Minutes tougher than expected (more voices for higher rates) tend to support the currency.", g: "Minutes softer than expected tend to weaken the currency." }],
    ["discorso", /parla |parlano |discorso|conferenza stampa|testimon|speaks|speech|press conference|testifies/i,
      { c: "Un intervento in pubblico di un membro di una banca centrale (governatore, presidente o consigliere).",
        e: "Non c'è un numero da confrontare: conta cosa dice sui tassi e sull'economia. Le parole del presidente o del governatore muovono di più di quelle di un membro del consiglio.",
        s: "Parole più dure sull'inflazione o sui tassi tendono a sostenere la valuta.", g: "Parole più prudenti o più morbide tendono a indebolirla." },
      { c: "A public appearance by a central bank official (governor, chair or board member).",
        e: "There is no figure to compare: what matters is what is said about rates and the economy. A chair or governor moves markets more than a board member.",
        s: "Tougher words on inflation or rates tend to support the currency.", g: "More cautious or softer words tend to weaken it." }],
    ["nfp", /non[- ]?farm|non agricol|payroll|occupati non/i,
      { c: "Quanti posti di lavoro sono stati creati negli Stati Uniti nell'ultimo mese, fuori dall'agricoltura.",
        e: "È il dato del lavoro più seguito al mondo. Dice quanto è forte l'economia americana e quanto la Fed può tenere i tassi alti: muove dollaro, rendimenti, Wall Street e oro.",
        s: "Più posti del previsto: economia solida, tassi alti più a lungo. Di solito dollaro e rendimenti salgono; le azioni possono soffrire.",
        g: "Meno posti del previsto: economia più debole, più spazio per tagli ai tassi. Di solito dollaro e rendimenti scendono; l'oro spesso sale." },
      { c: "How many jobs the US economy added last month, outside farming.",
        e: "The most watched labour figure in the world. It shows how strong the US economy is and how long the Fed can keep rates high: it moves the dollar, yields, Wall Street and gold.",
        s: "More jobs than expected: solid economy, rates stay high longer. Usually the dollar and yields rise; stocks may suffer.",
        g: "Fewer jobs than expected: weaker economy, more room for rate cuts. Usually the dollar and yields fall; gold often rises." }],
    ["sussidi", /sussidi|jobless|unemployment claims|initial claims|continuing claims/i,
      { c: "Quante persone hanno chiesto per la prima volta il sussidio di disoccupazione negli Stati Uniti nell'ultima settimana.",
        e: "È un termometro rapido del mercato del lavoro: esce ogni settimana, prima dei dati mensili. Qui un numero alto è un segnale di debolezza.",
        s: "Più richieste del previsto: lavoro più debole. Di solito il dollaro scende.", g: "Meno richieste del previsto: lavoro più solido. Di solito il dollaro sale." },
      { c: "How many people filed for unemployment benefits for the first time in the US last week.",
        e: "A quick gauge of the labour market, out every week ahead of the monthly data. Here a high number is a sign of weakness.",
        s: "More claims than expected: weaker labour market. The dollar usually falls.", g: "Fewer claims than expected: firmer labour market. The dollar usually rises." }],
    ["lavoro", /disoccupazione|unemployment rate|occupazione|occupati|employment|jolts|job openings|offerte di lavoro|salari|retribuzioni|average hourly|wage|earnings|\badp\b/i,
      { c: "Un dato sul mercato del lavoro: occupati, disoccupati, posti vacanti o salari.",
        e: "Il lavoro è il primo indizio sull'inflazione di domani: se i salari salgono, i prezzi tendono a seguirli. Le banche centrali lo guardano con attenzione.",
        s: "Per occupazione e salari, un dato sopra le attese segnala un'economia forte (e più inflazione): tende a sostenere la valuta. Per la disoccupazione vale il contrario: un tasso più alto è un segnale di debolezza.",
        g: "Per occupazione e salari, un dato sotto le attese segnala debolezza e tende a indebolire la valuta. Per la disoccupazione vale il contrario: un tasso più basso è un segnale di forza." },
      { c: "A labour-market figure: employment, unemployment, job openings or wages.",
        e: "Jobs are the first clue to tomorrow's inflation: when wages rise, prices tend to follow. Central banks watch it closely.",
        s: "For jobs and wages, a figure above expectations signals a strong economy (and more inflation) and tends to support the currency. For unemployment it is the other way round: a higher rate is a sign of weakness.",
        g: "For jobs and wages, a figure below expectations signals weakness and tends to weigh on the currency. For unemployment it is the other way round: a lower rate is a sign of strength." }],
    ["ppi", /\bppi\b|prezzi alla produzione|producer price|wpi|prezzi all'ingrosso|prezzi dei produttori/i,
      { c: "Di quanto sono cambiati i prezzi pagati dalle imprese per produrre: è l'inflazione «a monte», prima che arrivi nei negozi.",
        e: "Anticipa in parte l'inflazione al consumo. Il «core» toglie energia e alimentari, che oscillano molto.",
        s: "Prezzi alla produzione più alti del previsto fanno temere più inflazione: tendono a sostenere la valuta e i rendimenti.", g: "Più bassi del previsto: meno pressione sui prezzi, rendimenti e valuta tendono a scendere." },
      { c: "How much the prices firms pay to produce goods have changed: inflation «upstream», before it reaches shops.",
        e: "It partly anticipates consumer inflation. The «core» version strips out energy and food, which swing a lot.",
        s: "Producer prices above expectations raise inflation fears: they tend to support the currency and yields.", g: "Below expectations: less price pressure, yields and the currency tend to ease." }],
    ["cpi", /\bcpi\b|hicp|\bpce\b|inflazione|prezzi al consumo|consumer price|price index|indice dei prezzi/i,
      { c: "Di quanto sono saliti i prezzi che pagano i consumatori, cioè l'inflazione. Con «core» si intende senza energia e alimentari, più stabile.",
        e: "L'inflazione guida le decisioni sui tassi, e i tassi guidano tutto il resto. È uno dei dati che muovono di più.",
        s: "Inflazione più alta del previsto: si teme che la banca centrale tenga i tassi alti. Di solito sale la valuta, salgono i rendimenti e le azioni possono soffrire.",
        g: "Inflazione più bassa del previsto: cresce la possibilità di tassi più bassi. Di solito scendono valuta e rendimenti e le azioni lo accolgono bene." },
      { c: "How much the prices consumers pay have risen: inflation. «Core» leaves out energy and food, and is steadier.",
        e: "Inflation drives rate decisions, and rates drive everything else. It is one of the biggest movers.",
        s: "Inflation above expectations: markets fear the central bank will keep rates high. Usually the currency and yields rise and stocks may suffer.",
        g: "Inflation below expectations: rate cuts look more likely. Usually the currency and yields fall and stocks welcome it." }],
    ["pil", /\bpil\b|\bgdp\b|prodotto interno/i,
      { c: "Quanto è cresciuta (o calata) l'economia di un paese nel periodo: è la misura più completa dello stato di salute.",
        e: "Una stima preliminare o anticipata è la prima lettura e può essere rivista. Un PIL forte sostiene la valuta e le Borse del paese, uno debole fa temere una recessione.",
        s: "Crescita sopra il previsto: tende a sostenere la valuta e le azioni di quel paese, ma può far pensare a tassi più alti.", g: "Crescita sotto il previsto: tende a indebolire la valuta; aumentano le attese di tassi più bassi." },
      { c: "How much a country's economy grew (or shrank) over the period: the broadest measure of its health.",
        e: "A preliminary or advance estimate is the first reading and can be revised. Strong GDP supports the currency and the country's stocks, weak GDP raises recession fears.",
        s: "Growth above expectations: tends to support the currency and the country's stocks, but may point to higher rates.", g: "Growth below expectations: tends to weaken the currency; expectations of lower rates grow." }],
    ["pmi", /\bpmi\b|\bism\b|purchasing manager|indice manifatturiero|manufacturing (pmi|index)|services (pmi|index)/i,
      { c: "Un sondaggio tra i direttori acquisti delle imprese. Sopra 50 punti l'attività cresce, sotto 50 cala.",
        e: "Esce prima dei dati ufficiali, quindi è un'anticipazione dell'andamento dell'economia. Si guarda soprattutto la distanza dalla soglia di 50 e dalle attese.",
        s: "Indice sopra il previsto: attività più forte, tende a sostenere la valuta e le azioni cicliche.", g: "Indice sotto il previsto, e peggio se sotto 50: attività in rallentamento, la valuta tende a scendere." },
      { c: "A survey of firms' purchasing managers. Above 50 activity is growing, below 50 it is shrinking.",
        e: "It comes out before official data, so it is an early read on the economy. What counts is the distance from the 50 line and from forecasts.",
        s: "Index above expectations: stronger activity, tends to support the currency and cyclical stocks.", g: "Index below expectations, worse if under 50: activity slowing, the currency tends to fall." }],
    ["vendite", /vendite al dettaglio|retail sales|consumi|spesa delle famiglie|household spending|consumer spending|brc/i,
      { c: "Quanto spendono i consumatori nei negozi e online.",
        e: "I consumi sono la parte più grande di molte economie, soprattutto quella americana: un dato forte dice che la domanda regge.",
        s: "Vendite sopra il previsto: domanda solida, tende a sostenere la valuta (e può far salire i rendimenti).", g: "Vendite sotto il previsto: domanda in calo, la valuta tende a scendere." },
      { c: "How much consumers spend in shops and online.",
        e: "Consumption is the biggest part of many economies, especially the US: a strong figure says demand is holding up.",
        s: "Sales above expectations: solid demand, tends to support the currency (and may lift yields).", g: "Sales below expectations: demand slowing, the currency tends to fall." }],
    ["produzione", /produzione|industrial production|factory|manifatturier|ordini|orders|durable|beni durevoli|vendite manifatturiere|macchine utensili|capacity/i,
      { c: "Quanto producono fabbriche e industrie, o quanti ordini ricevono.",
        e: "Mostra lo stato dell'industria. Pesa di più nei paesi che vivono di manifattura, come Germania, Giappone e Cina.",
        s: "Dato sopra il previsto: industria in forza, tende a sostenere la valuta e i titoli industriali.", g: "Dato sotto il previsto: industria più debole, la valuta tende a scendere." },
      { c: "How much factories and industry produce, or how many orders they get.",
        e: "It shows the state of industry. It weighs more in manufacturing economies such as Germany, Japan and China.",
        s: "Figure above expectations: industry doing well, tends to support the currency and industrial stocks.", g: "Figure below expectations: weaker industry, the currency tends to fall." }],
    ["commercio", /bilancia commerciale|trade balance|partite correnti|current account|esportazioni|importazioni|exports|imports/i,
      { c: "La differenza tra ciò che un paese vende all'estero e ciò che compra.",
        e: "Un avanzo (più esportazioni) domanda la valuta del paese, un disavanzo la pesa. Conta soprattutto per Germania, Giappone, Cina e Svizzera.",
        s: "Saldo migliore del previsto: tende a sostenere la valuta.", g: "Saldo peggiore del previsto: tende a indebolirla." },
      { c: "The gap between what a country sells abroad and what it buys.",
        e: "A surplus (more exports) creates demand for the currency, a deficit weighs on it. Matters most for Germany, Japan, China and Switzerland.",
        s: "Balance better than expected: tends to support the currency.", g: "Balance worse than expected: tends to weaken it." }],
    ["fiducia", /fiducia|confidence|sentiment|zew|\bifo\b|sentix|michigan|umich|economy watchers|clima/i,
      { c: "Un sondaggio su quanto sono ottimisti consumatori, imprese o investitori.",
        e: "Misura le aspettative, non i fatti: serve ad anticipare spesa e investimenti. Muove poco da solo, ma conferma o smentisce un andamento.",
        s: "Fiducia sopra il previsto: tende a sostenere la valuta e le azioni.", g: "Fiducia sotto il previsto: segnale di prudenza, la valuta tende a scendere." },
      { c: "A survey of how upbeat consumers, firms or investors are.",
        e: "It gauges expectations, not facts: it helps anticipate spending and investment. It rarely moves markets on its own but confirms or questions a trend.",
        s: "Confidence above expectations: tends to support the currency and stocks.", g: "Confidence below expectations: a sign of caution, the currency tends to fall." }],
    ["petrolio", /petrolio|crude|oil inventor|\beia\b|\bapi\b|rig count|giacenze/i,
      { c: "Di quanto sono cambiate le scorte di petrolio greggio negli Stati Uniti nell'ultima settimana.",
        e: "Dice se l'offerta supera la domanda. Muove il prezzo del petrolio e, di riflesso, le valute legate alle materie prime (dollaro canadese, corona norvegese) e le compagnie petrolifere.",
        s: "Scorte in aumento più del previsto: più offerta, il prezzo del petrolio tende a scendere.", g: "Scorte in calo più del previsto: meno offerta, il prezzo del petrolio tende a salire." },
      { c: "How much US crude oil stockpiles changed over the past week.",
        e: "It shows whether supply exceeds demand. It moves the oil price and, in turn, commodity currencies (Canadian dollar, Norwegian krone) and oil companies.",
        s: "Stocks rising more than expected: more supply, the oil price tends to fall.", g: "Stocks falling more than expected: less supply, the oil price tends to rise." }],
    ["gas", /gas|stoccagg|natural gas|storage/i,
      { c: "Quanto gas naturale è immagazzinato (negli Stati Uniti o in Europa) rispetto alla settimana prima.",
        e: "In inverno le scorte decidono quanto gas servirà acquistare e a che prezzo. In Europa si guarda anche il livello di riempimento rispetto agli obiettivi.",
        s: "Scorte in aumento più del previsto (o prelievi minori): meno tensione, il prezzo del gas tende a scendere.", g: "Scorte in calo più del previsto (o prelievi maggiori): più tensione, il prezzo del gas tende a salire." },
      { c: "How much natural gas is in storage (in the US or Europe) compared with the week before.",
        e: "In winter, stocks decide how much gas must be bought and at what price. In Europe the fill level against targets is watched too.",
        s: "Stocks rising more than expected (or smaller withdrawals): less tension, the gas price tends to fall.", g: "Stocks falling more than expected (or bigger withdrawals): more tension, the gas price tends to rise." }],
    ["asta", /\baste?\b|auction|btp|bund|gilt|treasury|obbligazion/i,
      { c: "Un'asta in cui lo Stato vende nuovi titoli di debito a investitori e banche.",
        e: "Mostra quanta richiesta c'è per il debito del paese e a che rendimento. Un'asta debole può far salire i rendimenti.",
        s: "Rendimento più alto del previsto o richiesta debole: i titoli di Stato tendono a perdere prezzo.", g: "Rendimento più basso o richiesta forte: i titoli di Stato tendono a guadagnare prezzo." },
      { c: "An auction where the government sells new debt to investors and banks.",
        e: "It shows how much demand there is for the country's debt and at what yield. A weak auction can push yields up.",
        s: "A higher yield than expected or weak demand: government bonds tend to lose value.", g: "A lower yield or strong demand: government bonds tend to gain value." }],
    ["casa", /case|housing|home sales|building permits|permessi di costruzione|costruzion|mutui|mortgage|vendite di case|edilizia/i,
      { c: "Un dato sul mercato immobiliare: costruzioni, permessi, vendite di case o mutui.",
        e: "Le case sono molto sensibili ai tassi: se i mutui costano meno si compra di più. È un segnale della direzione dell'economia.",
        s: "Dato sopra il previsto: settore forte, tende a sostenere la valuta.", g: "Dato sotto il previsto: settore in difficoltà, la valuta tende a scendere." },
      { c: "A housing-market figure: construction, permits, home sales or mortgages.",
        e: "Housing is very sensitive to rates: cheaper mortgages mean more buying. It signals where the economy is heading.",
        s: "Figure above expectations: strong sector, tends to support the currency.", g: "Figure below expectations: sector struggling, the currency tends to fall." }],
    ["scorte", /scorte|inventories/i,
      { c: "Quante merci tengono in magazzino imprese e grossisti rispetto al mese prima.",
        e: "È un dato di dettaglio: serve soprattutto a correggere le stime del PIL. Di solito muove poco i mercati.",
        s: "Più scorte del previsto: possibile spinta al PIL, ma anche vendite deboli.", g: "Meno scorte del previsto: segnale di vendite buone o di prudenza delle imprese." },
      { c: "How much stock firms and wholesalers hold compared with the previous month.",
        e: "A detail figure: it mainly helps refine GDP estimates. It rarely moves markets.",
        s: "More stock than expected: a possible lift to GDP, but also weak sales.", g: "Less stock than expected: a sign of good sales or caution by firms." }],
    ["festivo", /festiv|holiday|chius[ao]|bank holiday/i,
      { c: "Un giorno di festa o di chiusura di un mercato.",
        e: "Con il mercato chiuso, gli scambi si riducono e le quotazioni di quel paese non si muovono. Gli altri mercati possono muoversi con meno volumi.",
        s: "", g: "" },
      { c: "A holiday or market closure.",
        e: "With the market shut, trading drops and that country's quotes do not move. Other markets may move on thinner volumes.",
        s: "", g: "" }]
  ];

  // che cosa può muoversi, per valuta dell'evento
  const COSA = {
    USD: ["dollaro, rendimenti dei Treasury, Wall Street, oro", "the dollar, Treasury yields, Wall Street, gold"],
    EUR: ["euro, spread Btp-Bund, Borse europee", "the euro, the Btp-Bund spread, European stocks"],
    GBP: ["sterlina, titoli di Stato britannici, Ftse 100", "the pound, UK gilts, the FTSE 100"],
    JPY: ["yen, Nikkei, rendimenti giapponesi", "the yen, the Nikkei, Japanese yields"],
    CHF: ["franco svizzero, Borsa svizzera (Smi)", "the Swiss franc, the Swiss stock market (SMI)"],
    CAD: ["dollaro canadese, petrolio, Borsa canadese", "the Canadian dollar, oil, the Canadian stock market"],
    AUD: ["dollaro australiano, materie prime, Cina", "the Australian dollar, commodities, China"],
    NZD: ["dollaro neozelandese, prodotti agricoli", "the New Zealand dollar, farm goods"],
    CNY: ["yuan, Borse cinesi, materie prime", "the yuan, Chinese stocks, commodities"],
    ALL: ["tutti i mercati", "all markets"]
  };

  const GENERICO = [
    { c: "Un dato o un appuntamento del calendario economico.", e: "Di impatto contenuto: di solito muove poco i mercati, se non si discosta molto dalle attese.", s: "", g: "" },
    { c: "An economic-calendar release or appointment.", e: "Low impact: it usually moves markets little unless it is far from expectations.", s: "", g: "" }
  ];

  G.eventoInfo = (title, cur) => {
    const t = String(title || "");
    const hit = T.find((x) => x[1].test(t));
    const i = G.en ? 1 : 0;
    const d = hit ? hit[2 + i] : GENERICO[i];
    const cosa = COSA[String(cur || "").toUpperCase()];
    return { kind: hit ? hit[0] : "generico", c: d.c, e: d.e, s: d.s, g: d.g, cosa: cosa ? cosa[i] : "" };
  };

  // un numero da un testo («1,3%», «6.6%», «19.2B», «77 mld piedi cubi», «-0,2%»)
  G.numEvento = (v) => {
    const m = /-?\d[\d.,]*/.exec(String(v == null ? "" : v).replace(/\s/g, ""));
    if (!m) return null;
    let s = m[0];
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (s.includes(",")) s = s.replace(",", ".");
    let n = parseFloat(s);
    if (!isFinite(n)) return null;
    const rest = String(v).replace(/\s/g, "").slice(String(v).replace(/\s/g, "").indexOf(m[0]) + m[0].length);
    const mult = /^(mila|mln|mld|[KkMmBbTt])(?![a-z])/i.exec(rest);
    if (mult) n *= { k: 1e3, m: 1e6, b: 1e9, t: 1e12, mila: 1e3, mln: 1e6, mld: 1e9 }[mult[1].toLowerCase()];
    return n;
  };

  // un numero di Forex Factory (formato inglese: «0.3%», «1,234», «225K», «19.2B») come si scrive in italiano
  G.ffNum = (v) => {
    const t = String(v == null ? "" : v).trim();
    if (!t || G.en) return t;
    return t.replace(/\d[\d.,]*\d/g, (m) => m.replace(/[.,]/g, (c) => (c === "." ? "," : ".")))
      .replace(/(\d)K\b/g, "$1 mila").replace(/(\d)M\b/g, "$1 mln").replace(/(\d)B\b/g, "$1 mld");
  };

  // risultato contro attese (o, se mancano, contro il precedente): { k: "su" | "giu" | "pari", rif: "att" | "prec" }
  G.verdetto = (act, exp, prev) => {
    const a = G.numEvento(act);
    if (a === null) return null;
    for (const [ref, rif] of [[exp, "att"], [prev, "prec"]]) {
      const r = G.numEvento(ref);
      if (r === null) continue;
      const tol = Math.max(1e-9, Math.abs(r) * 1e-9);
      return { k: Math.abs(a - r) <= tol ? "pari" : a > r ? "su" : "giu", rif };
    }
    return null;
  };
  G.verdettoTesto = (v) => {
    if (!v) return "";
    const L = G.L;
    if (v.rif === "att") return v.k === "su" ? L("sopra le attese", "above expectations") : v.k === "giu" ? L("sotto le attese", "below expectations") : L("in linea con le attese", "in line with expectations");
    return v.k === "su" ? L("in rialzo sul precedente", "up on the previous") : v.k === "giu" ? L("in calo sul precedente", "down on the previous") : L("invariato sul precedente", "unchanged on the previous");
  };
})();
