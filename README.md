# ReVesti

Negozio online di abbigliamento usato: *Dai una seconda vita ai vestiti*.

- **Vetrina** (`index.html`): reparti, filtri, ricerca, schede prodotto con taglie e foto, carrello. L'ordine si invia su WhatsApp o per email.
- **Gestione** (`/admin`): pannello [Decap CMS](https://decapcms.org) per aggiungere e modificare prodotti, foto, reparti e dati del negozio. Ogni salvataggio crea un commit su GitHub e Netlify ripubblica il sito da solo.

## Struttura

| Percorso | Contenuto |
|---|---|
| `content/prodotti/*.json` | un file per prodotto |
| `data/reparti.json` | elenco dei reparti |
| `data/negozio.json` | nome, titolo, WhatsApp, email |
| `images/uploads/` | foto caricate dal pannello |
| `build.js` | unisce i prodotti in `data/prodotti.json` durante la pubblicazione |
| `admin/` | pannello di gestione |

## Messa online (una volta sola)

### 1. Collega il repository a Netlify
1. Entra su [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project → GitHub**.
2. Scegli il repository `aadii90/revesti`.
3. Le impostazioni di build vengono lette da `netlify.toml` (comando `node build.js`, cartella `.`): lasciale così e premi **Deploy**.
4. In **Site configuration → Change site name** puoi scegliere l'indirizzo, per esempio `revesti.netlify.app`.

### 2. Crea l'app OAuth su GitHub (per accedere al pannello)
1. Su GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Compila:
   - *Application name*: `ReVesti Gestione`
   - *Homepage URL*: l'indirizzo del sito Netlify (es. `https://revesti.netlify.app`)
   - *Authorization callback URL*: `https://api.netlify.com/auth/done`
3. Premi **Register application**, poi **Generate a new client secret**. Tieni a portata *Client ID* e *Client secret*.

### 3. Inserisci le chiavi su Netlify
1. Nel sito su Netlify: **Site configuration → Access & security → OAuth → Install provider**.
2. Provider **GitHub**, incolla *Client ID* e *Client secret*, salva.

### 4. Usa il pannello
Vai su `https://<tuo-sito>.netlify.app/admin`, premi **Accedi con GitHub** e autorizza. Da lì:
- **Prodotti → Nuovo Prodotto**: nome, reparto, prezzo, taglie, foto, descrizione → **Pubblica**.
- **Impostazioni → Reparti**: aggiungi, rinomina o riordina i reparti.
- **Impostazioni → Dati del negozio**: nome, titolo, WhatsApp, email.

Dopo ogni pubblicazione il sito si aggiorna in circa un minuto.

## Note
- I tre prodotti che iniziano con "Esempio" servono solo a vedere l'aspetto del sito: eliminali quando carichi i tuoi.
- Il repository è pubblico: non inserire nei prodotti dati riservati come costi o fornitori.
- Il sito non incassa pagamenti: l'ordine arriva su WhatsApp e il pagamento si concorda con il cliente.
