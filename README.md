# App Pro Farmer

L'app di Pro Farmer per l'allevatore, su **app.profarmer.it** (dal novembre 2026).
Si installa sul telefono come un'app e dentro ci sono:

- **Riposa**: il calcolo di piùLact per la stalla, la scorta e il promemoria del
  riordino. È una copia di riposa.profarmer.it fatta da
  `strumenti/genera-riposa.mjs` (fuori da questo repository): **`riposa/` non si
  modifica a mano**.
- **Presenze e turni**: timbrature col QR appeso in stalla o col tablet di
  stalla e il PIN, ferie e riposi, turni della settimana, riepilogo del mese per
  il consulente del lavoro, mansionario. In regalo ai clienti piùLact.

`?demo` apre l'app con un'azienda finta tutta nel browser: niente parte verso il
database.

## Come è fatta

Pagine statiche pubblicate con GitHub Pages dal ramo `main`; il server è
Supabase (lo stesso progetto di Riposa), con le funzioni `pf_*` e le Edge
Function `pf-notifica` e `pf-invita`. Qui c'è solo la chiave pubblica di
Supabase: quello che ognuno vede lo decide il database.

- `index.html`, `assets/pf.js`: l'app (accesso, home, Presenze e turni, tablet di stalla).
- `assets/conti.js`: ore, pause, straordinari e assenze del mese.
- `assets/demo.js`: il finto database della demo.
- `sw.js`: l'app installabile e la copia per quando manca la rete.

Dopo ogni modifica a un file in `assets/` va alzato il `?v=` in `index.html`.

## Da non fare mai

Mettere chiavi, token o dati di persone in questi file: il repository è pubblico.
