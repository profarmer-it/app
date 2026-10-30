/* ============================================================================
   App Pro Farmer · i conti di Presenze e turni (dal 29/10/2026)
   ----------------------------------------------------------------------------
   Dalle timbrature valide e dalle assenze approvate fa il foglio ore del mese:
   per persona e giorno, entrate e uscite, ore, ordinario, straordinario e la
   causale delle assenze. Lo usano l'app, la demo e l'Excel per il consulente.
   Tutte le ore sono dell'Italia (Europe/Rome), qualunque sia il telefono.

   Regole (decise per azienda dal titolare, pf_aziende):
     - una coppia entrata → uscita vale per il giorno dell'entrata, se l'uscita
       arriva entro 20 ore; un'entrata senza uscita resta «uscita mancante»;
     - oltre «pausa_dopo_ore» nel giorno si tolgono «pausa_minuti»;
     - straordinario = ore del giorno oltre l'orario di contratto (ore_giorno);
     - nei giorni di ferie, riposo e malattia non si contano ore ordinarie;
       il permesso a ore si somma a parte.
   ========================================================================== */

const Conti = (() => {
  const FUSO = 'Europe/Rome';
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  // '2026-10-29T04:58:00Z' → { giorno: '2026-10-29', ora: '05:58' }
  function roma(iso) {
    const s = fmt.format(new Date(iso)).replace(',', '');
    return { giorno: s.slice(0, 10), ora: s.slice(11, 16) };
  }
  const oggi = () => roma(new Date().toISOString()).giorno;

  function giorniDelMese(mese) {            // mese = 'YYYY-MM'
    const [a, m] = mese.split('-').map(Number);
    const n = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => `${mese}-${String(i + 1).padStart(2, '0')}`);
  }
  const giornoSettimana = g => { const d = new Date(g + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
  const piuGiorni = (g, n) => { const d = new Date(g + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const lunediDi = g => piuGiorni(g, 1 - giornoSettimana(g));

  const ore = n => Math.round(n * 100) / 100;
  function hhmm(n) {                        // 7.5 → '7:30'
    if (!n) return '0:00';
    const m = Math.round(Math.abs(n) * 60);
    return (n < 0 ? '−' : '') + Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
  }

  // Le timbrature che valgono (il titolare le riceve tutte, anche quelle corrette).
  const valide = t => t.filter(x => x.valida !== false);

  /* Le coppie entrata/uscita di una persona, in ordine. */
  function coppie(timbrature) {
    const t = valide(timbrature).slice().sort((a, b) => a.quando.localeCompare(b.quando));
    const out = [];
    let aperta = null;
    for (const x of t) {
      if (x.verso === 'entrata') {
        if (aperta) out.push({ entrata: aperta, uscita: null });   // due entrate di fila: la prima resta senza uscita
        aperta = x;
      } else if (aperta && (new Date(x.quando) - new Date(aperta.quando)) <= 20 * 3600e3) {
        out.push({ entrata: aperta, uscita: x });
        aperta = null;
      } else {
        out.push({ entrata: null, uscita: x });                    // uscita senza entrata
        aperta = null;
      }
    }
    if (aperta) out.push({ entrata: aperta, uscita: null });
    return out;
  }

  /* Le assenze approvate di una persona, giorno per giorno. */
  function assenzeGiorno(assenze, personaId) {
    const m = {};
    for (const a of assenze) {
      if (a.persona !== personaId || a.stato !== 'approvata') continue;
      for (let g = a.dal; g <= a.al; g = piuGiorni(g, 1)) {
        (m[g] = m[g] || []).push(a);
      }
    }
    return m;
  }

  /* Il foglio ore di una persona in un mese. */
  function foglio(persona, timbrature, assenze, regole, mese) {
    const mie = timbrature.filter(t => t.persona === persona.id);
    const perGiorno = {};
    for (const c of coppie(mie)) {
      const rif = c.entrata || c.uscita;
      const g = roma(rif.quando).giorno;
      (perGiorno[g] = perGiorno[g] || []).push(c);
    }
    const ass = assenzeGiorno(assenze, persona.id);
    const contratto = Number(persona.ore_giorno || 8);
    const pausaDopo = Number(regole.pausa_dopo_ore || 6), pausaMin = Number(regole.pausa_minuti || 0);

    const giorni = giorniDelMese(mese).map(g => {
      const cc = perGiorno[g] || [];
      let lavoro = 0, mancante = false;
      for (const c of cc) {
        if (c.entrata && c.uscita) lavoro += (new Date(c.uscita.quando) - new Date(c.entrata.quando)) / 3600e3;
        // chi è dentro adesso non ha ancora l'uscita: manca solo dopo 14 ore
        else if (c.uscita || Date.now() - new Date(c.entrata.quando) > 14 * 3600e3) mancante = true;
      }
      const pausa = pausaMin && lavoro > pausaDopo ? pausaMin / 60 : 0;
      lavoro = Math.max(0, lavoro - pausa);
      const aa = ass[g] || [];
      const intera = aa.find(a => a.tipo !== 'permesso');
      const permesso = aa.filter(a => a.tipo === 'permesso').reduce((s, a) => s + Number(a.ore || 0), 0);
      const ordinario = intera ? 0 : Math.min(lavoro, contratto);
      const straordinario = intera ? lavoro : Math.max(0, lavoro - contratto);
      return {
        giorno: g, coppie: cc.map(c => ({
          entrata: c.entrata && roma(c.entrata.quando).ora, uscita: c.uscita && roma(c.uscita.quando).ora,
          modo: (c.entrata || c.uscita).modo
        })),
        lavoro: ore(lavoro), pausa: ore(pausa), ordinario: ore(ordinario), straordinario: ore(straordinario),
        causale: intera ? intera.tipo : (permesso ? 'permesso' : (lavoro ? 'ordinario' : '')),
        permesso: ore(permesso), mancante
      };
    });
    const somma = k => ore(giorni.reduce((s, d) => s + d[k], 0));
    const conta = tipo => giorni.filter(d => d.causale === tipo).length;
    return {
      persona, giorni,
      totale: {
        lavoro: somma('lavoro'), ordinario: somma('ordinario'), straordinario: somma('straordinario'),
        permesso: somma('permesso'), ferie: conta('ferie'), riposo: conta('riposo'), malattia: conta('malattia'),
        presenze: giorni.filter(d => d.lavoro > 0).length, mancanti: giorni.filter(d => d.mancante).length
      }
    };
  }

  /* Chi è dentro adesso: l'ultima timbratura valida è un'entrata di meno di 20 ore. */
  function dentro(timbrature, personaId) {
    const t = valide(timbrature).filter(x => x.persona === personaId).sort((a, b) => b.quando.localeCompare(a.quando))[0];
    return t && t.verso === 'entrata' && (Date.now() - new Date(t.quando)) < 20 * 3600e3 ? t : null;
  }

  /* I turni che valgono in un giorno: quelli del giorno preciso sostituiscono i ricorrenti. */
  function turniDelGiorno(turni, personaId, g) {
    const precisi = turni.filter(u => u.persona === personaId && u.giorno === g);
    const lista = precisi.length ? precisi
      : turni.filter(u => u.persona === personaId && u.giorno_settimana === giornoSettimana(g));
    return lista.filter(u => u.mansione !== 'riposo').sort((a, b) => (a.inizio || '').localeCompare(b.inizio || ''));
  }

  return { roma, oggi, giorniDelMese, giornoSettimana, piuGiorni, lunediDi, coppie, foglio, dentro,
    turniDelGiorno, hhmm, ore, valide };
})();
