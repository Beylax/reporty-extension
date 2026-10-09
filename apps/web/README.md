This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# GitHub e Claude Managed Agents

La dashboard usa una GitHub App per collegare repository e una chiave Claude centrale per eseguire i task in sandbox Anthropic. Managed Agents è una API beta; l’SDK è fissato alla versione verificata dai test.

## Preparazione del database

Applicare `supabase/github_claude.sql` una volta su un database Reporty esistente, dopo le patch precedenti. `supabase/initialize.sql` incorpora la funzionalità per inizializzazioni da zero ma elimina dati e account. Il codice non esegue migrazioni remote automaticamente.

## GitHub App

Registrare una GitHub App e impostare:

- Homepage: `https://reporty-extension.vercel.app`.
- Callback OAuth: `https://reporty-extension.vercel.app/api/github/callback`.
- Setup URL facoltativo dopo installazione: `https://reporty-extension.vercel.app/api/github/connect`.
- Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, **Metadata: Read**. Non sono necessari permessi Actions o Administration.
- Installazione sulle sole repository che si desidera rendere disponibili a Reporty. I webhook GitHub non sono richiesti.

Sul server configurare `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` (PEM, anche con newline rappresentati da `\n`) e `GITHUB_COOKIE_KEY` (32 byte casuali in base64, per esempio generati con `openssl rand -base64 32`). Per sviluppo locale aggiungere il relativo callback nella configurazione della App e impostare coerentemente `NEXT_PUBLIC_APP_URL`.

Lo sviluppatore usa **Collega GitHub**, poi **Carica repository**. Vengono proposte solo repository accessibili tramite l’App su cui il suo account GitHub può scrivere. Il server ripete questa verifica al salvataggio e verifica l’esistenza del branch. Il token OAuth è conservato per 30 minuti in un cookie cifrato, HttpOnly e legato all’utente Reporty: scaduto questo intervallo bisogna ricollegare GitHub per modificare il collegamento. I task successivi usano token di installazione generati sul server, limitati alla singola repository. Il collegamento salvato è condiviso con tutti gli sviluppatori Reporty, come gli altri dati del progetto.

## Claude e backend

Nella Console Anthropic creare un agente **singolo** con il modello desiderato e un ambiente cloud per Managed Agents. L’ambiente deve consentire i package manager necessari ai test e l’accesso GitHub per il checkout; preferire networking `limited` con host espliciti. Non configurare credenziali di produzione, altre repository, MCP o agenti secondari. Reporty imposta per sessione istruzioni e strumenti filesystem/bash, disabilita web search/fetch e non collega vault.

Variabili server richieste:

| Variabile | Uso |
| --- | --- |
| `ANTHROPIC_API_KEY` | Chiave centrale del workspace Anthropic |
| `ANTHROPIC_AGENT_ID` | Agente configurato nella Console |
| `ANTHROPIC_ENVIRONMENT_ID` | Ambiente cloud Managed Agents |
| `SUPABASE_AUTOMATION_KEY` | Chiave segreta Supabase dedicata, con ruolo service_role, mai nel client |
| `ANTHROPIC_WEBHOOK_SIGNING_KEY` | Secret di firma del webhook Anthropic |
| `CRON_SECRET` | Secret casuale per il processo di riconciliazione |
| `CLAUDE_TASK_BUDGET_CENTS` | Facoltativa: budget per task in centesimi USD, intero positivo (es. `500` = $5) |

Mantenere `SUPABASE_SECRET_KEY` per gli screenshot. Nessuna di queste chiavi deve avere prefisso `NEXT_PUBLIC_`, essere inviata al browser o finire nel repository. Senza `CLAUDE_TASK_BUDGET_CENTS` la sessione non ha un limite monetario impostato da Reporty. Il limite Anthropic viene verificato fra richieste del modello: l’ultima richiesta ammessa può superarlo leggermente. Il worker interrompe sessioni più lunghe di un’ora alla prima riconciliazione successiva.

Registrare nella Console Anthropic un webhook HTTPS a `/api/claude/webhook` per almeno `session.status_run_started`, `session.status_idled`, `session.status_rescheduled`, `session.status_terminated`, `session.budget_reached`, `session.deleted`. Il backend verifica firma e freschezza e rilegge la sessione: consegne duplicate o fuori ordine non costituiscono la fonte dello stato.

