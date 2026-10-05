# Estensione Reporty

Chrome ed Edge desktop, WXT + React e shadcn/ui. Non richiede script nel sito.

## Distribuzione senza marketplace

Dalla root genera lo ZIP collegato alla piattaforma di produzione:

```sh
npm run zip:extension:production
```

WXT crea `apps/extension/.output/reportyextension-0.0.0-chrome.zip` (il nome cambia con la versione). Lo ZIP pronto da condividere nella repo si trova in [`downloads/reporty-chrome.zip`](../../downloads/reporty-chrome.zip). Il comando aggiorna automaticamente questa copia: pubblicare poi le modifiche su GitHub. Puoi inoltre allegare lo ZIP a una Release GitHub.

Per installarlo:

1. Scaricare lo ZIP e **estrarlo** in una cartella permanente.
2. Aprire `chrome://extensions` oppure `edge://extensions`.
3. Abilitare **Modalità sviluppatore**.
4. Premere **Carica estensione non pacchettizzata** e selezionare la cartella estratta contenente `manifest.json`.
5. Aprire Reporty e premere **Collega**.

Non selezionare direttamente lo ZIP e non eliminare la cartella estratta dopo l'installazione. Gli aggiornamenti sono manuali: estrarre la nuova versione nella stessa cartella e premere Ricarica nella pagina delle estensioni.

## Preparazione locale

1. Applicare le migrazioni Supabase fino a `202610050005_reports.sql`.
2. Avviare la dashboard con `npm run dev:web` dalla root.
3. Se il servizio non è su `http://localhost:3000`, creare `apps/extension/.env` copiando `.env.example` e impostare `WXT_API_URL`. Ricostruire l'estensione dopo ogni cambio di URL.
4. Dalla root eseguire `npm run build --workspace=@reporty/extension`.
5. Aprire `chrome://extensions` oppure `edge://extensions`, abilitare Modalità sviluppatore e usare Carica estensione non pacchettizzata selezionando `apps/extension/.output/chrome-mv3`.

Per lo sviluppo con aggiornamenti automatici: `npm run dev:extension` dalla root.

## Collegamento

- Team: accedere alla dashboard nel browser, aprire il popup dell'estensione, premere Collega e confermare nella pagina aperta.
- Cliente: aprire il link ospite, inserire il nome, poi premere Collega nel popup. Scegliere il progetto ospite nella pagina e confermare. Non occorre un account.
- Tornare al popup dopo la conferma. I siti accessibili sono elencati nel popup; aprirne uno.
- Sul sito, aprire il popup, scegliere progetto/ambiente e posizione, poi Abilita su questo sito. Il browser chiede il permesso di accesso a quel dominio.
- L'abilitazione viene ricordata per origine e ambiente. Protocolli e porte restano distinti anche se il permesso browser è assegnato a livello di dominio.
- Scollega revoca la sessione corrente e rimuove le abilitazioni locali. Le sessioni durano 30 giorni; poi occorre ricollegare. La revoca di un invito ospite blocca subito le API; il pulsante in una pagina aperta si aggiorna entro 30 secondi.

Il codice di collegamento dura 60 secondi ed è monouso. Il trasferimento è accettato solo dalla pagina Reporty e dalla scheda aperta dal popup, con verifica della richiesta avviata dall'utente. La sessione è conservata nello storage riservato ai contesti fidati; non viene inviata al sito revisionato.

## Stato e verifica

Sono implementati collegamento membri/ospiti, elenco ambienti, abilitazione per sito, pulsante posizionabile, selezione elemento o pin libero, commenti e risposte, stati, modifica/eliminazione e screenshot. Configurare SUPABASE_SECRET_KEY solo sul backend per caricare e leggere immagini private.

Dopo ogni build ricaricare l’estensione dalla pagina del browser e ricaricare il sito. Il + apre la lista della pagina. Scegliere Seleziona elemento o Pin libero; selezionare il punto, scrivere il commento, controllare o rimuovere lo screenshot e inviare. Durante la selezione i click sulla pagina sono intercettati per non attivare link e pulsanti. Esc annulla la selezione.

Lo screenshot riguarda solo la scheda attiva e l’area visibile. Se il permesso activeTab non è disponibile dopo una navigazione, riaprire il popup sul sito e riprovare; è possibile inviare senza immagine. Sono accettati screenshot JPEG fino a 2,5 MB, così la richiesta resta entro il limite di payload Vercel.

Gli ancoraggi DOM usano selettori e un estratto del testo. Se l’elemento non è univoco, visibile o coerente con il testo originale il pin non viene mostrato; la segnalazione resta nella lista. I pin liberi usano coordinate documento e possono spostarsi rispetto al contenuto se il layout cambia. Nessuno stato React, cookie o storage del sito viene salvato o ripristinato. Elementi interni a iframe e shadow DOM non sono selezionabili in questa versione.

Verificare manualmente Chrome ed Edge: collegamento, attivazione, ricaricamento del sito, cambio posizione, disabilitazione e scollegamento. Per gli ospiti provare anche la revoca dalla dashboard. Build e test database non sostituiscono questa verifica nel browser.
