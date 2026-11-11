# ReVesti

Negozio online di abbigliamento usato: *Dai una seconda vita ai vestiti*.

- **Vetrina** (`index.html`): reparti, filtri, ricerca, schede prodotto con taglie e foto, carrello. L'ordine si invia su WhatsApp o per email.
- **Gestione** (`/admin`): pannello protetto da password per aggiungere e modificare prodotti, foto, reparti e dati del negozio. Ogni modifica diventa un commit su GitHub e Netlify aggiorna il sito da solo.

## Struttura

| Percorso | Contenuto |
|---|---|
| `data/prodotti.json` | catalogo prodotti |
| `data/reparti.json` | elenco dei reparti |
| `data/negozio.json` | nome, titolo, WhatsApp, email |
| `images/uploads/` | foto caricate dal pannello (ridimensionate a 1600 px) |
| `admin/index.html` | pannello di gestione |
| `netlify/functions/admin.mjs` | controlla la password e salva su GitHub |
| `netlify/functions/visit.mjs` | conta le visite del sito (totali per giorno, senza cookie né dati personali, in Netlify Blobs) |

## Messa online (una volta sola)

### 1. Collega il repository a Netlify
1. Su [app.netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub** → scegli `aadii90/revesti`.
2. Le impostazioni si leggono da `netlify.toml`: lasciale così e premi **Deploy**.
3. In **Site configuration → Change site name** scegli l'indirizzo, per esempio `revesti.netlify.app`.

### 2. Crea il token GitHub
Il pannello usa questo token per salvare le modifiche nel repository.
1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Repository access*: **Only select repositories** → `revesti`.
3. *Permissions → Repository permissions → Contents*: **Read and write**.
4. Scegli una scadenza (anche lunga), genera e copia il token.

### 3. Imposta password e token su Netlify
Nel sito su Netlify: **Site configuration → Environment variables → Add a variable**:

| Nome | Valore |
|---|---|
| `ADMIN_PASSWORD` | la password che vuoi usare per il pannello |
| `GITHUB_TOKEN` | il token del passo 2 |

Poi **Deploys → Trigger deploy → Deploy site** perché le variabili diventino attive.

### 4. Usa il pannello
Vai su `https://<tuo-sito>.netlify.app/admin` e inserisci la password. La sessione dura 12 ore.

- **+ Aggiungi prodotto**: nome, reparto, prezzo, taglie, foto (anche più di una), descrizione.
- **Reparti**: aggiungi, rinomina, riordina, elimina (solo se vuoti).
- **Dati del negozio**: nome, titolo, WhatsApp, email.

Ogni modifica viene pubblicata automaticamente dopo un paio di secondi e il sito si aggiorna in circa un minuto. Se la pubblicazione non riesce, in basso compare una barra con **Riprova**: le modifiche restano salvate nel browser finché non vanno online.

## Note
- Per cambiare password modifica `ADMIN_PASSWORD` su Netlify e ripubblica: le sessioni aperte vengono chiuse.
- Quando il token GitHub scade, generane uno nuovo e aggiorna `GITHUB_TOKEN`.
- Il repository è pubblico: non inserire nei prodotti dati riservati come costi o fornitori.
- I prodotti che iniziano con "Esempio" servono solo a vedere l'aspetto del sito: eliminali quando carichi i tuoi.
- Il sito non incassa pagamenti: l'ordine arriva su WhatsApp e il pagamento si concorda con il cliente.