`apps/web/vercel.json` configura un cron al minuto verso `/api/claude/reconcile`. Serve [Vercel Pro o Enterprise](https://vercel.com/docs/cron-jobs/usage-and-pricing) per questa frequenza (Hobby ammette solo un’esecuzione al giorno); altrimenti configurare un scheduler esterno che invii GET allo stesso endpoint con `Authorization: Bearer <CRON_SECRET>` e rimuovere la definizione Vercel prima del deploy. Il cron è necessario anche con i webhook: recupera callback perse, sessioni create prima di una disconnessione e file finali disponibili in ritardo. Ogni invocazione lavora su tre task, protetti da lease di 180 secondi; le route hanno durata massima di 120 secondi. La dashboard legge lo stato persistito ogni 5 secondi.

## Esecuzione e limiti

L’assegnazione salva uno snapshot di descrizione, contesto DOM/pin, screenshot e commenti esistenti, blocca la segnalazione e la porta In lavorazione. I commenti successivi rimangono disponibili agli utenti ma non cambiano il task già partito. Un vincolo database impedisce due task attivi sulla stessa segnalazione.

Claude esegue il checkout del commit scelto con un token **in sola lettura**, modifica i file e scrive un artefatto JSON. Il backend convalida l’artefatto e usa un token separato con scrittura per creare un commit, un branch `reporty/claude-<task-id>` e una PR **pronta per revisione**. Non modifica il branch di destinazione e non esegue merge o deploy. La PR riporta le verifiche dichiarate da Claude, che vanno comunque controllate in revisione/CI.

Questa versione pubblica fino a 60 file di testo UTF-8 e 2 MB di contenuti per task, incluse cancellazioni. Non pubblica binari, `.env*`, directory `.git` o workflow GitHub Actions. Dipendenze private e test che richiedono segreti vanno considerati non disponibili nell’ambiente; Claude deve dichiarare i test non eseguibili. Task che non producono un artefatto valido falliscono senza PR.

Il backend conserva session ID, branch e commit base per riprendere i tentativi senza ricreare la PR. Una risposta incerta alla creazione della sessione viene ricercata tramite metadata; non viene ritentata ciecamente. Dopo 10 minuti senza una sessione rintracciabile il task fallisce. Una sessione eventualmente non rintracciata ha comunque solo accesso in lettura e non può pubblicare. Le sessioni concluse con successo restano inattive su Anthropic per consultazione; definire una politica di conservazione nel workspace Anthropic.

Alla creazione verificata della PR la segnalazione passa in **Validazione** e si sblocca. In caso di fallimento ritorna allo stato precedente. Il merge della PR non chiude automaticamente la segnalazione. Stato, priorità, testo, screenshot ed eliminazione sono bloccati nel database durante il task, anche per estensione e widget; i commenti restano consentiti. La cancellazione di ambienti/progetti e il cambio di repository/origine sono impediti finché contengono task attivi.

## Verifica e attivazione

Eseguire dalla root `npm run typecheck`, `npm run lint`, `npm test` e `npm run build --workspace=@reporty/web` (aggiungere `-- --webpack` se Turbopack è impedito dal sandbox). `npm run test:automation` simula l’HTTP GitHub/Anthropic e verifica budget, firme webhook, recupero dopo timeout, validazione dei risultati e PR senza duplicati; `npm run test:db` verifica la migrazione senza perdita di dati e i permessi anche per ospiti.

Per la verifica reale, dopo migrazione e configurazione/deploy autorizzati, collegare una repository di prova e assegnare una segnalazione. Verificare PR, branch di destinazione, commenti durante l’esecuzione, blocco da dashboard/estensione/widget, ricaricamento pagina e completamento a dashboard chiusa. Verificare anche revoca accesso GitHub e budget esaurito. Le chiamate reali consumano credito Anthropic e scrivono branch/PR nella repository scelta.

Riferimenti: [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview), [repository](https://platform.claude.com/docs/en/managed-agents/github), [file di sessione](https://platform.claude.com/docs/en/managed-agents/files), [budget](https://platform.claude.com/docs/en/managed-agents/budgets), [webhook](https://platform.claude.com/docs/en/managed-agents/webhooks), [GitHub App](https://docs.github.com/en/rest/apps/apps).
