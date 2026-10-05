# Reporty

Monorepo npm workspaces per segnalare fix su siti e app web.

- `apps/web`: dashboard e API Next.js, da distribuire su Vercel.
- `apps/extension`: estensione WXT + React per Chrome ed Edge.
- `packages/shared`: tipi e identificazione delle pagine condivisi.
- `supabase`: destinazione delle migrazioni database.

## Sviluppo

Usare Node.js 22.12 o successivo. Dalla root:

```sh
npm install
npm run dev:web
```

In un secondo terminale:

```sh
npm run dev:extension
```

Verifiche: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
Il monorepo usa un solo `package-lock.json` nella root.

## Specifiche concordate

- Account con Google o link via email tramite Supabase Auth.
- Chi crea un progetto ne diventa amministratore e invita membri via email.
- Un amministratore generale può vedere tutti i progetti e siti.
- Ogni progetto comprende più ambienti con origini esplicite (produzione, staging, localhost). Le segnalazioni sono separate per ambiente.
- I membri assegnati possono vedere, commentare e cambiare stato delle segnalazioni. Autore e amministratore possono modificarle o eliminarle.
- Stati: aperta, in lavorazione, risolta.
- Gli ospiti Designer accedono tramite link riutilizzabili fino a revoca, inseriscono solo il nome e non devono registrarsi. Vedono tutte le segnalazioni del progetto e rispondono dall'estensione, senza dashboard o cambio di stato.
- Abilitazione esplicita dell'estensione per sito; pulsante flottante con posizione personalizzabile.
- Creazione tramite selezione elemento o pin libero; screenshot automatico dell'area visibile con anteprima e rimozione prima dell'invio.
- Identità pagina: ambiente e percorso; query e URL completo rimangono contesto. I percorsi dei router hash sono distinti.
- Nessun SDK nel sito e nessun ripristino dello stato React nell'MVP. Screenshot e contesto documentano lo stato originale; elementi non più trovati devono essere segnalati come tali.
- La dashboard elenca i siti e consente di aprirli per consultare le segnalazioni nell'estensione.

## Configurazione prevista

Gli esempi `.env.example` elencano le variabili previste: la connessione Supabase non è ancora implementata. Copiare quello web in `.env.local` e quello dell'estensione in `.env` quando si collega il servizio. Le chiavi privilegiate Supabase devono restare esclusivamente sul server.

Per Vercel impostare la Root Directory su `apps/web`, mantenendo accessibili i file del monorepo esterni alla root dell'app.

## Stato

Sono presenti gli starter e le basi del monorepo. Autenticazione, database, API, dashboard applicativa e flusso di segnalazione sono ancora da implementare.
