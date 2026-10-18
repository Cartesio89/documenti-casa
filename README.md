# Documenti casa

App personale per i documenti di casa: bollette, condominio, assicurazioni, mutuo, lavori e ristrutturazioni, elettrodomestici e mobili (scontrini, pagamenti, garanzie), contratti e multe.

Online su **https://cartesio89.github.io/documenti-casa/**. Si installa come app (icona casa con chiave inglese, senza barra del browser):
- Android/Chrome: menu ⋮ → *Installa app*;
- iPhone/Safari: Condividi → *Aggiungi alla schermata Home*.

L'app funziona anche offline. Documenti e foto inseriti senza rete restano sul telefono e si sincronizzano appena torna la connessione.

## Dove stanno i dati
- Questo repo (pubblico) contiene solo il codice. Nessun dato personale.
- L'elenco dei documenti sta in `data.json` nel repo **privato** `documenti-casa-data`. Le foto e i PDF stanno nella cartella `files/` dello stesso repo.
- Ogni dispositivo si collega con un token GitHub fine-grained: solo il repo dati, permesso Contents read/write. Si incolla da Altro → Sincronizzazione.
- Foto scattate offline: restano sul dispositivo (IndexedDB) e si caricano appena c'è rete.

## Funzioni
- Pulsante **+** in ogni sezione: inserimento manuale (campi e note), con foto e file facoltativi.
- Foto multipagina dalla fotocamera, oppure upload di foto e PDF. Le immagini vengono compresse prima del caricamento.
- PDF: l'app ne legge il testo e propone da sola importo e scadenza.
- Foto: OCR in italiano nel telefono, su richiesta. Motore e dizionario sono in `vendor/ocr` (circa 6 MB, caricati solo al primo uso). Tutti i valori proposti vanno confermati a mano.
- **Condividi → Documenti** (Android, con l'app installata): un PDF o una foto condivisi da un'altra app aprono un documento nuovo, oppure si allegano a una bolletta già arrivata per mail.
- **Doppioni**: l'app avvisa al salvataggio se il documento sembra già presente. Criteri:
  - stesso file;
  - stessa categoria, stesso importo e scadenza o data vicina;
  - stessa categoria e data vicina tra una bolletta arrivata dalla mail e una inserita a mano.

  I sospetti restano segnati con "Doppione?" e sono raccolti in Altro → Possibili doppioni, dove si elimina quello in più o si segnano come diversi.
- **Abitazioni**: con una sola casa non viene chiesto nulla. Dalla seconda in poi si sceglie la casa per ogni documento (le multe escluse), con filtro in Pagamenti e Archivio.
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
- Engie: la mail contiene solo il link alla Digital Bill, protetta dal codice fiscale. Il flusso è:
  1. apri il link dall'app (il codice fiscale viene copiato negli appunti);
  2. scarica il PDF;
  3. Condividi → Documenti: importo e scadenza vengono proposti e tu li confermi.
