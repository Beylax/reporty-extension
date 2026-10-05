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

Abilitare Email e Google in Sign In / Providers. Le credenziali OAuth Google restano nel pannello Supabase. Il link email PKCE va aperto nello stesso browser dal quale è stato richiesto.

## Verifiche locali

`npm run test:db` verifica con PGlite inizializzazione e riesecuzione, protezione del reset quando Storage non è vuoto, permessi degli sviluppatori e degli ospiti, link automatici per ambiente, revoca e operazioni sulle segnalazioni. Questi test non eseguono query sul progetto Supabase remoto.

## Creazione progetto con Produzione

La creazione del progetto richiede l’origine del sito e crea atomicamente l’ambiente Produzione e il relativo link ospite. Per aggiornare un database esistente senza cancellare dati, eseguire `create_project_with_production.sql`. La funzione è già inclusa in `initialize.sql`: non rieseguire il reset per applicare questo aggiornamento.

## Script incorporabile per ambiente

Su un database esistente eseguire **`widget.sql`**, aggiornamento non distruttivo. Il reset `initialize.sql` include già lo schema widget. Dopo il deploy web, ogni card ambiente mostra lo script da copiare nel sito e il toggle Abilita/Disabilita, inizialmente disabilitato.

Chiunque visiti l’origine configurata, quando lo script è attivo, inserisce il nome e può creare, leggere, rispondere, cambiare stato/priorità, modificare ed eliminare le segnalazioni di quell’ambiente. La chiave nello snippet è pubblica, non un segreto amministrativo. Il backend e il database verificano ambiente, origine e stato del toggle a ogni operazione. La sessione dura un giorno; il pannello controlla il toggle ogni 10 secondi. Disabilitando il widget le nuove operazioni vengono bloccate subito e il pannello scompare al controllo successivo.

Screenshot opzionali in HTTPS (o localhost) con `getDisplayMedia`: scegliere la scheda corrente e consentire ogni acquisizione. Vengono evidenziati punto o elemento e fermate tutte le tracce della condivisione dopo la cattura. Annullando il consenso si può comunque inviare la segnalazione senza screenshot. La funzione può non essere disponibile su browser mobile.

Con CSP del sito autorizzare il dominio Reporty per `script-src`, `connect-src` e `img-src` (oltre ai domini delle immagini Supabase e `data:` per le anteprime); consentire gli stili del pannello isolato. Lo script non recupera lo stato interno React. Il bundle viene generato prima di `dev:web` e della build Vercel; `npm run build:widget` lo rigenera manualmente durante lo sviluppo.
