// Riceve dal sito pubblico gli eventi di visita e aggiorna i totali del giorno.
import { getStore } from "@netlify/blobs";
import { parseEvent, record } from "../lib/stats.mjs";

export default async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  let body = null;
  try { body = JSON.parse((await req.text()).slice(0, 300)); } catch { body = null; }
  const ev = parseEvent(body, req.headers.get("user-agent"));
  if (ev) {
    try { await record(getStore({ name: "visite", consistency: "strong" }), ev); }
    catch (e) { console.error("visita non registrata:", e?.message); }
  }
  return new Response(null, { status: 204 });
};

export const config = { path: "/api/visit" };
