// Venditori di ReVesti: account, capi e catalogo pubblico.
// Tutto vive in Netlify Blobs; questo file non conosce Netlify: riceve
// { store, foto, mail, secret } e si può provare con un archivio finto.
//
// Chiavi nello store "venditori":
//   utente-<id>     account (id = hash dell'email)
//   prodotti-<id>   capi del venditore, in ogni stato
//   catalogo        capi approvati di tutti i venditori attivi (letto dal sito)
//   limite-<giorno> quante email sono partite oggi
import crypto from "node:crypto";

export class Err extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || null; }
}

const CODE_MS = 30 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_TRIES = 5;
const MAX_EMAILS_PER_DAY = 200;
const MAX_PRODUCTS = 40;
const MAX_PHOTOS = 6;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));
export const normEmail = e => String(e || "").trim().toLowerCase();
const validEmail = e => e.length <= 120 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const userId = email => sha("revesti:" + normEmail(email)).slice(0, 24);
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const slug = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "capo";

export function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "").replace(/^00/, "");
  if (/^3\d{8,9}$/.test(d)) d = "39" + d; // cellulare italiano senza prefisso
  return d;
}

// ---------- archivio ----------
const getJ = (store, key) => store.get(key, { type: "json" });

async function update(store, key, fn) {
  for (let i = 0; i < 5; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const res = await store.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return next;
  }
  throw new Err(409, "Troppe modifiche nello stesso momento: riprova.");
}

// ---------- sessione ----------
const sign = (payload, secret) => crypto.createHmac("sha256", "venditore:" + secret).update(payload).digest("base64url");
export function makeToken(id, pwv, secret) {
  const payload = Buffer.from(JSON.stringify({ id, pwv, exp: Date.now() + SESSION_MS })).toString("base64url");
  return payload + "." + sign(payload, secret);
}
function readToken(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  if (!safeEq(mac, sign(payload, secret))) return null;
  try { const t = JSON.parse(Buffer.from(payload, "base64url").toString()); return t.exp > Date.now() ? t : null; } catch { return null; }
}

export async function auth(ctx, token) {
  const t = readToken(token, ctx.secret);
  const u = t && await getJ(ctx.store, "utente-" + t.id);
  if (!u || !u.verificato || (u.pwv || 0) !== (t.pwv || 0)) throw new Err(401, "Sessione scaduta: accedi di nuovo.");
  if (u.stato === "sospeso") throw new Err(403, "Il tuo account è sospeso. Contatta ReVesti.");
  return u;
}

const publicUser = u => ({ id: u.id, email: u.email, nome: u.nome, whatsapp: u.whatsapp });

// ---------- codici via email ----------
async function sendCode(ctx, u, tipo) {
  if (u.codice && Date.now() - u.codice.inviato < RESEND_MS) throw new Err(429, "Ti abbiamo appena inviato un codice: aspetta un minuto prima di chiederne un altro.");
  const key = "limite-" + today();
  const lim = await update(ctx.store, key, cur => ({ n: (cur?.n || 0) + 1 }));
  if (lim.n > MAX_EMAILS_PER_DAY) throw new Err(429, "Troppe richieste oggi: riprova domani.");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  u.codice = { hash: sha(code + ":" + u.id), scade: Date.now() + CODE_MS, inviato: Date.now(), tentativi: 0, tipo };
  await ctx.store.setJSON("utente-" + u.id, u);
  const cosa = tipo === "reset" ? "reimpostare la password" : "confermare la tua email";
  try {
    await ctx.mail(u.email, `${code} è il tuo codice ReVesti`,
      `Ciao ${u.nome},\n\nil codice per ${cosa} su ReVesti è:\n\n${code}\n\nVale 30 minuti. Se non hai chiesto tu questo codice, ignora questa email.`);
  } catch (e) {
    u.codice.inviato = 0; // email non partita: si può riprovare subito
    await ctx.store.setJSON("utente-" + u.id, u);
    throw e;
  }
}

function checkCode(u, code, tipo) {
  const c = u.codice;
  if (!c || c.tipo !== tipo) throw new Err(400, "Codice non valido: chiedine uno nuovo.");
  if (Date.now() > c.scade) throw new Err(400, "Codice scaduto: chiedine uno nuovo.");
  if (c.tentativi >= MAX_TRIES) throw new Err(429, "Troppi tentativi: chiedi un nuovo codice.");
  return safeEq(c.hash, sha(String(code || "").replace(/\D/g, "") + ":" + u.id));
}

