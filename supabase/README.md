# Configurazione Supabase

## Aggiornamento unico delle modifiche recenti, senza reset

Eseguire **solo `update_reports.sql`**, copiando tutto il contenuto nel SQL Editor di Supabase in un’unica esecuzione. Include screenshot multipli, fino a 5 file da 5 MB per segnalazione e creazione di segnalazioni di pagina dalla dashboard. Sostituisce l’esecuzione separata di `report_screenshots.sql`, `report_attachments.sql` e `page_reports.sql`.

Lo script mantiene account, progetti, ambienti, sessioni, segnalazioni, risposte, notifiche e file esistenti. Copia il percorso dello screenshot storico nel nuovo array, lasciando intatto il campo precedente. Eventuali file già presenti sopra 5 MB non vengono rimossi né riscritti: il limite di 5 MB viene applicato ai nuovi upload tramite bucket e RPC. Se la tabella degli allegati esiste, i suoi record e i vincoli storici sono conservati.

È incrementale, rieseguibile e racchiuso in **una sola transazione**; un errore annulla l’intera esecuzione. Controlla prima la presenza delle tabelle, funzioni e colonne di base necessarie: se manca un prerequisito, si interrompe senza modifiche. Nessuna funzione di cancellazione viene invocata, nessuna tabella o account viene eliminato e nessun oggetto Storage viene cancellato. I `DELETE` presenti nei corpi delle RPC definiscono il comportamento delle future cancellazioni richieste dall’app, senza eseguirle durante l’aggiornamento.

Verifiche locali: `supabase/tests/update-reports.test.mjs` confronta tutti i record preesistenti negli schemi applicativi, Auth e Storage prima e dopo l’aggiornamento, prova il rollback su errore e la seconda esecuzione, copre il vecchio screenshot singolo e installazioni parziali con file più grandi. Le RPC finali sono confrontate con le migrazioni individuali già testate. Nessuno script è stato eseguito sul remoto.

## Inizializzazione e reset

Eseguire **`initialize.sql`** nel SQL Editor di Supabase. È l’unico script di inizializzazione e sostituisce le precedenti migrazioni.

**È distruttivo a ogni esecuzione:** elimina tutte le tabelle, i dati, i link, le sessioni di Reporty e tutti gli account Supabase Auth. Ricrea poi lo schema aggiornato in un’unica transazione. Non conserva amministratori e non elimina gli schemi gestiti `auth` e `storage`, né le impostazioni OAuth. Non è stato eseguito sul database remoto dall’agente.

Prima di eseguirlo, svuotare il bucket `screenshots` tramite il pannello Storage o l’API Storage, mantenendo il bucket. Se contiene file, lo script si interrompe prima del reset. Non cancellare direttamente i metadati `storage.objects` via SQL. Il bucket viene creato o configurato come privato, JPEG fino a 2,5 MB. Non aggiungere policy pubbliche; il backend controlla l’accesso e usa URL firmati.

Dopo il reset:

1. Accedere alla dashboard con Google o link email; non serve nominare un amministratore.
2. Creare progetti e ambienti. Ogni ambiente riceve automaticamente un link ospite in sola lettura nella sua card, copiabile e rigenerabile.
3. Collegare nuovamente l’estensione: le vecchie sessioni non sono più valide.

Tutti gli sviluppatori registrati possono leggere, modificare ed eliminare tutti i progetti, ambienti e segnalazioni. Gli ospiti entrano con il link, senza dashboard e senza nome per consultare lista, pin, dettagli, screenshot e risposte. Il nome viene richiesto alla prima creazione, risposta o modifica di stato/priorità e conservato nella sessione. Non possono modificare il testo o eliminare segnalazioni. Rigenerare un link revoca solo quel link e le sessioni associate.

## Autenticazione

In Authentication → URL Configuration impostare Site URL e Redirect URLs:

- Locale: `http://localhost:3000` e `http://localhost:3000/auth/callback`.
- Produzione: `https://reporty-extension.vercel.app` e `https://reporty-extension.vercel.app/auth/callback`.

Abilitare Google e disabilitare il provider Email in Sign In / Providers. Le credenziali OAuth Google restano nel pannello Supabase. La dashboard consente l’accesso soltanto tramite Google.

## Verifiche locali

`npm run test:db` verifica con PGlite inizializzazione e riesecuzione, protezione del reset quando Storage non è vuoto, permessi degli sviluppatori e degli ospiti, link automatici per ambiente, revoca e operazioni sulle segnalazioni. Questi test non eseguono query sul progetto Supabase remoto.

