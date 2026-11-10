// Pannello ReVesti: controlla la password e salva le modifiche nel repository GitHub.
// Variabili d'ambiente su Netlify:
//   ADMIN_PASSWORD  la password del pannello
//   GITHUB_TOKEN    token GitHub con permesso "Contents: Read and write" sul repository
//   GITHUB_REPO     facoltativa, default "aadii90/revesti"
//   GITHUB_BRANCH   facoltativa, default "main"
import crypto from "node:crypto";

const env = k => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "");
const DATA_FILES = { prodotti: "data/prodotti.json", reparti: "data/reparti.json", negozio: "data/negozio.json" };
const SESSION_MS = 12 * 60 * 60 * 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (status, error) => json({ error }, status);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const sha256 = s => crypto.createHash("sha256").update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));
const sign = (data, key) => crypto.createHmac("sha256", "revesti:" + key).update(data).digest("base64url");

function makeToken(password) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString("base64url");
  return payload + "." + sign(payload, password);
}
function validToken(token, password) {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [payload, mac] = token.split(".");
  if (!safeEqual(mac, sign(payload, password))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}

function github() {
  const repo = env("GITHUB_REPO") || "aadii90/revesti";
  const branch = env("GITHUB_BRANCH") || "main";
  const token = env("GITHUB_TOKEN");
  const call = async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}${method === "GET" ? `?ref=${branch}` : ""}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "revesti-admin",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify({ ...body, branch }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };
  return {
    async read(path) {
      const { status, data } = await call("GET", path);
      if (status === 404) return { content: null, sha: null };
      if (status !== 200) throw ghError(status, data);
      return { content: Buffer.from(data.content || "", "base64").toString("utf8"), sha: data.sha };
    },
    async write(path, base64, message, sha) {
      const { status, data } = await call("PUT", path, { message, content: base64, ...(sha ? { sha } : {}) });
      if (status !== 200 && status !== 201) throw ghError(status, data);
      return data.content.sha;
    },
    async remove(path, message) {
      const cur = await call("GET", path);
      if (cur.status === 404) return;
      if (cur.status !== 200) throw ghError(cur.status, cur.data);
      const { status, data } = await call("DELETE", path, { message, sha: cur.data.sha });
      if (status !== 200) throw ghError(status, data);
    },
  };
}
function ghError(status, data) {
  const e = new Error(data?.message || `GitHub ha risposto ${status}`);
  e.status = status === 409 || status === 422 && /sha/i.test(data?.message || "") ? 409 : status === 401 || status === 403 ? 502 : 500;
  if (status === 401 || status === 403) e.message = "GitHub ha rifiutato il token: controlla GITHUB_TOKEN nelle impostazioni Netlify.";
  return e;
}

export default async (req) => {
  if (req.method !== "POST") return fail(405, "Metodo non consentito");
  const password = env("ADMIN_PASSWORD");
  if (!password) return fail(500, "Password non configurata: aggiungi ADMIN_PASSWORD nelle impostazioni Netlify.");
  if (!env("GITHUB_TOKEN")) return fail(500, "Token GitHub mancante: aggiungi GITHUB_TOKEN nelle impostazioni Netlify.");

  let body;
  try { body = await req.json(); } catch { return fail(400, "Richiesta non valida"); }
  const { action } = body || {};

  if (action === "login") {
    if (typeof body.password !== "string" || !safeEqual(body.password, password)) {
      await sleep(1200);
      return fail(401, "Password errata");
    }
    return json({ token: makeToken(password) });
  }

  if (!validToken(body.token, password)) return fail(401, "Sessione scaduta: accedi di nuovo");
  const gh = github();

  try {
    if (action === "load") {
      const out = {};
      for (const [key, path] of Object.entries(DATA_FILES)) {
        const { content, sha } = await gh.read(path);
        let data = null;
        try { data = content ? JSON.parse(content) : null; } catch { data = null; }
        out[key] = { data, sha };
      }
      return json(out);
    }

    if (action === "save") {
      const path = DATA_FILES[body.file];
      if (!path) return fail(400, "File non valido");
      if (body.data === undefined || body.data === null || typeof body.data !== "object") return fail(400, "Dati mancanti");
      const text = JSON.stringify(body.data, null, 2) + "\n";
      const sha = await gh.write(path, Buffer.from(text).toString("base64"), String(body.message || `Aggiorna ${body.file}`).slice(0, 120), body.sha || undefined);
      return json({ sha });
    }

    if (action === "upload") {
      const b64 = String(body.base64 || "");
      if (!b64 || b64.length > 5_500_000) return fail(400, "Foto mancante o troppo grande");
      const base = String(body.name || "foto").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "foto";
      const path = `images/uploads/${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${base}.jpg`;
      await gh.write(path, b64, `Carica foto ${base}`);
      return json({ path: "/" + path });
    }

    if (action === "deleteImage") {
      const p = String(body.path || "").replace(/^\/+/, "");
      if (!/^images\/uploads\/[A-Za-z0-9._-]+$/.test(p)) return fail(400, "Percorso foto non valido");
      await gh.remove(p, `Elimina foto ${p.split("/").pop()}`);
      return json({ ok: true });
    }

    return fail(400, "Azione sconosciuta");
  } catch (e) {
    if (e.status === 409) return fail(409, "Il file è stato modificato da un'altra parte: ricarica il pannello e riprova.");
    return fail(e.status || 500, e.message || "Errore imprevisto");
  }
};

export const config = { path: "/api/admin" };
