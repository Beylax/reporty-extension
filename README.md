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

## GitHub e task Claude

Gli sviluppatori possono collegare una repository GitHub e il branch di destinazione alla creazione del progetto/ambiente oppure dalla card dell’ambiente. Il collegamento usa una GitHub App e diventa disponibile a tutti gli sviluppatori di Reporty.

Nel dettaglio della segnalazione, **Assegna task a Claude** avvia una sessione Claude Managed Agents con la chiave API centrale. La dashboard mostra avanzamento ed esito; il backend crea una PR pronta per la revisione sul branch scelto. Durante il task descrizione, stato, priorità, screenshot ed eliminazione sono bloccati anche nel database. I commenti restano disponibili. Alla PR la segnalazione passa in Validazione; in caso di fallimento torna allo stato precedente.

Per attivare la funzionalità servono la migrazione incrementale `supabase/github_claude.sql`, la configurazione GitHub/Anthropic e il processo periodico di riconciliazione. Seguire [la configurazione web](apps/web/README.md#github-e-claude-managed-agents). Lo ZIP già distribuito non viene aggiornato automaticamente; rigenerarlo e ricaricare l’estensione per visualizzare il nuovo messaggio di blocco. Il blocco backend vale anche per le versioni precedenti.

`npm run test:automation` verifica le integrazioni con HTTP simulato; `npm run test:db` verifica autorizzazioni, migrazione e blocchi. Queste verifiche non sostituiscono una prova su GitHub e Anthropic reali.

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

Sono presenti le basi del monorepo, l'accesso Google/email, gestione sessione e dashboard con shadcn/ui: elenco, creazione e rinomina progetti; creazione e modifica ambienti; link ospiti per ambiente e revoca. L'estensione permette collegamento membri/ospiti, elenco ambienti, attivazione per sito e pulsante flottante personalizzabile. Lo script distruttivo `supabase/initialize.sql` inizializza il database: seguire il README Supabase. Sono implementati selezione elementi/pin, segnalazioni, risposte, stati e screenshot privati, con lista e filtri nella dashboard. Per gli screenshot configurare SUPABASE_SECRET_KEY sul backend e inizializzare lo schema. Restano da verificare i flussi completi in Chrome ed Edge sui siti reali.

## Download estensione

Scaricare [`reporty-chrome.zip`](downloads/reporty-chrome.zip), estrarlo e caricare la cartella da Chrome o Edge in modalità sviluppatore. [Istruzioni complete](apps/extension/README.md#distribuzione-senza-marketplace). La build inclusa usa `https://reporty-extension.vercel.app`.

Le sessioni ospite dell’estensione sono separate per origine del sito (protocollo, dominio e porta): aprire un altro invito non scollega i siti già collegati. Gli avvii della revisione sono separati anche per scheda del browser.

### Accesso e database

Tutti gli sviluppatori che accedono con Google possono gestire tutti i progetti, ambienti e segnalazioni, senza inviti o ruoli amministratore. Ogni ambiente ha un link guest automatico nella sua card: **Copia link** e **Rigenera link**. La rigenerazione revoca solo il precedente link dell’ambiente e le sue sessioni.

Per inizializzare o ricostruire il database usare **`supabase/initialize.sql`**. Ogni esecuzione elimina i dati Reporty e tutti gli utenti Auth, poi ricrea lo schema. Svuotare prima il bucket screenshots tramite Storage. I dettagli sono in [supabase/README.md](supabase/README.md).

### Script per i siti in gestione

Dopo aver applicato `supabase/widget.sql`, copiare lo snippet dalla card dell’ambiente e incollarlo nel sito. Abilitare la revisione dalla dashboard: i visitatori inseriscono il nome e hanno comandi completi sulle segnalazioni dell’ambiente. Disabilitando lo script le operazioni sono bloccate e il pannello scompare entro 10 secondi. Screenshot opzionali con condivisione della scheda e consenso del browser. Il loader scarica il pannello solo quando abilitato.

### Tema e componenti UI

Dashboard, estensione e widget usano il tema Violet Bloom di tweakcn, con modalità chiara/scura e font Plus Jakarta Sans incluso localmente (licenza OFL). Il marchio è testuale: Reporty. Select, checkbox, switch, input, textarea e accordion usano i componenti UI condivisi nello stile shadcn/Base UI; i popup dell’estensione restano nello shadow root o nella modale corrente.
