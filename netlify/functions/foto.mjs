// Serve le foto caricate dai venditori (salvate in Netlify Blobs).
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const key = decodeURIComponent(new URL(req.url).pathname.replace(/^\/api\/foto\//, ""));
  if (!/^[a-f0-9]{24}\/[a-f0-9]{16}\.jpg$/.test(key)) return new Response("Non trovata", { status: 404 });
  const data = await getStore("foto").get(key, { type: "arrayBuffer" });
  if (!data) return new Response("Non trovata", { status: 404 });
  const cache = "public, max-age=31536000, immutable"; // il nome cambia a ogni caricamento
  return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": cache, "Netlify-CDN-Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });
};

export const config = { path: "/api/foto/*" };
