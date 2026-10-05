# Reporty — istruzioni per gli agenti

## Collaborazione

- Comunicare in italiano, con aggiornamenti brevi e risultati verificabili.
- Prima di introdurre funzionalità con scelte di prodotto non concordate, chiedere le specifiche e proporre opzioni. Per correzioni e scelte tecniche ordinarie, procedere nel perimetro richiesto.
- Non inizializzare nuovi progetti o cambiare stack senza richiesta.
- Usare agenti paralleli solo quando richiesto dall'utente.
- Non sovrascrivere modifiche dell'utente. Non eseguire reset, migrazioni remote, push o pubblicazioni senza autorizzazione per quell'azione.

## Struttura e stack

- Monorepo npm workspaces, Node.js >= 22.12, un solo `package-lock.json` nella root.
- `apps/web`: Next.js App Router, React, dashboard e API su Vercel.
- `apps/extension`: WXT + React, Manifest V3 per Chrome ed Edge desktop.
- `packages/shared`: tipi, validazione Zod e identificazione delle pagine.
- `supabase/migrations`: migrazioni SQL ordinate; `supabase/tests`: verifiche PostgreSQL locali con PGlite.
- `supabase/scripts`: operazioni manuali, incluse quelle distruttive; non sono migrazioni.
- `downloads/reporty-chrome.zip`: estensione di produzione pronta da distribuire tramite GitHub.
- UI con shadcn/ui, Base UI, Tailwind CSS e icone Lucide; riutilizzare i componenti esistenti.
- Prima di modificare Next.js leggere `apps/web/AGENTS.md` e la documentazione pertinente in `apps/web/node_modules/next/dist/docs/`.

## Modello di prodotto

- Gli utenti della dashboard sono sviluppatori (Google o link email, anche per creare il primo progetto). Il team usa dashboard ed estensione. I clienti/revisori ospiti usano l'estensione tramite link e nome, senza registrazione o accesso alla dashboard.
- I progetti contengono ambienti identificati da origini esplicite. Protocollo e porta fanno parte dell'origine.
- Il termine workspace indica attualmente la dashboard: non esiste una tabella workspace separata.
- Segnalazioni collegate a elementi DOM o pin liberi, con descrizione, screenshot opzionale e risposte.
- Stati: `open`, `in_progress`, `resolved`. Priorità: `low`, `medium`, `high`, inizialmente `medium`.
- Identità pagina: ambiente e percorso; query conservate come contesto, percorsi hash distinti.
- Non acquisire o ripristinare stato interno React, cookie o storage del sito. La modalità con script senza estensione è rimandata.

## Permessi

- Tutti gli sviluppatori autenticati (Google o link email, non account anonimi) vedono, modificano ed eliminano tutti i progetti, ambienti e segnalazioni. Non esistono più ruoli o membership nella UI né inviti sviluppatore.
- Ogni ambiente ha un link ospite generato automaticamente alla creazione, recuperabile in sola lettura nella propria card della tab Ambienti. Rigenerarlo revoca solo quel link e le sessioni associate; gli altri link restano validi. Le tabelle dei vecchi ruoli restano solo per compatibilità e cronologia.
- Gli inviti ospiti indicano un ambiente iniziale; nome obbligatorio e avvio dal link, collegamento automatico e consenso browser sul dominio quando necessario. Gli ospiti possono creare, leggere e rispondere e modificare stato e priorità delle segnalazioni del proprio progetto; non modificano il testo né eliminano segnalazioni.
- Autorizzare ogni operazione sul backend e nel database: nascondere un pulsante non è un controllo di sicurezza.

## Database, sessioni e screenshot

