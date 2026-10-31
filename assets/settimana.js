/* ============================================================================
   App Pro Farmer · la settimana come il foglio Excel (dal 31/10/2026)
   ----------------------------------------------------------------------------
   Giulio prepara ogni weekend la settimana dopo in un foglio come
   «Organizzazione lavoro stalla nuova e vecchia» → «Turni (3)»:
     - in alto una riga con le date (una colonna per giorno, anche a passo 2);
     - a sinistra stalla, fascia (Mattina, Pomeriggio, Notte) e il turno con
       l'orario («Turno lungo 6:00 - 15:00»); nelle caselle i nomi, anche con
       una nota («Balvir lavoro di Hakam», «Amrik per paglia»);
     - la riga «Festa»: chi riposa quel giorno;
     - sotto, i lavori del giorno: righe senza orario o testi lunghi.
   leggi() lo trasforma in turni-tipo, caselle, feste e lavori; avvisi()
   controlla una settimana (chi non riposa mai, turni sovrapposti, meno di 11
   ore di riposo, le ore della settimana). Non tocca il database.
   ========================================================================== */

const Settimana = (() => {
  const ORA = /(\d{1,2})[:.](\d{2})/g;
  const pulisci = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const chiaveNome = s => pulisci(s).toLowerCase();

  // «Turno lungo 6:00 - 15:00» → orari; «08:00/ 12:00 - 15:00 / 18:00» → spezzato; «dalle 10:00» → solo l'inizio
  function orari(testo) {
    // «dalle 02» senza minuti vale 02:00
    const testo2 = String(testo).replace(/dalle\s+(\d{1,2})(?![:.\d])/gi, (m, h) => `dalle ${h}:00`);
    const t = [...testo2.matchAll(ORA)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
    const min = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
    if (t.length >= 4 && min(t[2]) >= min(t[1])) return { inizio: t[0], fine: t[1], inizio2: t[2], fine2: t[3] };
    if (t.length >= 4) return { inizio: t[0], fine: t[1], dubbio: `Nel foglio ci sono due orari (${t[0]}-${t[1]} e ${t[2]}-${t[3]}): ho preso il primo.` };
    if (t.length >= 2) return { inizio: t[0], fine: t[1] };
    if (t.length === 1) return { inizio: t[0], fine: '', dubbio: 'Nel foglio c’è solo l’ora di inizio: scrivi quando finisce.' };
    return { inizio: '', fine: '', dubbio: 'Nel foglio non c’è l’orario: scrivilo.' };
  }
  const nomeTurno = (testo, fascia) => {
    const n = pulisci(String(testo).replace(/dalle\s+\d{1,2}(?:[:.]\d{2})?/gi, ' ').replace(/\b(dalle|orario)\b/gi, ' ').replace(/\d{1,2}[:.]\d{2}/g, ' ').replace(/[\/\-–,]+/g, ' ')).replace(/\s+e\s*$/i, '');
    // la fascia (Mattina, Pomeriggio, Notte) solo davanti ai nomi generici come «Turno lungo»
    return (fascia && /^turno/i.test(n) && !new RegExp(fascia, 'i').test(n) ? fascia + ' · ' : '') + (n || 'Turno');
  };

  // «Singh, Anup e Jass e Amrik per paglia» → [{nome:'Singh'}, …, {nome:'Amrik', nota:'per paglia'}]
  function nomi(testo) {
    return pulisci(testo).split(/,|\s+e\s+|\//i).map(pulisci).filter(Boolean).map(p => {
      const m = p.match(/^([A-Za-zÀ-ÿ']+)\s*(.*)$/);
      if (!m || /^\d/.test(p)) return null;
      return { nome: m[1].charAt(0).toUpperCase() + m[1].slice(1), nota: pulisci(m[2]) || '' };
    }).filter(Boolean);
  }
  // una casella fatta di nomi (e non di numeri di gruppi o di testi lunghi)?
  const soloNomi = c => { const s = pulisci(c); return s && s.length <= 70 && !/\d/.test(s) && nomi(s).length > 0; };

  /* rows: le righe del foglio (array di array, celle data come Date). */
  function leggi(rows) {
    // la riga delle date: quella con almeno 5 date
    let ri = -1, colonne = [];
    for (let r = 0; r < Math.min(rows.length, 15) && ri < 0; r++) {
      const c = (rows[r] || []).map((v, i) => v instanceof Date && !isNaN(v) ? i : -1).filter(i => i >= 0);
      if (c.length >= 5) { ri = r; colonne = c.slice(0, 7); }
    }
    if (ri < 0) throw new Error('Non trovo la riga con le date dei giorni: in alto ci vuole una data per ogni colonna.');
    // +12 ore: le date dell'Excel a volte arrivano a mezzanotte meno qualche secondo
    const giorni = colonne.map(i => iso(new Date(rows[ri][i].getTime() + 12 * 3600e3)));
    const primaCol = colonne[0];
    const turni = [], feste = giorni.map(() => []), lavori = giorni.map(() => []);
    let area = '', fascia = '';
    for (let r = ri + 1; r < rows.length; r++) {
      const riga = rows[r] || [];
      const sinistra = riga.slice(0, primaCol).map(pulisci);
      const celle = colonne.map(i => pulisci(riga[i]));
      if (!sinistra.some(Boolean) && !celle.some(Boolean)) continue;
      if (celle.filter(Boolean).length && celle.filter(Boolean).every(c => /^(lun|mar|mer|gio|ven|sab|dom)[a-zì]*\.?$/i.test(c))) continue;
      if (sinistra[0] && sinistra.length > 2) { area = sinistra[0]; fascia = ''; }
      if (sinistra[1] && sinistra.length > 2 && sinistra[1].length <= 20) fascia = sinistra[1];
      const etichetta = [...sinistra].reverse().find(x => x && x !== area && x !== fascia) || '';
      if (/^fest/i.test(etichetta)) { celle.forEach((c, g) => feste[g].push(...nomi(c).map(x => x.nome))); continue; }
      const conOra = /\d{1,2}[:.]\d{2}|dalle\s+\d/i.test(etichetta);
      const diNomi = celle.filter(Boolean).length && celle.filter(Boolean).every(soloNomi);
      if (etichetta && etichetta.length <= 80 && (conOra || diNomi)) {
        const o = orari(etichetta);
        turni.push({ chiave: chiaveNome((area || '') + '|' + nomeTurno(etichetta, fascia)), nome: nomeTurno(etichetta, fascia), area,
          ...o, celle: celle.map(c => nomi(c)) });
        continue;
      }
      // i lavori: «etichetta: casella» per le righe corte, la casella sola per i testi lunghi
      celle.forEach((c, g) => {
        if (!c) return;
        lavori[g].push(etichetta && etichetta.length <= 90 ? `${etichetta}: ${c}` : c);
      });
    }
    const tutti = new Map();
    turni.forEach(t => t.celle.forEach(cc => cc.forEach(x => tutti.set(chiaveNome(x.nome), x.nome))));
    feste.forEach(ff => ff.forEach(n => tutti.set(chiaveNome(n), n)));
    return { giorni, turni, feste, lavori, nomi: [...tutti.values()].sort((a, b) => a.localeCompare(b)) };
  }

  // le persone nominate in un testo (nomi del foglio già collegati: { alias: personaId })
  function nominate(testo, collegati) {
    const t = ' ' + String(testo).toLowerCase().replace(/[^a-zà-ÿ']+/g, ' ') + ' ';
    return [...new Set(Object.entries(collegati).filter(([a]) => a && t.includes(' ' + a + ' ')).map(([, pid]) => pid))];
  }

  /* ---------------------------------------------------------------- avvisi
     turni: [{ persona, giorno, inizio, fine, mansione }] dei 7 giorni;
     riposi: { personaId: Set(giorni) }; persone: [{ id, nome }]. */
  function istante(g, hm) {
    const [a, m, d] = g.split('-').map(Number);
    const [h, mi] = hm.split(':').map(Number);
    return Date.UTC(a, m - 1, d, h, mi) / 60000;            // minuti; il fuso non conta per le differenze
  }
  function avvisi({ giorni, turni, riposi, persone, tipi }) {
    const out = [], ore = {};
    const nomeDi = id => (persone.find(p => p.id === id) || {}).nome || '?';
    const dataBreve = g => ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(g + 'T12:00:00Z').getUTCDay()] + ' ' + g.slice(8) + '/' + g.slice(5, 7);
    for (const p of persone) {
      const miei = turni.filter(u => u.persona === p.id && u.inizio && u.fine).map(u => {
        const a = istante(u.giorno, u.inizio); let b = istante(u.giorno, u.fine); if (b <= a) b += 1440;
        return { ...u, a, b };
      }).sort((x, y) => x.a - y.a);
      const rip = riposi[p.id] || new Set();
      if (!miei.length) continue;
      // nessun giorno libero nei 7
      const liberi = giorni.filter(g => rip.has(g) || !miei.some(u => u.giorno === g));
      if (!liberi.length) out.push({ tipo: 'riposo', persona: p.id, testo: `${p.nome} non ha nessun giorno di riposo in settimana.` });
      // in festa e in turno lo stesso giorno
      const festaETurno = giorni.filter(g => rip.has(g) && miei.some(u => u.giorno === g));
      if (festaETurno.length) out.push({ tipo: 'festa', persona: p.id, testo: `${p.nome} è in festa ma ha anche un turno: ${festaETurno.map(dataBreve).join(', ')}.` });
      // turni sovrapposti (le due parti dello stesso spezzato non si toccano): una riga per coppia di turni
      const coppie = new Map();
      for (let i = 0; i < miei.length; i++) for (let j = i + 1; j < miei.length; j++) {
        const x = miei[i], y = miei[j];
        if (y.a < x.b && !(x.tipo && x.tipo === y.tipo && x.giorno === y.giorno)) {
          const k = `${x.mansione} ${x.inizio}-${x.fine} e ${y.mansione} ${y.inizio}-${y.fine}`;
          (coppie.get(k) || coppie.set(k, []).get(k)).push(x.giorno);
        }
      }
      coppie.forEach((gg, k) => out.push({ tipo: 'sovrapposti', persona: p.id, testo: `${p.nome} ha due turni insieme (${k}): ${[...new Set(gg)].map(dataBreve).join(', ')}.` }));
      // 11 ore di riposo di fila in ogni 24 ore: si guarda dall'inizio di ogni turno
      const unite = [];
      for (const u of miei) { const l = unite[unite.length - 1]; if (l && u.a <= l.b) l.b = Math.max(l.b, u.b); else unite.push({ a: u.a, b: u.b, giorno: u.giorno }); }
      ore[p.id] = unite.reduce((n, u) => n + (u.b - u.a), 0) / 60;   // i turni sovrapposti contano una volta
      const corti = [];
      for (let i = 0; i < unite.length; i++) {
        const fine = unite[i].a + 1440;
        let massimo = 0, t = unite[i].a;
        for (let j = i; j < unite.length && unite[j].a < fine; j++) {
          massimo = Math.max(massimo, unite[j].a - t); t = Math.max(t, unite[j].b);
        }
        massimo = Math.max(massimo, fine - t);
        if (massimo < 660 && !corti.some(c => c.giorno === unite[i].giorno)) corti.push({ giorno: unite[i].giorno, massimo });
      }
      if (corti.length) {
        const peggio = Math.min(...corti.map(c => c.massimo));
        out.push({ tipo: 'undici', persona: p.id, testo: `${p.nome} non ha 11 ore di riposo di fila nelle 24 ore dopo il turno di ${corti.map(c => dataBreve(c.giorno)).join(', ')} (al minimo ${Math.floor(peggio / 60)} h ${String(peggio % 60).padStart(2, '0')}).` });
      }
      if (ore[p.id] > 48) out.push({ tipo: 'ore', persona: p.id, testo: `${p.nome} ha ${Math.round(ore[p.id])} ore di turni in settimana, oltre 48.` });
    }
    // i turni scoperti, solo per i turni usati almeno un giorno della settimana
    for (const y of tipi || []) {
      if (!turni.some(u => u.tipo === y.id)) continue;
      const vuoti = giorni.filter(g => !turni.some(u => u.tipo === y.id && u.giorno === g));
      if (vuoti.length) out.push({ tipo: 'vuoto', testo: `Nessuno al turno «${y.nome}»: ${vuoti.map(dataBreve).join(', ')}.` });
    }
    return { avvisi: out, ore };
  }

  return { leggi, orari, nomi, nominate, avvisi, chiaveNome };
})();
if (typeof module !== 'undefined') module.exports = Settimana;
