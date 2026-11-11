// Collega la logica dei venditori a Netlify: archivi Blobs, chiave delle sessioni, invio email con Brevo.
// Variabili d'ambiente: ADMIN_PASSWORD (già usata dal pannello), BREVO_API_KEY, MAIL_FROM.
import { getStore } from "@netlify/blobs";
import { Err } from "./sellers.mjs";

export const env = k => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? "");
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

async function mail(to, subject, text) {
  const key = env("BREVO_API_KEY"), from = env("MAIL_FROM");
  if (!key || !from) throw new Err(503, "L'invio delle email non è ancora configurato su questo sito. Riprova più tardi.");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: from, name: "ReVesti" },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#14161B">${esc(text).replace(/\n/g, "<br>")}</div>`,
    }),
  });
  if (!res.ok) {
    console.error("Brevo", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new Err(502, "Non riesco a inviare l'email in questo momento. Riprova tra qualche minuto.");
  }
}

export function sellerCtx() {
  const secret = env("ADMIN_PASSWORD");
  if (!secret) throw new Err(500, "Sito non configurato: manca ADMIN_PASSWORD.");
  return {
    store: getStore({ name: "venditori", consistency: "strong" }),
    foto: getStore({ name: "foto", consistency: "strong" }),
    secret,
    mail,
  };
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
