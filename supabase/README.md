# Configurazione Supabase

## Inizializzazione e reset

Eseguire **`initialize.sql`** nel SQL Editor di Supabase. È l’unico script di inizializzazione e sostituisce le precedenti migrazioni.

**È distruttivo a ogni esecuzione:** elimina tutte le tabelle, i dati, i link, le sessioni di Reporty e tutti gli account Supabase Auth. Ricrea poi lo schema aggiornato in un’unica transazione. Non conserva amministratori e non elimina gli schemi gestiti `auth` e `storage`, né le impostazioni OAuth. Non è stato eseguito sul database remoto dall’agente.

Prima di eseguirlo, svuotare il bucket `screenshots` tramite il pannello Storage o l’API Storage, mantenendo il bucket. Se contiene file, lo script si interrompe prima del reset. Non cancellare direttamente i metadati `storage.objects` via SQL. Il bucket viene creato o configurato come privato, JPEG fino a 2,5 MB. Non aggiungere policy pubbliche; il backend controlla l’accesso e usa URL firmati.

Dopo il reset:

1. Accedere alla dashboard con Google o link email; non serve nominare un amministratore.
2. Creare progetti e ambienti. Ogni ambiente riceve automaticamente un link ospite in sola lettura nella sua card, copiabile e rigenerabile.
3. Collegare nuovamente l’estensione: le vecchie sessioni non sono più valide.

Tutti gli sviluppatori registrati possono leggere, modificare ed eliminare tutti i progetti, ambienti e segnalazioni. Gli ospiti entrano con il link e il nome, senza dashboard; possono creare, leggere, rispondere e cambiare stato/priorità nel progetto autorizzato. Non possono modificare il testo o eliminare segnalazioni. Rigenerare un link revoca solo quel link e le sessioni associate.

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

Chiunque visiti l’origine configurata, quando lo script è attivo, inserisce il nome e può creare, leggere, rispondere, cambiare stato/priorità, modificare ed eliminare le segnalazioni di quell’ambiente. La chiave nello snippet è pubblica, non un segreto amministrativo. Il backend e il database verificano ambiente, origine e stato del toggle a ogni operazione. La sessione dura un giorno; il pannello controlla il toggle ogni 10 secondi. Disabilitando il widget le nuove operazioni vengono bloccate subito e il pannello scompare al controllo successivo.

Screenshot opzionali in HTTPS (o localhost) con `getDisplayMedia`: scegliere la scheda corrente e consentire ogni acquisizione. Vengono evidenziati punto o elemento e fermate tutte le tracce della condivisione dopo la cattura. Annullando il consenso si può comunque inviare la segnalazione senza screenshot. La funzione può non essere disponibile su browser mobile.

Con CSP del sito autorizzare il dominio Reporty per `script-src`, `connect-src` e `img-src` (oltre ai domini delle immagini Supabase e `data:` per le anteprime); consentire gli stili del pannello isolato. Lo script non recupera lo stato interno React. Il bundle viene generato prima di `dev:web` e della build Vercel; `npm run build:widget` lo rigenera manualmente durante lo sviluppo.

Per aggiungere lo stato **Validazione** a un database già inizializzato, eseguire `supabase/report_validation.sql` (non distruttivo) prima di pubblicare la nuova UI. Lo script di inizializzazione include già questo stato.

Per visualizzare il numero delle risposte sui pin di un database esistente, eseguire `report_comment_counts.sql` nel SQL Editor. È un aggiornamento non distruttivo; `initialize.sql` include già il conteggio.

## Ultima modifica e partecipanti

Per un database già inizializzato eseguire **`report_updates.sql`**, senza usare il reset. La query conserva i dati e aggiunge `updated_at`, `updated_by` (sviluppatore) e `updated_guest_session_id` (guest o widget). Le modifiche a descrizione, stato, priorità e screenshot vengono attribuite dal database alla sessione autorizzata; risposte e aggiornamenti senza variazione del valore non cambiano questi campi. Una nuova acquisizione screenshot aggiorna sempre la data. I dati storici di modifica restano null perché non sono ricostruibili.

La dashboard mostra l’ultima modifica nel dettaglio e offre un filtro Utente: le identità selezionate corrispondono all’autore **oppure** all’ultimo modificatore. Impostazioni → Utenti elenca gli sviluppatori associati ai dati del progetto e le sessioni ospite, senza permessi di gestione. Sessioni guest diverse restano distinte anche se hanno lo stesso nome. Questa funzione registra l’ultima modifica, non una cronologia completa.

Applicare la query prima del deploy della dashboard e aggiornare l’estensione ZIP.

## Notifiche di creazione e cambio di stato

La creazione di una segnalazione e ogni cambio effettivo di stato generano una notifica per tutti gli sviluppatori registrati e per le sessioni ospite del progetto con link ancora valido, incluso chi esegue il cambio. La lettura è personale e condivisa tra dashboard ed estensione per la stessa identità; gli ospiti sono identificati dalla sessione. Risposte, priorità e salvataggi senza cambio di stato non generano notifiche. I tentativi ripetuti di creazione con lo stesso ID non duplicano le notifiche. Le nuove segnalazioni mostrano “Nuova segnalazione”; il filtro Stato usa lo stato iniziale registrato nell’evento. Eliminare la segnalazione elimina le notifiche associate.

La campanella nella dashboard apre un pannello laterale con tutti i progetti e filtri multipli per progetto, ambiente, stato di destinazione e lette/non lette. Il click segna la notifica come letta e apre il progetto con il dettaglio della segnalazione. Nell’estensione e nel widget la campanella accanto alle impostazioni apre la lista della pagina corrente con filtri multipli per stato e lette/non lette, indipendenti dai filtri delle segnalazioni; il badge rosso sul menu conta solo le non lette della stessa pagina e dello stesso ambiente, compresi i percorsi hash. “Segna tutte come lette” agisce su tutte le notifiche personali nella dashboard e solo sulla pagina corrente nell’estensione/widget. Gli aggiornamenti vengono controllati ogni 10 secondi mentre la scheda è visibile. Nella dashboard la lettura usa un endpoint senza cache e si aggiorna anche al ritorno sulla scheda, all’apertura del pannello e dopo un cambio di stato locale. Il pannello notifiche è flottante e animato, con rispetto di reduced motion. Nell’estensione/widget il click su una notifica mostra subito lo skeleton del dettaglio durante il caricamento.

Per un database esistente applicare **`supabase/notifications.sql`** nel SQL Editor dopo gli aggiornamenti `report_updates.sql` e `widget.sql`, poi distribuire dashboard/API e ricostruire e ricaricare l’estensione. Lo script è incrementale, rieseguibile e conserva i dati; genera solo notifiche future. `initialize.sql` include già le notifiche ma resta un reset distruttivo. Nessun aggiornamento remoto è stato eseguito. Verifiche locali: `npm run test:db` copre destinatari, lettura personale, isolamento pagina/ambiente/progetto, accessi negati, revoche, duplicati e migrazione incrementale.

Se il sistema di notifiche era già installato, applicare **`supabase/notification_creation.sql`** per abilitare anche la creazione. È incrementale e rieseguibile: conserva notifiche precedenti e letture, senza generare notifiche per segnalazioni storiche. `initialize.sql` e la versione corrente di `notifications.sql` includono già entrambe le tipologie. Poi distribuire dashboard/API e ricostruire e ricaricare l’estensione.