async function consumeCode(ctx, email, code, tipo, onOk) {
  const id = userId(email);
  let u = await getJ(ctx.store, "utente-" + id);
  if (!u) throw new Err(400, "Codice non valido: chiedine uno nuovo.");
  const ok = checkCode(u, code, tipo);
  if (!ok) {
    u.codice.tentativi++;
    await ctx.store.setJSON("utente-" + id, u);
    throw new Err(400, "Codice sbagliato: controlla l'email e riprova.");
  }
  delete u.codice;
  u.verificato = true;
  onOk?.(u);
  await ctx.store.setJSON("utente-" + id, u);
  return { token: makeToken(u.id, u.pwv || 0, ctx.secret), utente: publicUser(u) };
}

function checkProfile({ nome, whatsapp }) {
  const n = clean(nome, 40), w = normPhone(whatsapp);
  if (n.length < 2) throw new Err(400, "Scrivi il nome con cui vuoi comparire sul sito.");
  if (w.length < 9 || w.length > 15) throw new Err(400, "Numero WhatsApp non valido: scrivilo con il prefisso, per esempio 39 333 1234567.");
  return { nome: n, whatsapp: w };
}
const checkPw = pw => { if (typeof pw !== "string" || pw.length < 8 || pw.length > 200) throw new Err(400, "La password deve avere almeno 8 caratteri."); };

// ---------- account ----------
export async function register(ctx, b) {
  const email = normEmail(b.email);
  if (!validEmail(email)) throw new Err(400, "Indirizzo email non valido.");
  checkPw(b.password);
  const prof = checkProfile(b);
  if (b.accetta !== true) throw new Err(400, "Per registrarti devi accettare il regolamento e l'informativa privacy.");
  const id = userId(email);
  const old = await getJ(ctx.store, "utente-" + id);
  if (old?.verificato) throw new Err(409, "Questa email è già registrata: accedi, oppure usa «Password dimenticata».");
  const salt = crypto.randomBytes(16).toString("hex");
  const u = { id, email, ...prof, salt, hash: hashPw(b.password, salt), pwv: 0, verificato: false, stato: "attivo", creato: old?.creato || new Date().toISOString(), accettato: new Date().toISOString(), codice: old?.codice };
  await sendCode(ctx, u, "conferma");
  return { ok: true };
}

export const verify = (ctx, b) => consumeCode(ctx, b.email, b.code, "conferma");

export async function resend(ctx, b) {
  const u = await getJ(ctx.store, "utente-" + userId(b.email));
  if (u && !u.verificato) await sendCode(ctx, u, "conferma");
  return { ok: true };
}

export async function login(ctx, b) {
  const u = await getJ(ctx.store, "utente-" + userId(b.email));
  if (!u || typeof b.password !== "string" || !safeEq(u.hash, hashPw(b.password, u.salt))) throw new Err(401, "Email o password sbagliate.");
  if (u.stato === "sospeso") throw new Err(403, "Il tuo account è sospeso. Contatta ReVesti.");
  if (!u.verificato) {
    try { await sendCode(ctx, u, "conferma"); } catch (e) { if (e.status !== 429) throw e; }
    return { daConfermare: true };
  }
  return { token: makeToken(u.id, u.pwv || 0, ctx.secret), utente: publicUser(u) };
}

export async function resetRequest(ctx, b) {
  const u = await getJ(ctx.store, "utente-" + userId(b.email));
  if (u) { try { await sendCode(ctx, u, "reset"); } catch (e) { if (e.status === 429) throw e; if (e.status >= 500) throw e; } }
  return { ok: true }; // stessa risposta anche se l'email non esiste
}

export async function resetConfirm(ctx, b) {
  checkPw(b.password);
  return consumeCode(ctx, b.email, b.code, "reset", u => {
    u.salt = crypto.randomBytes(16).toString("hex");
    u.hash = hashPw(b.password, u.salt);
    u.pwv = (u.pwv || 0) + 1; // chiude le sessioni aperte
  });
}

export async function me(ctx, u) {
  return { utente: publicUser(u), prodotti: (await getJ(ctx.store, "prodotti-" + u.id)) || [] };
}

export async function saveProfile(ctx, u, b) {
  const prof = checkProfile(b);
  const next = await update(ctx.store, "utente-" + u.id, cur => ({ ...cur, ...prof }));
  await rebuildCatalog(ctx);
  return { utente: publicUser(next) };
}

