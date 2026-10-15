# Reporty

**Reporty** semplifica la revisione di siti e applicazioni web. Clienti, designer e sviluppatori segnalano problemi direttamente sulla pagina e seguono feedback, risposte e correzioni da un unico sistema.

La revisione può avvenire con un **widget installato tramite script**, con l’**estensione per Chrome ed Edge desktop** oppure nel **Playground della dashboard**, che incorpora il sito e usa il widget.

**Dashboard:** [Apri Reporty](https://reporty-extension.vercel.app/)

**Estensione:** [Release su GitHub](https://github.com/Beylax/reporty-extension/releases) · [ZIP nella repository](https://github.com/Beylax/reporty-extension/blob/main/downloads/reporty-chrome.zip)

## 1. Accessi e permessi

Gli sviluppatori accedono alla dashboard con **Google**. Clienti e revisori ospiti non devono registrarsi e non accedono alla dashboard.

| Accesso | Consultazione | Operazioni sulle segnalazioni |
| --- | --- | --- |
| Sviluppatore in dashboard o con estensione collegata | Tutti i progetti e gli ambienti | Gestione completa, comprese modifica del testo ed eliminazione |
| Ospite tramite link ed estensione, senza nome | Segnalazioni autorizzate del progetto; sul sito sono mostrate quelle della pagina e dell’ambiente correnti | Sola consultazione |
| Ospite tramite link ed estensione, con nome | Come sopra | Creazione, risposte, cambio di stato e priorità; nessuna modifica del testo o eliminazione |
| Visitatore tramite widget, senza nome | Segnalazioni dell’ambiente con script abilitato | Sola consultazione |
| Visitatore tramite widget, con nome | Come sopra | Gestione completa delle segnalazioni dell’ambiente, comprese modifica del testo ed eliminazione |

La consultazione senza nome include pin, lista, dettagli, screenshot, risposte e allegati delle risposte. **Il nome viene richiesto alla prima azione di scrittura** e ricordato nella sessione. Annullando la richiesta non viene eseguita la modifica.

Tutti gli sviluppatori autenticati condividono l’accesso a tutti i progetti: possono crearli, modificarli ed eliminarli. Attualmente non esistono ruoli, membership o inviti sviluppatore da gestire.

## 2. Crea un progetto e configura gli ambienti

### Crea il progetto

1. Accedi alla dashboard con Google.
2. Clicca **Nuovo progetto**.
3. Inserisci il nome e l’**origine del sito**, ad esempio `https://www.example.com`.
4. Conferma con **Crea progetto**.

Reporty crea automaticamente l’ambiente **Produzione** e il relativo link ospite.

L’origine contiene protocollo, dominio ed eventuale porta, senza percorsi. `http://localhost:3000`, `http://localhost:3001` e `https://www.example.com` sono origini diverse.

La sidebar permette di cercare e aprire i progetti. Ogni progetto contiene le tab **Segnalazioni**, **Ambienti** e **Impostazioni**, oltre al pulsante **Playground**.

### Gestisci gli ambienti

Nella tab **Ambienti** puoi aggiungere, modificare o eliminare ambienti, ad esempio Produzione, Staging e Sviluppo. Le segnalazioni restano separate per ambiente.

Ogni card mostra nome, origine e **Apri sito**. Espandendola trovi i campi modificabili e la sezione **Script di revisione e link di invito**. Dopo la creazione, il nuovo ambiente si apre automaticamente per consentire la configurazione.

### Condividi il link ospite

Ogni ambiente ha un link generato automaticamente:

- **Copia link** copia l’invito da condividere con il revisore.
- **Rigenera link** revoca il precedente link di quell’ambiente e le sessioni associate. Gli altri link restano validi.

Il campo del link è in sola lettura: questo riguarda la modifica dell’URL nella dashboard, non i permessi del revisore dopo l’inserimento del nome.

## 3. Revisiona tramite script

Questa modalità permette di usare Reporty senza installare l’estensione.

1. Apri la card dell’ambiente e la sezione **Script di revisione e link di invito**.
2. Premi **Copia script** e inserisci lo snippet nelle pagine del sito da revisionare.
3. Usa **Verifica installazione** per controllare che il loader venga eseguito con la chiave dell’ambiente corretto.
4. Premi **Abilita** per rendere disponibile il pannello.

La revisione tramite script è inizialmente disabilitata. La verifica di installazione funziona anche prima dell’abilitazione e non la attiva automaticamente. Apre la pagina iniziale del sito e mostra l’esito con un toast; controlla il loader di quella pagina, non tutte le funzionalità o tutte le pagine del sito.

Chi visita le pagine con lo script attivo può consultare le segnalazioni senza nome. Alla prima creazione, risposta o modifica deve indicare il proprio nome.

**Chiunque possa accedere al sito con il widget attivo può consultare le segnalazioni e, dopo aver inserito il nome, gestire tutte quelle dell’ambiente.** Per questo la modalità è particolarmente adatta a staging e siti ad accesso controllato.

Premendo **Disabilita**, le operazioni vengono bloccate e il pannello scompare dalle pagine aperte entro circa 10 secondi.

### Usa lo script su localhost

Lo script di un ambiente abilitato funziona anche su `http://localhost` e `https://localhost`, con qualsiasi porta, senza creare un ambiente locale aggiuntivo.

Le segnalazioni vengono associate **all’ambiente dello script** e al percorso corrente; il contesto conserva l’URL localhost. Questa possibilità non crea una separazione dei dati locali: per mantenerli distinti usa lo script di un ambiente dedicato. Sugli altri domini è richiesta l’origine esatta configurata.

## 4. Revisiona con l’estensione

Questa modalità permette di usare Reporty sul sito senza inserirvi lo script. Il pannello è visibile nel browser di chi ha installato, collegato e abilitato l’estensione.

### Installa o aggiorna Reporty

1. Scarica lo ZIP dalle [Release di GitHub](https://github.com/Beylax/reporty-extension/releases) oppure dalla [repository](https://github.com/Beylax/reporty-extension/blob/main/downloads/reporty-chrome.zip).
2. Estrai lo ZIP in una cartella permanente.
3. Apri `chrome://extensions` oppure `edge://extensions`.
4. Attiva **Modalità sviluppatore**.
5. Premi **Carica estensione non pacchettizzata** e seleziona la cartella contenente `manifest.json`.

Non selezionare direttamente lo ZIP e non eliminare la cartella dopo l’installazione. Gli aggiornamenti sono manuali: estrai la nuova versione nella stessa cartella, premi **Ricarica** nella pagina delle estensioni e ricarica il sito.

### Collegamento per clienti e revisori

1. Installa l’estensione.
2. Apri il link ospite ricevuto.
3. Premi **Inizia revisione**: il nome non è necessario per iniziare a consultare.
4. Se richiesto, premi **Consenti e apri il sito** e accetta il permesso del browser sul dominio.

Il collegamento avviene automaticamente e il sito si apre con Reporty attivo. Il nome verrà chiesto alla prima azione di scrittura.

Le sessioni ospite sono separate per origine: aprire un invito per un altro sito non scollega quelli già collegati.

### Collegamento per sviluppatori

1. Accedi alla dashboard nel browser.
2. Apri il popup dell’estensione e premi **Collega**.
3. Conferma il collegamento nella pagina Reporty.
4. Apri il sito da revisionare e il popup dell’estensione.
5. Controlla progetto e ambiente, riconosciuti automaticamente dall’URL, scegli la posizione dei pulsanti e premi **Abilita su questo sito**.
6. Concedi il permesso del browser, se richiesto.

L’abilitazione viene ricordata per sito e ambiente. Il popup permette di aggiornare le impostazioni, cambiare collegamento o usare **Scollega**. Le sessioni dell’estensione durano 30 giorni; alla scadenza occorre ricollegarsi.

## 5. Crea una segnalazione

Sul sito, il pulsante flottante **+** è dedicato alla creazione. Il pulsante menu accanto apre la consultazione e diventa **×** quando la modale è aperta.

1. Premi **+**.
2. Scegli **Seleziona elemento** per collegare il feedback a un elemento della pagina, oppure **Pin libero** per indicare un punto.
3. Clicca l’elemento o il punto desiderato. Durante la selezione i clic non attivano link e pulsanti del sito; **Esc** annulla la selezione.
4. Inserisci la descrizione e scegli la priorità: **Alta**, **Media** o **Bassa**. La priorità iniziale è **Media**.
5. Controlla lo screenshot, se acquisito, e invia.

### Screenshot

Dopo la selezione Reporty avvia la richiesta di acquisizione, evidenziando l’elemento o il punto segnalato. **Ogni acquisizione richiede il consenso del browser alla condivisione della scheda corrente**, sia con l’estensione sia con lo script.

Puoi annullare la condivisione e inviare senza immagine, rimuovere l’anteprima oppure usare **Acquisisci screenshot**. Per ripetere la cattura devi essere sulla pagina e nella posizione originali.

Gli screenshot sono JPEG fino a **2,5 MB**, conservati in uno spazio privato e consultabili dagli utenti autorizzati. L’acquisizione richiede un browser desktop compatibile e un contesto HTTPS o localhost.

## 6. Consulta pin, dettagli e risposte

Estensione e widget mostrano lista e pin della **pagina e dell’ambiente correnti**. Le segnalazioni sono numerate dalla meno recente e i pin hanno il colore dello stato.

| Stato | Colore | Uso |
| --- | --- | --- |
| Aperta | Rosso | Feedback da prendere in carico |
| In lavorazione | Arancione | Correzione in corso |
| Validazione | Blu | Correzione da verificare |
| Chiusa | Verde | Lavoro concluso e verificato |

Nell’interfaccia attuale lo stato finale è chiamato **Chiusa**; corrisponde a “Risolta” nella precedente documentazione.

Passa sul pin per vedere un’anteprima e cliccalo per aprire il dettaglio. Puoi anche aprire la lista dal menu, cercare e applicare filtri multipli per **stato** e **priorità**. Le pillole permettono di rimuovere singoli filtri; l’ordinamento può seguire stato, priorità, data di apertura o aggiornamento.

Lista e dettaglio condividono la stessa modale, con ritorno alla lista. Nel dettaglio puoi:

- leggere descrizione, autore, date e risposte;
- usare **Mostra screenshot** per aprire l’immagine;
- usare il bersaglio **Vai alla segnalazione** per raggiungere il punto;
- cambiare stato e priorità, rispondere e, quando consentito, modificare il testo o eliminare la segnalazione.

### Risposte e allegati

Le risposte sono disponibili in dashboard, estensione e widget. Il testo della risposta è obbligatorio; puoi aggiungere **fino a 5 file**, ciascuno non vuoto e di massimo **2,5 MB**.

Le pillole mostrano nome e dimensione. PNG, JPEG, WebP e GIF riconosciuti come immagini si aprono con l’icona occhio; gli altri formati vengono scaricati. I file sono privati e vengono richiesti per la visualizzazione o il download solo al clic.

La risposta viene salvata dopo il completamento degli upload. Se l’invio fallisce, i file selezionati restano disponibili per riprovare.

### Visibilità e posizione di Reporty

Nelle impostazioni del pannello puoi:

- spostare menu e **+** in uno dei quattro angoli con **Posizione dei pulsanti**;
- attivare o disattivare **Mostra segnalazioni sulla pagina**;
- includere le segnalazioni chiuse con **Mostra risolte**;
- usare **Nascondi Reporty** per nascondere tutti i pin e ritrarre i pulsanti fuori dal bordo laterale.

Quando Reporty è nascosto, una linguetta con chevron permette di richiamare i comandi. Le preferenze di posizione e nascondimento vengono conservate nel browser per il sito e l’ambiente collegati.

## 7. Gestisci le correzioni dalla dashboard

Apri il progetto e la tab **Segnalazioni**. Su desktop la vista iniziale è **Kanban** e puoi passare a **Lista**; su mobile è disponibile la Lista con card selezionabili.

### Ricerca e filtri

La ricerca e i filtri si applicano all’intero insieme delle segnalazioni, comprese quelle non ancora caricate.

- **Priorità**, **Ambienti**, **Pagine** e **Utente** sono disponibili nelle due viste.
- **Stato** è disponibile nella Lista; nel Kanban gli stati corrispondono alle colonne.
- Il filtro **Utente** seleziona le segnalazioni create o aggiornate dalla persona scelta; non rappresenta un’assegnazione del lavoro.
- Le pillole sotto i controlli mostrano i filtri attivi e permettono di rimuoverli.

Su mobile, **Filtri** apre un pannello dal basso con le opzioni multiselezione.

### Vista Lista

La tabella desktop mostra descrizione, stato, priorità, ambiente/pagina, autore e date di apertura e aggiornamento. Clicca la descrizione per aprire il dettaglio.

Le intestazioni ordinano le rispettive colonne; un secondo clic inverte il verso. L’ordine iniziale è per stato, da Aperta a Chiusa. A parità di stato vengono prima le priorità più alte, poi le segnalazioni meno recenti.

La Lista è paginata in blocchi da **20 segnalazioni**.

### Vista Kanban

Le quattro colonne sono **Aperta**, **In lavorazione**, **Validazione** e **Chiusa**.

- Trascina una card in un’altra colonna per salvarne il nuovo stato.
- Usa il controllo di priorità nella card per cambiarla.
- Clicca la card per aprire il dettaglio.
- Usa **Ordina per** e la freccia per scegliere priorità o date e invertire la direzione.

L’ordine iniziale è Alta → Media → Bassa, con le segnalazioni meno recenti prima a parità di priorità. Ogni colonna carica progressivamente altre card quando raggiungi il fondo.

### Azioni in blocco

Nella **Lista**, seleziona una o più segnalazioni tramite checkbox. La selezione generale comprende **tutti i risultati filtrati, anche nelle altre pagine**.

La barra delle azioni permette di cambiare stato, cambiare priorità o eliminare le segnalazioni selezionate. L’eliminazione richiede conferma e comprende le risposte e i relativi file.

La selezione resta passando tra pagine e cambiando ordinamento; viene azzerata cambiando ricerca, filtri o vista. Se un’operazione riesce solo in parte, le segnalazioni fallite restano selezionate per riprovare.

### Dettaglio e apertura del sito

Dal dettaglio puoi consultare screenshot e risposte, aggiornare stato e priorità, modificare il testo ed eliminare la segnalazione.

**Apri pagina originale** apre il sito e, quando Reporty è attivo, scorre fino al punto ed evidenzia il pin. Il dettaglio si apre cliccando il pin.

Lista e Kanban controllano gli aggiornamenti ogni **10 secondi** e al ritorno sulla scheda, conservando vista, filtri, ordinamento e posizione di scorrimento. I controlli periodici si sospendono quando la scheda è nascosta.

## 8. Usa il Playground

Il **Playground** permette di consultare il sito e le sue segnalazioni dentro la dashboard, con viewport diverse.

### Requisiti

- Lo script Reporty deve essere installato e abilitato nell’ambiente.
- Il sito deve consentire l’incorporamento dalla dashboard: le intestazioni `Content-Security-Policy: frame-ancestors` e `X-Frame-Options` non devono bloccarlo.

Il Playground usa **l’identità e i permessi del widget**. La sessione sviluppatore della dashboard non viene trasferita al sito; per scrivere nel widget può quindi essere richiesto il nome.

### Navigazione e segnalazioni

1. Apri un progetto e premi **Playground** accanto alle tab.
2. Seleziona l’ambiente.
3. Apri una delle tab delle pagine con segnalazioni. Se non ce ne sono, viene proposta la pagina iniziale dell’ambiente.
4. Usa la sidebar per cercare e filtrare le segnalazioni della pagina corrente per stato e priorità.
5. Seleziona una segnalazione per aprirne il dettaglio nel widget incorporato. Per crearne una usa il **+** del widget.

Non è prevista l’aggiunta manuale di URL. Le pagine già aperte restano caricate quando cambi tab; chiudere il Playground o cambiare ambiente avvia una nuova sessione.

### Viewport e spazio di lavoro

| Preset | Dimensioni |
| --- | --- |
| Desktop | 1440 × 900 px |
| Tablet | 768 × 1024 px |
| Mobile | 390 × 844 px |

Puoi impostare dimensioni personalizzate da **240 a 3840 px**. Ogni tab conserva la propria viewport. La pagina viene ridotta visivamente per entrare nello spazio disponibile mantenendo le dimensioni CSS impostate.

**Adatta alla larghezza** usa invece lo spazio disponibile a scala 100% e si aggiorna al ridimensionamento della finestra o della sidebar.

Puoi nascondere e riaprire la sidebar conservando ricerca e filtri. **Schermo intero** nasconde intestazione, tab, toolbar e sidebar; **Esci da schermo intero** ripristina la configurazione precedente senza ricaricare la pagina.

### Screenshot nel Playground

1. Avvia la cattura dal widget.
2. Premi **Condividi scheda e acquisisci** nella dashboard.
3. Autorizza la condivisione della scheda corrente in Chrome o Edge desktop.

Reporty ritaglia solo la pagina incorporata, con il punto evidenziato. Cambiare pagina, viewport o tab annulla la cattura.

Se il sito o il widget non si collegano, controlla script, abilitazione e restrizioni sugli iframe, oppure apri la pagina esternamente. Una navigazione fuori dall’origine dell’ambiente interrompe il collegamento.

## 9. Notifiche

La campanella è disponibile nella dashboard, nell’estensione e nel widget. Reporty genera notifiche per:

- nuove segnalazioni;
- cambi effettivi di stato;
- nuove risposte.

I cambi di priorità e i salvataggi senza cambio di stato non generano notifiche. Le notifiche raggiungono gli sviluppatori registrati e le sessioni ospite del progetto con link valido, incluso chi esegue l’azione.

### Nella dashboard

Il pannello comprende tutti i progetti e parte dal filtro **Non lette**. Puoi filtrare per progetto, ambiente, stato registrato nell’evento e lettura.

Cliccare una notifica la segna come letta e apre il progetto con il dettaglio della segnalazione. **Segna come letta** aggiorna il badge senza aprire il dettaglio; **Segna tutte come lette** agisce su tutte le notifiche personali, anche non ancora caricate.

### Nell’estensione e nel widget

La lista e il badge riguardano la **pagina e l’ambiente correnti**. Sono disponibili filtri per stato e lettura, indipendenti da quelli delle segnalazioni. **Segna tutte come lette** riguarda solo questa pagina e questo ambiente.

La lettura è personale: per lo stesso sviluppatore è condivisa tra dashboard ed estensione; per gli ospiti è legata alla sessione.

Le notifiche vengono controllate ogni **10 secondi** mentre la scheda è visibile. Nuovi arrivi non letti producono un toast; lo storico al primo caricamento resta silenzioso. Le liste caricano blocchi da 20 con scorrimento progressivo e pulsante **Carica altre notifiche**.

## 10. Impostazioni del progetto e preferenze

Nella tab **Impostazioni** puoi rinominare il progetto, consultare **Utenti** ed eliminare il progetto dalla **Zona pericolosa**.

L’elenco Utenti mostra sviluppatori e ospiti che hanno partecipato al progetto, prima gli sviluppatori e poi gli ospiti. Gli ospiti sono identificati dalla sessione; chi consulta senza nome non compare tra i partecipanti. Questo elenco non gestisce ruoli o assegnazioni.

Dashboard, estensione e widget supportano il **tema chiaro e scuro**. Inizialmente seguono il dispositivo; una scelta esplicita viene conservata nel browser. Popup e pannello dell’estensione condividono la preferenza; dashboard e widget la conservano per origine.

Le operazioni mostrano conferme o errori tramite toast. I caricamenti usano skeleton delle sezioni in attesa; le interfacce supportano navigazione da tastiera e preferenza di movimento ridotto.

### Audit tecnico

Gli sviluppatori possono aprire la pagina **Audit Supabase** dall’icona attività nella sidebar. Mostra metriche di database, Storage, screenshot e richieste API, con aggiornamento manuale e collegamento alla pagina Usage di Supabase.

La disponibilità dei dati richiede una configurazione del backend. Una metrica non disponibile viene indicata come tale; per le quote ufficiali e i consumi del servizio va consultata la pagina Usage.

## 11. Contesto delle pagine e limiti

- Una pagina è identificata da **ambiente e percorso**. I parametri query restano come contesto e non creano pagine distinte.
- I percorsi dei router hash, ad esempio `#/prodotti` e `#/contatti`, identificano pagine diverse; un normale frammento come `#contatti` non crea una pagina separata.
- Reporty conserva URL, informazioni sulla viewport, posizione di scorrimento e riferimento all’elemento o al punto. Non acquisisce né ripristina stato interno React, cookie o storage del sito.
- Se un elemento è stato rimosso, modificato o non è identificabile con sicurezza, il pin può non comparire. La segnalazione resta consultabile nella lista, insieme allo screenshot originale.
- Un pin libero usa coordinate della pagina: se il layout cambia, può non corrispondere più allo stesso contenuto.
- La selezione degli elementi interni a iframe e shadow DOM non è disponibile in questa versione.
- La vista Mobile del Playground simula le dimensioni della pagina; l’estensione e gli screenshot richiedono comunque browser desktop compatibili.

## 12. Risoluzione dei problemi

| Problema | Cosa controllare |
| --- | --- |
| L’estensione non compare sul sito | Verifica installazione, collegamento, origine riconosciuta e abilitazione; concedi il permesso sul dominio e ricarica il sito |
| Il link ospite non funziona più | Potrebbe essere stato rigenerato: chiedi il link corrente dell’ambiente |
| Il widget non compare | Verifica la presenza dello script corretto e il toggle Abilita; usa Verifica installazione |
| Verifica installazione fallisce | Consenti il popup, lascia aperta la scheda e controlla la chiave dello script; il controllo scade dopo circa 15 secondi |
| Non riesci a scrivere | Inserisci il nome quando richiesto e verifica validità del collegamento e abilitazione dello script |
| Non trovi una segnalazione | Controlla ambiente, percorso, ricerca, filtri e visibilità delle segnalazioni chiuse |
| Il bersaglio non trova l’elemento | Il DOM potrebbe essere cambiato: consulta descrizione e screenshot |
| Lo screenshot non viene acquisito | Usa HTTPS o localhost e un browser desktop compatibile; condividi la scheda corrente, non una finestra o l’intero schermo |
| Un allegato non viene inviato | Controlla testo della risposta, massimo 5 file e limite di 2,5 MB per file |
| Il Playground resta vuoto o non si collega | Controlla script abilitato, origine dell’ambiente e restrizioni del sito sugli iframe; prova l’apertura esterna |

## 13. Sviluppi futuri da valutare

Queste voci restano proposte e non sono funzionalità disponibili:

- **Permessi e ruoli per progetto**, per superare l’attuale accesso condiviso di tutti gli sviluppatori.
- **Assegnazione delle segnalazioni a un utente**, per indicare chi ha in carico il lavoro.
- **Notifiche via email**, in aggiunta alle notifiche già presenti nell’app.
- **Integrazione HubSpot**, con collegamento delle segnalazioni ai ticket e possibile organizzazione di una pipeline per progetto.

L’elenco dei partecipanti, comprese le sessioni ospite identificate, e le notifiche in app sono già disponibili.
