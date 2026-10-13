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

La dashboard occupa tutta la larghezza disponibile, mantenendo i margini interni. La sidebar è fissa su desktop; sotto i 768 px si apre dal menu hamburger come pannello laterale, con chiusura tramite pulsante, Escape, clic esterno o selezione di un link.

Nella tab Ambienti, ogni ambiente è un accordion inizialmente chiuso. L’intestazione mostra sempre nome, URL e Apri sito; il link apre il sito separatamente dal comando di espansione. Modifica, link ospite, script e cancellazione restano nel contenuto espandibile.

Nel dettaglio progetto su mobile le tab scorrono orizzontalmente ed è disponibile solo la vista Lista, con card selezionabili per le azioni in blocco. La ricerca occupa una riga; nella riga successiva si trovano Filtri e ordinamento. Filtri apre un pannello dal basso con angoli superiori arrotondati: ogni voce apre le proprie opzioni multiselezione, con Indietro accanto a Chiudi. Le pillole dei filtri attivi restano rimovibili nella pagina. La selezione di tutti i risultati filtrati comprende anche le altre pagine.

I componenti UI identici di dashboard ed estensione (button, checkbox, input, textarea, select, switch, skeleton e selettori segmentati) hanno una sola implementazione in `packages/shared/ui`, esposta tramite `@reporty/shared/ui/*` e inclusa esplicitamente nelle due build Tailwind. Le modali e i toast mantengono le differenze specifiche di ciascuna superficie.

I selettori di stato e priorità nelle segnalazioni di dashboard, estensione e widget usano segmenti a chevron incastrati, con estremità arrotondate e opzione attiva evidenziata. Il contorno è grigio a riposo e diventa viola su hover, focus da tastiera e selezione, usando sempre lo stesso profilo. Fondo e testo evidenziano anche la selezione. Fondo e contorno usano lo stesso profilo SVG chiuso, senza clip-path esterni. Le misure provengono dal border box di layout e restano corrette durante le animazioni delle modali; i profili adiacenti coincidono senza occupare spazio aggiuntivo. Le etichette restano su una sola riga: quando lo spazio non basta, il selettore scorre orizzontalmente e rende visibile l’opzione selezionata. Lo stesso stile si applica alla priorità nelle card Kanban.

### Vista Kanban delle segnalazioni

Nella dashboard si può passare da Lista a Kanban. Le quattro colonne rappresentano Aperta, In lavorazione, Validazione e Chiusa. Le card sono ordinate per priorità (alta, media, bassa), poi dalla meno recente. Trascinare una card in una colonna ne salva lo stato; il menu Priorità nella card permette di cambiarne la priorità. Lo stato è modificabile anche dal dettaglio della segnalazione. Ricerca e filtri si applicano anche alla board: una card spostata in uno stato escluso dai filtri viene nascosta. La paginazione rimane nella vista Lista; la board ha scorrimento indipendente per colonna.

### Audit temporaneo Supabase

Il pulsante con icona attività accanto al tema della sidebar apre `/dashboard/audit`, riservata agli sviluppatori autenticati. Impostare `SUPABASE_ACCESS_TOKEN` solo sul backend (Vercel e `.env.local` per l’uso locale), poi ripetere il deploy. Il riferimento progetto viene ricavato da `NEXT_PUBLIC_SUPABASE_URL`; con un dominio personalizzato impostare anche `SUPABASE_PROJECT_REF`. Il token deve poter leggere analytics (`analytics_usage_read`) e database (`database_read`). Non usare variabili pubbliche per il token.

La pagina usa la Management API e sole query di lettura, senza nuove migrazioni. Misura tutti i database del cluster, tutti i bucket del progetto e il bucket screenshots separatamente. I conteggi API sono la somma dei campioni restituiti da Supabase e mostrano il loro intervallo, non un totale mensile. Le API sono illimitate nel piano Free. Soglie indicative verificate il 12 ottobre 2026: database 500 MB, Storage 1 GB. Gli indicatori avvisano dall’80% e segnalano il 100%. File Storage attuale e quota ufficiale non coincidono necessariamente: la quota è condivisa dall’organizzazione e misurata come media sul periodo. Egress e cached egress (5 GB ciascuno) vanno verificati sulla pagina Usage di Supabase collegata dalla pagina Audit.

