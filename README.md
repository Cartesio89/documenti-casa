# Documenti casa

App personale per i documenti di casa: bollette, condominio, assicurazioni, mutuo, lavori e ristrutturazioni, elettrodomestici e mobili (scontrini, pagamenti, garanzie), contratti e multe.

Online su **https://cartesio89.github.io/documenti-casa/**. Dal telefono: "Aggiungi a schermata Home".

## Dove stanno i dati
- Questo repo (pubblico) contiene solo il codice. Nessun dato personale.
- L'elenco dei documenti sta in `data.json` nel repo **privato** `documenti-casa-data`. Le foto e i PDF stanno nella cartella `files/` dello stesso repo.
- Ogni dispositivo si collega con un token GitHub fine-grained: solo il repo dati, permesso Contents read/write. Si incolla da Altro → Sincronizzazione.
- Foto scattate offline: restano sul dispositivo (IndexedDB) e si caricano appena c'è rete.

## Funzioni
- Foto multipagina dalla fotocamera, oppure upload di foto e PDF. Le immagini vengono compresse prima del caricamento.
- Lettura automatica di importo e date (OCR in italiano, nel browser). I valori sono solo proposte da confermare a mano. La prima volta il telefono scarica circa 6 MB, che poi restano nella cache del browser.
- Stati del documento:
  - Da pagare
  - Addebito (domiciliata)
  - Pagato
  - –

  La spunta sposta il documento in Pagati, che sono ordinati per categoria.
- Archivio per categoria, anno e sottocategoria. I lavori hanno ognuno la propria cartella. I tag sono liberi e riutilizzabili.
- Pulsante "Aggiungi a calendario": crea l'evento alle 9:00 del giorno di scadenza, con il secondo indirizzo come invitato.
- ZIP di tutti i documenti, con le cartelle come nell'app e un `elenco.csv`.
- Mail automatica: `apps-script/Code.gs` gira nella casella delle bollette e scrive `inbox.json` nel repo dati. L'app crea i documenti e li segna in rosso. Le istruzioni sono in Altro → Mail automatica.

## Limiti noti
- Calendario: niente sincronizzazione a due vie. Gli eventi creati dall'app vanno salvati a mano.
- Engie: la mail non contiene né importo né PDF, solo il link alla Digital Bill, che chiede il codice fiscale. L'app apre il link e copia il codice fiscale, se è salvato sul dispositivo. Il PDF va poi aggiunto a mano.
