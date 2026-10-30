/* ============================================================================
   App Pro Farmer · i documenti di Presenze e turni (dal 30/10/2026)
   ----------------------------------------------------------------------------
   Due testi, scritti qui una volta sola:
     - la nomina di Pro Farmer a responsabile del trattamento (art. 28 GDPR),
       che il titolare accetta nell'app prima di cominciare: il database
       registra versione, data e chi l'ha accettata (37-nomina-responsabile.sql);
     - il modello di informativa ai dipendenti (artt. 13 GDPR, 4 Statuto dei
       lavoratori), che il titolare stampa già compilato con la sua azienda.
   BOZZE DA FAR RILEGGERE A UN LEGALE. Se il testo della nomina cambia, cambia
   anche VERSIONE (qui e in 37-nomina-responsabile.sql): i titolari la
   riaccettano. «App Pro Farmer/strumenti/documenti-per-legale.mjs» ne fa una
   copia da mandare al legale.
   ========================================================================== */

const Documenti = (() => {
  const VERSIONE = 'nomina-2026-11-v2';   // v2 (30/10): il telefono collegato del dipendente
  const PF = 'Pro Farmer S.r.l.s., Via Milazzo 19, 26100 Cremona (CR), P.IVA 01797050190, info@profarmer.it';
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* I fornitori di cui si serve Pro Farmer per l'app (sub-responsabili). */
  const SUB = [
    ['Supabase Inc.', 'database, accesso e funzioni dell’app; i dati stanno nella regione europea (Francoforte, Germania)'],
    ['Resend Inc.', 'invio delle e-mail di accesso e di servizio'],
    ['GitHub Inc. (GitHub Pages)', 'pubblicazione delle pagine dell’app; non riceve i dati delle presenze'],
    ['Servizi di notifica dei telefoni (Apple, Google, Mozilla)', 'consegna delle notifiche a chi le ha attivate; ricevono solo il testo della notifica']
  ];

  function nomina(az) {
    const a = e(az && az.ragione || '[azienda]');
    return `
<h2>Nomina di Pro Farmer a responsabile del trattamento</h2>
<p class="doc-nota">Accordo ai sensi dell’art. 28 del Regolamento (UE) 2016/679 (GDPR) · versione ${VERSIONE}</p>
<p><b>Tra</b> ${a} (il «<b>Titolare</b>»), che usa l’app Pro Farmer per la gestione delle presenze e dei turni dei propri dipendenti,
<b>e</b> ${e(PF)} (il «<b>Responsabile</b>»), che fornisce l’app.</p>

<h3>1. Oggetto e durata</h3>
<p>Il Titolare nomina il Responsabile per i trattamenti necessari a fornire «Presenze e turni» dell’app Pro Farmer (easy.profarmer.it),
per tutta la durata del servizio, in regalo o in abbonamento, e fino alla restituzione o cancellazione dei dati prevista al punto 9.</p>

<h3>2. Natura e finalità</h3>
<p>Registrazione delle entrate e uscite, delle ferie, dei riposi, dei permessi e della malattia; preparazione dei turni e dei compiti;
riepilogo mensile delle ore da consegnare al consulente del lavoro; invio di notifiche e promemoria di servizio.
Il Responsabile tratta i dati <b>solo su istruzione documentata del Titolare</b>, che sono questo accordo e le impostazioni che il Titolare sceglie nell’app,
e non li usa per finalità proprie, commerciali o di profilazione.</p>

<h3>3. Interessati e dati</h3>
<p>Interessati: i dipendenti e i collaboratori che il Titolare inserisce nell’app, e il Titolare stesso.
Dati: nome e cognome, indirizzo e-mail (facoltativo), orario di contratto, PIN personale (conservato solo in forma non leggibile),
orari di entrata e uscita, assenze e relativo tipo, turni, compiti, correzioni con il loro motivo; un identificativo del telefono
collegato dal dipendente; se il Titolare sceglie il controllo della posizione, l’indicazione «dentro», «fuori» o «senza posizione»
rispetto all’area dell’azienda al momento della timbratura (le coordinate non vengono conservate).
<b>Non si trattano dati biometrici</b> e non si traccia la posizione in continuo. La malattia è indicata solo come tipo di assenza, senza diagnosi.</p>

<h3>4. Obblighi del Titolare</h3>
<p>Il Titolare: dà ai dipendenti l’informativa (l’app ne fornisce un modello); verifica, con il proprio consulente, che l’uso dell’app sia conforme
alla disciplina del lavoro, compreso l’art. 4 della legge 300/1970; inserisce solo dati necessari; custodisce il proprio accesso e quello del tablet aziendale.</p>

<h3>5. Riservatezza e sicurezza</h3>
<p>Il Responsabile autorizza al trattamento solo persone vincolate alla riservatezza e adotta misure adeguate ai sensi dell’art. 32 GDPR, fra cui:
accesso con e-mail e codice temporaneo; separazione dei dati per azienda e per ruolo a livello di database; dati in transito cifrati (HTTPS);
storico non modificabile delle timbrature; copie di sicurezza del fornitore del database. <b>Il Responsabile non consulta le presenze dei dipendenti</b>,
salvo richiesta di assistenza del Titolare e limitatamente a essa.</p>

<h3>6. Sub-responsabili</h3>
<p>Il Titolare autorizza in via generale il Responsabile a servirsi dei fornitori seguenti, vincolati a obblighi equivalenti:</p>
<ul>${SUB.map(([n, c]) => `<li><b>${e(n)}</b>: ${e(c)}.</li>`).join('')}</ul>
<p>Il Responsabile informa il Titolare di ogni aggiunta o sostituzione con almeno 30 giorni di anticipo, nell’app o per e-mail; il Titolare può opporsi
e, in tal caso, recedere dal servizio. Eventuali trasferimenti fuori dall’Unione europea avvengono con le garanzie degli artt. 44-49 GDPR
(per esempio le clausole contrattuali tipo della Commissione).</p>

<h3>7. Assistenza al Titolare</h3>
<p>Il Responsabile assiste il Titolare, con misure tecniche adeguate, nel rispondere alle richieste dei dipendenti (accesso, rettifica, cancellazione,
limitazione, portabilità, opposizione) e negli adempimenti degli artt. 32-36 GDPR. L’esportazione dei dati (Excel e PDF) è sempre disponibile nell’app.</p>

<h3>8. Violazioni dei dati</h3>
<p>Il Responsabile comunica al Titolare ogni violazione dei dati personali senza ingiustificato ritardo, e comunque entro 48 ore dalla scoperta,
con le informazioni disponibili per la notifica all’autorità ai sensi dell’art. 33 GDPR.</p>

<h3>9. Fine del servizio</h3>
<p>Alla fine del servizio il Titolare può esportare tutti i dati per 30 giorni; poi il Responsabile li cancella entro i successivi 60 giorni,
salvo che il Titolare chieda di conservarli più a lungo per gli obblighi di legge sulla conservazione dei documenti di lavoro.</p>

<h3>10. Verifiche</h3>
<p>Il Responsabile mette a disposizione del Titolare le informazioni necessarie a dimostrare il rispetto di questo accordo e consente verifiche,
con preavviso ragionevole e senza oneri irragionevoli.</p>

<p class="doc-nota">L’accettazione nell’app vale come firma: il database registra versione, data e ora, e chi ha accettato per il Titolare.</p>`;
  }

  function informativa(az, consulente) {
    const a = e(az && az.ragione || '[ragione sociale dell’azienda]');
    const dove = e([az && az.comune, az && az.provincia].filter(Boolean).join(' ') || '[sede]');
    return `
<h2>Informativa ai dipendenti sul trattamento dei dati di presenza</h2>
<p class="doc-nota">Ai sensi degli artt. 13 del Regolamento (UE) 2016/679 (GDPR) e 4 della legge 300/1970 · modello fornito da Pro Farmer</p>

<h3>Chi tratta i tuoi dati</h3>
<p>Il <b>titolare del trattamento</b> è ${a}, ${dove} (il tuo datore di lavoro). Per la gestione delle presenze usa l’app Pro Farmer:
${e(PF)} tratta i dati <b>per conto dell’azienda</b>, come responsabile del trattamento, e non li usa per altri scopi.</p>

<h3>Perché</h3>
<ul>
<li>Registrare l’orario di entrata e di uscita e calcolare le ore di lavoro, gli straordinari e le assenze.</li>
<li>Gestire ferie, riposi, permessi e malattia, e organizzare i turni e i compiti.</li>
<li>Preparare il riepilogo mensile per il consulente del lavoro e adempiere agli obblighi di legge e di contratto (paghe, libro unico, controlli).</li>
</ul>
<p>Base giuridica: esecuzione del contratto di lavoro e obblighi di legge (art. 6, par. 1, lett. b e c GDPR; art. 88 GDPR).
L’app è uno strumento di registrazione degli accessi e delle presenze ai sensi dell’art. 4, comma 2, della legge 300/1970: <b>non serve a controllare a distanza l’attività lavorativa</b>.</p>

<h3>Quali dati</h3>
<p>Nome e cognome; e-mail, se ti è stato dato l’accesso all’app; orario di contratto; PIN personale per il tablet (conservato in forma non leggibile);
orari di entrata e uscita; assenze e loro tipo (senza diagnosi); turni e compiti; eventuali correzioni del titolare con il motivo.</p>
<ul>
<li><b>Niente dati biometrici</b> (impronte, volto).</li>
<li><b>Niente posizione in continuo.</b> ${az && (az.verifica || 'posizione') === 'posizione'
  ? 'Quando timbri dal telefono, solo in quel momento il telefono indica se sei dentro o fuori dall’area dell’azienda: si conserva solo questo esito, mai le coordinate. Se non dai il permesso della posizione la timbratura vale lo stesso, segnata «senza posizione».'
  : 'La posizione del telefono non viene usata.'}</li>
<li>Timbri dal tuo telefono (collegato una volta dal titolare, senza e-mail)${az && az.verifica === 'qr' ? ' inquadrando il QR appeso in azienda' : ''}, oppure sul tablet aziendale con il tuo PIN.
Il collegamento e il PIN sono personali: non timbrare per i colleghi e non farlo fare a loro per te.</li>
</ul>

<h3>Chi li vede</h3>
<p>Il titolare e chi in azienda gestisce il personale; il consulente del lavoro${consulente ? ` (${e(consulente)})` : ''}, per le paghe;
Pro Farmer e i suoi fornitori tecnici (database in Unione europea, invio e-mail e notifiche), solo per far funzionare l’app.
I colleghi vedono solo se sei presente o assente, non il motivo.</p>

<h3>Per quanto tempo</h3>
<p>Per la durata del rapporto di lavoro e poi per i tempi previsti dalla legge per i documenti di lavoro e di paga.</p>

<h3>I tuoi diritti</h3>
<p>Puoi chiedere all’azienda di vedere i tuoi dati, correggerli, e negli altri casi previsti cancellarli, limitarne l’uso, opporti o averne copia
(artt. 15-22 GDPR). Le tue ore le vedi anche nell’app. Se ritieni che i tuoi dati siano trattati in modo non corretto puoi rivolgerti al
Garante per la protezione dei dati personali (garanteprivacy.it).</p>

<h3>Per informazioni</h3>
<p>${a}: ____________________________ (persona di riferimento e contatto)</p>
<p class="doc-firma">Data ____________ &nbsp;&nbsp; Firma del dipendente per presa visione ________________________________</p>`;
  }

  return { VERSIONE, nomina, informativa };
})();