// ---------- capi ----------
const FIELDS = ["nome", "reparto", "prezzo", "prezzo_pieno", "taglie", "foto", "altre_foto", "descrizione"];
const snapshot = p => Object.fromEntries(FIELDS.map(k => [k, p[k]]));
const photosOf = p => [p?.foto, ...(p?.altre_foto || [])].filter(Boolean);
const refs = p => new Set([...photosOf(p), ...photosOf(p?.pubblicato)]);
const photoKey = path => path.replace(/^\/api\/foto\//, "");

async function dropPhotos(ctx, paths) {
  for (const p of paths) { try { await ctx.foto.delete(photoKey(p)); } catch { /* resta un file orfano, nessun danno */ } }
}

function checkProduct(u, b) {
  const nome = clean(b.nome, 80);
  if (nome.length < 2) throw new Err(400, "Scrivi il nome del capo.");
  const reparto = clean(b.reparto, 40);
  if (!reparto) throw new Err(400, "Scegli un reparto.");
  const prezzo = Math.round(Number(b.prezzo) * 100) / 100;
  if (!Number.isFinite(prezzo) || prezzo < 0 || prezzo > 100000) throw new Err(400, "Prezzo non valido.");
  const pieno = Math.round(Number(b.prezzo_pieno) * 100) / 100;
  const taglie = (Array.isArray(b.taglie) ? b.taglie : []).map(t => clean(t, 14)).filter(Boolean).slice(0, 50);
  const mine = new RegExp(`^/api/foto/${u.id}/[a-f0-9]{16}\\.jpg$`);
  const foto = [b.foto, ...(Array.isArray(b.altre_foto) ? b.altre_foto : [])].filter(Boolean).map(String);
  if (foto.length > MAX_PHOTOS) throw new Err(400, `Puoi caricare al massimo ${MAX_PHOTOS} foto per capo.`);
  if (foto.some(f => !mine.test(f))) throw new Err(400, "Foto non valida: caricala di nuovo.");
  return { nome, reparto, prezzo, prezzo_pieno: Number.isFinite(pieno) && pieno > prezzo ? pieno : null, taglie, foto: foto[0] || "", altre_foto: foto.slice(1), descrizione: String(b.descrizione ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 1200) };
}

export async function saveProduct(ctx, u, b) {
  const data = checkProduct(u, b);
  let orphans = [], saved;
  await update(ctx.store, "prodotti-" + u.id, cur => {
    const list = cur || [];
    const i = b.id ? list.findIndex(p => p.id === b.id) : -1;
    if (b.id && i < 0) throw new Err(404, "Capo non trovato: ricarica la pagina.");
    if (i < 0 && list.length >= MAX_PRODUCTS) throw new Err(400, `Hai raggiunto il massimo di ${MAX_PRODUCTS} capi: eliminane uno venduto.`);
    const old = i >= 0 ? list[i] : null;
    const base = old || { id: `v-${u.id.slice(0, 8)}-${slug(data.nome)}-${crypto.randomBytes(2).toString("hex")}`, data: new Date().toISOString(), pubblicato: null, nascosto: false };
    saved = { ...base, ...data, stato: "attesa", motivo: "", aggiornato: new Date().toISOString() };
    const keep = refs(saved);
    orphans = old ? [...refs(old)].filter(p => !keep.has(p)) : [];
    return i >= 0 ? list.map((p, k) => k === i ? saved : p) : [saved, ...list];
  });
  await dropPhotos(ctx, orphans);
  return { prodotto: saved };
}

export async function setHidden(ctx, u, b) {
  let found = false;
  const list = await update(ctx.store, "prodotti-" + u.id, cur => (cur || []).map(p => p.id === b.id ? (found = true, { ...p, nascosto: !!b.nascosto }) : p));
  if (!found) throw new Err(404, "Capo non trovato: ricarica la pagina.");
  await rebuildCatalog(ctx);
  return { prodotti: list };
}

export async function deleteProduct(ctx, u, b) {
  let gone = null;
  await update(ctx.store, "prodotti-" + u.id, cur => { gone = (cur || []).find(p => p.id === b.id) || null; return (cur || []).filter(p => p.id !== b.id); });
  if (gone) { await dropPhotos(ctx, refs(gone)); if (gone.pubblicato) await rebuildCatalog(ctx); }
  return { ok: true };
}

export async function upload(ctx, u, b) {
  const b64 = String(b.base64 || "");
  if (!b64 || b64.length > 5_500_000) throw new Err(400, "Foto mancante o troppo grande.");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Err(400, "La foto non è leggibile: usa JPG o PNG.");
  const key = `${u.id}/${crypto.randomBytes(8).toString("hex")}.jpg`;
  await ctx.foto.set(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { path: "/api/foto/" + key };
}

// ---------- titolare ----------
async function allUsers(ctx) {
  const { blobs } = await ctx.store.list({ prefix: "utente-" });
  return (await Promise.all(blobs.map(b => getJ(ctx.store, b.key)))).filter(Boolean);
}

export async function rebuildCatalog(ctx) {
  const prodotti = [];
  for (const u of await allUsers(ctx)) {
    if (!u.verificato || u.stato !== "attivo") continue;
    for (const p of (await getJ(ctx.store, "prodotti-" + u.id)) || []) {
      if (p.pubblicato && !p.nascosto) prodotti.push({ id: p.id, ...p.pubblicato, attivo: true, data: p.data, venditore: { nome: u.nome, whatsapp: u.whatsapp } });
    }
  }
  prodotti.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  await ctx.store.setJSON("catalogo", { aggiornato: new Date().toISOString(), prodotti });
  return prodotti.length;
}

export async function readCatalog(store) {
  return (await getJ(store, "catalogo"))?.prodotti || [];
}

export async function listSellers(ctx) {
  const users = await allUsers(ctx);
  const venditori = await Promise.all(users.map(async u => ({
    id: u.id, email: u.email, nome: u.nome, whatsapp: u.whatsapp, verificato: !!u.verificato, stato: u.stato, creato: u.creato,
    prodotti: (await getJ(ctx.store, "prodotti-" + u.id)) || [],
  })));
  venditori.sort((a, b) => String(b.creato).localeCompare(String(a.creato)));
  return { venditori };
}

export async function setSellerStatus(ctx, b) {
  if (b.stato !== "attivo" && b.stato !== "sospeso") throw new Err(400, "Stato non valido.");
  const cur = await getJ(ctx.store, "utente-" + b.id);
  if (!cur) throw new Err(404, "Venditore non trovato.");
  await update(ctx.store, "utente-" + b.id, u => ({ ...u, stato: b.stato }));
  await rebuildCatalog(ctx);
  return { ok: true };
}

export async function deleteSeller(ctx, b) {
  if (!/^[a-f0-9]{24}$/.test(String(b.id))) throw new Err(400, "Venditore non valido.");
  for (const p of (await getJ(ctx.store, "prodotti-" + b.id)) || []) await dropPhotos(ctx, refs(p));
  await ctx.store.delete("prodotti-" + b.id);
  await ctx.store.delete("utente-" + b.id);
  await rebuildCatalog(ctx);
  return { ok: true };
}

export async function review(ctx, b) {
  const u = await getJ(ctx.store, "utente-" + b.venditore);
  if (!u) throw new Err(404, "Venditore non trovato.");
  const motivo = clean(b.motivo, 300);
  let done = null, orphans = [];
  await update(ctx.store, "prodotti-" + u.id, cur => (cur || []).map(p => {
    if (p.id !== b.id) return p;
    if (b.approva) {
      done = { ...p, stato: "online", motivo: "", pubblicato: snapshot(p) };
      const keep = refs(done);
      orphans = [...refs(p)].filter(x => !keep.has(x));
    } else {
      done = { ...p, stato: "rifiutato", motivo };
    }
    return done;
  }));
  if (!done) throw new Err(404, "Capo non trovato: aggiorna l'elenco.");
  await dropPhotos(ctx, orphans);
  await rebuildCatalog(ctx);
  try {
    await ctx.mail(u.email, b.approva ? `«${done.nome}» è online su ReVesti` : `«${done.nome}» non è stato approvato`,
      b.approva ? `Ciao ${u.nome},\n\nil tuo capo «${done.nome}» è stato approvato ed è ora visibile su ReVesti.`
                : `Ciao ${u.nome},\n\nil tuo capo «${done.nome}» non è stato approvato.${motivo ? `\n\nMotivo: ${motivo}` : ""}\n\nPuoi modificarlo dal tuo pannello e inviarlo di nuovo.`);
  } catch { /* l'avviso è una cortesia: l'approvazione vale comunque */ }
  return { ok: true };
}
