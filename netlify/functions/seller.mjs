// Area venditori: registrazione con codice via email, accesso, profilo, capi e foto.
import { sellerCtx, json } from "../lib/ctx.mjs";
import * as S from "../lib/sellers.mjs";

const OPEN = { register: S.register, verify: S.verify, resend: S.resend, login: S.login, resetRequest: S.resetRequest, resetConfirm: S.resetConfirm };
const AUTH = { me: S.me, saveProfile: S.saveProfile, saveProduct: S.saveProduct, setHidden: S.setHidden, deleteProduct: S.deleteProduct, upload: S.upload };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Richiesta non valida" }, 400); }
  const action = body?.action;
  try {
    const ctx = sellerCtx();
    if (OPEN[action]) return json(await OPEN[action](ctx, body));
    if (AUTH[action]) return json(await AUTH[action](ctx, await S.auth(ctx, body.token), body));
    return json({ error: "Azione sconosciuta" }, 400);
  } catch (e) {
    if (e instanceof S.Err) {
      if (e.status === 401 || (e.status === 400 && /odice/.test(e.message))) await sleep(900); // rallenta i tentativi a caso
      return json({ error: e.message }, e.status);
    }
    console.error("venditore", action, e);
    return json({ error: "Errore imprevisto. Riprova tra poco." }, 500);
  }
};

export const config = { path: "/api/venditore" };