## Creazione progetto con Produzione

La creazione del progetto richiede l’origine del sito e crea atomicamente l’ambiente Produzione e il relativo link ospite. Per aggiornare un database esistente senza cancellare dati, eseguire `create_project_with_production.sql`. La funzione è già inclusa in `initialize.sql`: non rieseguire il reset per applicare questo aggiornamento.

## Script incorporabile per ambiente

Su un database esistente eseguire **`widget.sql`**, aggiornamento non distruttivo. Il reset `initialize.sql` include già lo schema widget. Dopo il deploy web, ogni card ambiente mostra lo script da copiare nel sito e il toggle Abilita/Disabilita, inizialmente disabilitato.

Chiunque visiti l’origine configurata, quando lo script è attivo, può consultare senza nome le segnalazioni di quell’ambiente. Il nome viene richiesto alla prima scrittura, conservato nella sessione e permette di creare, rispondere, cambiare stato/priorità, modificare ed eliminare secondo i permessi del widget. La chiave nello snippet è pubblica, non un segreto amministrativo. Il backend e il database verificano ambiente, origine e stato del toggle a ogni operazione. La sessione dura un giorno; il pannello controlla il toggle ogni 10 secondi. Disabilitando il widget le nuove operazioni vengono bloccate subito e il pannello scompare al controllo successivo.

## Consultazione senza nome

Su un database esistente applicare **`reviewer_read_only.sql`** dopo gli aggiornamenti widget, ultima modifica e allegati. È incrementale e rieseguibile: conserva account, segnalazioni, link, allegati e nomi delle sessioni esistenti. Non eseguire `initialize.sql` per questo aggiornamento: resta distruttivo.

Le nuove sessioni possono avere `display_name` nullo. Le RPC autorizzano la lettura con il link ospite o con il widget abilitato; creazione, modifiche, risposte, associazione screenshot e scritture sugli allegati richiedono un nome. Il nome viene assegnato alla sessione esistente senza sostituirne il token e senza cambiare i permessi. Il primo nome salvato non viene sovrascritto da richieste concorrenti. Le sessioni senza nome non compaiono tra i partecipanti della dashboard.

Applicare la migrazione prima del deploy web/API e aggiornare e ricaricare l’estensione. Nessuna query remota è stata eseguita. `npm run test:db` verifica schema nuovo e migrazione su dati esistenti, accessi in lettura, scritture negate senza nome, attribuzione dopo inserimento del nome, RLS, isolamento e revoche.

Screenshot opzionali in HTTPS (o localhost) con `getDisplayMedia`: scegliere la scheda corrente e consentire ogni acquisizione. Vengono evidenziati punto o elemento e fermate tutte le tracce della condivisione dopo la cattura. Annullando il consenso si può comunque inviare la segnalazione senza screenshot. La funzione può non essere disponibile su browser mobile.

Con CSP del sito autorizzare il dominio Reporty per `script-src`, `connect-src` e `img-src` (oltre ai domini delle immagini Supabase e `data:` per le anteprime); consentire gli stili del pannello isolato. Lo script non recupera lo stato interno React. Il bundle viene generato prima di `dev:web` e della build Vercel; `npm run build:widget` lo rigenera manualmente durante lo sviluppo.

Per aggiungere lo stato **Validazione** a un database già inizializzato, eseguire `supabase/report_validation.sql` (non distruttivo) prima di pubblicare la nuova UI. Lo script di inizializzazione include già questo stato.

Per visualizzare il numero delle risposte sui pin di un database esistente, eseguire `report_comment_counts.sql` nel SQL Editor. È un aggiornamento non distruttivo; `initialize.sql` include già il conteggio.

## Ultima modifica e partecipanti

Per un database già inizializzato eseguire **`report_updates.sql`**, senza usare il reset. La query conserva i dati e aggiunge `updated_at`, `updated_by` (sviluppatore) e `updated_guest_session_id` (guest o widget). Le modifiche a descrizione, stato, priorità e screenshot vengono attribuite dal database alla sessione autorizzata; risposte e aggiornamenti senza variazione del valore non cambiano questi campi. Una nuova acquisizione screenshot aggiorna sempre la data. I dati storici di modifica restano null perché non sono ricostruibili.

