# App Pro Farmer

**Easy**, l'app di Pro Farmer per le presenze e i turni dei dipendenti delle
aziende agricole, su **easy.profarmer.it** (dal novembre 2026): timbrature dal
proprio telefono (con la posizione del momento o col QR appeso in azienda) e il
contatore «Al lavoro da», ferie e riposi, la settimana a griglia (turni per
stalla, Festa, lavori del giorno, avvisi su riposi e ore), il cruscotto del mese
per il titolare (ore, netto con la paga oraria, riposi), il riepilogo per il
consulente del lavoro, mansionario. Il tablet di stalla col PIN è stato tolto il
31/10/2026.

Chiunque crea l'account; Pro Farmer abilita le aziende clienti piùLact (gratis,
senza limiti di dipendenti). I dipendenti entrano con l'e-mail e la password, su
invito del titolare. Riposa è un'app a sé (riposa.profarmer.it): `riposa/` qui
rimanda solo lì.

`?demo` apre l'app con un'azienda finta tutta nel browser: niente parte verso il
database.

## Come è fatta

Pagine statiche pubblicate con GitHub Pages dal ramo `main`; il server è
Supabase (lo stesso progetto di Riposa), con le funzioni `pf_*` e le Edge
Function `pf-notifica` e `pf-invita`. Qui c'è solo la chiave pubblica di
Supabase: quello che ognuno vede lo decide il database.

- `index.html`, `assets/pf.js`: l'app (accesso e primo accesso, home, Presenze e turni, cruscotto).
- `assets/conti.js`: ore, pause, straordinari e assenze del mese; durata del turno e «oltre l'orario».
- `assets/settimana.js`: gli avvisi della settimana (riposi, sovrapposizioni, 11 ore, 48 ore).
- `assets/documenti.js`: nomina a responsabile del trattamento (v5), informativa ai dipendenti, condizioni d'uso.
- `assets/demo.js`: il finto database della demo.
- `sw.js`: l'app installabile e la copia per quando manca la rete.

Dopo ogni modifica a un file in `assets/` va alzato il `?v=` in `index.html`.

## Da non fare mai

Mettere chiavi, token o dati di persone in questi file: il repository è pubblico.
