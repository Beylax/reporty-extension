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
- Il team usa sia dashboard sia estensione. I revisori ospiti (Designer e clienti) installano l'estensione e accedono tramite link riutilizzabili fino a revoca, inserendo solo il nome, senza registrazione. Vedono tutte le segnalazioni del progetto e rispondono dall'estensione, senza dashboard o cambio di stato.
- Abilitazione esplicita dell'estensione per sito; pulsante flottante con posizione personalizzabile.
- Creazione tramite selezione elemento o pin libero; screenshot automatico dell'area visibile con anteprima e rimozione prima dell'invio.
- Identità pagina: ambiente e percorso; query e URL completo rimangono contesto. I percorsi dei router hash sono distinti.
- Nessun SDK nel sito e nessun ripristino dello stato React nell'MVP. Screenshot e contesto documentano lo stato originale; elementi non più trovati devono essere segnalati come tali.
- La revisione senza estensione tramite script nei siti gestiti dal team è rimandata a una fase successiva ed esclusa dall'MVP.
- La dashboard elenca i siti e consente di aprirli per consultare le segnalazioni nell'estensione.

## Configurazione prevista

Gli esempi `.env.example` elencano le variabili richieste. Copiare quello web in `.env.local` e quello dell'estensione in `.env`. Le chiavi privilegiate Supabase devono restare esclusivamente sul server. Per provider, callback e database seguire [supabase/README.md](supabase/README.md).

Per Vercel impostare la Root Directory su `apps/web`, mantenendo accessibili i file del monorepo esterni alla root dell'app.

## Stato

Sono presenti le basi del monorepo, l'accesso Google/email, gestione sessione e dashboard con shadcn/ui: elenco, creazione e rinomina progetti; creazione e modifica ambienti; inviti membri vincolati all'email, link ospiti riutilizzabili e revoca. L'estensione permette collegamento membri/ospiti, elenco ambienti, attivazione per sito e pulsante flottante personalizzabile. Le migrazioni vanno applicate al database remoto seguendo il README Supabase. Sono implementati selezione elementi/pin, segnalazioni, risposte, stati e screenshot privati, con lista e filtri nella dashboard. Per gli screenshot configurare SUPABASE_SECRET_KEY sul backend e applicare la quinta migrazione. Restano da verificare i flussi completi in Chrome ed Edge sui siti reali.

## Download estensione

Scaricare [`reporty-chrome.zip`](downloads/reporty-chrome.zip), estrarlo e caricare la cartella da Chrome o Edge in modalità sviluppatore. [Istruzioni complete](apps/extension/README.md#distribuzione-senza-marketplace). La build inclusa usa `https://reporty-extension.vercel.app`.

Le sessioni ospite dell’estensione sono separate per origine del sito (protocollo, dominio e porta): aprire un altro invito non scollega i siti già collegati. Gli avvii della revisione sono separati anche per scheda del browser.

### Accesso condiviso

Tutti gli sviluppatori che accedono con Google o link email possono gestire tutti i progetti, ambienti e segnalazioni. Non sono necessari inviti o ruoli per progetto. Nella tab **Ambienti** si trova l’unico link ospite del progetto: scegli l’ambiente di avvio, crea e copia il link. **Rigenera link** invalida il precedente link e gli accessi ospite associati. Richiede la migrazione `202610050011_shared_dashboard.sql`; i vecchi inviti individuali vengono revocati mantenendo lo storico delle segnalazioni.

Dalla migrazione 013 il link ospite è **per ambiente**: viene creato automaticamente insieme all’ambiente e compare in sola lettura nella sua card, con **Copia link** e **Rigenera link**. La rigenerazione non modifica gli altri link.