La dashboard mostra l’ultima modifica nel dettaglio e offre un filtro Utente: le identità selezionate corrispondono all’autore **oppure** all’ultimo modificatore. Impostazioni → Utenti elenca gli sviluppatori associati ai dati del progetto e le sessioni ospite, senza permessi di gestione. Sessioni guest diverse restano distinte anche se hanno lo stesso nome. Questa funzione registra l’ultima modifica, non una cronologia completa.

Applicare la query prima del deploy della dashboard e aggiornare l’estensione ZIP.

## Notifiche di creazione, cambio di stato e risposta

La creazione di una segnalazione, ogni cambio effettivo di stato e ogni nuova risposta generano una notifica per tutti gli sviluppatori registrati e per le sessioni ospite del progetto con link ancora valido, incluso chi esegue il cambio. La lettura è personale e condivisa tra dashboard ed estensione per la stessa identità; gli ospiti sono identificati dalla sessione. Priorità e salvataggi senza cambio di stato non generano notifiche. I tentativi ripetuti di creazione con lo stesso ID non duplicano le notifiche. Le tre tipologie hanno icone, colori e contenuti distinti: creazione con titolo e autore, cambio di stato con le due pillole stato, risposta con autore e anteprima del commento; il filtro Stato usa lo stato registrato al momento dell’evento. Eliminare la segnalazione elimina le notifiche associate.

La campanella nella dashboard apre un pannello laterale con tutti i progetti, filtro iniziale “Non lette” e filtri multipli per progetto, ambiente, stato di destinazione e lette/non lette. Il click segna la notifica come letta e apre il progetto con il dettaglio della segnalazione. Ogni card non letta offre anche “Segna come letta” per aggiornare lettura e badge senza aprire il dettaglio, in dashboard, estensione e widget; con il filtro Non lette la card viene rimossa dalla lista. Nell’estensione e nel widget la campanella accanto alle impostazioni apre la lista della pagina corrente con filtro iniziale “Non lette” e filtri multipli per stato e lette/non lette, indipendenti dai filtri delle segnalazioni; il badge rosso sul menu conta solo le non lette della stessa pagina e dello stesso ambiente, compresi i percorsi hash. “Segna tutte come lette” agisce su tutte le notifiche personali nella dashboard e solo sulla pagina corrente nell’estensione/widget. Gli aggiornamenti vengono controllati ogni 10 secondi mentre la scheda è visibile. All’arrivo di nuove notifiche non lette viene mostrato un toast in dashboard, estensione e widget; lo storico al primo caricamento è silenzioso e più arrivi nello stesso controllo vengono raggruppati. Nella dashboard la lettura usa un endpoint senza cache e si aggiorna anche al ritorno sulla scheda, all’apertura del pannello e dopo un cambio di stato locale. Il pannello notifiche è flottante e animato, con rispetto di reduced motion. Nell’estensione/widget il click su una notifica mostra subito lo skeleton del dettaglio durante il caricamento.

Per un database esistente applicare **`supabase/notifications.sql`** nel SQL Editor dopo gli aggiornamenti `report_updates.sql` e `widget.sql`, poi distribuire dashboard/API e ricostruire e ricaricare l’estensione. Lo script è incrementale, rieseguibile e conserva i dati; genera solo notifiche future. `initialize.sql` include già le notifiche ma resta un reset distruttivo. Nessun aggiornamento remoto è stato eseguito. Verifiche locali: `npm run test:db` copre destinatari, lettura personale, isolamento pagina/ambiente/progetto, accessi negati, revoche, duplicati e migrazione incrementale.

Se il sistema di notifiche era già installato, applicare **`supabase/notification_creation.sql`** per abilitare anche la creazione. È incrementale e rieseguibile: conserva notifiche precedenti e letture, senza generare notifiche per segnalazioni storiche. `initialize.sql` e la versione corrente di `notifications.sql` includono già tutte e tre le tipologie. Poi distribuire dashboard/API e ricostruire e ricaricare l’estensione.

Per aggiungere le notifiche delle risposte a un database con notifiche già attive, applicare **`supabase/notifications_reply.sql`**. Lo script è incrementale e rieseguibile, conserva gli eventi e le letture precedenti, distingue le tipologie e non genera notifiche per risposte storiche. `initialize.sql` e le versioni correnti di `notifications.sql` e `notification_creation.sql` includono già anche le risposte. Poi distribuire dashboard/API e ricostruire e ricaricare l’estensione. Nessuno script remoto è stato eseguito.