Le metriche non disponibili restano esplicitamente tali; non vengono sostituite con zero. Aggiornamento manuale, nessun polling. Verifiche parser e soglie: `node --experimental-strip-types --test scripts/supabase-audit.test.mjs`. Fonti: [Management API](https://supabase.com/docs/reference/api/v1-get-project-usage-api-count), [query read-only](https://supabase.com/docs/reference/api/v1-read-only-query), [Storage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), [piano Free](https://supabase.com/pricing).

### Ordinamento segnalazioni

Nella tabella della dashboard, ogni intestazione dati ordina la propria colonna; il secondo click inverte il verso e la freccia indica l’ordine attivo. Sono ordinabili descrizione, stato, priorità, ambiente/pagina, autore, data apertura e data aggiornamento. “Ordina per” resta nel Kanban della dashboard e nella lista estensione/widget. Nel Kanban lo stato è già determinato dalla colonna: sono disponibili priorità e le due date. La freccia inverte la direzione. Default: Aperta → Chiusa nella lista; Alta → Bassa nel Kanban, con segnalazioni più vecchie prima a parità di priorità. Le date partono dalle più recenti; aggiornamenti non registrati restano in fondo in entrambe le direzioni. Cambiare ordinamento riporta la paginazione e il caricamento progressivo delle colonne al primo blocco, mantenendo i filtri. L’ordine dei pin sulla pagina resta indipendente dall’ordinamento della lista.

## Notifiche di creazione, cambio di stato e risposta

La creazione di una segnalazione, ogni cambio effettivo di stato e ogni nuova risposta generano una notifica per tutti gli sviluppatori registrati e per le sessioni ospite del progetto con link ancora valido, incluso chi esegue il cambio. La lettura è personale e condivisa tra dashboard ed estensione per la stessa identità; gli ospiti sono identificati dalla sessione. Priorità e salvataggi senza cambio di stato non generano notifiche. I tentativi ripetuti di creazione con lo stesso ID non duplicano le notifiche. Le tre tipologie hanno icone, colori e contenuti distinti: creazione con titolo e autore, cambio di stato con le due pillole stato, risposta con autore e anteprima del commento; il filtro Stato usa lo stato registrato al momento dell’evento. Eliminare la segnalazione elimina le notifiche associate.

La campanella nella dashboard apre un pannello laterale con tutti i progetti, filtro iniziale “Non lette” e filtri multipli per progetto, ambiente, stato di destinazione e lette/non lette. Il click segna la notifica come letta e apre il progetto con il dettaglio della segnalazione. Ogni card non letta offre anche “Segna come letta” per aggiornare lettura e badge senza aprire il dettaglio, in dashboard, estensione e widget; con il filtro Non lette la card viene rimossa dalla lista. Nell’estensione e nel widget la campanella accanto alle impostazioni apre la lista della pagina corrente con filtro iniziale “Non lette” e filtri multipli per stato e lette/non lette, indipendenti dai filtri delle segnalazioni; il badge rosso sul menu conta solo le non lette della stessa pagina e dello stesso ambiente, compresi i percorsi hash. “Segna tutte come lette” agisce su tutte le notifiche personali nella dashboard e solo sulla pagina corrente nell’estensione/widget. Gli aggiornamenti vengono controllati ogni 10 secondi mentre la scheda è visibile. All’arrivo di nuove notifiche non lette viene mostrato un toast in dashboard, estensione e widget; lo storico al primo caricamento è silenzioso e più arrivi nello stesso controllo vengono raggruppati. Nella dashboard la lettura usa un endpoint senza cache e si aggiorna anche al ritorno sulla scheda, all’apertura del pannello e dopo un cambio di stato locale. Il pannello notifiche è flottante e animato, con rispetto di reduced motion. Nell’estensione/widget il click su una notifica mostra subito lo skeleton del dettaglio durante il caricamento.

Per un database esistente applicare **`supabase/notifications.sql`** nel SQL Editor dopo gli aggiornamenti `report_updates.sql` e `widget.sql`, poi distribuire dashboard/API e ricostruire e ricaricare l’estensione. Lo script è incrementale, rieseguibile e conserva i dati; genera solo notifiche future. `initialize.sql` include già le notifiche ma resta un reset distruttivo. Nessun aggiornamento remoto è stato eseguito. Verifiche locali: `npm run test:db` copre destinatari, lettura personale, isolamento pagina/ambiente/progetto, accessi negati, revoche, duplicati e migrazione incrementale.

Se il sistema di notifiche era già installato, applicare **`supabase/notification_creation.sql`** per abilitare anche la creazione. È incrementale e rieseguibile: conserva notifiche precedenti e letture, senza generare notifiche per segnalazioni storiche. `initialize.sql` e la versione corrente di `notifications.sql` includono già tutte e tre le tipologie. Poi distribuire dashboard/API e ricostruire e ricaricare l’estensione.

### Azioni in blocco nella dashboard

La modalità Lista della dashboard usa una tabella su desktop e card selezionabili su mobile, con descrizione, stato, priorità, ambiente/pagina, autore e date; la descrizione apre il dettaglio. Solo in modalità Lista, le checkbox permettono di selezionare singole segnalazioni o tutti i risultati filtrati, comprese le altre pagine. La selezione resta passando tra pagine e cambiando ordinamento; viene azzerata cambiando ricerca, filtri o modalità di visualizzazione. La checkbox nella prima cella dell’intestazione seleziona o deseleziona tutti i risultati filtrati, senza label visibile e con stato intermedio per una selezione parziale. Con almeno una selezione compare la sezione azioni per stato, priorità ed eliminazione tramite icona cestino; i controlli hanno la stessa altezza. La conferma di eliminazione indica il numero di segnalazioni e include le risposte.

Le operazioni mostrano avanzamento e toast, sono protette dai doppi clic e mantengono i controlli di autenticazione e RPC per ogni segnalazione. Le modifiche confermate vengono tolte dalla selezione; quelle fallite restano selezionate per riprovare. Gli screenshot vengono rimossi tramite API Storage solo dopo una cancellazione confermata; gli errori di pulizia sono segnalati separatamente. I cambi di stato generano le notifiche esistenti. Non serve una migrazione del database: dopo il deploy web le azioni sono disponibili nella Lista.

Per aggiungere le notifiche delle risposte a un database con notifiche già attive, applicare **`supabase/notifications_reply.sql`**. Lo script è incrementale e rieseguibile, conserva gli eventi e le letture precedenti, distingue le tipologie e non genera notifiche per risposte storiche. `initialize.sql` e le versioni correnti di `notifications.sql` e `notification_creation.sql` includono già anche le risposte. Poi distribuire dashboard/API e ricostruire e ricaricare l’estensione. Nessuno script remoto è stato eseguito.