- Aggiungere nuove migrazioni numerate, senza riscrivere quelle già distribuite. L’ultima è `202610050013_environment_review_links.sql`.
- Mantenere RLS, controlli RPC e `search_path` esplicito nelle funzioni security definer; limitare gli execute grant.
- Token ospite e invito memorizzati con hash. I codici di collegamento estensione sono monouso; verificare origine, scheda, nonce e scadenza.
- La sessione estensione resta nello storage riservato ai contesti fidati; non deve essere esposta al sito revisionato.
- `SUPABASE_SECRET_KEY` resta server-only, usata per Storage dopo controllo di autorizzazione. Non inserirla nell'estensione, nei log o in variabili `NEXT_PUBLIC_*`.
- Screenshot nel bucket privato `screenshots`, JPEG fino a 2,5 MB, URL firmati brevi. Evidenziare elemento/punto durante la cattura e rimuovere sempre l'overlay temporaneo, anche su errore.
- Rimuovere file tramite API Storage, non eliminando direttamente metadati `storage.objects` via SQL. La pulizia dopo cancellazioni applicative è best effort e non deve nascondere errori.

## Convenzioni UI

- Dashboard con sidebar progetti e ricerca; email troncata ed Esci sulla stessa riga.
- Dettaglio progetto in tab: Segnalazioni e Ambienti; link ospite nella card di ciascun ambiente.
- Filtri segnalazioni multiselect su una riga, ricerca separata, pillole rimovibili sotto. Stati iniziali: Aperta e In lavorazione. Ordine priorità: Alta, Media, Bassa.
- Dettaglio segnalazione in dialogo: descrizione e screenshot in evidenza, gestione sotto, autore in fondo. Colori per stato/priorità.
- Estensione: floating `+` che ruota a `×`, creazione in evidenza, lista accordion, sezioni in riquadri verticali, back e chiudi sulla stessa riga.
- Il popup determina progetto/ambiente dall'URL senza select; informazioni revisore in fondo, senza elenco siti.
- Collegamento: toast di successo/errore, pulsante disabilitato dopo successo e protezione dai doppi clic.
- Tutti i caricamenti usano skeleton specifici che riprendono layout, dimensioni e sezioni della UI caricata (pagine, operazioni, dettagli e immagini), senza placeholder generici; tutti i feedback delle operazioni usano toast. Le istruzioni e gli stati vuoti restano nel contenuto. Dashboard: ToastProvider globale Base UI; estensione: provider nelle superfici popup, review e shadow root, senza portali nel sito ospitante.
- Preservare accessibilità, gestione del focus, etichette e reduced motion.

## Comandi dalla root

```sh
npm install
npm run dev:web
npm run dev:extension
npm run typecheck
npm run lint
npm test
npm run test:extension
npm run build:extension:production
npm run zip:extension:production
```

- Eseguire verifiche proporzionate alle modifiche. Per cambiamenti di permessi aggiungere test DB su ruoli, isolamento e accesso negato.
- Il test lifecycle dell'estensione usa attualmente localhost: costruire con configurazione locale per quel test. Rigenerare la build di produzione dopo averlo eseguito se si deve distribuire lo ZIP.
- Per la build web: `npm run build --workspace=@reporty/web`; se Turbopack è impedito dal sandbox, usare `npm run build --workspace=@reporty/web -- --webpack`.
- Non eseguire typecheck Next e build contemporaneamente: la generazione di `.next/types` può causare race.
- Build e test automatici non equivalgono a verifica manuale in Chrome/Edge; dichiarare quali verifiche sono state effettivamente svolte.

## Produzione e distribuzione

- Dashboard/API: `https://reporty-extension.vercel.app`. Vercel Root Directory `apps/web`, con file esterni alla root disponibili alla build.
- `NEXT_PUBLIC_APP_URL` è l'origine della dashboard, senza `/login`. Callback Supabase: `/auth/callback`.
- `npm run zip:extension:production` usa il dominio di produzione e aggiorna `downloads/reporty-chrome.zip`. Verificare manifest e backend inclusi prima di condividere.
- Distribuzione corrente via ZIP su GitHub, senza marketplace: estrarre, abilitare Modalità sviluppatore, caricare la cartella contenente `manifest.json`. Aggiornamenti manuali.
- Non committare `.env*`, segreti o file generati diversi dall'archivio distribuibile concordato. Aggiornare README e indicare all'utente eventuali migrazioni, deploy o ricaricamenti necessari.
