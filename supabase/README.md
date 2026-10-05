# Configurazione Supabase

## Autenticazione locale

In Authentication → URL Configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

In Authentication → Sign In / Providers abilitare Email e Google. Per Google creare le credenziali OAuth nella Google Cloud Console e usare il callback indicato da Supabase. Client secret Google resta nel pannello Supabase.

Il link email usa PKCE: aprirlo nello stesso browser in cui è stato richiesto.

## Database

La migrazione `migrations/202610050001_initial.sql` è destinata a un progetto nuovo. Eseguirla nel SQL Editor oppure tramite Supabase CLI dopo aver collegato il progetto. Non è stata applicata automaticamente.

Include progetti, membri, ambienti, segnalazioni, risposte, inviti e sessioni ospiti; RLS separa i progetti. Le migrazioni successive attivano le API di gestione, gli inviti e le segnalazioni. I bucket restano privati: non aggiungere policy pubbliche.

Dopo il primo accesso, per nominare l'amministratore generale eseguire nel SQL Editor, sostituendo l'UUID con quello dell'utente nella sezione Authentication → Users:

```sql
insert into public.platform_admins(user_id) values ('UUID-UTENTE');
```

Gli utenti non possono assegnarsi questo ruolo tramite i client.

## Gestione progetti e ambienti

Dopo la migrazione iniziale eseguire `migrations/202610050002_project_management.sql` nel SQL Editor. Non rieseguire la migrazione iniziale. Questa seconda migrazione consente agli amministratori di rinominare progetti e aggiungere/modificare ambienti, mantenendo immutabili gli identificativi e la proprietà dei record.

Verificare dalla dashboard: creare un progetto, aggiungere `https://example.com` e `http://localhost:3000`, modificarne i nomi e provare a inserire una seconda volta lo stesso dominio. I membri leggono gli ambienti; solo amministratori del progetto e amministratore generale possono modificarli.

## Inviti membri e revisori ospiti

Eseguire `migrations/202610050003_invitations.sql` dopo le prime due migrazioni. Nel dettaglio progetto gli amministratori trovano membri, inviti e link ospite.

- Invito membro: inserire l'email, creare il link e condividerlo manualmente. Accettazione dopo login con la stessa email verificata. Il link è monouso, con accettazione idempotente per il membro già aggiunto; può essere revocato prima dell'accettazione. Revocare un invito non rimuove un membro già entrato.
- Invito ospite: link riutilizzabile fino a revoca, nessun login, solo nome. Crea una sessione ospite separata dall'account Supabase Auth e senza accesso alla dashboard. Revocando il link si bloccano tutte le sessioni create da quell'invito.
- I link sono mostrati solo al momento della creazione. Il database conserva hash SHA-256: per sostituire un link perso, revocarlo e generarne uno nuovo.
- La pagina ospite conferma l'accesso; il popup dell'estensione permette di collegare la sessione e lavorare sulle segnalazioni.
- Nell'MVP anche i clienti installano l'estensione. Il team usa dashboard ed estensione; i clienti non accedono alla dashboard. La modalità senza estensione tramite script è prevista per una fase successiva.
- Non è richiesto un service-role secret: le funzioni SQL controllano i permessi e offrono agli ospiti solo operazioni limitate.

Verifica manuale: invitare un secondo account, provare prima con un'email diversa, poi con quella corretta; aprire un link ospite in incognito, inserire un nome e revocare il link dalla dashboard. Ricaricando la pagina ospite l'accesso deve risultare revocato.

`npm run test:db` esegue tutte le migrazioni su PostgreSQL locale in memoria (PGlite), con fixture per Auth e Storage. Verifica permessi, email, token nascosti e revoca senza contattare il progetto Supabase remoto.

## Collegamento dell'estensione

Eseguire `migrations/202610050004_extension_sessions.sql` dopo la terza migrazione. Aggiunge codici monouso di collegamento (60 secondi) e sessioni dedicate all'estensione (30 giorni). Le API verificano a ogni richiesta l'accesso corrente agli ambienti: rimozione di una membership o revoca di un invito ha effetto anche sulle sessioni già collegate.

Seguire [le istruzioni estensione](../apps/extension/README.md) per installazione e verifica. Non è richiesta una chiave service-role. I test locali includono riutilizzo del codice, token privati e revoca delle sessioni.

## Segnalazioni e screenshot

Eseguire `migrations/202610050005_reports.sql` dopo la quarta migrazione. Le operazioni sulle segnalazioni passano attraverso una funzione che verifica sessione, progetto, ambiente e permessi a ogni chiamata. Gli ospiti possono creare, leggere e rispondere; i membri possono cambiare stato; membri autori e amministratori possono modificare ed eliminare. Il caricamento della propria immagine è consentito anche all'autore ospite.

Per gli screenshot aggiungere in `apps/web/.env.local` (e poi nelle variabili server Vercel):

```dotenv
SUPABASE_SECRET_KEY=chiave-segreta-server-supabase
```

Usare la Secret key da Settings → API Keys (oppure la legacy service-role key). Non usare il prefisso NEXT_PUBLIC e non inserire la chiave nell'estensione. Riavviare Next.js dopo aver configurato la variabile. La chiave è usata solo per Storage, dopo un controllo di accesso tramite RPC/RLS; le query applicative mantengono la sessione dell'utente.

Il bucket `screenshots` è quello creato nella prima migrazione, privato. I percorsi sono determinati dal server con progetto e UUID segnalazione. Le immagini visibili sono servite con URL firmati validi per 60 secondi e senza cache del server. Le richieste screenshot JPEG sono limitate a 2,5 MB per rispettare il limite delle funzioni Vercel. Se l'upload fallisce dopo il salvataggio, il commento resta salvato e viene mostrato un avviso. La rimozione dei file dopo l'eliminazione di una segnalazione è best effort; un errore Storage può lasciare un file privato orfano.

Verifica: creare una segnalazione con elemento e una con pin libero; rimuovere uno screenshot prima dell'invio; aprire la pagina con un secondo membro e controllare pin e commenti; cambiare stato e rispondere; verificare dalla dashboard filtri e immagini. Cambiare o rimuovere l'elemento nel sito e verificare che la segnalazione resti nella lista con indicazione di elemento non trovato.