Per gli allegati delle risposte su un database esistente, eseguire una volta `reply_attachments.sql` prima del nuovo deploy web. È incrementale e conserva tutti i dati: aggiunge `comment_attachments`, la RPC autorizzata `attachment_operation`, associazione atomica nella risposta e bucket privato `attachments` (massimo 2.500.000 byte per file, 5 file per risposta). Non aggiungere policy Storage per anon/authenticated: upload, lettura e pulizia passano dal backend. `initialize.sql` include questa modifica e richiede lo svuotamento preventivo di `screenshots` e `attachments` tramite Storage; resta un reset distruttivo. Upload interrotti da una chiusura forzata possono lasciare prenotazioni e file temporanei; vengono raccolti alla cancellazione della segnalazione/ambiente/progetto.

## Screenshot multipli

Questa modifica è inclusa in `update_reports.sql`, da applicare prima del deploy; `report_screenshots.sql` resta il riferimento individuale. La migrazione è incrementale e rieseguibile: aggiunge `issues.screenshot_paths`, conserva lo screenshot storico in `screenshot_path` e come prima immagine dell’array, e aggiorna le RPC di autorizzazione e pulizia. Sono consentiti al massimo 5 screenshot JPEG fino a 2,5 MB ciascuno. Lettura per sessioni ospiti anche senza nome; scrittura solo per sviluppatori autenticati o per l’autore ospite identificato, con verifica del toggle widget e della sessione. I nuovi percorsi sono `progetto/segnalazione/screenshot.jpg`; quelli storici restano validi. Il database controlla presenza, tipo e dimensione degli oggetti prima del collegamento; i file vengono eliminati solo tramite API Storage. Non eseguire `initialize.sql` per aggiornare un database da conservare.

## File della segnalazione fino a 5 MB

Questa modifica è inclusa in `update_reports.sql`, da applicare prima del deploy; `report_attachments.sql` resta il riferimento individuale. È una migrazione incrementale, transazionale e rieseguibile. Aggiunge `issue_attachments`, protetta da RLS senza accesso diretto per `anon` e `authenticated`, la RPC `report_attachment_operation` con `search_path` esplicito e il bucket privato `report-attachments` con limite di 5.000.000 byte. I dati e il bucket degli allegati delle risposte sono conservati, con il loro limite di 2,5 MB.

Ogni segnalazione ha al massimo 5 file, compresi quelli prenotati in attesa di upload. Le scritture richiedono sviluppatore autenticato oppure autore ospite identificato; la lettura dei file confermati è disponibile anche agli ospiti senza nome autorizzati sul progetto/ambiente. I controlli RPC comprendono sessione, toggle widget, proprietà della prenotazione, dimensione effettiva e MIME Storage prima del collegamento. Upload incompleti non appaiono nel dettaglio e non sono scaricabili tramite API. Le cancellazioni della segnalazione, del progetto o dell’ambiente restituiscono anche i percorsi dei file prenotati per la pulizia tramite API Storage.

Il backend emette un token upload per un solo percorso, senza overwrite; il client usa TUS e la chiave server non lascia il backend. Gli upload firmati Supabase possono restare validi per 2 ore anche dopo la revoca della sessione: la conferma nel database viene sempre nuovamente autorizzata. Il file generico è forzato a `application/octet-stream` e viene sempre scaricato, tramite URL firmato di 60 secondi. Verificare anche il limite globale Storage, che non viene modificato da SQL. Il piano Free include 1 GB complessivo: l’operazione non è distruttiva, ma file da 5 MB possono consumare rapidamente la quota.

## Segnalazioni di pagina dalla dashboard

Questa modifica è inclusa in `update_reports.sql`, da applicare prima del deploy; `page_reports.sql` resta il riferimento individuale. La migrazione incrementale, transazionale e rieseguibile aggiorna solo `report_operation` e i relativi grant, senza riscrivere o eliminare dati. `initialize.sql` include già lo stesso supporto, ma resta uno script distruttivo da non usare per aggiornare dati esistenti.

Il nuovo `anchor.kind = page` permette la creazione senza coordinate, viewport o scroll fittizi. I controlli su utente sviluppatore, sessione ospite identificata, revoca e origine dell’ambiente restano attivi. I tipi `pin` ed `element` richiedono ancora i rispettivi metadati e la viewport/scroll. Screenshot, file, risposte e operazioni di pulizia usano le RPC e i bucket già esistenti. La nuova API `/api/reports` accetta solo creazione e screenshot tramite sessione dashboard autenticata non anonima.
