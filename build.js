// Raccoglie tutti i prodotti di content/prodotti/*.json in data/prodotti.json.
// Netlify lo esegue a ogni pubblicazione (vedi netlify.toml). Nessuna dipendenza.
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "content", "prodotti");
const out = path.join(__dirname, "data", "prodotti.json");

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")) : [];
const prodotti = [];
for (const f of files) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    prodotti.push({ id: f.replace(/\.json$/, ""), ...p });
  } catch (e) {
    console.warn("Prodotto ignorato, JSON non valido:", f, e.message);
  }
}
prodotti.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || String(a.nome).localeCompare(String(b.nome)));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(prodotti, null, 2));
console.log(`data/prodotti.json: ${prodotti.length} prodotti`);
