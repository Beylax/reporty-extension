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
