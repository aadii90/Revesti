// Conteggio visite senza cookie e senza dati personali: solo totali per giorno.
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|facebookexternalhit|whatsapp|telegram/i;
const MAX_PRODUCTS_PER_DAY = 300;

export const dayKey = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

// t: "v" visita, "p" prodotto aperto (con id), "w" ordine avviato su WhatsApp o email
export function parseEvent(body, userAgent) {
  if (!body || typeof body !== "object" || !userAgent || BOT.test(userAgent)) return null;
  const t = body.t;
  if (t !== "v" && t !== "p" && t !== "w") return null;
  if (t !== "p") return { t };
  const id = String(body.id || "");
  return /^[a-z0-9-]{1,80}$/.test(id) ? { t, id } : null;
}

export function apply(day, ev) {
  const d = { visite: 0, ordini: 0, prodotti: {}, ...(day || {}) };
  d.prodotti = { ...d.prodotti };
  if (ev.t === "v") d.visite++;
  if (ev.t === "w") d.ordini++;
  if (ev.t === "p" && (ev.id in d.prodotti || Object.keys(d.prodotti).length < MAX_PRODUCTS_PER_DAY)) d.prodotti[ev.id] = (d.prodotti[ev.id] || 0) + 1;
  return d;
}

export async function record(store, ev, now = new Date()) {
  const key = "giorno-" + dayKey(now);
  for (let i = 0; i < 4; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const res = await store.setJSON(key, apply(cur ? cur.data : null, ev), cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return true;
  }
  return false;
}

export async function readStats(store, days = 30, now = new Date()) {
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(now.getTime() - (days - 1 - i) * 86400000)));
  return Promise.all(keys.map(async giorno => {
    let d = null;
    try { d = await store.get("giorno-" + giorno, { type: "json" }); } catch { d = null; }
    return { giorno, visite: d?.visite || 0, ordini: d?.ordini || 0, prodotti: d?.prodotti || {} };
  }));
}
