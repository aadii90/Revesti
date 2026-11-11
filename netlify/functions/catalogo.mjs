// Capi approvati dei venditori, letti dal sito pubblico insieme a data/prodotti.json.
import { getStore } from "@netlify/blobs";
import { readCatalog } from "../lib/sellers.mjs";

export default async () => {
  let prodotti = [];
  try { prodotti = await readCatalog(getStore({ name: "venditori", consistency: "strong" })); }
  catch (e) { console.error("catalogo", e?.message); }
  return new Response(JSON.stringify(prodotti), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=0, must-revalidate" } });
};

export const config = { path: "/api/catalogo" };
