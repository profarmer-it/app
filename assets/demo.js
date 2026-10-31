/* ============================================================================
   App Pro Farmer · la demo (dal 29/10/2026)
   ----------------------------------------------------------------------------
   easy.profarmer.it/?demo apre l'app con un'azienda finta, «Cascina Demo»,
   tutta dentro il telefono: niente parte verso Supabase. Serve per la serata
   del 19/11, per gli agenti che la mostrano ai clienti, e come collaudo
   (fa le veci del database: stesse funzioni pf_* di 36-app-pro-farmer.sql,
   con le stesse risposte e gli stessi messaggi d'errore principali).
   Le modifiche restano sul telefono finché non si preme «Ricomincia».
   ========================================================================== */

const PFDemo = (() => {
  const CHIAVE = 'pf-demo-v1';
  const AZ = 'az-demo';
  const id = () => 'x' + Math.random().toString(36).slice(2, 10);
  const err = m => { throw Object.assign(new Error(m), { delDatabase: true }); };

  // ------------------------------------------------------------ i dati finti
  function nuovi() {
    const persone = [
      { id: 'p-marco', nome: 'Marco', cognome: 'Rossi', ruolo: 'titolare', email: 'marco@cascinademo.it', ore_giorno: 9, pin: '2580' },
      { id: 'p-ion', nome: 'Ion', cognome: 'Popescu', ruolo: 'dipendente', email: 'ion@cascinademo.it', ore_giorno: 9, pin: '1470' },
      { id: 'p-raji', nome: 'Rajinder', cognome: 'Singh', ruolo: 'dipendente', email: '', ore_giorno: 9, pin: '3690' },
      { id: 'p-samir', nome: 'Samir', cognome: 'Benali', ruolo: 'dipendente', email: 'samir@cascinademo.it', ore_giorno: 9, pin: '1593' },
      { id: 'p-luca', nome: 'Luca', cognome: 'Ferrari', ruolo: 'dipendente', email: 'luca@cascinademo.it', ore_giorno: 9, pin: '7531' },
      { id: 'p-ahmed', nome: 'Ahmed', cognome: 'Khan', ruolo: 'dipendente', email: '', ore_giorno: 9, pin: '8462' }
    ].map(p => ({ ...p, attivo: true, invitato: !!p.email, dal: '2025-01-01', al: null }));

    // i turni ricorrenti di una stalla da 300 vacche
    const turni = [];
    const t = (persona, giorni, inizio, fine, mansione) => giorni.forEach(g =>
      turni.push({ id: id(), persona, giorno: null, giorno_settimana: g, inizio, fine, mansione, compito: null }));
    t('p-ion', [1, 2, 3, 4, 5, 6], '05:00', '09:00', 'Mungitura');
    t('p-ion', [1, 2, 3, 4, 5, 6], '16:30', '19:30', 'Mungitura');
    t('p-raji', [1, 2, 3, 4, 5, 7], '05:00', '09:00', 'Mungitura');
    t('p-raji', [1, 2, 3, 4, 5, 7], '16:30', '19:30', 'Mungitura');
    t('p-samir', [1, 2, 3, 4, 5, 6], '06:00', '13:00', 'Alimentazione');
    t('p-luca', [1, 2, 3, 4, 5], '08:00', '14:00', 'Pulizia cuccette');
    t('p-ahmed', [2, 3, 4, 5, 6, 7], '05:00', '09:00', 'Mungitura');
    t('p-ahmed', [2, 3, 4, 5, 6, 7], '16:30', '19:30', 'Vitelli');

    const mansioni = [
      { id: 'm-cuccette', titolo: 'Pulizia cuccette', persone: ['p-luca'], istruzioni:
        'Ogni mattina: togliere il letame dalla parte posteriore della cuccetta.\n'
        + 'Materassino: piùLact 0,5 kg a cuccetta, un giorno sì e uno no.\n'
        + 'Buca: piùLact Pronto, 35 kg a cuccetta una volta a settimana (il lunedì).' },
      { id: 'm-mungitura', titolo: 'Mungitura', persone: ['p-ion', 'p-raji', 'p-ahmed'], istruzioni:
        'Pre-dipping, scarto dei primi getti, asciugatura, attacco entro 90 secondi.\n'
        + 'Segnare sul foglio in sala le vacche trattate: latte da scartare.' },
      { id: 'm-vitelli', titolo: 'Vitelli', persone: ['p-ahmed'], istruzioni:
        'Colostro entro 2 ore dalla nascita, 4 litri. Box puliti e paglia asciutta.' }
    ];
    turni.filter(u => u.mansione === 'Pulizia cuccette').forEach(u => { u.compito = 'm-cuccette'; });

    // un mese e mezzo di timbrature, con piccole differenze di minuti
    const timbrature = [];
    let seme = 7;
    const caso = () => { seme = (seme * 9301 + 49297) % 233280; return seme / 233280; };
    const oggi = Conti.oggi();
    const ass = [
      { id: id(), persona: 'p-raji', tipo: 'ferie', dal: Conti.piuGiorni(oggi, -12), al: Conti.piuGiorni(oggi, -10), stato: 'approvata', nota: '', creata: '' },
      { id: id(), persona: 'p-ahmed', tipo: 'riposo', dal: oggi, al: oggi, stato: 'approvata', nota: '', creata: '' },
      { id: id(), persona: 'p-luca', tipo: 'malattia', dal: Conti.piuGiorni(oggi, -20), al: Conti.piuGiorni(oggi, -19), stato: 'approvata', nota: 'Certificato n. 1234', creata: '' },
      { id: id(), persona: 'p-ion', tipo: 'ferie', dal: '2026-12-03', al: '2026-12-07', stato: 'chiesta', nota: 'Matrimonio di mio fratello', creata: new Date().toISOString() },
      { id: id(), persona: 'p-samir', tipo: 'permesso', dal: Conti.piuGiorni(oggi, 3), al: Conti.piuGiorni(oggi, 3), ore: 2, stato: 'chiesta', nota: 'Visita medica', creata: new Date().toISOString() }
    ];
    const assente = (p, g) => ass.some(a => a.persona === p && a.stato === 'approvata' && a.tipo !== 'permesso' && g >= a.dal && g <= a.al);
    const istante = (g, hm, scarto) => {
      // ora italiana → istante: l'ora legale/solare la sistema Date con il fuso del momento
      const [h, m] = hm.split(':').map(Number);
      const prova = new Date(`${g}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
      const roma = Conti.roma(prova.toISOString());
      const diff = (Number(roma.ora.slice(0, 2)) - h) * 60 + (Number(roma.ora.slice(3)) - m);
      return new Date(prova.getTime() - diff * 60e3 + scarto * 60e3).toISOString();
    };
    const adesso = Date.now();
    for (let k = 45; k >= 0; k--) {
      const g = Conti.piuGiorni(oggi, -k);
      for (const p of persone) {
        if (p.ruolo !== 'dipendente' || assente(p.id, g)) continue;
        for (const u of Conti.turniDelGiorno(turni, p.id, g)) {
          const e = istante(g, u.inizio, Math.round(caso() * 12 - 7));
          const s = istante(g, u.fine, Math.round(caso() * 25 - 3));
          if (new Date(e) > adesso) continue;
          const modo = p.email ? 'qr' : 'chiosco';
          timbrature.push({ id: id(), persona: p.id, verso: 'entrata', quando: e, modo, valida: true });
          // oggi: chi è ancora nel turno non ha l'uscita
          if (new Date(s) <= adesso) timbrature.push({ id: id(), persona: p.id, verso: 'uscita', quando: s, modo, valida: true });
        }
      }
    }
    // una dimenticanza di ieri, corretta dal titolare
    const ieri = Conti.piuGiorni(oggi, -1);
    const sba = timbrature.find(x => x.persona === 'p-samir' && Conti.roma(x.quando).giorno === ieri && x.verso === 'uscita');
    if (sba) {
      sba.valida = false;
      timbrature.push({ id: id(), persona: 'p-samir', verso: 'uscita', quando: istante(ieri, '13:10', 0), modo: 'correzione',
        sostituisce: sba.id, motivo: 'Uscito alle 13:10, timbrato tardi', valida: true });
    }
    // a qualunque ora si apra la demo, in stalla c'è qualcuno
    if (!persone.some(p => Conti.dentro(timbrature, p.id))) {
      timbrature.push({ id: id(), persona: 'p-ion', verso: 'entrata', quando: new Date(adesso - 52 * 60e3).toISOString(), modo: 'qr', valida: true });
      timbrature.push({ id: id(), persona: 'p-raji', verso: 'entrata', quando: new Date(adesso - 47 * 60e3).toISOString(), modo: 'chiosco', valida: true });
      timbrature.push({ id: id(), persona: 'p-samir', verso: 'entrata', quando: new Date(adesso - 15 * 60e3).toISOString(), modo: 'qr', valida: true });
    }
    return {
      azienda: { id: AZ, ragione: 'Cascina Demo', comune: 'Soresina', pausa_dopo_ore: 6, pausa_minuti: 0, ritardo_minuti: 15,
        soglia_straordinari_mese: 30, posizione_attiva: true, cliente_piulact: true, verifica: 'posizione', area: true, raggio_m: 300,
        nomina: { versione: 'nomina-2026-11-v5', il: new Date(Date.now() - 20 * 864e5).toISOString(), da: 'Marco Rossi' } },
      piano: { piano: 'regalo', stato: 'attivo', fino_al: null },
      persone, turni, mansioni, timbrature, assenze: ass,
      punti: [{ id: 'q-sala', nome: 'Sala mungitura', codice: 'demo-sala-mungitura', lat: null, lon: null, raggio_m: 300, attivo: true },
              { id: 'q-uff', nome: 'Ufficio', codice: 'demo-ufficio', lat: null, lon: null, raggio_m: 300, attivo: true }],
      dispositivi: [{ id: 'd-tablet', nome: 'Tablet in sala mungitura', attivo: true, ultimo_uso: new Date().toISOString() }],
      settimane: [Conti.lunediDi(oggi)]
    };
  }

  let d;
  try { d = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { d = null; }
  if (!d) d = nuovi();
  // dal 31/10/2026: la settimana a griglia (turni-tipo, lavori, nomi del foglio)
  if (!d.tipi) {
    d.tipi = [
      { id: 'y-mm', nome: 'Mungitura mattina', area: 'Stalla', inizio: '05:00', fine: '09:00', inizio2: null, fine2: null, posizione: 1 },
      { id: 'y-ali', nome: 'Alimentazione', area: 'Stalla', inizio: '06:00', fine: '13:00', inizio2: null, fine2: null, posizione: 2 },
      { id: 'y-mp', nome: 'Mungitura pomeriggio', area: 'Stalla', inizio: '16:00', fine: '20:00', inizio2: null, fine2: null, posizione: 3 },
      { id: 'y-vit', nome: 'Vitelli', area: 'Vitellaia', inizio: '07:00', fine: '11:00', inizio2: '15:00', fine2: '18:00', posizione: 4 }];
    d.lavori = []; d.alias = {};
    const lun = Conti.lunediDi(Conti.oggi());
    const giro = { 'y-mm': ['p-ion', 'p-raji'], 'y-ali': ['p-samir'], 'y-mp': ['p-ion', 'p-luca'], 'y-vit': ['p-ahmed'] };
    for (let i = 0; i < 7; i++) {
      const g = Conti.piuGiorni(lun, i);
      for (const y of d.tipi) for (const pid of giro[y.id]) {
        if ((pid === 'p-luca' && i === 2) || (pid === 'p-raji' && i === 6)) continue;
        d.turni.push({ id: id(), persona: pid, giorno: g, giorno_settimana: null, inizio: y.inizio, fine: y.fine, mansione: y.nome, tipo: y.id, nota: '' });
        if (y.inizio2) d.turni.push({ id: id(), persona: pid, giorno: g, giorno_settimana: null, inizio: y.inizio2, fine: y.fine2, mansione: y.nome, tipo: y.id, nota: '' });
      }
      d.lavori.push({ id: id(), giorno: g, testo: i % 2 ? 'Samir e Luca: cuccette gruppo 2 con piùLact Pronto' : 'Ion: pulizia sala mungitura e abbeveratoi', persone: i % 2 ? ['p-samir', 'p-luca'] : ['p-ion'], posizione: 1 });
    }
    d.assenze.push({ id: id(), persona: 'p-luca', tipo: 'riposo', dal: Conti.piuGiorni(lun, 2), al: Conti.piuGiorni(lun, 2), stato: 'approvata', da_settimana: true });
  }
  const salva = () => { try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch (e) {} };
  let io = 'p-marco';     // chi «è entrato» nella demo

  const persona = pid => d.persone.find(p => p.id === pid);
  const me = () => persona(io);
  const titolare = () => { if (me().ruolo !== 'titolare') err('Solo il titolare può farlo.'); };
  const dalChiosco = k => { if (k !== 'demo.tablet') err('Questo tablet non è più collegato.'); };

  function verso(pid, v) {
    if (v) return v;
    const t = Conti.dentro(d.timbrature, pid);
    return t ? 'uscita' : 'entrata';
  }
  function scrivi(pid, v, modo, oraTelefono, chiave, extra) {
    const gia = chiave && d.timbrature.find(t => t.chiave === chiave);
    if (gia) return { ok: true, gia: true, id: gia.id, verso: gia.verso, quando: gia.quando };
    const quando = oraTelefono && new Date(oraTelefono) < new Date() ? new Date(oraTelefono).toISOString() : new Date().toISOString();
    const vv = verso(pid, v);
    const doppio = d.timbrature.find(t => t.persona === pid && t.valida && t.verso === vv && Math.abs(new Date(t.quando) - new Date(quando)) < 60e3);
    if (doppio) return { ok: true, gia: true, id: doppio.id, verso: doppio.verso, quando: doppio.quando };
    const r = { id: id(), persona: pid, verso: vv, quando, modo, valida: true, chiave, ...extra };
    d.timbrature.push(r); salva();
    return { ok: true, id: r.id, verso: r.verso, quando: r.quando, nome: persona(pid).nome };
  }

  const F = {
    pf_area() {
      const tit = me().ruolo === 'titolare';
      const pubblica = p => ({ id: p.id, nome: p.nome, cognome: p.cognome, ruolo: p.ruolo,
        ...(tit ? { email: p.email, ore_giorno: p.ore_giorno, pin: !!p.pin, attivo: p.attivo, invitato: p.invitato, dal: p.dal, al: p.al } : {}) });
      return {
        ok: true, attiva: true, demo: true,
        io: { ...pubblica(me()), email: me().email, ore_giorno: me().ore_giorno, pin: !!me().pin },
        azienda: d.azienda, piano: d.piano,
        persone: d.persone.filter(p => p.attivo || tit).map(pubblica),
        punti: tit ? d.punti : [], dispositivi: tit ? d.dispositivi : [],
        timbrature: tit ? d.timbrature : d.timbrature.filter(t => t.persona === io && t.valida),
        assenze: d.assenze.filter(a => a.stato !== 'annullata' && (tit || a.persona === io || a.stato === 'approvata'))
          .map(a => tit || a.persona === io ? a : { id: a.id, persona: a.persona, tipo: 'assente', dal: a.dal, al: a.al, stato: a.stato }),
        turni: tit ? d.turni : d.turni.filter(u => u.persona === io),
        settimane: d.settimane,
        tipi: d.tipi, alias: tit ? d.alias : {},
        lavori: d.lavori.filter(l => tit || !l.persone.length || l.persone.includes(io)),
        mansioni: d.mansioni.filter(m => tit || !m.persone.length || m.persone.includes(io))
      };
    },
    pf_mese() {
      titolare();
      return { timbrature: d.timbrature.filter(t => t.valida), assenze: d.assenze.filter(a => a.stato === 'approvata'), correzioni: 0 };
    },
    pf_timbra({ p_codice, p_verso, p_ora_telefono, p_chiave }) {
      const pu = d.punti.find(x => x.codice === p_codice && x.attivo);
      if (!pu) err('Questo QR non è della tua azienda, o non vale più.');
      return scrivi(io, p_verso, 'qr', p_ora_telefono, p_chiave, { punto: pu.id });
    },
    pf_timbra_per({ p_persona, p_verso, p_quando, p_motivo }) {
      titolare();
      if (p_quando && new Date(p_quando) < Date.now() - 600e3 && !(p_motivo || '').trim()) err('Per un\'ora passata serve il motivo.');
      if (!p_quando) return scrivi(p_persona, p_verso, 'titolare', null, null, { motivo: p_motivo || null });
      d.timbrature.push({ id: id(), persona: p_persona, verso: p_verso || verso(p_persona), quando: new Date(p_quando).toISOString(),
        modo: 'titolare', motivo: p_motivo, valida: true });
      salva(); return { ok: true };
    },
    pf_correggi({ p_id, p_quando, p_verso, p_annulla, p_motivo }) {
      titolare();
      if (!(p_motivo || '').trim()) err('Scrivi il motivo della correzione.');
      const t = d.timbrature.find(x => x.id === p_id);
      if (!t) err('Timbratura non trovata.');
      if (!t.valida) err('Questa timbratura è già stata corretta: correggi l\'ultima.');
      t.valida = false;
      d.timbrature.push({ id: id(), persona: t.persona, verso: p_verso || t.verso, quando: p_quando ? new Date(p_quando).toISOString() : t.quando,
        modo: 'correzione', sostituisce: t.id, annullata: !!p_annulla, motivo: p_motivo.trim(), valida: !p_annulla });
      salva(); return { ok: true };
    },
    pf_imposta_pin({ p_persona, p_pin }) {
      if (!/^\d{4}$/.test(p_pin)) err('Il PIN è di 4 cifre.');
      if (['0000', '1111', '1234', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '4321'].includes(p_pin)) err('Questo PIN è troppo facile: scegline un altro.');
      if (p_persona !== io) titolare();
      persona(p_persona).pin = p_pin; salva(); return { ok: true };
    },
    pf_salva_persona({ p }) {
      titolare();
      if (!(p.nome || '').trim()) err('Manca il nome.');
      if (p.id) {
        const x = persona(p.id);
        Object.assign(x, { nome: p.nome.trim(), cognome: (p.cognome || '').trim(), email: (p.email || '').trim().toLowerCase(),
          ore_giorno: Number(p.ore_giorno || x.ore_giorno) });
        if (x.id !== io && p.attivo !== undefined) { x.attivo = !!p.attivo; x.al = p.attivo ? null : Conti.oggi(); }
        salva(); return { ok: true, id: x.id };
      }
      const x = { id: id(), nome: p.nome.trim(), cognome: (p.cognome || '').trim(), ruolo: 'dipendente', email: (p.email || '').trim().toLowerCase(),
        ore_giorno: Number(p.ore_giorno || 9), attivo: true, invitato: false, dal: Conti.oggi(), al: null, pin: null };
      d.persone.push(x); salva(); return { ok: true, id: x.id };
    },
    pf_salva_punto({ p }) {
      titolare();
      if (p.id) {
        const x = d.punti.find(q => q.id === p.id);
        Object.assign(x, { nome: p.nome, lat: p.lat === '' ? null : p.lat ?? x.lat, lon: p.lon === '' ? null : p.lon ?? x.lon,
          raggio_m: Number(p.raggio_m || x.raggio_m) });
        if (p.attivo !== undefined) x.attivo = !!p.attivo;
        if (p.nuovo_codice) x.codice = 'demo-' + id();
        salva(); return { ok: true, id: x.id };
      }
      const x = { id: id(), nome: p.nome, codice: 'demo-' + id(), lat: null, lon: null, raggio_m: 300, attivo: true };
      d.punti.push(x); salva(); return { ok: true, id: x.id };
    },
    pf_salva_regole({ p }) { titolare(); Object.assign(d.azienda, p); salva(); return { ok: true }; },
    pf_chiedi_assenza({ p }) {
      const chi = p.persona || io;
      if (chi !== io) titolare();
      if (p.tipo === 'malattia' && me().ruolo !== 'titolare') err('La malattia la segna il titolare: avvisalo.');
      if (!p.dal) err('Manca il giorno.');
      const tit = me().ruolo === 'titolare';
      const a = { id: id(), persona: chi, tipo: p.tipo, dal: p.dal, al: p.al || p.dal, ore: p.ore || null, nota: p.nota || '',
        stato: tit ? 'approvata' : 'chiesta', creata: new Date().toISOString() };
      if (a.al < a.dal) err('Il giorno di fine viene prima dell\'inizio.');
      d.assenze.push(a); salva(); return { ok: true, id: a.id, stato: a.stato };
    },
    pf_decidi_assenza({ p_id, p_esito }) { titolare(); d.assenze.find(a => a.id === p_id).stato = p_esito; salva(); return { ok: true }; },
    pf_ritira_assenza({ p_id }) {
      const a = d.assenze.find(x => x.id === p_id && x.persona === io && x.stato === 'chiesta');
      if (!a) err('Si ritira solo una richiesta non ancora decisa.');
      a.stato = 'annullata'; salva(); return { ok: true };
    },
    pf_salva_turno({ p }) {
      titolare();
      if (p.id) d.turni = d.turni.filter(u => u.id !== p.id);
      const u = { id: id(), persona: p.persona, giorno: p.giorno || null, giorno_settimana: p.giorno_settimana ? Number(p.giorno_settimana) : null,
        inizio: p.inizio || null, fine: p.fine || null, mansione: p.mansione || 'Lavoro', compito: p.compito || null };
      d.turni.push(u); salva(); return { ok: true, id: u.id };
    },
    pf_togli_turno({ p_id }) { titolare(); d.turni = d.turni.filter(u => u.id !== p_id); salva(); return { ok: true }; },
    pf_salva_tipo({ p }) {
      titolare();
      if (!(p.nome || '').trim()) err('Manca il nome del turno.');
      if (!p.inizio || !p.fine) err(`Il turno «${p.nome}» non ha l'orario completo.`);
      const v = { nome: p.nome.trim(), area: (p.area || '').trim() || null, inizio: p.inizio, fine: p.fine, inizio2: p.inizio2 || null, fine2: p.fine2 || null };
      if (p.id) {
        const y = d.tipi.find(t => t.id === p.id); if (!y) err('Turno non trovato.');
        Object.assign(y, v); if (p.attivo === false) d.tipi = d.tipi.filter(t => t.id !== p.id);
        salva(); return { ok: true, id: p.id };
      }
      const y = { id: id(), ...v, posizione: Number(p.posizione || 0) }; d.tipi.push(y); salva(); return { ok: true, id: y.id };
    },
    _metti(tipo, pid, g, nota) {
      const y = d.tipi.find(t => t.id === tipo); if (!y) err('Turno non trovato.');
      d.turni.push({ id: id(), persona: pid, giorno: g, giorno_settimana: null, inizio: y.inizio, fine: y.fine, mansione: y.nome, tipo, nota: nota || '' });
      if (y.inizio2) d.turni.push({ id: id(), persona: pid, giorno: g, giorno_settimana: null, inizio: y.inizio2, fine: y.fine2, mansione: y.nome, tipo, nota: nota || '' });
    },
    pf_salva_cella({ p }) {
      titolare();
      if (!p.tipo) {
        d.assenze = d.assenze.filter(a => !(a.da_settimana && a.dal === p.giorno && a.al === p.giorno && a.tipo === 'riposo'));
        for (const x of p.persone) d.assenze.push({ id: id(), persona: x.id, tipo: 'riposo', dal: p.giorno, al: p.giorno, stato: 'approvata', da_settimana: true });
      } else {
        d.turni = d.turni.filter(u => !(u.tipo === p.tipo && u.giorno === p.giorno));
        for (const x of p.persone) F._metti(p.tipo, x.id, p.giorno, x.nota);
      }
      salva(); return { ok: true };
    },
    pf_salva_settimana({ p_lunedi, p }) {
      titolare();
      const dentro = g => g >= p_lunedi && g <= Conti.piuGiorni(p_lunedi, 6);
      for (const a of p.alias || []) d.alias[a.alias] = a.persona;
      d.turni = d.turni.filter(u => !(u.tipo && dentro(u.giorno)));
      d.assenze = d.assenze.filter(a => !(a.da_settimana && dentro(a.dal)));
      d.lavori = d.lavori.filter(l => !dentro(l.giorno));
      for (const c of p.celle || []) if (dentro(c.giorno)) for (const x of c.persone) F._metti(c.tipo, x.id, c.giorno, x.nota);
      for (const c of p.feste || []) if (dentro(c.giorno)) for (const x of c.persone) d.assenze.push({ id: id(), persona: x.id, tipo: 'riposo', dal: c.giorno, al: c.giorno, stato: 'approvata', da_settimana: true });
      (p.lavori || []).forEach((l, i) => { if (dentro(l.giorno) && l.testo.trim()) d.lavori.push({ id: id(), giorno: l.giorno, testo: l.testo.trim(), persone: l.persone || [], posizione: i + 1 }); });
      salva(); return { ok: true };
    },
    pf_copia_settimana({ p_lunedi }) {
      titolare();
      const prima = g => g >= Conti.piuGiorni(p_lunedi, -7) && g < p_lunedi, dentro = g => g >= p_lunedi && g <= Conti.piuGiorni(p_lunedi, 6);
      if (d.turni.some(u => u.tipo && dentro(u.giorno))) err('Questa settimana ha già dei turni: svuotala prima di copiare.');
      d.turni.filter(u => u.tipo && prima(u.giorno)).forEach(u => d.turni.push({ ...u, id: id(), giorno: Conti.piuGiorni(u.giorno, 7) }));
      d.assenze.filter(a => a.da_settimana && prima(a.dal)).forEach(a => d.assenze.push({ ...a, id: id(), dal: Conti.piuGiorni(a.dal, 7), al: Conti.piuGiorni(a.al, 7) }));
      d.lavori.filter(l => prima(l.giorno)).forEach(l => d.lavori.push({ ...l, id: id(), giorno: Conti.piuGiorni(l.giorno, 7) }));
      salva(); return { ok: true };
    },
    pf_salva_lavoro({ p }) {
      titolare();
      if (p.id) {
        if (!p.testo.trim()) d.lavori = d.lavori.filter(l => l.id !== p.id);
        else Object.assign(d.lavori.find(l => l.id === p.id), { testo: p.testo.trim(), persone: p.persone || [] });
      } else if (p.testo.trim()) d.lavori.push({ id: id(), giorno: p.giorno, testo: p.testo.trim(), persone: p.persone || [], posizione: 99 });
      salva(); return { ok: true };
    },
    pf_pubblica_settimana({ p_lunedi }) {
      titolare();
      if (!d.settimane.includes(p_lunedi)) d.settimane.push(p_lunedi);
      salva(); return { ok: true, avvisati: d.persone.filter(p => p.ruolo === 'dipendente' && p.attivo).length };
    },
    pf_salva_mansione({ p }) {
      titolare();
      if (p.togli) { d.mansioni = d.mansioni.filter(m => m.id !== p.id); salva(); return { ok: true }; }
      if (!(p.titolo || '').trim()) err('Manca il titolo.');
      if (p.id) Object.assign(d.mansioni.find(m => m.id === p.id), { titolo: p.titolo, istruzioni: p.istruzioni || '', persone: p.persone || [] });
      else d.mansioni.push({ id: id(), titolo: p.titolo, istruzioni: p.istruzioni || '', persone: p.persone || [] });
      salva(); return { ok: true };
    },
    pf_nuovo_dispositivo({ p_nome }) {
      titolare();
      d.dispositivi.push({ id: id(), nome: p_nome || 'Tablet di stalla', attivo: true, ultimo_uso: null });
      salva(); return { ok: true, chiave: 'demo.tablet' };
    },
    pf_togli_dispositivo({ p_id }) { titolare(); d.dispositivi.find(x => x.id === p_id).attivo = false; salva(); return { ok: true }; },
    pf_chiosco_persone({ p_chiave }) {
      dalChiosco(p_chiave);
      return { ok: true, azienda: d.azienda.ragione, persone: d.persone.filter(p => p.attivo).map(p => ({
        id: p.id, nome: p.nome, cognome: (p.cognome || '').slice(0, 1), pin: !!p.pin, dentro: !!Conti.dentro(d.timbrature, p.id) })) };
    },
    pf_chiosco_timbra({ p_chiave, p_persona, p_pin, p_verso, p_ora_telefono, p_chiave_invio }) {
      dalChiosco(p_chiave);
      const p = persona(p_persona);
      if (!p.pin) err('Non hai ancora il PIN: chiedilo al titolare.');
      if (p.pin !== p_pin) return { ok: false, motivo: 'PIN sbagliato.' };
      return scrivi(p.id, p_verso, 'chiosco', p_ora_telefono, p_chiave_invio);
    },
    pf_accetta_nomina() { titolare(); d.azienda.nomina = { versione: 'nomina-2026-11-v5', il: new Date().toISOString(), da: me().nome }; salva(); return { ok: true }; },
    // il dipendente timbra dal suo account (30/10/2026): nella demo è sempre in azienda
    pf_timbra_io({ p_verso, p_ora_telefono, p_chiave, p_codice }) {
      const pu = p_codice ? d.punti.find(x => x.codice === p_codice && x.attivo) : null;
      const area = d.azienda.verifica === 'posizione' ? 'dentro' : null;
      return { ...scrivi(io, p_verso, pu ? 'qr' : 'telefono', p_ora_telefono, p_chiave, pu ? { punto: pu.id, area } : { area }), area };
    },
    pf_paghe() { titolare(); return d.paghe || (d.paghe = { 'p-ion': 8, 'p-raji': 8.5, 'p-samir': 8, 'p-luca': 9 }); },
    pf_salva_paga({ p_persona, p_paga }) {
      titolare(); d.paghe = d.paghe || {};
      if (p_paga == null) delete d.paghe[p_persona]; else d.paghe[p_persona] = Number(p_paga);
      salva(); return { ok: true };
    },
    pf_salva_iscrizione() { return { ok: true }; },
    pf_togli_iscrizione() { return { ok: true }; }
  };

  return {
    rpc(nome, args) {
      return new Promise((ok, ko) => setTimeout(() => {
        try { if (!F[nome]) err('Nella demo non c\'è: ' + nome); ok(JSON.parse(JSON.stringify(F[nome](args || {})))); }
        catch (e) { ko(e); }
      }, 120));
    },
    chi: () => io,
    diventa(pid) { io = pid; },
    persone: () => d.persone.map(p => ({ id: p.id, nome: p.nome, ruolo: p.ruolo, pin: p.pin })),
    ricomincia() { d = nuovi(); salva(); },
    codicePunto: () => d.punti[0].codice
  };
})();
