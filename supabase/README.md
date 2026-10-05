# Configurazione Supabase

## Autenticazione locale

In Authentication → URL Configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

In Authentication → Sign In / Providers abilitare Email e Google. Per Google creare le credenziali OAuth nella Google Cloud Console e usare il callback indicato da Supabase. Client secret Google resta nel pannello Supabase.

Il link email usa PKCE: aprirlo nello stesso browser in cui è stato richiesto.

## Database

La migrazione `migrations/202610050001_initial.sql` è destinata a un progetto nuovo. Eseguirla nel SQL Editor oppure tramite Supabase CLI dopo aver collegato il progetto. Non è stata applicata automaticamente.

Include progetti, membri, ambienti, segnalazioni, risposte, inviti e sessioni ospiti; RLS separa i progetti. Inviti e sessioni sono riservati al server e screenshot privati. Le API di gestione, gli ospiti e l'upload screenshot sono ancora da implementare: non aggiungere policy pubbliche per aggirare queste restrizioni.

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
- La pagina ospite conferma l'accesso; il trasferimento della sessione all'estensione e la lettura/scrittura delle segnalazioni saranno implementati nel blocco estensione.
- Nell'MVP anche i clienti installano l'estensione. Il team usa dashboard ed estensione; i clienti non accedono alla dashboard. La modalità senza estensione tramite script è prevista per una fase successiva.
- Non è richiesto un service-role secret: le funzioni SQL controllano i permessi e offrono agli ospiti solo operazioni limitate.

Verifica manuale: invitare un secondo account, provare prima con un'email diversa, poi con quella corretta; aprire un link ospite in incognito, inserire un nome e revocare il link dalla dashboard. Ricaricando la pagina ospite l'accesso deve risultare revocato.

`npm run test:db` esegue tutte le migrazioni su PostgreSQL locale in memoria (PGlite), con fixture per Auth e Storage. Verifica permessi, email, token nascosti e revoca senza contattare il progetto Supabase remoto.
