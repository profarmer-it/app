/* ============================================================================
   App Pro Farmer (dal 29/10/2026)
   ----------------------------------------------------------------------------
   L'app dell'allevatore: si entra con e-mail e codice (come in Riposa Pro) e
   nella home ci sono le app: Riposa e Presenze e turni.

   Ruoli (li decide il database, 36-app-pro-farmer.sql):
     - titolare: home, poi Presenze con Oggi, Turni, Ferie, Mese, Altro;
     - dipendente: va dritto a Presenze con Timbra, Turni, Ferie, Compiti;
     - tablet di stalla (#chiosco): nessun accesso, una chiave sul tablet e il
       PIN di ognuno; può solo timbrare.
   ?demo: tutto con il finto database di demo.js, niente parte verso Supabase.

   Senza rete: le timbrature restano in una coda sul telefono (con l'ora del
   momento e una chiave) e partono da sole quando torna il segnale; il
   database le riconosce se arrivano due volte.
   ========================================================================== */

const PF = (() => {
  const SUPABASE = {
    url: 'https://gmhmxybqmkcmnbjdnslz.supabase.co',
    chiave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtaG14eWJxbWtjbW5iamRuc2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjM4OTgsImV4cCI6MjEwODIzOTg5OH0.af0OZrnCjJ6Wznmv0vmimnUSOPeLcrRSU5AhyvIRNBc'
  };
  const VAPID = 'BBMiPSY2ADgUWEiZE7vpPz6aJLnfxfM-rUjhZKuNp2nQh8nv7NSMChvyL_MMjIEUnc1c3CZO_OflRINeQX_nZo4';
  const LIB = {
    jsqr: 'assets/vendor/jsQR-1.4.0.js',
    qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  };
  const INDIRIZZO = 'https://easy.profarmer.it/';
  const DEMO = new URLSearchParams(location.search).has('demo');
  const K_CODA = 'pf-coda', K_CHIOSCO = 'pf-chiosco';
  const MANSIONI = ['Mungitura', 'Alimentazione', 'Pulizia cuccette', 'Vitelli', 'Manutenzione', 'Altro'];
  const TIPI = { ferie: 'Ferie', riposo: 'Riposo', permesso: 'Permesso', malattia: 'Malattia', assente: 'Assente' };
  const GIORNI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  let sb = null, A = null, emailAccesso = '', orologio = null;
  let settimana = Conti.lunediDi(Conti.oggi()), mese = Conti.oggi().slice(0, 7), datiMese = null;
  let paghe = null;                         // { persona: paga oraria netta }, solo per il titolare (dal 31/10/2026)
  const app = () => document.getElementById('app');

  /* ---------------------------------------------------------------- utilità */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nome = p => p ? `${p.nome}${p.cognome ? ' ' + p.cognome : ''}` : '';
  const iniziale = p => (p && p.nome ? p.nome[0] : '?').toUpperCase();
  const dataIt = g => { const [a, m, d] = g.split('-'); return `${+d}/${+m}`; };
  const dataLunga = g => { const d = new Date(g + 'T12:00:00Z'); return `${GIORNI[Conti.giornoSettimana(g)].toLowerCase()} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`; };
  const ora = iso => Conti.roma(iso).ora;
  const titolare = () => A && A.io.ruolo === 'titolare';
  const persona = id => A.persone.find(p => p.id === id);
  function nuovaChiave() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  }
  function leggi(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } }
  function scrivi(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function toast(t) {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function caricaLib(url, globale) {
    if (window[globale]) return Promise.resolve(window[globale]);
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = url; s.onload = () => ok(window[globale]); s.onerror = () => ko(new Error('Senza rete non si carica: riprova con il segnale.'));
      document.head.appendChild(s);
    });
  }

  /* ------------------------------------------------------------ il database */
  function collegamento() {
    if (sb || DEMO) return sb;
    sb = window.supabase.createClient(SUPABASE.url, SUPABASE.chiave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'pf-accesso' }
    });
    return sb;
  }
  function rpc(nome, args) {
    if (DEMO) return PFDemo.rpc(nome, args);
    return collegamento().rpc(nome, args).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(error.message), { delDatabase: error.code === 'P0001' });
      return data;
    });
  }
  const motivo = e => e && e.delDatabase ? e.message
    : navigator.onLine === false ? 'Sei senza rete: riprova quando torna il segnale.' : 'Qualcosa non è andato: riprova tra poco.';

  /* -------------------------------------------------------------- l'accesso
     Dal 30/10/2026 si entra con e-mail e password, e il telefono la ricorda.
     Il codice di 6 cifre per e-mail resta per il primo accesso e per la
     password dimenticata: dopo il codice si sceglie la password. */
  function mostraAccesso(msg, info) {
    fermaOrologio();
    app().className = '';
    app().innerHTML = `<div class="accesso">
      <img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
      <h1>Entra nell'app Pro Farmer</h1>
      <form id="f-email" class="campo" novalidate>
        <label for="email">La tua e-mail</label>
        <input id="email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(emailAccesso)}">
        <label for="password" style="margin-top:8px">La password</label>
        <div class="campo-pw"><input id="password" name="password" type="password" autocomplete="current-password" enterkeyhint="go">
          <button type="button" class="mostra-pw" aria-label="Mostra la password" aria-pressed="false">Mostra</button></div>
        <div class="antirobot" data-antirobot aria-live="polite"></div>
        <button class="btn pieno" style="margin-top:8px">Entra</button>
      </form>
      ${msg ? `<p class="errore" role="alert">${esc(msg)}</p>` : ''}
      ${info ? `<p class="sotto" role="status">${esc(info)}</p>` : ''}
      <button class="btn sec pieno" id="col-codice" type="button">Primo accesso</button>
      <p class="sotto" style="text-align:center;margin-top:-4px"><a href="#" id="pw-persa">Password dimenticata?</a></p>
      <div class="scheda"><b>Non hai ancora un account?</b>
        <p class="sotto" style="margin:4px 0 10px">Easy è gratuita per i clienti piùLact: crei l'account, chiedi l'attivazione e Pro Farmer ti abilita.
          Se sei un dipendente, l'accesso te lo manda il tuo titolare.</p>
        <button class="btn sec pieno" id="crea">Crea l'account</button></div>
      <p class="sotto"><a href="?demo">Guarda la demo</a> · <a href="#chiosco">Questo è il tablet di stalla</a></p>
    </div>`;
    occhio();
    const leggiEmail = () => {
      const e = document.getElementById('email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { mostraAccesso('Scrivi un’e-mail completa, per esempio nome@libero.it.'); return null; }
      return (emailAccesso = e);
    };
    document.getElementById('crea').addEventListener('click', () => mostraCrea());
    const primo = ev => {
      ev.preventDefault();
      const e = document.getElementById('email').value.trim().toLowerCase();
      if (e) emailAccesso = e;
      mostraPrimo();
    };
    document.getElementById('col-codice').addEventListener('click', primo);
    document.getElementById('pw-persa').addEventListener('click', primo);
    document.getElementById('f-email').addEventListener('submit', ev => {
      ev.preventDefault();
      const e = leggiEmail(); if (!e) return;
      const pw = document.getElementById('password').value;
      if (!pw) return mostraAccesso('Scrivi la password. Se non l’hai ancora scelta, tocca «Primo accesso».');
      const b = ev.currentTarget.querySelector('.btn'); b.disabled = true; b.textContent = 'Controllo…';
      Antirobot.token().then(captchaToken => collegamento().auth.signInWithPassword({ email: e, password: pw, options: { captchaToken } })).then(({ error }) => {
        if (!error) return carica();
        const m = String(error.message || '');
        if (Antirobot.errore(error)) return mostraAccesso('Il controllo anti-robot non è riuscito: ricarica la pagina e riprova.');
        if (error.status === 429 || /rate|too many/i.test(m)) return mostraAccesso('Troppi tentativi: aspetta qualche minuto e riprova.');
        if (/invalid|credentials/i.test(m)) return mostraAccesso('E-mail o password sbagliate. Se è il primo accesso o non ricordi la password, tocca «Primo accesso».');
        mostraAccesso(navigator.onLine === false ? 'Sei senza rete: riprova quando torna il segnale.' : 'Non riesco a controllare: riprova tra poco.');
      });
    });
  }
  // Primo accesso (o password dimenticata): e-mail, codice, password. Ci porta
  // anche il link dell'e-mail d'invito (#primo-accesso), dal 31/10/2026.
  function mostraPrimo(msg) {
    fermaOrologio();
    app().className = '';
    app().innerHTML = `<div class="accesso">
      <img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
      <h1>Primo accesso</h1>
      <p class="sotto">Si fa una volta sola, in tre passi. Vale anche se hai dimenticato la password.</p>
      <ol class="passi">
        <li>Scrivi la tua e-mail, quella a cui è arrivato l’invito.</li>
        <li>Ti mandiamo un codice di 6 cifre: scrivilo qui.</li>
        <li>Scegli la tua password. Dalla volta dopo entri con e-mail e password.</li>
      </ol>
      <form id="f-primo" class="campo" novalidate>
        <label for="p-email">La tua e-mail</label>
        <input id="p-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" value="${esc(emailAccesso)}">
        <div class="antirobot" data-antirobot aria-live="polite"></div>
        <button class="btn pieno" style="margin-top:8px">Mandami il codice</button>
      </form>
      ${msg ? `<p class="errore" role="alert">${esc(msg)}</p>` : ''}
      <p class="sotto"><a href="#" id="torna">← Ho già la password: entra</a></p>
    </div>`;
    document.getElementById('torna').addEventListener('click', ev => { ev.preventDefault(); history.replaceState(null, '', location.pathname + location.search); mostraAccesso(); });
    document.getElementById('f-primo').addEventListener('submit', ev => {
      ev.preventDefault();
      const e = document.getElementById('p-email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return mostraPrimo('Scrivi un’e-mail completa, per esempio nome@libero.it.');
      emailAccesso = e;
      chiediCodice(e, ev.currentTarget.querySelector('.btn'), false, mostraPrimo);
    });
  }
  // Crea l'account: e-mail, codice, password; poi la richiesta a Pro Farmer.
  function mostraCrea(msg) {
    fermaOrologio();
    app().className = '';
    app().innerHTML = `<div class="accesso">
      <img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
      <h1>Crea l'account</h1>
      <p class="sotto">Scrivi la tua e-mail: ti mandiamo un codice di 6 cifre per confermarla, poi scegli la password.</p>
      <form id="f-crea" class="campo" novalidate>
        <label for="c-email">La tua e-mail</label>
        <input id="c-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" value="${esc(emailAccesso)}">
        <div class="antirobot" data-antirobot aria-live="polite"></div>
        <button class="btn pieno" style="margin-top:8px">Mandami il codice</button>
      </form>
      ${msg ? `<p class="errore" role="alert">${esc(msg)}</p>` : ''}
      <p class="sotto"><a href="#" id="torna">← Ho già un account</a></p>
    </div>`;
    document.getElementById('torna').addEventListener('click', ev => { ev.preventDefault(); mostraAccesso(); });
    document.getElementById('f-crea').addEventListener('submit', ev => {
      ev.preventDefault();
      const e = document.getElementById('c-email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return mostraCrea('Scrivi un’e-mail completa, per esempio nome@libero.it.');
      emailAccesso = e;
      chiediCodice(e, ev.currentTarget.querySelector('.btn'), true);
    });
  }
  function chiediCodice(e, el, crea, indietro) {
    if (el) { el.style.pointerEvents = 'none'; el.textContent = 'Mando il codice…'; }
    const torna = indietro || (crea ? mostraCrea : mostraAccesso);
    Antirobot.token().then(captchaToken => collegamento().auth.signInWithOtp({ email: e, options: { shouldCreateUser: !!crea, data: crea ? { app: 'pf' } : undefined, emailRedirectTo: 'https://easy.profarmer.it/', captchaToken } })).then(({ error }) => {
      if (!error) return mostraCodice();
      const m = String(error.message || '');
      if (Antirobot.errore(error)) return torna('Il controllo anti-robot non è riuscito: ricarica la pagina e riprova.');
      if (error.status === 429 || /rate|seconds|too many/i.test(m)) return torna('Hai chiesto il codice da poco: aspetta un minuto e riprova.');
      if (/signup|not allowed|not found|user/i.test(m)) return crea
        ? torna('Le registrazioni non sono ancora aperte: scrivi a info@profarmer.it.')
        : torna('Questa e-mail non ha un account. Se sei un dipendente, chiedi al titolare di mandarti l’accesso; se sei il titolare, torna indietro e tocca «Crea l’account».');
      torna(navigator.onLine === false ? 'Sei senza rete: riprova quando torna il segnale.' : 'Non riesco a mandare il codice: riprova tra poco.');
    });
  }
  function mostraCodice(msg) {
    app().innerHTML = `<div class="accesso">
      <img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
      <h1>Controlla la posta</h1>
      <p class="sotto">Ti abbiamo mandato un codice di 6 cifre a <b>${esc(emailAccesso)}</b>. Vale 15 minuti. Se non lo trovi, guarda nella posta indesiderata.</p>
      <form id="f-codice" class="campo" novalidate>
        <label for="codice">Il codice</label>
        <input id="codice" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" enterkeyhint="go" placeholder="123456">
        <button class="btn pieno" style="margin-top:8px">Avanti</button>
      </form>
      ${msg ? `<p class="errore" role="alert">${esc(msg)}</p>` : ''}
      <p class="sotto"><a href="#" id="altra">← Torna all'accesso</a></p>
    </div>`;
    document.getElementById('altra').addEventListener('click', ev => { ev.preventDefault(); mostraAccesso(); });
    const c = document.getElementById('codice'); c.focus();
    document.getElementById('f-codice').addEventListener('submit', ev => {
      ev.preventDefault();
      const codice = c.value.replace(/\D/g, '');
      if (codice.length !== 6) return mostraCodice('Il codice ha 6 cifre.');
      const b = ev.currentTarget.querySelector('button'); b.disabled = true; b.textContent = 'Controllo…';
      collegamento().auth.verifyOtp({ email: emailAccesso, token: codice, type: 'email' }).then(({ error }) => {
        if (error) return mostraCodice(/expired|invalid/i.test(error.message)
          ? 'Codice sbagliato o scaduto. Ricontrolla, o chiedine uno nuovo.' : 'Non riesco a controllare il codice: riprova tra poco.');
        // dopo il codice la password si sceglie sempre: chi avesse registrato prima
        // questa e-mail con una password sua (account non confermato) la perde
        mostraPassword(() => carica(), false);
      });
    });
  }
  /* Scegliere (o cambiare) la password. Il campo nascosto con l'e-mail serve
     al telefono per salvarla insieme (Portachiavi, Google). */
  function mostraPassword(dopo, puoSaltare, msg) {
    fermaOrologio();
    app().className = '';
    app().innerHTML = `<div class="accesso">
      <img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
      <h1>Scegli la tua password</h1>
      <p class="sotto">La prossima volta entri con l'e-mail e questa password, e il telefono può ricordarla per te. Almeno 8 caratteri:
        meglio una frase facile da ricordare, per esempio tre parole.</p>
      <form id="f-pw" class="campo" novalidate>
        <input type="email" name="email" autocomplete="username" value="${esc(emailAccesso)}" hidden>
        <label for="nuova">La nuova password</label>
        <div class="campo-pw"><input id="nuova" name="new-password" type="password" autocomplete="new-password" minlength="8" enterkeyhint="done">
          <button type="button" class="mostra-pw" aria-label="Mostra la password" aria-pressed="false">Mostra</button></div>
        <button class="btn pieno" style="margin-top:8px">Salva ed entra</button>
      </form>
      ${msg ? `<p class="errore" role="alert">${esc(msg)}</p>` : ''}
      ${puoSaltare ? '<p class="sotto"><a href="#" id="salta">Tengo la password di prima</a></p>' : ''}
    </div>`;
    occhio();
    const n = document.getElementById('nuova'); n.focus();
    const salta = document.getElementById('salta');
    if (salta) salta.addEventListener('click', ev => { ev.preventDefault(); dopo(); });
    document.getElementById('f-pw').addEventListener('submit', ev => {
      ev.preventDefault();
      const pw = n.value;
      if (pw.length < 8) return mostraPassword(dopo, puoSaltare, 'La password deve avere almeno 8 caratteri.');
      const b = ev.currentTarget.querySelector('.btn'); b.disabled = true; b.textContent = 'Salvo…';
      collegamento().auth.updateUser({ password: pw, data: { password_scelta: true } }).then(({ error }) => {
        if (!error || error.code === 'same_password') { toast('Password salvata.'); return dopo(); }
        if (error.code === 'weak_password' || /weak|pwned|leak/i.test(error.message))
          return mostraPassword(dopo, puoSaltare, 'Questa password è troppo facile, o è già finita in furti di dati su altri siti: scegline un’altra.');
        if (error.code === 'reauthentication_needed' || error.status === 401)
          return mostraAccesso('Per cambiare la password, ricevi un codice per e-mail.');
        mostraPassword(dopo, puoSaltare, navigator.onLine === false ? 'Sei senza rete: riprova quando torna il segnale.' : 'Non riesco a salvarla: riprova tra poco.');
      });
    });
  }
  function occhio() {
    document.querySelectorAll('.mostra-pw').forEach(b => b.addEventListener('click', () => {
      const i = b.previousElementSibling, vedi = i.type === 'password';
      i.type = vedi ? 'text' : 'password';
      b.textContent = vedi ? 'Nascondi' : 'Mostra';
      b.setAttribute('aria-pressed', String(vedi));
    }));
  }
  /* ----------------------------------------- la richiesta di attivazione
     Chi ha creato l'account ma non è ancora dentro un'azienda: la richiesta a
     Pro Farmer (cliente piùLact?), poi l'attesa; se rifiutata, il motivo. */
  function richiesta(msg) {
    rpc('pf_mia_richiesta').then(r => {
      emailAccesso = r.email || emailAccesso;
      const q = r.richiesta;
      if (r.persona) return schermo('Accesso sospeso', `<p class="sotto">${esc(msg || 'Presenze e turni non è attiva per la tua azienda in questo momento. Scrivi a info@profarmer.it.')}</p>`);
      if (q && q.stato === 'in_attesa') return schermo('Richiesta inviata', `<p class="sotto">Il ${dataIt(Conti.roma(q.creata).giorno)} hai chiesto Easy per <b>${esc(q.ragione)}</b>.
        Pro Farmer controlla che sia cliente piùLact e ti abilita: ti arriva un'e-mail. Di solito entro un giorno lavorativo.</p>
        <button class="btn pieno" data-az="ricarica">Ho ricevuto l'e-mail: entra</button>`);
      formRichiesta(q && q.stato === 'rifiutata' ? q : null, msg);
    }).catch(e => schermo('Non riesco a caricare', `<p class="sotto">${esc(motivo(e))}</p><button class="btn pieno" data-az="ricarica">Riprova</button>`));
  }
  function schermo(titolo, corpo) {
    fermaOrologio();
    app().className = '';
    app().innerHTML = `<div class="accesso"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
      <p class="sotto chi-sono">Sei entrato come <b>${esc(emailAccesso).replace('@', '@<wbr>')}</b><br><a href="#" data-az="esci">Esci e cambia account</a></p>
      <h1>${esc(titolo)}</h1>${corpo}</div>`;
  }
  function formRichiesta(rifiutata, msg) {
    const v = formRichiesta.valori || {};
    const campo = (id, et, extra = '') => `<div class="campo"><label for="r-${id}">${et}</label><input id="r-${id}" value="${esc(v[id] || '')}" ${extra}></div>`;
    schermo('Chiedi Easy per la tua azienda', `
      ${rifiutata ? `<div class="avviso">La richiesta per ${esc(rifiutata.ragione)} non è stata accettata: ${esc(rifiutata.motivo || '')}</div>` : ''}
      <p class="sotto">Easy è gratuita per i clienti piùLact, senza limiti di dipendenti. Pro Farmer controlla e ti abilita.
        <b>Sei un dipendente?</b> Non serve: chiedi al tuo titolare di mandarti l'accesso.</p>
      <form id="f-rich" class="campo" novalidate style="gap:12px">
        <div class="due">${campo('nome', 'Il tuo nome', 'autocomplete="given-name"')}${campo('cognome', 'Cognome', 'autocomplete="family-name"')}</div>
        ${campo('ragione', 'Ragione sociale dell’azienda', 'autocomplete="organization"')}
        ${campo('piva', 'Partita IVA', 'inputmode="numeric" maxlength="13"')}
        <div class="due">${campo('comune', 'Comune', 'autocomplete="address-level2"')}${campo('provincia', 'Provincia (sigla)', 'maxlength="2" autocapitalize="characters"')}</div>
        ${campo('telefono', 'Telefono', 'type="tel" inputmode="tel" autocomplete="tel"')}
        ${campo('nota', 'Da chi compri piùLact? (facoltativo)', 'placeholder="Per esempio: l’agente Rossi, o Pro Farmer"')}
        <label class="spunta"><input type="checkbox" id="r-ok"> <span>Ho letto e accetto le <a href="#" data-az="doc-condizioni">condizioni d’uso di Easy</a>
          e l'<a href="https://www.iubenda.com/privacy-policy/12376136" target="_blank" rel="noopener">informativa privacy</a>.</span></label>
        <button class="btn pieno">Manda la richiesta</button>
      </form>
      ${msg ? `<p class="errore" role="alert">${esc(msg)}</p>` : ''}`);
    document.getElementById('f-rich').addEventListener('submit', ev => {
      ev.preventDefault();
      const d = {};
      ['nome', 'cognome', 'ragione', 'piva', 'comune', 'provincia', 'telefono', 'nota'].forEach(k => { d[k] = document.getElementById('r-' + k).value.trim(); });
      formRichiesta.valori = d;
      if (!d.nome || d.ragione.length < 2) return formRichiesta(rifiutata, 'Scrivi il tuo nome e la ragione sociale.');
      if (!/^(IT)?\s*\d{11}$/i.test(d.piva.replace(/\s/g, ''))) return formRichiesta(rifiutata, 'La partita IVA ha 11 cifre.');
      if (!document.getElementById('r-ok').checked) return formRichiesta(rifiutata, 'Per mandare la richiesta accetta le condizioni d’uso.');
      const b = ev.currentTarget.querySelector('.btn'); b.disabled = true; b.textContent = 'Mando…';
      rpc('pf_chiedi', { p: { ...d, condizioni: Documenti.CONDIZIONI } }).then(() => { formRichiesta.valori = null; richiesta(); })
        .catch(e => formRichiesta(rifiutata, motivo(e)));
    });
  }
  function esci() {
    togliNotifiche().finally(() => {
      if (DEMO) { location.href = location.pathname; return; }
      collegamento().auth.signOut().then(() => { A = null; location.hash = ''; mostraAccesso(); });
    });
  }

  /* -------------------------------------------------------------- caricare */
  function carica(dopo) {
    return rpc('pf_area').then(r => {
      if (!r || !r.ok) {
        if (DEMO) return mostraAccesso('Il tuo accesso all’app Pro Farmer non è attivo.');
        return richiesta();
      }
      A = r;
      if (A.persone && !A.persone.find(p => p.id === A.io.id)) A.persone.push(A.io);
      svuotaCoda();
      if (dopo) dopo(); else disegna();
    }).catch(e => {
      // senza rete: se l'area c'era già, si continua con quella
      if (A) { toast('Senza rete: vedi i dati di prima.'); disegna(); return; }
      app().innerHTML = `<div class="accesso"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
        <h1>Non riesco a caricare</h1><p class="sotto">${esc(motivo(e))}</p>
        <button class="btn pieno" id="riprova">Riprova</button></div>`;
      document.getElementById('riprova').addEventListener('click', () => carica());
    });
  }
  const aggiorna = msg => carica(() => { if (msg) toast(msg); disegna(); });

  /* ---------------------------------------------------------- disegnare */
  const ICONE = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    oggi: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    turni: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    ferie: '<path d="M12 3v18M5 8c2-3 12-3 14 0M5 8c0 3 3 4 7 4s7-1 7-4"/>',
    mese: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    altro: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    timbra: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2M18 14h2M14 18h2M18 18h2v2"/>',
    compiti: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    profilo: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
  };
  const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[k]}</svg>`;

  function voci() {
    if (titolare()) return [['home', 'Home'], ['oggi', 'Oggi'], ['turni', 'Turni'], ['ferie', 'Ferie'], ['mese', 'Mese'], ['altro', 'Altro']];
    return [['timbra', 'Timbra'], ['turni', 'Turni'], ['ferie', 'Ferie'], ['compiti', 'Compiti'], ['profilo', 'Profilo']];
  }
  function vistaDaHash() {
    const h = location.hash.replace('#', '').split('=')[0];
    const ok = voci().map(v => v[0]);
    if (h === 'presenze') return titolare() ? 'oggi' : 'timbra';
    return ok.includes(h) ? h : ok[0];
  }
  function barraDemo() {
    if (!DEMO) return '';
    const io = PFDemo.chi();
    return `<div class="barra-demo">DEMO · Sei
      <select id="demo-chi" aria-label="Chi sei nella demo">${PFDemo.persone().map(p =>
        `<option value="${p.id}"${p.id === io && location.hash !== '#chiosco' ? ' selected' : ''}>${esc(p.nome)}${p.ruolo === 'titolare' ? ' (titolare)' : ''}</option>`).join('')}
        <option value="tablet"${location.hash === '#chiosco' ? ' selected' : ''}>il tablet di stalla</option></select>
      <button id="demo-ricomincia">Ricomincia</button></div>`;
  }

  function disegna() {
    if (!A) return;
    fermaOrologio();
    const v = vistaDaHash();
    const da = { home: vHome, oggi: vOggi, turni: vTurni, ferie: vFerie, mese: vMese, altro: vAltro, timbra: vTimbra, compiti: vCompiti, profilo: vProfilo }[v];
    const daDecidere = titolare() ? A.assenze.filter(a => a.stato === 'chiesta').length : 0;
    const titolo = { home: '', oggi: 'Oggi', turni: 'Turni', ferie: 'Ferie e riposi', mese: 'Cruscotto del mese', altro: 'Impostazioni',
      timbra: '', compiti: 'Compiti', profilo: 'Profilo' }[v];
    app().className = v === 'mese' || (v === 'turni' && titolare() && (A.tipi || []).length) ? 'largo' : '';
    if (!A.attiva) {
      app().innerHTML = barraDemo() + `<div class="accesso"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
        <h1>Presenze e turni è in pausa</h1><p class="sotto">Per la tua azienda l'app non è attiva in questo momento.
        Scrivi a <a href="mailto:info@profarmer.it">info@profarmer.it</a> o chiama Pro Farmer.</p>
        <button class="btn sec" data-az="esci">Esci</button></div>`;
      return;
    }
    if (!A.azienda.nomina) { vNomina(); return; }
    app().innerHTML = barraDemo()
      + (titolo ? `<header class="testa"><h1>${titolo}</h1>${v === 'oggi' ? '' : ''}</header>`
        : `<header class="testa"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer"></header>`)
      + `<main class="corpo" id="corpo">${da()}</main>`
      + `<nav class="menu" aria-label="Menu"><div class="dentro">${voci().map(([k, t]) =>
        `<a href="#${k}" class="${k === v ? 'su' : ''}"${k === v ? ' aria-current="page"' : ''}>${svg(k)}${t}`
        + (k === 'ferie' && daDecidere ? `<span class="pallino">${daDecidere}</span>` : '') + '</a>').join('')}</div></nav>`;
    if (v === 'timbra') avviaOrologio();
    window.scrollTo(0, 0);
  }

  /* ----------------------------------------------------------------- home */
  function saluto() {
    const h = Number(Conti.roma(new Date().toISOString()).ora.slice(0, 2));
    return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  }
  function chiDentro() {
    const oggi = Conti.oggi();
    const dip = A.persone.filter(p => p.attivo !== false);
    const dentro = dip.filter(p => Conti.dentro(A.timbrature, p.id));
    const assenti = dip.filter(p => assenzaDel(p.id, oggi));
    return { dip, dentro, assenti };
  }
  function assenzaDel(pid, g) {
    return A.assenze.find(a => a.persona === pid && a.stato === 'approvata' && g >= a.dal && g <= a.al && a.tipo !== 'permesso');
  }
  function vHome() {
    const { dip, dentro, assenti } = chiDentro();
    const chieste = A.assenze.filter(a => a.stato === 'chiesta').length;
    return `<div><p class="saluto">${saluto()}, ${esc(A.io.nome)}</p><p class="sotto">${esc(A.azienda.ragione)}</p></div>
      <a href="#oggi" class="scheda forte app-card" style="text-decoration:none">
        <span class="ico" style="background:var(--inchiostro);color:var(--arancio)">${svg('oggi')}</span>
        <span><b>Presenze e turni</b><span class="sotto">Adesso in stalla ${dentro.length} su ${dip.length}${assenti.length ? ` · ${assenti.length} assent${assenti.length > 1 ? 'i' : 'e'}` : ''}.</span>
        ${chieste ? `<span class="chip nero" style="margin-top:6px">${chieste} da approvare</span>` : ''}</span></a>
      <div class="scheda"><h2 class="sezione" style="margin:0 0 4px">Adesso in stalla</h2>
        ${dentro.length ? `<b>${dentro.map(p => esc(p.nome)).join(', ')}</b>` : '<span class="sotto">Nessuno.</span>'}
        ${assenti.length ? `<span class="sotto"> · fuori ${assenti.map(p => esc(p.nome) + ' (' + TIPI[assenzaDel(p.id, Conti.oggi()).tipo].toLowerCase() + ')').join(', ')}</span>` : ''}</div>
      <p class="sotto">Easy è gratuita per i clienti piùLact. Per la tua stalla c’è anche
        <a href="https://riposa.profarmer.it/" target="_blank" rel="noopener">Riposa</a>, il calcolo di piùLact e il promemoria del riordino.</p>`;
  }

  /* ------------------------------------------------------- oggi (titolare) */
  function statoPersona(p) {
    const oggi = Conti.oggi();
    const d = Conti.dentro(A.timbrature, p.id);
    if (d) {
      const o = Conti.oltre(A.timbrature, p, A.turni, null);
      return `<span class="chip verde">Dentro dalle ${ora(d.quando)}</span>${o ? ` <span class="chip">${Conti.durataTesto(o.presenza)}</span>` : ''}`
        + (o && o.minuti >= Conti.TOLLERANZA ? ` <span class="chip arancio">oltre l’orario di ${Conti.durataTesto(o.minuti)}</span>` : '');
    }
    const a = assenzaDel(p.id, oggi);
    if (a) return `<span class="chip">${TIPI[a.tipo]}</span>`;
    const ultima = Conti.valide(A.timbrature).filter(t => t.persona === p.id && Conti.roma(t.quando).giorno === oggi)
      .sort((x, y) => y.quando.localeCompare(x.quando))[0];
    if (ultima) {
      const o = ultima.verso === 'uscita' ? Conti.oltre(A.timbrature, p, A.turni, ultima) : null;
      return `<span class="chip">Uscito alle ${ora(ultima.quando)}</span>`
        + (o && o.minuti >= Conti.TOLLERANZA ? ` <span class="chip arancio">${Conti.durataTesto(o.minuti)} oltre l’orario</span>` : '');
    }
    const t = Conti.turniDelGiorno(A.turni, p.id, oggi)[0];
    return t ? `<span class="chip">Turno alle ${t.inizio}</span>` : '<span class="chip">Fuori</span>';
  }
  function vOggi() {
    const oggi = Conti.oggi();
    const persone = A.persone.filter(p => p.attivo !== false);
    const di = Conti.valide(A.timbrature).length && A.timbrature.filter(t => Conti.roma(t.quando).giorno === oggi)
      .sort((x, y) => y.quando.localeCompare(x.quando));
    const mancanti = Conti.valide(A.timbrature).filter(t => t.verso === 'entrata' && (Date.now() - new Date(t.quando)) > 14 * 3600e3
      && (Date.now() - new Date(t.quando)) < 4 * 86400e3
      && !Conti.valide(A.timbrature).some(u => u.persona === t.persona && u.quando > t.quando));
    const senzaArea = A.azienda.verifica === 'posizione' && !A.azienda.area;
    return `<p class="sotto">${dataLunga(oggi)}</p>
      ${senzaArea ? '<div class="avviso">Segna l’area dell’azienda: Impostazioni → Regole → «Segna qui la posizione dell’azienda», stando in azienda. Senza, le timbrature dal telefono non dicono se si è dentro.</div>' : ''}
      ${mancanti.map(t => `<div class="avviso rosso">${esc(nome(persona(t.persona)))} è entrato ${dataIt(Conti.roma(t.quando).giorno)} alle ${ora(t.quando)}
        e non ha timbrato l'uscita. <button class="link" data-az="correggi" data-id="${t.id}">Sistema</button></div>`).join('')}
      <div class="scheda">${persone.map(p => `<div class="persona">
        <span class="avatar${Conti.dentro(A.timbrature, p.id) ? ' dentro' : ''}">${iniziale(p)}</span>
        <span class="chi"><b>${esc(nome(p))}</b><span>${statoPersona(p)}</span></span>
        <span class="azioni"><button class="btn piccolo ${Conti.dentro(A.timbrature, p.id) ? 'sec' : ''}" data-az="timbra-per" data-id="${p.id}">
          ${Conti.dentro(A.timbrature, p.id) ? 'Uscita' : 'Entrata'}</button></span></div>`).join('')}</div>
      <button class="btn chiaro" data-az="timbra-per-ora">Timbra per qualcuno a un'altra ora…</button>
      <h2 class="sezione">Le timbrature di oggi</h2>
      <div class="scheda">${di && di.length ? di.map(t => rigaTimbratura(t)).join('') : '<p class="lista-vuota">Ancora nessuna.</p>'}</div>
      <p class="sotto">Tocca una timbratura per correggerla. La riga di prima resta nello storico, con il motivo.</p>`;
  }
  const MODI = { qr: 'QR', chiosco: 'tablet', titolare: 'dal titolare', correzione: 'corretta', telefono: 'suo telefono' };
  const AREE = { fuori: ' · <b style="color:var(--rosso)">fuori area</b>', nd: ' · posizione non data' };
  function oltreRiga(t, p) {
    if (t.verso !== 'uscita' || t.valida === false || !p) return '';
    const o = Conti.oltre(A.timbrature, p, A.turni, t);
    return o && o.minuti >= Conti.TOLLERANZA ? ` · <b style="color:var(--arancio)">+${Conti.durataTesto(o.minuti)}</b>` : '';
  }
  function rigaTimbratura(t) {
    const p = persona(t.persona);
    const vecchia = t.valida === false;
    return `<button class="riga" style="width:100%;text-align:left${vecchia ? ';opacity:.5;text-decoration:line-through' : ''}" ${vecchia ? 'disabled' : `data-az="correggi" data-id="${t.id}"`}>
      <span><b>${ora(t.quando)}</b> ${t.verso} · ${esc(p ? p.nome : '')}${t.motivo ? `<br><span class="sotto">${esc(t.motivo)}</span>` : ''}</span>
      <span class="dx">${MODI[t.modo] || ''}${AREE[t.area] || ''}${oltreRiga(t, p)}</span></button>`;
  }

  /* --------------------------------------------------------------- timbra */
  function ultimaMia() {
    return Conti.valide(A.timbrature).filter(t => t.persona === A.io.id).sort((a, b) => b.quando.localeCompare(a.quando))[0];
  }
  function vTimbra() {
    const oggi = Conti.oggi();
    const dentro = Conti.dentro(A.timbrature, A.io.id);
    const turni = Conti.turniDelGiorno(A.turni, A.io.id, oggi);
    const u = ultimaMia();
    const coda = leggi(K_CODA, []).filter(c => c.tipo === 'qr' || c.tipo === 'io');
    const verifica = A.azienda.verifica;
    const f = Conti.foglio(A.io, A.timbrature, A.assenze, A.azienda, oggi.slice(0, 7));
    const a = assenzaDel(A.io.id, oggi);
    return `<p class="saluto">Ciao ${esc(A.io.nome)}</p>
      <p class="orologio" id="orologio">${Conti.roma(new Date().toISOString()).ora}</p>
      <p class="data">${dataLunga(oggi)}</p>
      ${dentro ? contatore(dentro.quando) : ''}
      ${a ? `<div class="avviso">Oggi sei in ${TIPI[a.tipo].toLowerCase()}.</div>` : ''}
      <button class="btn enorme" data-az="timbra-io" data-verso="${dentro ? 'uscita' : 'entrata'}">${verifica === 'qr' ? svg('timbra') + ' ' : ''}${dentro ? 'Uscita · fine lavoro' : 'Entrata · inizio lavoro'}</button>
      <p class="sotto" style="text-align:center">${verifica === 'posizione' ? 'Quando premi, il telefono dice solo se sei in azienda. Nessun tracciamento.'
        : verifica === 'qr' ? 'Dopo il tocco inquadra il QR appeso in azienda.' : ''}</p>
      ${coda.length ? `<div class="avviso">${coda.length === 1 ? 'Una timbratura è salvata' : coda.length + ' timbrature sono salvate'} sul telefono:
        partono da sole quando torna la rete.</div>` : ''}
      <div class="scheda"><h2 class="sezione" style="margin:0 0 2px">Il tuo turno di oggi</h2>
        ${turni.length ? turni.map(t => `<div class="riga"><span>${esc(t.mansione)}${t.nota ? ` <small class="sotto">${esc(t.nota)}</small>` : ''}</span><span class="dx">${t.inizio}–${t.fine}</span></div>`).join('')
          : '<p class="lista-vuota">Oggi non hai turni.</p>'}</div>
      ${(A.lavori || []).some(l => l.giorno === oggi) ? `<div class="scheda"><h2 class="sezione" style="margin:0 0 2px">I lavori di oggi</h2>
        ${(A.lavori || []).filter(l => l.giorno === oggi).map(l => `<p class="lavoro">${esc(l.testo)}</p>`).join('')}</div>` : ''}
      <div class="scheda"><div class="riga"><span>Ultima timbratura</span><span class="dx">${u
        ? `${Conti.roma(u.quando).giorno === oggi ? 'oggi' : dataIt(Conti.roma(u.quando).giorno)}, ${u.verso} ${ora(u.quando)}` : '—'}</span></div>
        <div class="riga"><span>Le tue ore di ${MESI[Number(oggi.slice(5, 7)) - 1]}</span><span class="dx">${Conti.hhmm(f.totale.lavoro)}</span></div></div>
      <p class="sotto">Se hai sbagliato una timbratura, dillo al titolare: la corregge lui.</p>`;
  }
  /* Il contatore dopo l'entrata (dal 31/10/2026): da quanto si lavora, quando
     finisce il turno e, dopo, di quanto lo si è passato. */
  function contatore(dal) {
    const o = Conti.oltre(A.timbrature, A.io, A.turni, null) || { presenza: Math.floor((Date.now() - new Date(dal)) / 60000), durata: Conti.durataTurno(A.io, A.turni, Conti.oggi()), get minuti() { return this.presenza - this.durata; } };
    const fine = new Date(new Date(dal).getTime() + o.durata * 60000).toISOString();
    const oltre = o.minuti > 0;
    return `<div class="contatore${oltre ? ' oltre' : ''}" id="contatore" data-dal="${dal}" role="timer" aria-live="off">
      <span class="etichetta">Al lavoro da</span>
      <b class="tempo">${Conti.durataTesto(o.presenza)}</b>
      <span class="fine${oltre ? ' oltre' : ''}">${oltre ? `Oltre l’orario di ${Conti.durataTesto(o.minuti)}<br><span style="font-weight:500;color:var(--testo-2)">Turno finito alle ${ora(fine)}</span>`
        : `Fine turno alle ${ora(fine)} · turno di ${Conti.durataTesto(o.durata).replace(' 00 min', '')}`}</span></div>`;
  }
  function avviaOrologio() {
    const passo = () => {
      const el = document.getElementById('orologio');
      if (!el) return fermaOrologio();
      el.textContent = Conti.roma(new Date().toISOString()).ora;
      const c = document.getElementById('contatore');
      if (c) c.outerHTML = contatore(c.dataset.dal);
    };
    orologio = setInterval(passo, 10000);
  }
  function fermaOrologio() { if (orologio) clearInterval(orologio); orologio = null; }

  /* Il lettore del QR: BarcodeDetector se c'è, altrimenti jsQR. */
  function inquadra(dopo) {
    let flusso = null, fermo = false;
    const el = document.createElement('div');
    el.className = 'lettore';
    el.innerHTML = `<video playsinline muted autoplay></video><div class="mirino" aria-hidden="true"></div>
      <div class="giu"><p class="sotto" id="lettore-msg">Inquadra il QR appeso in stalla.</p>
      <button class="btn sec pieno" id="lettore-chiudi">Annulla</button></div>`;
    document.body.appendChild(el);
    const chiudi = () => { fermo = true; if (flusso) flusso.getTracks().forEach(t => t.stop()); el.remove(); };
    el.querySelector('#lettore-chiudi').addEventListener('click', chiudi);
    const video = el.querySelector('video');
    const msg = t => { const m = el.querySelector('#lettore-msg'); if (m) m.textContent = t; };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg('Questo telefono non lascia usare la fotocamera all’app. Inquadra il QR con la fotocamera del telefono: si apre l’app e timbra.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(s => {
      flusso = s; video.srcObject = s;
      const usaDetector = 'BarcodeDetector' in window;
      const det = usaDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const tela = document.createElement('canvas'); const ctx = tela.getContext('2d', { willReadFrequently: true });
      const prova = () => usaDetector ? Promise.resolve() : caricaLib(LIB.jsqr, 'jsQR');
      prova().then(() => {
        const giro = () => {
          if (fermo) return;
          if (video.readyState < 2) return requestAnimationFrame(giro);
          const leggiTesto = det
            ? det.detect(video).then(r => r[0] && r[0].rawValue)
            : Promise.resolve((() => {
              tela.width = video.videoWidth; tela.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const r = window.jsQR(ctx.getImageData(0, 0, tela.width, tela.height).data, tela.width, tela.height, { inversionAttempts: 'dontInvert' });
              return r && r.data;
            })());
          leggiTesto.then(t => {
            const c = codiceDa(t);
            if (c) { chiudi(); (typeof dopo === 'function' ? dopo : timbraQR)(c); } else setTimeout(giro, 180);
          }).catch(() => setTimeout(giro, 300));
        };
        giro();
      }).catch(e => msg(e.message));
    }).catch(() => msg('Serve il permesso della fotocamera: dagli l’ok nelle impostazioni del telefono, o inquadra il QR con la fotocamera.'));
  }
  // il QR contiene https://easy.profarmer.it/#t=<codice>
  function codiceDa(t) {
    if (!t) return null;
    const m = String(t).match(/[#&?]t=([0-9a-z-]{8,40})/i);
    return m ? m[1] : null;
  }

  function posizione() {
    if (A.azienda.verifica !== 'posizione' || !navigator.geolocation) return Promise.resolve(null);
    // solo adesso, una volta: niente posizione in continuo
    return new Promise(ok => navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }));
  }
  function timbraQR(codice) {
    const quando = new Date().toISOString(), chiave = nuovaChiave();
    posizione().then(pos => {
      const args = { p_codice: codice, p_verso: null, p_ora_telefono: quando, p_chiave: chiave,
        p_lat: pos ? pos.lat : null, p_lon: pos ? pos.lon : null };
      rpc('pf_timbra', args).then(r => {
        esito(true, r.verso === 'entrata' ? 'Entrata' : 'Uscita', `${r.gia ? 'Era già segnata alle' : 'Alle'} ${ora(r.quando)}. Buon lavoro, ${A.io.nome}.`);
        aggiorna();
      }).catch(e => {
        if (e.delDatabase) return esito(false, 'Non timbrata', e.message);
        metti({ tipo: 'qr', args });
        esito(true, 'Salvata sul telefono', `Sei senza rete: la timbratura delle ${ora(quando)} parte appena torna il segnale.`);
        disegna();
      });
    });
  }
  function esito(ok, titolo, testo, dopo) {
    const el = document.createElement('div');
    el.className = 'esito ' + (ok ? 'ok' : 'no'); el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="segno">${ok ? '✓' : '!'}</div><h2>${esc(titolo)}</h2><p>${esc(testo)}</p>
      <button class="btn sec" style="margin-top:12px">Chiudi</button>`;
    document.body.appendChild(el);
    if (navigator.vibrate) navigator.vibrate(ok ? 80 : [60, 60, 60]);
    const via = () => { el.remove(); if (dopo) dopo(); };
    el.querySelector('button').addEventListener('click', via);
    setTimeout(() => { if (el.isConnected) via(); }, ok ? 3500 : 6000);
  }

  /* ------------------------------------------------- la coda senza rete */
  function metti(c) { const q = leggi(K_CODA, []); q.push({ ...c, messa: new Date().toISOString() }); scrivi(K_CODA, q); }
  let svuoto = false;
  function svuotaCoda() {
    const q = leggi(K_CODA, []);
    if (!q.length || svuoto || navigator.onLine === false) return Promise.resolve();
    svuoto = true;
    const resto = [];
    return q.reduce((p, c) => p.then(() => rpc({ qr: 'pf_timbra', chiosco: 'pf_chiosco_timbra', io: 'pf_timbra_io' }[c.tipo], c.args)
      .catch(e => { if (!e.delDatabase) resto.push(c); })), Promise.resolve())
      .then(() => { scrivi(K_CODA, (resto.length ? resto : null)); svuoto = false; if (resto.length < q.length && A) aggiorna(`Partite le timbrature salvate (${q.length - resto.length}).`); });
  }
  window.addEventListener('online', () => svuotaCoda());
  setInterval(() => svuotaCoda(), 60000);

  /* ---------------------------------------------------------------- turni */
  /* ------------------------------------------------ la settimana a griglia
     Dal 31/10/2026, come il foglio «Organizzazione lavoro» di Giulio: una riga
     per turno-tipo (raggruppati per stalla), una colonna per giorno, più
     persone per casella; la riga Festa (riposi); i lavori del giorno; gli
     avvisi (Settimana.avvisi) e le ore di ognuno. Si riempie dall'Excel, a mano
     casella per casella, o copiando la settimana prima. */
  const giorniSett = () => Array.from({ length: 7 }, (_, i) => Conti.piuGiorni(settimana, i));
  const orarioTipo = y => `${y.inizio}–${y.fine}${y.inizio2 ? ` e ${y.inizio2}–${y.fine2}` : ''}`;
  function riposoDel(pid, g) {
    return A.assenze.find(a => a.persona === pid && a.stato === 'approvata' && a.tipo === 'riposo' && g >= a.dal && g <= a.al);
  }
  function inCella(tipoId, g) {
    const visti = new Map();
    A.turni.filter(u => u.tipo === tipoId && u.giorno === g).forEach(u => { if (!visti.has(u.persona)) visti.set(u.persona, u.nota || ''); });
    return [...visti].map(([id, nota]) => ({ id, nota }));
  }
  function collegati() {
    const c = { ...(A.alias || {}) };
    A.persone.forEach(p => { const k = Settimana.chiaveNome(p.nome); if (k && !c[k]) c[k] = p.id; });
    return c;
  }
  function avvisiSettimana(g7) {
    const dip = A.persone.filter(p => p.attivo !== false && p.ruolo === 'dipendente');
    const turni = A.turni.filter(u => u.tipo && g7.includes(u.giorno));
    const riposi = {};
    dip.forEach(p => { riposi[p.id] = new Set(g7.filter(g => assenzaDel(p.id, g))); });
    return Settimana.avvisi({ giorni: g7, turni, riposi, persone: dip, tipi: A.tipi });
  }
  function vSettimana() {
    const g7 = giorniSett(), oggi = Conti.oggi();
    const pubblicata = A.settimane.includes(settimana);
    const aree = [...new Set(A.tipi.map(y => y.area || ''))];
    const vuota = !A.turni.some(u => u.tipo && g7.includes(u.giorno));
    const { avvisi, ore } = avvisiSettimana(g7);
    const nomeCorto = id => esc((persona(id) || {}).nome || '?');
    const cellaHtml = (y, g) => {
      const cc = inCella(y.id, g);
      return `<td><button class="cella" data-az="cella" data-tipo="${y.id}" data-giorno="${g}" aria-label="${esc(y.nome)}, ${GIORNI[Conti.giornoSettimana(g)]}">
        ${cc.length ? cc.map(x => `<span>${nomeCorto(x.id)}${x.nota ? ` <small>${esc(x.nota)}</small>` : ''}</span>`).join('') : '<span class="vuota">+</span>'}</button></td>`;
    };
    const lavori = g => (A.lavori || []).filter(l => l.giorno === g);
    const oreRighe = Object.entries(ore).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    return `<div class="navsett"><button data-az="sett" data-n="-7" aria-label="Settimana prima">‹</button>
        <b>${dataIt(g7[0])} – ${dataIt(g7[6])}</b><button data-az="sett" data-n="7" aria-label="Settimana dopo">›</button></div>
      <div class="riga-bottoni"><button class="btn" data-az="importa">Importa dal foglio Excel</button>
        ${vuota ? '<button class="btn sec" data-az="copia-sett">Copia la settimana prima</button>' : ''}
        <button class="btn ${pubblicata ? 'chiaro' : 'sec'}" data-az="pubblica">${pubblicata ? 'Pubblicata · avvisa di nuovo' : 'Pubblica e avvisa'}</button>
        <button class="btn chiaro" data-az="tipi">I turni</button></div>
      ${avvisi.length ? `<details class="avvisi-sett"${avvisi.length <= 6 ? ' open' : ''}><summary><b>${avvisi.length} ${avvisi.length === 1 ? 'cosa da guardare' : 'cose da guardare'}</b> prima di pubblicare</summary>
        <ul>${avvisi.map(a => `<li>${esc(a.testo)}</li>`).join('')}</ul>
        <p class="sotto">Le regole sul riposo dipendono dal contratto: in caso di dubbio chiedi al consulente del lavoro.</p></details>`
        : (vuota ? '' : '<p class="sotto">Nessun problema trovato: ognuno ha un riposo, niente turni sovrapposti, almeno 11 ore di riposo di fila.</p>')}
      <div class="griglia"><table>
        <thead><tr><th></th>${g7.map(g => `<th class="${g === oggi ? 'oggi' : ''}">${GIORNI[Conti.giornoSettimana(g)].slice(0, 3)} ${g.slice(8)}</th>`).join('')}</tr></thead>
        <tbody>${aree.map(ar => `${ar ? `<tr class="area"><th colspan="8">${esc(ar)}</th></tr>` : ''}
          ${A.tipi.filter(y => (y.area || '') === ar).map(y => `<tr><th><b>${esc(y.nome)}</b><small>${orarioTipo(y)}</small></th>${g7.map(g => cellaHtml(y, g)).join('')}</tr>`).join('')}`).join('')}
          <tr class="festa"><th><b>Festa</b><small>riposo</small></th>${g7.map(g => {
            const chi = A.persone.filter(p => riposoDel(p.id, g));
            return `<td><button class="cella" data-az="cella" data-tipo="" data-giorno="${g}" aria-label="Festa, ${GIORNI[Conti.giornoSettimana(g)]}">
              ${chi.length ? chi.map(p => `<span>${esc(p.nome)}</span>`).join('') : '<span class="vuota">+</span>'}</button></td>`;
          }).join('')}</tr>
          <tr class="lavori"><th><b>Lavori</b><small>del giorno</small></th>${g7.map(g => `<td><button class="cella" data-az="lavori" data-giorno="${g}">
            ${lavori(g).length ? lavori(g).map(l => `<span class="lav">${esc(l.testo)}</span>`).join('') : '<span class="vuota">+</span>'}</button></td>`).join('')}</tr>
        </tbody></table></div>
      ${oreRighe.length ? `<h2 class="sezione">Ore di turno della settimana</h2>
        <div class="scheda ore-sett">${oreRighe.map(([id, n]) => `<div class="riga"><span>${nomeCorto(id)}</span><span class="dx"${n > 48 ? ' style="color:var(--rosso);font-weight:700"' : ''}>${Conti.hhmm(n)}</span></div>`).join('')}</div>` : ''}
      <p class="sotto">Tocca una casella per cambiare chi c'è. «Pubblica e avvisa» manda a ognuno i suoi turni e i suoi lavori.</p>`;
  }
  function foglioCella(tipoId, g) {
    const y = tipoId ? A.tipi.find(t => t.id === tipoId) : null;
    const dentro = new Map(y ? inCella(y.id, g).map(x => [x.id, x.nota]) : A.persone.filter(p => riposoDel(p.id, g)).map(p => [p.id, '']));
    const persone = A.persone.filter(p => p.attivo !== false && p.ruolo === 'dipendente');
    foglio(`${y ? y.nome : 'Festa'} · ${GIORNI[Conti.giornoSettimana(g)]} ${dataIt(g)}`, `
      ${y ? `<p class="sotto">${orarioTipo(y)}${y.area ? ' · ' + esc(y.area) : ''}</p>` : '<p class="sotto">Chi riposa questo giorno: conta come riposo nel cruscotto.</p>'}
      <div class="lista-spunte">${persone.map(p => `<div class="spunta-nota"><label class="spunta"><input type="checkbox" value="${p.id}"${dentro.has(p.id) ? ' checked' : ''}> <span>${esc(nome(p))}</span></label>
        ${y ? `<input class="nota" data-per="${p.id}" placeholder="nota" value="${esc(dentro.get(p.id) || '')}" aria-label="Nota per ${esc(p.nome)}">` : ''}</div>`).join('')}</div>
      <p class="errore" id="c-err"></p><button class="btn pieno" id="c-salva">Salva</button>`, f => {
      f.querySelector('#c-salva').addEventListener('click', () => {
        const scelti = [...f.querySelectorAll('input[type=checkbox]:checked')].map(c => ({ id: c.value,
          nota: y ? (f.querySelector(`.nota[data-per="${c.value}"]`) || {}).value || '' : '' }));
        salvaE('pf_salva_cella', { p: { giorno: g, tipo: tipoId || '', persone: scelti } }, 'Salvato.', f);
      });
    });
  }
  function foglioLavori(g) {
    const ll = (A.lavori || []).filter(l => l.giorno === g);
    foglio(`Lavori · ${GIORNI[Conti.giornoSettimana(g)]} ${dataIt(g)}`, `
      <p class="sotto">Ognuno vede i lavori dove c'è il suo nome; quelli senza nomi li vedono tutti.</p>
      ${ll.map(l => `<div class="campo"><textarea data-id="${l.id}" rows="3">${esc(l.testo)}</textarea></div>`).join('')}
      <div class="campo"><label for="l-nuovo">Un lavoro nuovo</label><textarea id="l-nuovo" rows="3" placeholder="Amrik e Jassmeet: cuccette gruppo 32"></textarea></div>
      <p class="errore" id="l-err"></p><button class="btn pieno" id="l-salva">Salva</button>`, f => {
      f.querySelector('#l-salva').addEventListener('click', async () => {
        const c = collegati();
        try {
          for (const t of f.querySelectorAll('textarea[data-id]')) {
            const vecchio = ll.find(l => l.id === t.dataset.id);
            if (vecchio && vecchio.testo !== t.value) await rpc('pf_salva_lavoro', { p: { id: t.dataset.id, testo: t.value, persone: Settimana.nominate(t.value, c) } });
          }
          const n = f.querySelector('#l-nuovo').value;
          if (n.trim()) await rpc('pf_salva_lavoro', { p: { giorno: g, testo: n, persone: Settimana.nominate(n, c) } });
          chiudiFoglio(); aggiorna('Salvato.');
        } catch (e) { f.querySelector('#l-err').textContent = motivo(e); }
      });
    });
  }
  function foglioTipi() {
    foglio('I turni', `<p class="sotto">I turni-tipo della settimana: nome, stalla e orario. L'orario vale per i turni messi da qui in avanti.</p>
      ${A.tipi.map(y => `<div class="scheda tipo-riga" data-id="${y.id}">
        <div class="due"><div class="campo"><label>Nome</label><input data-k="nome" value="${esc(y.nome)}"></div>
          <div class="campo"><label>Stalla</label><input data-k="area" value="${esc(y.area || '')}"></div></div>
        <div class="orari"><input type="time" data-k="inizio" value="${y.inizio}" aria-label="Inizio"><span>–</span><input type="time" data-k="fine" value="${y.fine}" aria-label="Fine">
          <span>e poi</span><input type="time" data-k="inizio2" value="${y.inizio2 || ''}" aria-label="Inizio dopo la pausa"><span>–</span><input type="time" data-k="fine2" value="${y.fine2 || ''}" aria-label="Fine dopo la pausa"></div>
        <label class="spunta"><input type="checkbox" data-k="togli"> <span>Non lo uso più</span></label></div>`).join('') || '<p class="lista-vuota">Ancora nessun turno: importa il foglio Excel.</p>'}
      <p class="errore" id="t-err"></p><button class="btn pieno" id="t-salva">Salva</button>`, f => {
      f.querySelector('#t-salva').addEventListener('click', async () => {
        try {
          for (const r of f.querySelectorAll('.tipo-riga')) {
            const v = k => r.querySelector(`[data-k="${k}"]`);
            await rpc('pf_salva_tipo', { p: { id: r.dataset.id, nome: v('nome').value, area: v('area').value, inizio: v('inizio').value, fine: v('fine').value,
              inizio2: v('inizio2').value, fine2: v('fine2').value, attivo: !v('togli').checked } });
          }
          chiudiFoglio(); aggiorna('Turni salvati.');
        } catch (e) { f.querySelector('#t-err').textContent = motivo(e); }
      });
    });
  }

  /* L'Excel della settimana: si legge sul telefono (SheetJS), si collegano
     turni e nomi a quelli di Easy, si controlla, poi pf_salva_settimana. */
  function apriImporta() {
    foglio('Importa la settimana dal foglio Excel', `
      <p class="sotto">Scegli il file della settimana, per esempio «Organizzazione lavoro stalla nuova e vecchia». Easy legge il foglio con le date in alto:
        i turni con i nomi, la riga Festa e i lavori del giorno. Prima di salvare ti fa controllare tutto.</p>
      <div class="campo"><label for="x-file">Il file Excel</label><input id="x-file" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
      <div id="x-fogli"></div><div id="x-passo"></div><p class="errore" id="x-err"></p>`, f => {
      const err = m => { f.querySelector('#x-err').textContent = m || ''; };
      f.querySelector('#x-file').addEventListener('change', ev => {
        const file = ev.target.files[0]; if (!file) return;
        err(''); f.querySelector('#x-passo').innerHTML = '<p class="lista-vuota">Leggo il foglio…</p>';
        Promise.all([caricaLib('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'), file.arrayBuffer()]).then(([X, buf]) => {
          const wb = X.read(buf, { cellDates: true });
          const scegli = nomeFoglio => {
            try {
              const rows = X.utils.sheet_to_json(wb.Sheets[nomeFoglio], { header: 1, raw: true, defval: '' });
              passoControllo(f, Settimana.leggi(rows));
              err('');
            } catch (e) { f.querySelector('#x-passo').innerHTML = ''; err(e.message); }
          };
          f.querySelector('#x-fogli').innerHTML = wb.SheetNames.length > 1 ? `<div class="campo"><label for="x-foglio">Il foglio</label>
            <select id="x-foglio">${wb.SheetNames.map(n => `<option>${esc(n)}</option>`).join('')}</select></div>` : '';
          const sel = f.querySelector('#x-foglio');
          if (sel) sel.addEventListener('change', () => scegli(sel.value));
          scegli(wb.SheetNames[0]);
        }).catch(e => { f.querySelector('#x-passo').innerHTML = ''; err(e.message || 'Non riesco a leggere il file.'); });
      });
    });
  }
  function passoControllo(f, L) {
    const lunedi = Conti.lunediDi(L.giorni[0]);
    const chiave = y => Settimana.chiaveNome((y.area || '') + '|' + y.nome);
    const esistenti = new Map(A.tipi.map(y => [chiave(y), y]));
    const c = collegati();
    const dip = A.persone.filter(p => p.attivo !== false);
    const opzioni = n => `<option value="">Non è in Easy: salta</option><option value="nuovo"${c[Settimana.chiaveNome(n)] ? '' : ' selected'}>Nuova persona «${esc(n)}»</option>`
      + dip.map(p => `<option value="${p.id}"${c[Settimana.chiaveNome(n)] === p.id ? ' selected' : ''}>${esc(nome(p))}</option>`).join('');
    const nLavori = L.lavori.reduce((n, l) => n + l.length, 0);
    f.querySelector('#x-passo').innerHTML = `
      <div class="avviso">Settimana dal ${dataIt(lunedi)} al ${dataIt(Conti.piuGiorni(lunedi, 6))}${L.giorni[0] !== lunedi ? ' (nel foglio il primo giorno non è un lunedì: controlla le date)' : ''}.
        Salvando, i turni del foglio, le feste e i lavori di quella settimana prendono il posto di quelli che ci sono in Easy.</div>
      <h3 class="sezione">I turni del foglio (${L.turni.length})</h3>
      ${L.turni.map((t, i) => { const y = esistenti.get(t.chiave);
        const o = y || t;
        return `<div class="scheda tipo-riga" data-i="${i}">
          <b>${esc(t.nome)}</b>${t.area ? ` <span class="sotto">· ${esc(t.area)}</span>` : ''}${y ? ' <span class="chip verde">già in Easy</span>' : ' <span class="chip">nuovo</span>'}
          <div class="orari"><input type="time" data-k="inizio" value="${o.inizio || ''}" aria-label="Inizio"><span>–</span><input type="time" data-k="fine" value="${o.fine || ''}" aria-label="Fine">
            <span>e poi</span><input type="time" data-k="inizio2" value="${o.inizio2 || ''}" aria-label="Inizio dopo la pausa"><span>–</span><input type="time" data-k="fine2" value="${o.fine2 || ''}" aria-label="Fine dopo la pausa"></div>
          ${!y && t.dubbio ? `<p class="sotto" style="color:var(--arancio-2)">${esc(t.dubbio)}</p>` : ''}</div>`; }).join('')}
      <h3 class="sezione">I nomi del foglio (${L.nomi.length})</h3>
      <p class="sotto">Collega ogni nome a una persona di Easy. Easy se lo ricorda per le settimane dopo.</p>
      <div class="scheda">${L.nomi.map(n => `<div class="riga nome-riga"><span><b>${esc(n)}</b></span><select data-nome="${esc(n)}" aria-label="Chi è ${esc(n)}">${opzioni(n)}</select></div>`).join('')}</div>
      <p class="sotto">E poi ${L.feste.reduce((n, x) => n + x.length, 0)} feste e ${nLavori} lavori del giorno.</p>
      <div id="x-avvisi"></div>
      <button class="btn pieno" id="x-salva">Salva la settimana in Easy</button>`;
    const leggiScelte = () => {
      const orari = L.turni.map((t, i) => { const r = f.querySelector(`.tipo-riga[data-i="${i}"]`); const v = k => r.querySelector(`[data-k="${k}"]`).value;
        return { inizio: v('inizio'), fine: v('fine'), inizio2: v('inizio2'), fine2: v('fine2') }; });
      const chi = {}; f.querySelectorAll('select[data-nome]').forEach(s => { chi[s.dataset.nome] = s.value; });
      return { orari, chi };
    };
    // gli avvisi con le scelte di adesso (le persone nuove con un id finto)
    const controlla = () => {
      const { orari, chi } = leggiScelte();
      const idDi = n => chi[n] === 'nuovo' ? 'nuovo:' + n : chi[n];
      const persone = L.nomi.filter(n => chi[n]).map(n => ({ id: idDi(n), nome: n }));
      const turni = [];
      L.turni.forEach((t, i) => { const o = orari[i]; if (!o.inizio || !o.fine) return;
        t.celle.forEach((cc, gi) => cc.forEach(x => { if (!chi[x.nome]) return;
          turni.push({ persona: idDi(x.nome), giorno: L.giorni[gi], inizio: o.inizio, fine: o.fine, mansione: t.nome, tipo: 't' + i });
          if (o.inizio2 && o.fine2) turni.push({ persona: idDi(x.nome), giorno: L.giorni[gi], inizio: o.inizio2, fine: o.fine2, mansione: t.nome, tipo: 't' + i });
        })); });
      const riposi = {}; L.feste.forEach((ff, gi) => ff.forEach(n => { if (chi[n]) (riposi[idDi(n)] = riposi[idDi(n)] || new Set()).add(L.giorni[gi]); }));
      const { avvisi } = Settimana.avvisi({ giorni: L.giorni, turni, riposi, persone, tipi: L.turni.map((t, i) => ({ id: 't' + i, nome: t.nome })) });
      const senza = L.turni.filter((t, i) => !orari[i].inizio || !orari[i].fine).map(t => t.nome);
      f.querySelector('#x-avvisi').innerHTML = (senza.length ? `<div class="avviso rosso">Manca l'orario di: ${senza.map(esc).join(', ')}. Scrivilo sopra.</div>` : '')
        + (avvisi.length ? `<details class="avvisi-sett"><summary><b>${avvisi.length} ${avvisi.length === 1 ? 'cosa da guardare' : 'cose da guardare'}</b> in questa settimana</summary>
          <ul>${avvisi.map(a => `<li>${esc(a.testo)}</li>`).join('')}</ul></details>` : '');
    };
    f.querySelectorAll('#x-passo input, #x-passo select').forEach(el => el.addEventListener('change', controlla));
    controlla();
    f.querySelector('#x-salva').addEventListener('click', async ev => {
      const b = ev.currentTarget;
      const { orari, chi } = leggiScelte();
      if (L.turni.some((t, i) => !orari[i].inizio || !orari[i].fine)) { controlla(); f.querySelector('#x-err').textContent = 'Prima scrivi gli orari che mancano.'; return; }
      b.disabled = true; b.textContent = 'Salvo…';
      try {
        // 1. le persone nuove
        const ids = {};
        for (const n of L.nomi) {
          if (chi[n] === 'nuovo') ids[n] = (await rpc('pf_salva_persona', { p: { nome: n, cognome: '', email: '', ore_giorno: 9 } })).id;
          else if (chi[n]) ids[n] = chi[n];
        }
        // 2. i turni-tipo
        const tipoId = [];
        for (let i = 0; i < L.turni.length; i++) {
          const t = L.turni[i], y = esistenti.get(t.chiave);
          tipoId[i] = (await rpc('pf_salva_tipo', { p: { id: y ? y.id : '', nome: y ? y.nome : t.nome, area: t.area, ...orari[i], posizione: i + 1 } })).id;
        }
        // 3. la settimana
        const coll = { ...c }; Object.entries(ids).forEach(([n, id]) => { coll[Settimana.chiaveNome(n)] = id; });
        const p = {
          alias: Object.entries(ids).map(([n, id]) => ({ alias: Settimana.chiaveNome(n), persona: id })),
          celle: L.turni.flatMap((t, i) => t.celle.map((cc, gi) => ({ giorno: L.giorni[gi], tipo: tipoId[i],
            persone: cc.filter(x => ids[x.nome]).map(x => ({ id: ids[x.nome], nota: x.nota })) }))),
          feste: L.feste.map((ff, gi) => ({ giorno: L.giorni[gi], persone: ff.filter(n => ids[n]).map(n => ({ id: ids[n] })) })),
          lavori: L.lavori.flatMap((ll, gi) => ll.map(testo => ({ giorno: L.giorni[gi], testo, persone: Settimana.nominate(testo, coll) })))
        };
        await rpc('pf_salva_settimana', { p_lunedi: lunedi, p });
        settimana = lunedi; chiudiFoglio(); location.hash = '#turni';
        aggiorna('Settimana salvata: controlla e premi «Pubblica e avvisa».');
      } catch (e) { b.disabled = false; b.textContent = 'Salva la settimana in Easy'; f.querySelector('#x-err').textContent = motivo(e); }
    });
  }

  function vTurni() {
    if (titolare() && (A.tipi || []).length) return vSettimana();
    const g7 = Array.from({ length: 7 }, (_, i) => Conti.piuGiorni(settimana, i));
    const oggi = Conti.oggi();
    const persone = (titolare() ? A.persone.filter(p => p.attivo !== false) : [A.io]);
    const pubblicata = A.settimane.includes(settimana);
    return `<div class="navsett"><button data-az="sett" data-n="-7" aria-label="Settimana prima">‹</button>
        <b>${dataIt(g7[0])} – ${dataIt(g7[6])}</b><button data-az="sett" data-n="7" aria-label="Settimana dopo">›</button></div>
      ${titolare() ? `<div class="riga-bottoni"><button class="btn" data-az="importa">Importa dal foglio Excel</button><button class="btn sec" data-az="turno-nuovo">+ Turno</button>
        <button class="btn ${pubblicata ? 'chiaro' : 'sec'}" data-az="pubblica">${pubblicata ? 'Pubblicata · avvisa di nuovo' : 'Pubblica e avvisa'}</button></div>
        <p class="sotto">I turni «ogni settimana» si ripetono da soli. Cambia solo le eccezioni, poi premi «Pubblica»: ognuno riceve i suoi.</p>` : ''}
      <div class="scheda">${g7.map(g => {
        const righe = persone.flatMap(p => Conti.turniDelGiorno(A.turni, p.id, g).map(u => ({ p, u })));
        const ass = persone.map(p => ({ p, a: assenzaDel(p.id, g) })).filter(x => x.a);
        return `<div class="giorno-turni"><h3 class="${g === oggi ? 'oggi' : ''}"><span>${GIORNI[Conti.giornoSettimana(g)]} ${dataIt(g)}</span>
          ${titolare() ? `<button class="link" data-az="turno-nuovo" data-giorno="${g}">+ aggiungi</button>` : ''}</h3>
          ${righe.map(({ p, u }) => `<button class="turno" ${titolare() ? `data-az="turno" data-id="${u.id}" data-giorno="${g}"` : (u.compito ? `data-az="compito" data-id="${u.compito}"` : 'disabled')}>
            <span>${titolare() ? `<b>${esc(p.nome)}</b> · ` : ''}${esc(u.mansione)}${u.nota ? ` <small>${esc(u.nota)}</small>` : ''}</span><span>${u.inizio}–${u.fine}</span></button>`).join('')}

          ${ass.map(({ p, a }) => `<div class="turno" style="background:transparent;box-shadow:inset 0 0 0 1px var(--bordo)"><span>${titolare() ? `<b>${esc(p.nome)}</b> · ` : ''}${TIPI[a.tipo]}</span><span></span></div>`).join('')}
          ${!righe.length && !ass.length ? '<p class="lista-vuota">Nessun turno.</p>' : ''}
          ${!titolare() ? (A.lavori || []).filter(l => l.giorno === g).map(l => `<p class="lavoro">${esc(l.testo)}</p>`).join('') : ''}</div>`;
      }).join('')}</div>`;
  }
  function foglioTurno(u, giorno) {
    const persone = A.persone.filter(p => p.attivo !== false);
    const ricorrente = u ? !u.giorno : true;
    const g = giorno || Conti.oggi();
    foglio(u ? 'Cambia il turno' : 'Nuovo turno', `
      <div class="campo"><label for="t-persona">Chi</label><select id="t-persona">${persone.map(p =>
        `<option value="${p.id}"${u && u.persona === p.id ? ' selected' : ''}>${esc(nome(p))}</option>`).join('')}</select></div>
      <div class="campo"><label for="t-mansione">Cosa</label><select id="t-mansione">${MANSIONI.map(m =>
        `<option${u && u.mansione === m ? ' selected' : ''}>${m}</option>`).join('')}${u && !MANSIONI.includes(u.mansione) ? `<option selected>${esc(u.mansione)}</option>` : ''}</select></div>
      <div class="due"><div class="campo"><label for="t-inizio">Dalle</label><input id="t-inizio" type="time" value="${u ? u.inizio || '' : '05:00'}"></div>
        <div class="campo"><label for="t-fine">Alle</label><input id="t-fine" type="time" value="${u ? u.fine || '' : '09:00'}"></div></div>
      <div class="campo"><label for="t-giorno">Il giorno</label><input id="t-giorno" type="date" value="${u && u.giorno ? u.giorno : g}"></div>
      <label class="spunta"><input type="checkbox" id="t-ogni"${ricorrente ? ' checked' : ''}> <span>Ogni settimana, questo giorno della settimana</span></label>
      ${A.mansioni.length ? `<div class="campo"><label for="t-compito">Compito del mansionario (facoltativo)</label><select id="t-compito"><option value="">—</option>${A.mansioni.map(m =>
        `<option value="${m.id}"${u && u.compito === m.id ? ' selected' : ''}>${esc(m.titolo)}</option>`).join('')}</select></div>` : ''}
      <p class="errore" id="t-err"></p>
      <button class="btn pieno" id="t-salva">Salva</button>
      ${u ? `<div class="riga-bottoni">${!u.giorno ? `<button class="btn chiaro" id="t-riposo">Solo il ${dataIt(g)}: riposo</button>` : ''}
        <button class="btn rosso" id="t-togli">${u.giorno ? 'Togli' : 'Togli da tutte le settimane'}</button></div>` : ''}`, f => {
      const val = id => f.querySelector('#' + id) && f.querySelector('#' + id).value;
      f.querySelector('#t-salva').addEventListener('click', () => {
        const giorno = val('t-giorno'); const ogni = f.querySelector('#t-ogni').checked;
        if (!val('t-inizio') || !val('t-fine')) return (f.querySelector('#t-err').textContent = 'Scrivi le ore.');
        const p = { id: u ? u.id : '', persona: val('t-persona'), mansione: val('t-mansione'), inizio: val('t-inizio'), fine: val('t-fine'),
          compito: val('t-compito') || '', giorno: ogni ? '' : giorno, giorno_settimana: ogni ? Conti.giornoSettimana(giorno) : '' };
        salvaE('pf_salva_turno', { p }, 'Turno salvato.', f);
      });
      const togli = f.querySelector('#t-togli');
      if (togli) togli.addEventListener('click', () => salvaE('pf_togli_turno', { p_id: u.id }, 'Turno tolto.', f));
      const riposo = f.querySelector('#t-riposo');
      if (riposo) riposo.addEventListener('click', () => salvaE('pf_salva_turno',
        { p: { persona: u.persona, giorno: g, mansione: 'riposo', inizio: '', fine: '' } }, `Il ${dataIt(g)} è di riposo.`, f));
    });
  }

  /* ---------------------------------------------------------------- ferie */
  function rigaAssenza(a, decidi) {
    const p = persona(a.persona);
    const quando = a.dal === a.al ? `il ${dataIt(a.dal)}` : `dal ${dataIt(a.dal)} al ${dataIt(a.al)}`;
    const stato = { chiesta: '<span class="chip giallo">Da decidere</span>', approvata: '<span class="chip verde">Approvata</span>',
      rifiutata: '<span class="chip rosso">Non approvata</span>' }[a.stato] || '';
    return `<div class="riga" style="flex-wrap:wrap"><span style="flex:1;min-width:180px">${titolare() || a.persona !== A.io.id ? `<b>${esc(p ? p.nome : '')}</b> · ` : ''}
      ${TIPI[a.tipo]}${a.ore ? ` (${a.ore} ore)` : ''} ${quando}${a.nota ? `<br><span class="sotto">${esc(a.nota)}</span>` : ''}</span>
      <span class="dx"${decidi ? ' style="flex:1 1 100%"' : ''}>${decidi ? `<span class="riga-bottoni"><button class="btn piccolo" data-az="decidi" data-id="${a.id}" data-esito="approvata">Approva</button>
        <button class="btn piccolo sec" data-az="decidi" data-id="${a.id}" data-esito="rifiutata">Rifiuta</button></span>`
        : stato + (a.persona === A.io.id && a.stato === 'chiesta' ? ` <button class="link" data-az="ritira" data-id="${a.id}">Ritira</button>` : '')
          + (titolare() && a.stato === 'approvata' ? ` <button class="link" data-az="decidi" data-id="${a.id}" data-esito="annullata">Togli</button>` : '')}</span></div>`;
  }
  function vFerie() {
    const oggi = Conti.oggi();
    const chieste = A.assenze.filter(a => a.stato === 'chiesta');
    const prossime = A.assenze.filter(a => a.stato === 'approvata' && a.al >= oggi).sort((a, b) => a.dal.localeCompare(b.dal));
    if (titolare()) return `<button class="btn" data-az="assenza-nuova">+ Segna ferie, riposo, permesso o malattia</button>
      <h2 class="sezione">Da decidere</h2>
      <div class="scheda">${chieste.length ? chieste.map(a => rigaAssenza(a, true)).join('') : '<p class="lista-vuota">Nessuna richiesta.</p>'}</div>
      <h2 class="sezione">Chi manca nei prossimi giorni</h2>
      <div class="scheda">${prossime.length ? prossime.map(a => rigaAssenza(a)).join('') : '<p class="lista-vuota">Nessuno.</p>'}</div>`;
    const mie = A.assenze.filter(a => a.persona === A.io.id).sort((a, b) => b.dal.localeCompare(a.dal));
    const altri = prossime.filter(a => a.persona !== A.io.id);
    return `<button class="btn" data-az="assenza-nuova">+ Chiedi ferie, riposo o permesso</button>
      <h2 class="sezione">Le tue richieste</h2>
      <div class="scheda">${mie.length ? mie.map(a => rigaAssenza(a)).join('') : '<p class="lista-vuota">Nessuna.</p>'}</div>
      <h2 class="sezione">Chi manca nei prossimi giorni</h2>
      <div class="scheda">${altri.length ? altri.map(a => rigaAssenza(a)).join('') : '<p class="lista-vuota">Nessuno.</p>'}</div>
      <p class="sotto">Se stai male, avvisa il titolare: la malattia la segna lui.</p>`;
  }
  function foglioAssenza() {
    const tit = titolare();
    const tipi = tit ? ['ferie', 'riposo', 'permesso', 'malattia'] : ['ferie', 'riposo', 'permesso'];
    foglio(tit ? 'Segna un’assenza' : 'Chiedi ferie o riposo', `
      ${tit ? `<div class="campo"><label for="a-persona">Chi</label><select id="a-persona">${A.persone.filter(p => p.attivo !== false).map(p =>
        `<option value="${p.id}">${esc(nome(p))}</option>`).join('')}</select></div>` : ''}
      <div class="campo"><label for="a-tipo">Cosa</label><select id="a-tipo">${tipi.map(t => `<option value="${t}">${TIPI[t]}</option>`).join('')}</select></div>
      <div class="due"><div class="campo"><label for="a-dal">Dal</label><input id="a-dal" type="date" value="${Conti.oggi()}"></div>
        <div class="campo"><label for="a-al">Al</label><input id="a-al" type="date" value="${Conti.oggi()}"></div></div>
      <div class="campo nascosto" id="a-ore-c"><label for="a-ore">Quante ore</label><input id="a-ore" type="number" inputmode="decimal" min="0.5" max="12" step="0.5" value="2"></div>
      <div class="campo"><label for="a-nota">Una nota (facoltativa)</label><input id="a-nota" maxlength="300"></div>
      <p class="errore" id="a-err"></p>
      <button class="btn pieno" id="a-salva">${tit ? 'Salva' : 'Manda la richiesta'}</button>
      ${tit ? '' : '<p class="sotto">Il titolare la approva o la rifiuta, e ti arriva la notifica.</p>'}`, f => {
      const tipo = f.querySelector('#a-tipo');
      tipo.addEventListener('change', () => f.querySelector('#a-ore-c').classList.toggle('nascosto', tipo.value !== 'permesso'));
      const dal = f.querySelector('#a-dal'), al = f.querySelector('#a-al');
      dal.addEventListener('change', () => { if (al.value < dal.value) al.value = dal.value; });
      f.querySelector('#a-salva').addEventListener('click', () => {
        if (al.value < dal.value) return (f.querySelector('#a-err').textContent = 'Il giorno di fine viene prima dell’inizio.');
        const p = { tipo: tipo.value, dal: dal.value, al: al.value, nota: f.querySelector('#a-nota').value,
          ore: tipo.value === 'permesso' ? f.querySelector('#a-ore').value : '' };
        if (tit) p.persona = f.querySelector('#a-persona').value;
        salvaE('pf_chiedi_assenza', { p }, tit ? 'Segnata.' : 'Richiesta mandata al titolare.', f);
      });
    });
  }

  /* ----------------------------------------------------------------- mese */
  function datiPerMese() {
    // l'area copre il mese in corso e quello prima; per i più vecchi chiede pf_mese
    const primo = Conti.piuGiorni(Conti.oggi().slice(0, 7) + '-01', -1).slice(0, 7);
    if (mese >= primo) return Promise.resolve({ timbrature: A.timbrature, assenze: A.assenze });
    if (datiMese && datiMese.mese === mese) return Promise.resolve(datiMese);
    return rpc('pf_mese', { p_mese: mese + '-01' }).then(r => (datiMese = { mese, ...r }));
  }
  function fogli(d) {
    // il titolare compare solo se timbra anche lui
    const timbra = p => d.timbrature.some(t => t.persona === p.id && t.quando.slice(0, 7) >= Conti.piuGiorni(mese + '-01', -1).slice(0, 7));
    const persone = A.persone.filter(p => (p.ruolo === 'dipendente' && p.attivo !== false) || timbra(p));
    return persone.map(p => Conti.foglio(p, d.timbrature, d.assenze, A.azienda, mese));
  }
  const euro = n => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const caricaPaghe = () => paghe ? Promise.resolve(paghe) : rpc('pf_paghe').then(r => (paghe = r || {})).catch(() => ({}));
  /* Il cruscotto del mese (dal 31/10/2026, solo il titolare): per ognuno le ore
     lavorate, il netto (ore × paga oraria netta, straordinari compresi alla
     stessa paga) e i riposi, dichiarati o senza timbrature. */
  function cruscotto(ff, pp) {
    const oggi = Conti.oggi();
    const righe = ff.map(f => {
      const paga = pp[f.persona.id] != null ? Number(pp[f.persona.id]) : null;
      const dal = f.persona.dal || '';
      const senza = f.giorni.filter(g => g.giorno < oggi && g.giorno >= dal && !g.coppie.length && !g.causale).length;
      return { f, paga, netto: paga == null ? null : Math.round(f.totale.lavoro * paga * 100) / 100,
        dichiarati: f.totale.riposo, senza, ferie: f.totale.ferie, malattia: f.totale.malattia };
    });
    const tot = k => righe.reduce((n, r) => n + (r[k] || 0), 0);
    const ore = ff.reduce((n, f) => n + f.totale.lavoro, 0);
    const manca = righe.filter(r => r.paga == null);
    return `<div class="cruscotto">
        <div class="cifra"><span>Ore lavorate</span><b>${Conti.hhmm(ore)}</b></div>
        <div class="cifra forte"><span>Netto guadagnato</span><b>${euro(tot('netto'))}</b></div>
        <div class="cifra"><span>Riposi</span><b>${tot('dichiarati') + tot('senza')}</b><small>${tot('dichiarati')} dichiarat${tot('dichiarati') === 1 ? 'o' : 'i'} · ${tot('senza')} senza timbrature</small></div>
      </div>
      <div class="scheda scorre"><table class="tab-tabella">
        <tr><th>Persona</th><th>Ore</th><th>Paga</th><th>Netto</th><th><abbr title="Riposi: dichiarati + senza timbrature">Riposi</abbr></th></tr>
        ${righe.map((r, i) => `<tr class="tocca" data-az="dettaglio" data-i="${i}" tabindex="0"><td><b>${esc(r.f.persona.nome)}</b></td>
          <td>${Conti.hhmm(r.f.totale.lavoro)}</td>
          <td>${r.paga == null ? `<button class="link" data-az="paga" data-id="${r.f.persona.id}">metti</button>` : euro(r.paga) + '/h'}</td>
          <td><b>${r.netto == null ? '—' : euro(r.netto)}</b></td>
          <td><b>${r.dichiarati + r.senza}</b>${r.dichiarati + r.senza ? `<br><span class="sotto" style="white-space:nowrap">${r.dichiarati} + ${r.senza}</span>` : ''}</td></tr>`).join('')}
        <tr class="totale"><td><b>Totale</b></td><td><b>${Conti.hhmm(ore)}</b></td><td></td><td><b>${euro(tot('netto'))}</b></td><td><b>${tot('dichiarati') + tot('senza')}</b></td></tr>
      </table></div>
      ${manca.length ? `<p class="sotto">Manca la paga oraria di ${manca.map(r => esc(r.f.persona.nome)).join(', ')}: la metti nella sua scheda (Altro → Persone) o con «metti».</p>` : ''}
      <p class="sotto">Netto = ore lavorate del mese × paga oraria netta, straordinari compresi alla stessa paga. Riposi: dichiarati + senza timbrature. «Senza timbrature» sono i giorni passati
        in cui non ha timbrato e non aveva ferie, riposo o malattia. Lo vedi solo tu: ai dipendenti la paga non arriva.</p>
      <h2 class="sezione">Ore, straordinari e assenze</h2>`;
  }
  function foglioPaga(pid) {
    const p = persona(pid);
    foglio(`La paga di ${p.nome}`, `<div class="campo"><label for="g-paga">Paga oraria netta, € all’ora</label>
        <input id="g-paga" type="text" inputmode="decimal" autocomplete="off" value="${paghe && paghe[pid] != null ? String(paghe[pid]).replace('.', ',') : ''}" placeholder="8,00"></div>
      <p class="sotto">La vedi solo tu, nel cruscotto del mese.</p><p class="errore" id="g-err"></p><button class="btn pieno" id="g-salva">Salva</button>`, f => {
      f.querySelector('#g-salva').addEventListener('click', () => salvaPaga(pid, f.querySelector('#g-paga').value).then(() => { chiudiFoglio(); toast('Paga salvata.'); disegna(); })
        .catch(e => { f.querySelector('#g-err').textContent = motivo(e); }));
    });
  }
  function salvaPaga(pid, v) {
    const n = String(v).trim() === '' ? null : Number(String(v).trim().replace('€', '').replace(',', '.'));
    if (n != null && !(n >= 0 && n <= 500)) return Promise.reject(Object.assign(new Error('La paga oraria va da 0 a 500 €.'), { delDatabase: true }));
    return rpc('pf_salva_paga', { p_persona: pid, p_paga: n }).then(() => { paghe = { ...(paghe || {}) }; if (n == null) delete paghe[pid]; else paghe[pid] = n; });
  }
  function vMese() {
    setTimeout(() => Promise.all([datiPerMese(), caricaPaghe()]).then(([d, pp]) => {
      const el = document.getElementById('mese-dati'); if (!el) return;
      const ff = fogli(d);
      const soglia = Number(A.azienda.soglia_straordinari_mese || 0);
      el.innerHTML = cruscotto(ff, pp) + `<div class="scheda scorre"><table class="tab-tabella">
        <tr><th>Persona</th><th>Ore</th><th><abbr title="Straordinari">Str.</abbr></th><th>Ferie</th><th><abbr title="Riposi">Rip.</abbr></th><th><abbr title="Malattia">Mal.</abbr></th></tr>
        ${ff.map((f, i) => `<tr class="tocca" data-az="dettaglio" data-i="${i}" tabindex="0"><td><b>${esc(f.persona.nome)}</b>${f.totale.mancanti ? ' <span class="chip rosso">!</span>' : ''}</td>
          <td>${Conti.hhmm(f.totale.lavoro)}</td><td${soglia && f.totale.straordinario > soglia ? ' style="color:var(--rosso);font-weight:700"' : ''}>${Conti.hhmm(f.totale.straordinario)}</td>
          <td>${f.totale.ferie}</td><td>${f.totale.riposo}</td><td>${f.totale.malattia}</td></tr>`).join('')}</table></div>
        ${ff.some(f => f.totale.mancanti) ? '<p class="sotto"><span class="chip rosso">!</span> manca qualche uscita: tocca la persona per vedere i giorni.</p>' : ''}
        ${ff.filter(f => soglia && f.totale.straordinario > soglia).map(f => `<div class="avviso">${esc(f.persona.nome)} ha ${Conti.hhmm(f.totale.straordinario)} di straordinari, oltre la soglia di ${soglia} ore.</div>`).join('')}
        <div class="riga-bottoni"><button class="btn" data-az="excel">Excel per il consulente</button><button class="btn sec" data-az="stampa">Stampa o PDF</button></div>
        <p class="sotto">Ferie, riposi e malattia sono in giorni; ore e straordinari in ore e minuti. Le pause: ${A.azienda.pausa_minuti
          ? `${A.azienda.pausa_minuti} minuti tolti oltre le ${A.azienda.pausa_dopo_ore} ore nel giorno` : 'nessuna pausa tolta'} (si cambia in Impostazioni).</p>`;
      el._fogli = ff;
    }).catch(e => { const el = document.getElementById('mese-dati'); if (el) el.innerHTML = `<p class="errore">${esc(motivo(e))}</p>`; }), 0);
    const [a, m] = mese.split('-').map(Number);
    const chieste = A.assenze.filter(x => x.stato === 'chiesta');
    return `<div class="navsett"><button data-az="mese" data-n="-1" aria-label="Mese prima">‹</button>
        <b>${MESI[m - 1]} ${a}</b><button data-az="mese" data-n="1" aria-label="Mese dopo"${mese >= Conti.oggi().slice(0, 7) ? ' disabled style="opacity:.4"' : ''}>›</button></div>
      ${chieste.length ? `<div class="scheda">${chieste.map(x => rigaAssenza(x, true)).join('')}</div>` : ''}
      <div id="mese-dati"><p class="lista-vuota">Conto le ore…</p></div>`;
  }
  function dettaglio(f) {
    const righe = f.giorni.filter(g => g.coppie.length || g.causale);
    foglio(`${nome(f.persona)} · ${MESI[Number(mese.slice(5)) - 1]}`, `
      <div class="scorre"><table class="tab-tabella"><tr><th>Giorno</th><th>Orari</th><th>Ore</th><th>Str.</th></tr>
      ${righe.map(g => `<tr><td>${GIORNI[Conti.giornoSettimana(g.giorno)].slice(0, 3)} ${dataIt(g.giorno)}</td>
        <td>${g.causale && g.causale !== 'ordinario' && !g.coppie.length ? TIPI[g.causale] : g.coppie.map(c => `${c.entrata || '?'}–${c.uscita || '<b style="color:var(--rosso)">?</b>'}`).join(' ')}</td>
        <td>${Conti.hhmm(g.lavoro)}</td><td>${g.straordinario ? Conti.hhmm(g.straordinario) : ''}</td></tr>`).join('')
        || '<tr><td colspan="4" class="lista-vuota">Niente in questo mese.</td></tr>'}</table></div>
      <p class="sotto">Per correggere un orario: Oggi → tocca la timbratura, oppure «Timbra per qualcuno a un'altra ora».</p>`);
  }
  function righeExcel(f) {
    return f.giorni.map(g => ({
      Giorno: g.giorno.split('-').reverse().join('/'), 'Giorno della settimana': GIORNI[Conti.giornoSettimana(g.giorno)],
      'Entrate e uscite': g.coppie.map(c => `${c.entrata || '?'}-${c.uscita || '?'}`).join(' '),
      'Ore lavorate': g.lavoro, 'Pausa tolta': g.pausa, Ordinario: g.ordinario, Straordinario: g.straordinario,
      Causale: g.causale ? TIPI[g.causale] || 'Ordinario' : '', 'Permesso (ore)': g.permesso || '', Note: g.mancante ? 'Uscita mancante' : ''
    }));
  }
  function excel(ff) {
    caricaLib(LIB.xlsx, 'XLSX').then(X => {
      const wb = X.utils.book_new();
      const riep = ff.map(f => ({ Persona: nome(f.persona), 'Orario di contratto (ore/giorno)': f.persona.ore_giorno,
        'Giorni di presenza': f.totale.presenze, 'Ore lavorate': f.totale.lavoro, Ordinario: f.totale.ordinario,
        Straordinario: f.totale.straordinario, 'Ferie (giorni)': f.totale.ferie, 'Riposi (giorni)': f.totale.riposo,
        'Malattia (giorni)': f.totale.malattia, 'Permessi (ore)': f.totale.permesso, 'Giorni con uscita mancante': f.totale.mancanti }));
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(riep), 'Riepilogo');
      ff.forEach(f => X.utils.book_append_sheet(wb, X.utils.json_to_sheet(righeExcel(f)), nome(f.persona).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Persona'));
      X.writeFile(wb, `Presenze ${A.azienda.ragione} ${mese}.xlsx`.replace(/[\\/:*?"<>|]/g, ''));
    }).catch(e => toast(e.message));
  }
  function stampa(ff) {
    const [a, m] = mese.split('-').map(Number);
    const el = document.getElementById('stampa');
    el.innerHTML = `<div style="font-family:Inter,Arial,sans-serif;color:#000;padding:10mm">
      <h1 style="font-size:20pt;margin:0">Presenze di ${MESI[m - 1]} ${a}</h1><p style="margin:4px 0 14px">${esc(A.azienda.ragione)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:10pt" border="1" cellpadding="5"><tr><th align="left">Persona</th><th>Presenze</th><th>Ore</th><th>Ordinario</th><th>Straord.</th><th>Ferie</th><th>Riposi</th><th>Malattia</th><th>Permessi h</th></tr>
      ${ff.map(f => `<tr><td>${esc(nome(f.persona))}</td><td align="right">${f.totale.presenze}</td><td align="right">${Conti.hhmm(f.totale.lavoro)}</td>
        <td align="right">${Conti.hhmm(f.totale.ordinario)}</td><td align="right">${Conti.hhmm(f.totale.straordinario)}</td><td align="right">${f.totale.ferie}</td>
        <td align="right">${f.totale.riposo}</td><td align="right">${f.totale.malattia}</td><td align="right">${f.totale.permesso || ''}</td></tr>`).join('')}</table>
      ${ff.map(f => `<h2 style="font-size:13pt;margin:18px 0 6px;break-before:page">${esc(nome(f.persona))}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:9pt" border="1" cellpadding="3"><tr><th align="left">Giorno</th><th align="left">Entrate e uscite</th><th>Ore</th><th>Straord.</th><th align="left">Causale</th></tr>
        ${righeExcel(f).map(r => `<tr><td>${r.Giorno} ${r['Giorno della settimana'].slice(0, 3)}</td><td>${r['Entrate e uscite']}</td><td align="right">${Conti.hhmm(r['Ore lavorate'])}</td>
          <td align="right">${r.Straordinario ? Conti.hhmm(r.Straordinario) : ''}</td><td>${r.Causale}${r.Note ? ' · ' + r.Note : ''}</td></tr>`).join('')}</table>`).join('')}
      <p style="font-size:8pt;margin-top:14px">Fatto con l'app Pro Farmer · Presenze e turni. Le correzioni del titolare restano nello storico dell'app.</p></div>`;
    setTimeout(() => window.print(), 50);
  }

  /* ---------------------------------------------------- altro (titolare) */
  function vAltro() {
    const persone = A.persone;
    return `<h2 class="sezione">Persone</h2>
      <div class="scheda">${persone.map(p => `<button class="persona" style="width:100%;text-align:left" data-az="persona" data-id="${p.id}">
        <span class="avatar">${iniziale(p)}</span><span class="chi"><b>${esc(nome(p))}${p.attivo === false ? ' · non più attivo' : ''}</b>
        <span>${p.ruolo === 'titolare' ? 'Titolare' : 'Dipendente'} · ${p.ore_giorno} ore al giorno${p.pin ? ' · PIN' : ''}${p.email ? (p.invitato ? ' · accesso mandato' : ' · accesso da mandare') : ' · senza e-mail'}</span></span></button>`).join('')}
        <button class="btn sec pieno" style="margin-top:10px" data-az="persona">+ Aggiungi una persona</button></div>
      <h2 class="sezione">I QR in stalla</h2>
      <div class="scheda">${A.punti.map(q => `<div class="riga"><span><b>${esc(q.nome)}</b>${q.attivo ? '' : ' · spento'}${q.lat ? '<br><span class="sotto">con l’area intorno</span>' : ''}</span>
        <span class="dx"><button class="btn piccolo" data-az="stampa-qr" data-id="${q.id}">Stampa</button>
        <button class="btn piccolo sec" data-az="punto" data-id="${q.id}">Cambia</button></span></div>`).join('') || '<p class="lista-vuota">Nessun QR: aggiungine uno, per esempio «Sala mungitura».</p>'}
        <button class="btn sec pieno" style="margin-top:10px" data-az="punto">+ Aggiungi un QR</button></div>
      <h2 class="sezione">Tablet di stalla</h2>
      <div class="scheda"><p class="sotto">Un tablet o un vecchio telefono fisso in sala mungitura: ognuno tocca il suo nome e scrive il suo PIN di 4 cifre.
        Serve a chi non ha il telefono, e nessuno può timbrare per un collega.</p>
        ${A.dispositivi.filter(d => d.attivo).map(d => `<div class="riga"><span>${esc(d.nome)}${d.ultimo_uso ? `<br><span class="sotto">usato ${dataIt(Conti.roma(d.ultimo_uso).giorno)}</span>` : ''}</span>
          <span class="dx"><button class="btn piccolo sec" data-az="togli-tablet" data-id="${d.id}">Scollega</button></span></div>`).join('')}
        <button class="btn sec pieno" style="margin-top:10px" data-az="collega-tablet">Usa questo dispositivo come tablet di stalla</button></div>
      <h2 class="sezione">Mansionario</h2>
      <div class="scheda">${A.mansioni.map(m => `<button class="riga" style="width:100%;text-align:left" data-az="mansione" data-id="${m.id}">
        <span><b>${esc(m.titolo)}</b><br><span class="sotto">${m.persone.length ? m.persone.map(id => esc((persona(id) || {}).nome || '')).join(', ') : 'Tutti'}</span></span><span class="dx">›</span></button>`).join('')
        || '<p class="lista-vuota">Nessun compito scritto.</p>'}
        <button class="btn sec pieno" style="margin-top:10px" data-az="mansione">+ Scrivi un compito</button></div>
      <h2 class="sezione">Regole del foglio ore</h2>
      <div class="scheda"><div class="riga"><span>Pausa</span><span class="dx">${A.azienda.pausa_minuti ? `${A.azienda.pausa_minuti} min oltre ${A.azienda.pausa_dopo_ore} ore` : 'nessuna'}</span></div>
        <div class="riga"><span>Promemoria a chi non timbra</span><span class="dx">${A.azienda.ritardo_minuti} min dopo l’inizio del turno</span></div>
        <div class="riga"><span>Avviso straordinari</span><span class="dx">oltre ${A.azienda.soglia_straordinari_mese} ore al mese</span></div>
        <div class="riga"><span>Controllo quando si timbra dal telefono</span><span class="dx">${{ posizione: 'posizione al momento', qr: 'QR in azienda', nessuna: 'nessuno' }[A.azienda.verifica] || 'posizione al momento'}${A.azienda.verifica === 'posizione' ? (A.azienda.area ? `, ${A.azienda.raggio_m} m` : ' · <b style="color:var(--rosso)">area da segnare</b>') : ''}</span></div>
        <button class="btn sec pieno" style="margin-top:10px" data-az="regole">Cambia le regole</button></div>
      <h2 class="sezione">Documenti</h2>
      <div class="scheda">
        <div class="riga"><span>Nomina di Pro Farmer a responsabile del trattamento</span><span class="dx">${A.azienda.nomina
          ? `accettata il ${dataIt(Conti.roma(A.azienda.nomina.il).giorno)}` : ''}</span></div>
        <div class="riga-bottoni" style="margin:8px 0 12px"><button class="btn sec piccolo" data-az="doc-nomina">Leggi o stampa</button></div>
        <div class="riga"><span>Informativa per i dipendenti, già compilata con i dati dell'azienda</span><span class="dx"></span></div>
        <p class="sotto" style="margin:6px 0 8px">Stampala, aggiungi il contatto di riferimento e falla firmare per presa visione. Va data prima di cominciare a timbrare.</p>
        <div class="riga-bottoni"><button class="btn sec piccolo" data-az="doc-informativa">Leggi o stampa</button></div>
      </div>
      ${vProfilo()}`;
  }
  function foglioPersona(p) {
    const tit = p && p.ruolo === 'titolare';
    foglio(p ? nome(p) : 'Nuova persona', `
      <div class="due"><div class="campo"><label for="p-nome">Nome</label><input id="p-nome" value="${esc(p ? p.nome : '')}" autocomplete="off"></div>
        <div class="campo"><label for="p-cognome">Cognome</label><input id="p-cognome" value="${esc(p ? p.cognome : '')}" autocomplete="off"></div></div>
      <div class="campo"><label for="p-email">E-mail (per timbrare dal suo telefono; senza, timbra dal tablet con il PIN)</label>
        <input id="p-email" type="email" inputmode="email" autocapitalize="off" value="${esc(p ? p.email || '' : '')}"></div>
      <div class="campo"><label for="p-ore">Orario di contratto, ore al giorno</label><input id="p-ore" type="number" inputmode="decimal" min="0" max="16" step="0.5" value="${p ? p.ore_giorno : 9}"></div>
      ${p ? `<div class="campo"><label for="p-paga">Paga oraria netta, € all’ora (la vedi solo tu, nel cruscotto)</label>
        <input id="p-paga" type="text" inputmode="decimal" autocomplete="off" value="${paghe && paghe[p.id] != null ? String(paghe[p.id]).replace('.', ',') : ''}" placeholder="8,00"></div>` : ''}
      ${p && !tit && p.id !== A.io.id ? `<label class="spunta"><input type="checkbox" id="p-attivo"${p.attivo !== false ? ' checked' : ''}> <span>Lavora ancora qui (togli la spunta quando smette: le sue ore restano)</span></label>` : ''}
      <p class="errore" id="p-err"></p>
      <button class="btn pieno" id="p-salva">Salva</button>
      ${p ? `<div class="riga-bottoni"><button class="btn sec" id="p-pin">${p.pin ? 'Cambia il PIN' : 'Dai un PIN'}</button>
        ${p.email && p.id !== A.io.id ? `<button class="btn sec" id="p-invita">${p.invitato ? 'Rimanda l’accesso' : 'Manda l’accesso'}</button>` : ''}</div>
        ${p.email && p.id !== A.io.id ? `<p class="sotto">${p.invitato ? 'Accesso mandato: entra con la sua e-mail e sceglie la sua password, poi timbra dal suo telefono.'
          : 'Manda l’accesso: gli arriva un’e-mail, entra con la sua e-mail, sceglie la password e timbra dal suo telefono.'}</p>` : ''}` : ''}`, f => {
      const campoPaga = f.querySelector('#p-paga');
      if (campoPaga && !paghe) caricaPaghe().then(pp => { if (pp[p.id] != null && !campoPaga.value) campoPaga.value = String(pp[p.id]).replace('.', ','); });
      f.querySelector('#p-salva').addEventListener('click', async () => {
        const att = f.querySelector('#p-attivo');
        if (campoPaga && campoPaga.value.trim().replace(',', '.') !== String(paghe && paghe[p.id] != null ? paghe[p.id] : '')) {
          try { await salvaPaga(p.id, campoPaga.value); } catch (e) { f.querySelector('#p-err').textContent = motivo(e); return; }
        }
        salvaE('pf_salva_persona', { p: { id: p ? p.id : '', nome: f.querySelector('#p-nome').value, cognome: f.querySelector('#p-cognome').value,
          email: f.querySelector('#p-email').value, ore_giorno: f.querySelector('#p-ore').value, attivo: att ? att.checked : undefined } },
          p ? 'Salvato.' : 'Aggiunto. Ora dagli il PIN o mandagli l’accesso.', f);
      });
      const pin = f.querySelector('#p-pin'); if (pin) pin.addEventListener('click', () => foglioPin(p));
      const inv = f.querySelector('#p-invita'); if (inv) inv.addEventListener('click', () => invita(p, inv));
    });
  }
  function foglioPin(p) {
    foglio(`Il PIN di ${p.nome}`, `<p class="sotto">4 cifre, da tenere per sé. Serve sul tablet di stalla.</p>
      <div class="campo"><label for="pin">PIN</label><input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></div>
      <p class="errore" id="pin-err"></p><button class="btn pieno" id="pin-salva">Salva il PIN</button>`, f => {
      f.querySelector('#pin').focus();
      f.querySelector('#pin-salva').addEventListener('click', () =>
        salvaE('pf_imposta_pin', { p_persona: p.id, p_pin: f.querySelector('#pin').value.replace(/\D/g, '') }, 'PIN salvato.', f));
    });
  }
  function invita(p, b) {
    if (DEMO) return toast('Nella demo l’e-mail non parte.');
    b.disabled = true; b.textContent = 'Mando…';
    collegamento().functions.invoke('pf-invita', { body: { id: p.id } }).then(({ data, error }) => {
      if (error || !data || !data.ok) { b.disabled = false; b.textContent = 'Riprova'; return toast((data && data.motivo) || 'E-mail non partita: riprova.'); }
      chiudiFoglio(); aggiorna(`Accesso mandato a ${p.email}.`);
    });
  }
  function foglioPunto(q) {
    foglio(q ? q.nome : 'Nuovo QR', `
      <div class="campo"><label for="q-nome">Dove sta</label><input id="q-nome" value="${esc(q ? q.nome : 'Sala mungitura')}"></div>

      <p class="errore" id="q-err"></p>
      <button class="btn pieno" id="q-salva">Salva</button>
      ${q ? `<button class="btn chiaro" id="q-nuovo">Nuovo QR (il foglio vecchio non vale più)</button>
        <button class="btn chiaro" id="q-spegni">${q.attivo ? 'Spegni questo QR' : 'Riaccendi questo QR'}</button>` : ''}`, f => {
      let lat = q ? q.lat : null, lon = q ? q.lon : null;
      const qui = f.querySelector('#q-qui');
      if (qui) qui.addEventListener('click', () => {
        qui.textContent = 'Cerco la posizione…';
        navigator.geolocation.getCurrentPosition(p => { lat = p.coords.latitude; lon = p.coords.longitude; qui.textContent = 'Posizione segnata ✓'; },
          () => { qui.textContent = 'Posizione non trovata: riprova all’aperto'; }, { enableHighAccuracy: true, timeout: 15000 });
      });
      const dati = extra => ({ p: { id: q ? q.id : '', nome: f.querySelector('#q-nome').value, lat: lat ?? '', lon: lon ?? '',
        raggio_m: f.querySelector('#q-raggio') ? f.querySelector('#q-raggio').value : '', ...extra } });
      f.querySelector('#q-salva').addEventListener('click', () => salvaE('pf_salva_punto', dati(), 'Salvato. Ora stampalo e appendilo.', f));
      const nuovo = f.querySelector('#q-nuovo'); if (nuovo) nuovo.addEventListener('click', () => salvaE('pf_salva_punto', dati({ nuovo_codice: true }), 'QR nuovo: ristampalo.', f));
      const sp = f.querySelector('#q-spegni'); if (sp) sp.addEventListener('click', () => salvaE('pf_salva_punto', dati({ attivo: !q.attivo }), 'Fatto.', f));
    });
  }
  function stampaQR(q) {
    caricaLib(LIB.qr, 'qrcode').then(qrcode => {
      const c = qrcode(0, 'M'); c.addData(`${INDIRIZZO}#t=${q.codice}`); c.make();
      document.getElementById('stampa').innerHTML = `<div style="font-family:Inter,Arial,sans-serif;color:#000;text-align:center;padding:16mm 10mm">
        <p style="font-size:16pt;margin:0">${esc(A.azienda.ragione)}</p>
        <h1 style="font-size:40pt;margin:6mm 0">Timbra qui</h1>
        <p style="font-size:20pt;margin:0 0 8mm">${esc(q.nome)}</p>
        <div style="display:inline-block;width:120mm">${c.createSvgTag({ cellSize: 8, margin: 2, scalable: true })}</div>
        <p style="font-size:15pt;margin:8mm 0 0">Apri l'app Pro Farmer → «Inquadra il QR».<br>Oppure inquadralo con la fotocamera del telefono.</p>
        <p style="font-size:10pt;margin:10mm 0 0;color:#555">Il QR segna solo l'ora di entrata e di uscita. Nessuna posizione in continuo, nessun dato biometrico.</p></div>`;
      setTimeout(() => window.print(), 80);
    }).catch(e => toast(e.message));
  }
  function foglioRegole() {
    const z = A.azienda;
    foglio('Regole del foglio ore', `
      <div class="due"><div class="campo"><label for="r-pmin">Pausa da togliere (minuti)</label><input id="r-pmin" type="number" inputmode="numeric" min="0" max="120" value="${z.pausa_minuti}"></div>
        <div class="campo"><label for="r-pdopo">…oltre queste ore nel giorno</label><input id="r-pdopo" type="number" inputmode="decimal" min="0" max="16" step="0.5" value="${z.pausa_dopo_ore}"></div></div>
      <div class="campo"><label for="r-rit">Promemoria a chi non ha timbrato, minuti dopo l’inizio del turno</label><input id="r-rit" type="number" inputmode="numeric" min="5" max="240" value="${z.ritardo_minuti}"></div>
      <div class="campo"><label for="r-soglia">Avviso se gli straordinari del mese superano (ore)</label><input id="r-soglia" type="number" inputmode="numeric" min="0" max="200" value="${z.soglia_straordinari_mese}"></div>
      <div class="campo"><label for="r-ver">Quando si timbra dal telefono, controlla che sia in azienda con</label><select id="r-ver">
        <option value="posizione"${(z.verifica || 'posizione') === 'posizione' ? ' selected' : ''}>la posizione, solo in quel momento</option>
        <option value="qr"${z.verifica === 'qr' ? ' selected' : ''}>il QR appeso in azienda</option>
        <option value="nessuna"${z.verifica === 'nessuna' ? ' selected' : ''}>nessun controllo</option></select></div>
      <div id="r-area-c" class="campo"${(z.verifica || 'posizione') === 'posizione' ? '' : ' hidden'}>
        <p class="sotto">L’area dell’azienda: ${z.area ? `segnata, raggio ${z.raggio_m} m.` : '<b>non ancora segnata</b>.'} Mettiti in azienda (per esempio in sala mungitura) e premi il pulsante.
          Il telefono di chi timbra dice solo se è dentro o fuori, e solo in quel momento.</p>
        <button class="btn sec" id="r-qui" type="button">Segna qui la posizione dell’azienda</button>
        <label for="r-raggio">Raggio in metri</label><input id="r-raggio" type="number" inputmode="numeric" min="50" max="3000" value="${z.raggio_m || 300}"></div>
      <button class="btn pieno" id="r-salva">Salva</button>`, f => {
      let lat, lon;
      f.querySelector('#r-ver').addEventListener('change', ev => { f.querySelector('#r-area-c').hidden = ev.target.value !== 'posizione'; });
      f.querySelector('#r-qui').addEventListener('click', ev => {
        const b = ev.currentTarget; b.textContent = 'Cerco la posizione…';
        if (DEMO) { lat = 45.2; lon = 10.0; b.textContent = 'Posizione segnata ✓'; return; }
        navigator.geolocation.getCurrentPosition(q => { lat = q.coords.latitude; lon = q.coords.longitude; b.textContent = `Posizione segnata ✓ (precisione ${Math.round(q.coords.accuracy)} m)`; },
          () => { b.textContent = 'Posizione non trovata: dai il permesso e riprova all’aperto'; }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      f.querySelector('#r-salva').addEventListener('click', () => salvaE('pf_salva_regole', { p: {
        pausa_minuti: f.querySelector('#r-pmin').value, pausa_dopo_ore: f.querySelector('#r-pdopo').value,
        ritardo_minuti: f.querySelector('#r-rit').value, soglia_straordinari_mese: f.querySelector('#r-soglia').value,
        verifica: f.querySelector('#r-ver').value, raggio_m: f.querySelector('#r-raggio').value,
        ...(lat != null ? { lat, lon } : {}) } }, 'Regole salvate.', f));
    });
  }
  function foglioMansione(m) {
    foglio(m ? m.titolo : 'Nuovo compito', `
      <div class="campo"><label for="m-titolo">Il compito</label><input id="m-titolo" value="${esc(m ? m.titolo : '')}" placeholder="Pulizia cuccette"></div>
      <div class="campo"><label for="m-istr">Come si fa</label><textarea id="m-istr" placeholder="Per esempio: piùLact 0,5 kg a cuccetta, un giorno sì e uno no.">${esc(m ? m.istruzioni : '')}</textarea></div>
      <p class="sotto">Chi lo fa (nessuna spunta = tutti)</p>
      ${A.persone.filter(p => p.attivo !== false && p.ruolo === 'dipendente').map(p => `<label class="spunta"><input type="checkbox" value="${p.id}"
        ${m && m.persone.includes(p.id) ? ' checked' : ''}> <span>${esc(nome(p))}</span></label>`).join('')}
      <button class="btn pieno" id="m-salva">Salva</button>${m ? '<button class="btn chiaro" id="m-togli">Togli il compito</button>' : ''}`, f => {
      f.querySelector('#m-salva').addEventListener('click', () => salvaE('pf_salva_mansione', { p: { id: m ? m.id : '',
        titolo: f.querySelector('#m-titolo').value, istruzioni: f.querySelector('#m-istr').value,
        persone: [...f.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value) } }, 'Salvato.', f));
      const t = f.querySelector('#m-togli'); if (t) t.addEventListener('click', () => salvaE('pf_salva_mansione', { p: { id: m.id, togli: true } }, 'Tolto.', f));
    });
  }

  /* --------------------------- la timbratura dal proprio account (30/10/2026)
     Il dipendente entra con la sua e-mail e la sua password (lo invita il
     titolare) e preme «Entrata» / «Uscita». Il controllo lo sceglie il titolare:
     la posizione solo in quel momento, il QR appeso in azienda o niente. */
  function posizioneOra() {
    if (DEMO) return Promise.resolve({ lat: 45.2, lon: 10.0, precisione: 15 });
    if (!navigator.geolocation) return Promise.resolve(null);
    // solo adesso, una volta: niente posizione in continuo
    return new Promise(ok => navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precisione: p.coords.accuracy }), () => ok(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }));
  }

  function timbraIo(verso, codiceQr) {
    const v = A.azienda.verifica;
    if (v === 'qr' && !codiceQr) {
      if (DEMO) return timbraIo(verso, PFDemo.codicePunto());
      return inquadra(c => timbraIo(verso, c));
    }
    const quando = new Date().toISOString(), chiave = nuovaChiave();
    const b = document.querySelector('[data-az="timbra-io"]'); if (b) { b.disabled = true; b.textContent = v === 'posizione' ? 'Controllo la posizione…' : 'Un attimo…'; }
    (v === 'posizione' ? posizioneOra() : Promise.resolve(null)).then(pos => {
      const args = { p_verso: verso, p_ora_telefono: quando, p_chiave: chiave, p_codice: codiceQr || null,
        p_lat: pos ? pos.lat : null, p_lon: pos ? pos.lon : null, p_precisione: pos ? pos.precisione : null };
      rpc('pf_timbra_io', args).then(r => {
        const nota = r.area === 'fuori' ? ' Risulti fuori dall’area dell’azienda: il titolare lo vede.'
          : r.area === 'nd' ? ' Segnata senza posizione: dai il permesso della posizione all’app.' : '';
        esito(true, r.verso === 'entrata' ? 'Entrata' : 'Uscita', `${r.gia ? 'Era già segnata alle' : 'Alle'} ${ora(r.quando)}.${nota}`);
        aggiorna();
      }).catch(e => {
        if (e.delDatabase) { esito(false, 'Non segnata', e.message); disegna(); return; }
        metti({ tipo: 'io', args });
        A.timbrature.push({ id: chiave, persona: A.io.id, verso, quando, modo: codiceQr ? 'qr' : 'telefono', valida: true });
        esito(true, 'Salvata sul telefono', `Sei senza rete: la timbratura delle ${ora(quando)} parte appena torna il segnale.`);
        disegna();
      });
    });
  }

  /* -------------------------------------- la nomina e i documenti (30/10/2026) */
  function vNomina() {
    app().className = '';
    if (!titolare()) {
      app().innerHTML = barraDemo() + `<div class="accesso"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer">
        <h1>Quasi pronta</h1><p class="sotto">Il titolare di ${esc(A.azienda.ragione)} deve ancora completare l'attivazione di Presenze e turni.
        Appena l'ha fatto, riapri l'app.</p><button class="btn sec" data-az="esci">Esci</button></div>`;
      return;
    }
    app().innerHTML = barraDemo() + `<header class="testa"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer"></header>
      <main class="corpo" style="padding-bottom:32px">
        <p class="saluto">Prima di cominciare</p>
        <p class="sotto">${esc(A.azienda.ragione)} è il titolare dei dati dei suoi dipendenti; Pro Farmer li tratta per suo conto,
          come responsabile del trattamento. Per questo serve la nomina (art. 28 GDPR). In breve:</p>
        <div class="scheda"><ul class="punti">
          <li>Pro Farmer usa i dati <b>solo per far funzionare l'app</b>, mai per altri scopi.</li>
          <li><b>Pro Farmer non guarda le presenze</b> dei tuoi dipendenti, se non quando gli chiedi assistenza.</li>
          <li>Niente dati biometrici, niente posizione in continuo; i dati stanno in Unione europea.</li>
          <li>A te tocca dare l'informativa ai dipendenti: il modello pronto è in Impostazioni → Documenti.</li>
          <li>Puoi esportare tutto quando vuoi; alla fine del servizio hai 30 giorni per scaricare i dati.</li>
        </ul></div>
        <button class="btn chiaro" data-az="doc-nomina">Leggi tutto il testo</button>
        <label class="spunta"><input type="checkbox" id="nomina-ok"> <span>Ho letto la nomina e la accetto per ${esc(A.azienda.ragione)}.</span></label>
        <p class="errore" id="nomina-err"></p>
        <button class="btn pieno" data-az="accetta-nomina">Accetto e comincio</button>
        <button class="btn sec" data-az="esci">Esci</button>
      </main>`;
  }
  function documento(html, titolo) {
    foglio(titolo, `<div class="doc">${html}</div><button class="btn sec pieno" data-az="stampa-doc">Stampa o salva in PDF</button>`);
    documento.ultimo = html;
  }
  function stampaDoc(html) {
    document.getElementById('stampa').innerHTML = `<div class="doc doc-stampa">${html}</div>`;
    setTimeout(() => window.print(), 60);
  }

  /* ------------------------------------------------------ compiti, profilo */
  function vCompiti() {
    return A.mansioni.length ? A.mansioni.map(m => `<div class="scheda"><h2 style="font-size:18px;font-weight:800">${esc(m.titolo)}</h2>
      <p style="white-space:pre-line;margin-top:6px;color:var(--testo-2)">${esc(m.istruzioni)}</p></div>`).join('')
      : '<p class="lista-vuota">Il titolare non ha ancora scritto i compiti.</p>';
  }
  function vProfilo() {
    return `<h2 class="sezione">Il tuo profilo</h2>
      <div class="scheda"><div class="riga"><span>${esc(nome(A.io))}</span><span class="dx">${A.io.ruolo === 'titolare' ? 'Titolare' : 'Dipendente'}</span></div>
        <div class="riga"><span>Azienda</span><span class="dx">${esc(A.azienda.ragione)}</span></div>
        ${A.io.email ? `<div class="riga"><span>E-mail</span><span class="dx">${esc(A.io.email)}</span></div>` : ''}
        <div class="riga-bottoni" style="margin-top:10px"><button class="btn sec" data-az="notifiche" id="b-notifiche">Notifiche</button>
        ${A.io.email ? '<button class="btn sec" data-az="cambia-password">Cambia la password</button>' : ''}</div></div>
      <p class="sotto">I tuoi dati: li tratta la tua azienda, e Pro Farmer per suo conto. Solo presenze, niente posizione in continuo né dati biometrici.
        <a href="https://www.iubenda.com/privacy-policy/12376136" target="_blank" rel="noopener">Informativa privacy</a>.</p>
      <button class="btn chiaro" data-az="esci">Esci</button>`;
  }

  /* ---------------------------------------------------------- notifiche */
  function chiaveVapid() {
    const b = atob((VAPID + '='.repeat((4 - VAPID.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  }
  function attivaNotifiche() {
    if (DEMO) return toast('Nella demo le notifiche non partono.');
    const suIPhone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installata = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (suIPhone && !installata) return toast('Su iPhone: prima Condividi → «Aggiungi alla schermata Home», poi apri l’app da lì.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Questo telefono non riceve notifiche dall’app.');
    Notification.requestPermission().then(perm => {
      if (perm !== 'granted') return toast('Notifiche non permesse: si cambiano nelle impostazioni del telefono.');
      return navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription().then(s => s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapid() })))
        .then(s => rpc('pf_salva_iscrizione', { s: { ...s.toJSON(), dispositivo: navigator.userAgent.slice(0, 200) } }))
        .then(() => toast('Notifiche attive su questo telefono.'));
    }).catch(() => toast('Non riesco ad attivare le notifiche: riprova.'));
  }
  function togliNotifiche() {
    if (DEMO || !('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.getRegistration().then(reg => reg && reg.pushManager.getSubscription())
      .then(s => s && rpc('pf_togli_iscrizione', { endpoint: s.endpoint }).catch(() => {}).then(() => s.unsubscribe()))
      .catch(() => {});
  }

  /* ---------------------------------------------------- fogli (modali) */
  function foglio(titolo, html, dopo) {
    chiudiFoglio();
    const v = document.createElement('div');
    v.className = 'velo';
    v.innerHTML = `<div class="foglio" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <button class="chiudi" aria-label="Chiudi">✕</button><h2>${esc(titolo)}</h2>${html}</div>`;
    document.body.appendChild(v);
    const f = v.querySelector('.foglio');
    v.addEventListener('click', ev => { if (ev.target === v) chiudiFoglio(); });
    f.querySelector('.chiudi').addEventListener('click', chiudiFoglio);
    if (dopo) dopo(f);
    const primo = f.querySelector('input,select,textarea'); if (primo && matchMedia('(pointer:fine)').matches) primo.focus();
    return f;
  }
  function chiudiFoglio() { document.querySelectorAll('.velo').forEach(v => v.remove()); }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') chiudiFoglio(); });
  function salvaE(funz, args, msg, f) {
    const b = f && f.querySelector('.btn:not(.chiaro):not(.sec):not(.rosso)');
    const err = f && f.querySelector('.errore');
    if (b) b.disabled = true;
    return rpc(funz, args).then(r => {
      if (r && r.ok === false) throw Object.assign(new Error(r.motivo || 'Non salvato.'), { delDatabase: true });
      chiudiFoglio(); aggiorna(typeof msg === 'function' ? msg(r) : msg); return r;
    }).catch(e => { if (b) b.disabled = false; if (err) err.textContent = motivo(e); else toast(motivo(e)); });
  }

  /* ----------------------------------------------- timbrare per un altro */
  function timbraPer(pid) {
    const p = persona(pid);
    const verso = Conti.dentro(A.timbrature, pid) ? 'uscita' : 'entrata';
    rpc('pf_timbra_per', { p_persona: pid, p_verso: verso, p_quando: null, p_motivo: null })
      .then(() => aggiorna(`${p.nome}: ${verso} alle ${Conti.roma(new Date().toISOString()).ora}.`))
      .catch(e => toast(motivo(e)));
  }
  function foglioTimbraPerOra(pid) {
    const adesso = Conti.roma(new Date().toISOString());
    foglio('Timbra a un’altra ora', `
      <div class="campo"><label for="x-persona">Chi</label><select id="x-persona">${A.persone.filter(p => p.attivo !== false).map(p =>
        `<option value="${p.id}"${p.id === pid ? ' selected' : ''}>${esc(nome(p))}</option>`).join('')}</select></div>
      <div class="campo"><label for="x-verso">Entrata o uscita</label><select id="x-verso"><option value="entrata">Entrata</option><option value="uscita">Uscita</option></select></div>
      <div class="due"><div class="campo"><label for="x-giorno">Giorno</label><input id="x-giorno" type="date" value="${adesso.giorno}" max="${adesso.giorno}"></div>
        <div class="campo"><label for="x-ora">Ora</label><input id="x-ora" type="time" value="${adesso.ora}"></div></div>
      <div class="campo"><label for="x-motivo">Motivo</label><input id="x-motivo" placeholder="Per esempio: aveva il telefono scarico" maxlength="200"></div>
      <p class="errore" id="x-err"></p><button class="btn pieno" id="x-salva">Salva</button>`, f => {
      f.querySelector('#x-salva').addEventListener('click', () => {
        const quando = istante(f.querySelector('#x-giorno').value, f.querySelector('#x-ora').value);
        if (!quando) return (f.querySelector('#x-err').textContent = 'Giorno e ora, per favore.');
        salvaE('pf_timbra_per', { p_persona: f.querySelector('#x-persona').value, p_verso: f.querySelector('#x-verso').value,
          p_quando: quando, p_motivo: f.querySelector('#x-motivo').value }, 'Salvata.', f);
      });
    });
  }
  // giorno e ora italiani → istante ISO
  function istante(g, hm) {
    if (!g || !hm) return null;
    const prova = new Date(`${g}T${hm}:00Z`);
    const r = Conti.roma(prova.toISOString());
    const diff = (Number(r.ora.slice(0, 2)) - Number(hm.slice(0, 2))) * 60 + (Number(r.ora.slice(3)) - Number(hm.slice(3)))
      + (r.giorno > g ? 1440 : r.giorno < g ? -1440 : 0);
    return new Date(prova.getTime() - diff * 60e3).toISOString();
  }
  function foglioCorreggi(t) {
    const p = persona(t.persona); const r = Conti.roma(t.quando);
    foglio(`Correggi · ${p ? p.nome : ''}`, `<p class="sotto">${t.verso === 'entrata' ? 'Entrata' : 'Uscita'} del ${dataIt(r.giorno)} alle ${r.ora}
      (${MODI[t.modo] || ''}). La riga di adesso resta nello storico.</p>
      <div class="campo"><label for="c-verso">Entrata o uscita</label><select id="c-verso"><option value="entrata"${t.verso === 'entrata' ? ' selected' : ''}>Entrata</option>
        <option value="uscita"${t.verso === 'uscita' ? ' selected' : ''}>Uscita</option></select></div>
      <div class="due"><div class="campo"><label for="c-giorno">Giorno</label><input id="c-giorno" type="date" value="${r.giorno}"></div>
        <div class="campo"><label for="c-ora">Ora giusta</label><input id="c-ora" type="time" value="${r.ora}"></div></div>
      <div class="campo"><label for="c-motivo">Motivo (obbligatorio)</label><input id="c-motivo" maxlength="200"></div>
      <p class="errore" id="c-err"></p>
      <button class="btn pieno" id="c-salva">Correggi</button><button class="btn chiaro" id="c-annulla">Era sbagliata: annullala</button>
      ${t.verso === 'entrata' ? '<button class="btn sec" id="c-uscita">Aggiungi l’uscita mancante</button>' : ''}`, f => {
      const m = () => f.querySelector('#c-motivo').value;
      f.querySelector('#c-salva').addEventListener('click', () => salvaE('pf_correggi', { p_id: t.id,
        p_quando: istante(f.querySelector('#c-giorno').value, f.querySelector('#c-ora').value), p_verso: f.querySelector('#c-verso').value,
        p_annulla: false, p_motivo: m() }, 'Corretta.', f));
      f.querySelector('#c-annulla').addEventListener('click', () => salvaE('pf_correggi', { p_id: t.id, p_quando: null, p_verso: null, p_annulla: true, p_motivo: m() }, 'Annullata.', f));
      const u = f.querySelector('#c-uscita');
      if (u) u.addEventListener('click', () => { chiudiFoglio(); foglioTimbraPerOra(t.persona); const s = document.getElementById('x-verso'); if (s) s.value = 'uscita'; });
    });
  }

  /* --------------------------------------------------- il tablet di stalla */
  let chiosco = { persone: [], azienda: '', timer: null };
  function chiaveChiosco() { return DEMO ? 'demo.tablet' : leggi(K_CHIOSCO, null); }
  function mostraChiosco(msg) {
    fermaOrologio();
    const k = chiaveChiosco();
    if (!k) {
      app().innerHTML = `<div class="accesso"><img class="logo" src="assets/logo-bianco.png" alt="Pro Farmer"><h1>Tablet di stalla</h1>
        <p class="sotto">Questo dispositivo non è ancora collegato. Il titolare entra con la sua e-mail e, in Altro → Tablet di stalla,
        preme «Usa questo dispositivo come tablet di stalla».</p><a class="btn pieno" href="#">Entra come titolare</a></div>`;
      return;
    }
    rpc('pf_chiosco_persone', { p_chiave: k }).then(r => {
      chiosco.persone = r.persone; chiosco.azienda = r.azienda;
      disegnaChiosco(msg);
    }).catch(e => {
      if (e.delDatabase) { if (!DEMO) scrivi(K_CHIOSCO, null); return mostraChiosco(); }
      disegnaChiosco('Senza rete: le timbrature restano qui e partono quando torna il segnale.');
    });
  }
  function disegnaChiosco(msg) {
    const coda = leggi(K_CODA, []).filter(c => c.tipo === 'chiosco').length;
    app().className = 'largo';
    app().innerHTML = barraDemo() + `<div class="chiosco">
      <div class="alto"><div><p class="sotto">${esc(chiosco.azienda)} · ${dataLunga(Conti.oggi())}</p>
        <p class="orologio" id="orologio">${Conti.roma(new Date().toISOString()).ora}</p></div>
        <img src="assets/logo-bianco.png" alt="Pro Farmer" style="height:34px"></div>
      <p class="saluto" style="font-size:22px">Tocca il tuo nome</p>
      ${msg ? `<div class="avviso">${esc(msg)}</div>` : ''}${coda ? `<div class="avviso">${coda} timbrature aspettano la rete.</div>` : ''}
      <div class="griglia-persone">${chiosco.persone.map(p => `<button data-az="chiosco-persona" data-id="${p.id}">
        <span class="avatar${p.dentro ? ' dentro' : ''}">${esc(p.nome[0] || '?')}</span>${esc(p.nome)} ${esc(p.cognome || '')}.
        <small>${p.dentro ? 'dentro · tocca per l’uscita' : 'fuori · tocca per l’entrata'}</small></button>`).join('')}</div>
      <p class="sotto" style="margin-top:auto">Solo l’ora di entrata e di uscita. <button class="link" data-az="chiosco-esci">Scollega questo tablet</button></p></div>`;
    avviaOrologio();
  }
  function pinChiosco(pid) {
    const p = chiosco.persone.find(x => x.id === pid);
    if (!p.pin) return esito(false, 'Manca il PIN', `${p.nome}, chiedi al titolare di darti il PIN di 4 cifre.`);
    let pin = '';
    const f = foglio(`${p.nome}: ${p.dentro ? 'uscita' : 'entrata'}`, `<p class="sotto" style="text-align:center">Scrivi il tuo PIN</p>
      <div class="puntini" aria-live="polite">${'<i></i>'.repeat(4)}</div>
      <div class="tastierino">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${n}</button>`).join('')}
        <button data-n="c" aria-label="Cancella">⌫</button><button data-n="0">0</button><button data-n="x" aria-label="Annulla">✕</button></div>
      <p class="errore" id="pin-err" style="text-align:center"></p>`);
    const punti = () => f.querySelectorAll('.puntini i').forEach((x, i) => x.classList.toggle('pieno', i < pin.length));
    f.querySelector('.tastierino').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const n = b.dataset.n;
      if (n === 'x') return chiudiFoglio();
      if (n === 'c') { pin = pin.slice(0, -1); return punti(); }
      if (pin.length >= 4) return;
      pin += n; punti();
      if (pin.length === 4) {
        const args = { p_chiave: chiaveChiosco(), p_persona: pid, p_pin: pin, p_verso: p.dentro ? 'uscita' : 'entrata',
          p_ora_telefono: new Date().toISOString(), p_chiave_invio: nuovaChiave() };
        rpc('pf_chiosco_timbra', args).then(r => {
          if (!r.ok) { pin = ''; punti(); f.querySelector('#pin-err').textContent = r.motivo; return; }
          chiudiFoglio();
          esito(true, `${p.nome}: ${r.verso}`, `${r.gia ? 'Era già segnata alle' : 'Alle'} ${ora(r.quando)}.`, () => mostraChiosco());
        }).catch(e => {
          chiudiFoglio();
          if (e.delDatabase) return esito(false, 'Non timbrata', e.message, () => mostraChiosco());
          metti({ tipo: 'chiosco', args });
          p.dentro = !p.dentro;
          esito(true, `${p.nome}: ${args.p_verso}`, `Senza rete: salvata alle ${ora(args.p_ora_telefono)}, parte appena torna il segnale.`, () => disegnaChiosco());
        });
      }
    });
  }

  /* --------------------------------------------------------- i tocchi */
  const AZ = {
    esci, notifiche: attivaNotifiche, inquadra,
    'cambia-password': () => {
      if (DEMO) return toast('Nella app vera scegli qui una password nuova.');
      emailAccesso = A.io.email || emailAccesso;
      mostraPassword(() => disegna(), true);
    },
    'doc-nomina': () => documento(Documenti.nomina(A.azienda), 'La nomina'),
    'doc-informativa': () => documento(Documenti.informativa(A.azienda), 'Informativa per i dipendenti'),
    'doc-condizioni': ev => { if (ev && ev.preventDefault) ev.preventDefault(); documento(Documenti.condizioni(), 'Condizioni d’uso di Easy'); },
    ricarica: () => carica(),
    'stampa-doc': () => stampaDoc(documento.ultimo || ''),
    'accetta-nomina': b => {
      const ok = document.getElementById('nomina-ok');
      if (!ok || !ok.checked) { document.getElementById('nomina-err').textContent = 'Spunta la casella per accettare.'; return; }
      b.disabled = true; b.textContent = 'Un attimo…';
      rpc('pf_accetta_nomina', { p_versione: Documenti.VERSIONE })
        .then(() => aggiorna('Fatto. Adesso aggiungi le persone e stampa il QR.'))
        .catch(e => { b.disabled = false; b.textContent = 'Accetto e comincio'; document.getElementById('nomina-err').textContent = motivo(e); });
    },
    'qr-demo': () => timbraQR(PFDemo.codicePunto()),
    'timbra-per': b => timbraPer(b.dataset.id),
    'timbra-per-ora': () => foglioTimbraPerOra(),
    correggi: b => foglioCorreggi(A.timbrature.find(t => t.id === b.dataset.id)),
    sett: b => { settimana = Conti.piuGiorni(settimana, Number(b.dataset.n)); disegna(); },
    importa: () => apriImporta(),
    tipi: () => foglioTipi(),
    cella: b => foglioCella(b.dataset.tipo, b.dataset.giorno),
    lavori: b => foglioLavori(b.dataset.giorno),
    'copia-sett': () => { if (confirm('Copio turni, feste e lavori della settimana prima in questa?')) rpc('pf_copia_settimana', { p_lunedi: settimana }).then(() => aggiorna('Copiata: cambia quello che serve e pubblica.')).catch(e => toast(motivo(e))); },
    paga: b => foglioPaga(b.dataset.id),
    mese: b => {
      const [a, m] = mese.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + Number(b.dataset.n), 1));
      const nuovo = d.toISOString().slice(0, 7); if (nuovo > Conti.oggi().slice(0, 7)) return;
      mese = nuovo; disegna();
    },
    'turno-nuovo': b => foglioTurno(null, b.dataset.giorno),
    turno: b => foglioTurno(A.turni.find(u => u.id === b.dataset.id), b.dataset.giorno),
    compito: b => { const m = A.mansioni.find(x => x.id === b.dataset.id); if (m) foglio(m.titolo, `<p style="white-space:pre-line">${esc(m.istruzioni)}</p>`); },
    pubblica: () => rpc('pf_pubblica_settimana', { p_lunedi: settimana })
      .then(r => aggiorna(r.avvisati ? `Turni pubblicati: avvisate ${r.avvisati} persone.` : 'Turni pubblicati. Chi ha le notifiche attive riceve l’avviso.'))
      .catch(e => toast(motivo(e))),
    'assenza-nuova': () => foglioAssenza(),
    decidi: b => rpc('pf_decidi_assenza', { p_id: b.dataset.id, p_esito: b.dataset.esito })
      .then(() => aggiorna({ approvata: 'Approvata: gli arriva la notifica.', rifiutata: 'Non approvata: gli arriva la notifica.', annullata: 'Tolta.' }[b.dataset.esito]))
      .catch(e => toast(motivo(e))),
    ritira: b => rpc('pf_ritira_assenza', { p_id: b.dataset.id }).then(() => aggiorna('Richiesta ritirata.')).catch(e => toast(motivo(e))),
    dettaglio: b => { const el = document.getElementById('mese-dati'); if (el && el._fogli) dettaglio(el._fogli[Number(b.dataset.i)]); },
    excel: () => { const el = document.getElementById('mese-dati'); if (el && el._fogli) excel(el._fogli); },
    stampa: () => { const el = document.getElementById('mese-dati'); if (el && el._fogli) stampa(el._fogli); },
    persona: b => foglioPersona(b.dataset.id ? persona(b.dataset.id) : null),
    punto: b => foglioPunto(b.dataset.id ? A.punti.find(q => q.id === b.dataset.id) : null),
    'stampa-qr': b => stampaQR(A.punti.find(q => q.id === b.dataset.id)),
    regole: () => foglioRegole(),
    mansione: b => foglioMansione(b.dataset.id ? A.mansioni.find(m => m.id === b.dataset.id) : null),
    'collega-tablet': () => {
      if (!confirm('Questo dispositivo diventa il tablet di stalla: si esce dal tuo accesso e resta solo la schermata per timbrare con il PIN. Continuo?')) return;
      rpc('pf_nuovo_dispositivo', { p_nome: 'Tablet di stalla' }).then(r => {
        if (!DEMO) { scrivi(K_CHIOSCO, r.chiave); collegamento().auth.signOut(); }
        location.hash = '#chiosco'; mostraChiosco();
      }).catch(e => toast(motivo(e)));
    },
    'timbra-io': b => timbraIo(b.dataset.verso),
    'togli-tablet': b => rpc('pf_togli_dispositivo', { p_id: b.dataset.id }).then(() => aggiorna('Tablet scollegato.')).catch(e => toast(motivo(e))),
    'chiosco-persona': b => pinChiosco(b.dataset.id),
    'chiosco-esci': () => {
      if (!confirm('Scollego il tablet? Per ricollegarlo serve il titolare.')) return;
      if (!DEMO) scrivi(K_CHIOSCO, null);
      location.hash = ''; DEMO ? (PFDemo.diventa('p-marco'), carica()) : mostraAccesso();
    }
  };
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-az]');
    if (!b || !AZ[b.dataset.az]) return;
    if (b.tagName === 'A') ev.preventDefault();
    AZ[b.dataset.az](b.tagName === 'A' ? ev : b, ev);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.matches('tr[data-az]')) ev.target.click();
  });
  document.addEventListener('change', ev => {
    if (ev.target.id !== 'demo-chi') return;
    const v = ev.target.value;
    if (v === 'tablet') { location.hash = '#chiosco'; return mostraChiosco(); }
    PFDemo.diventa(v); location.hash = ''; carica();
  });
  document.addEventListener('click', ev => {
    if (ev.target.id === 'demo-ricomincia') { PFDemo.ricomincia(); PFDemo.diventa('p-marco'); location.hash = ''; carica(); }
  });

  // i link «#collega=» del telefono senza e-mail non valgono più (30/10/2026)
  function collegamentoVecchio() {
    history.replaceState(null, '', location.pathname + location.search);
    mostraAccesso('', 'Il collegamento del telefono senza e-mail non si usa più: chiedi al titolare di mandarti l’accesso alla tua e-mail, poi entra qui.');
  }

  /* ------------------------------------------------------------ partenza */
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (h === '#chiosco') return mostraChiosco();
    if (/#collega=/.test(h)) return collegamentoVecchio();
    if (h === '#primo-accesso' && !A) return mostraPrimo();
    const c = codiceDa(h);
    if (c && A) { history.replaceState(null, '', location.pathname + location.search + '#timbra'); return timbraQR(c); }
    if (A) disegna();
  });

  function parti() {
    if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (/#collega=/.test(location.hash)) return collegamentoVecchio();
    if (location.hash === '#chiosco' || (!DEMO && leggi(K_CHIOSCO, null) && !location.hash)) { location.hash = '#chiosco'; return mostraChiosco(); }
    const qr = codiceDa(location.hash);
    if (DEMO) return carica(() => { disegna(); if (qr) timbraQR(qr); });
    collegamento().auth.getSession().then(({ data }) => {
      try { localStorage.removeItem('pf-telefono'); } catch (e) {}   // il vecchio collegamento senza e-mail (fino al 30/10/2026)
      if (!data.session) return location.hash === '#primo-accesso' ? mostraPrimo()
        : mostraAccesso(qr ? 'Entra con la tua e-mail, poi inquadra di nuovo il QR.' : '');
      if (location.hash === '#primo-accesso') history.replaceState(null, '', location.pathname + location.search);
      carica(() => {
        if (qr) { history.replaceState(null, '', location.pathname + '#timbra'); disegna(); timbraQR(qr); } else disegna();
      });
    });
  }
  return { parti };
})();

PF.parti();
