import chromium from "@sparticuz/chromium-min";
import { del, put } from "@vercel/blob";
import puppeteer from "puppeteer-core";
import { requireAdmin } from "../lib/auth.js";
import { getCatalogState, hasDatabase, updatePdfState } from "../lib/db.js";
import { buildA4Html, buildMobileHtml } from "../lib/pdf-builders.js";
import { json, methodNotAllowed, readJson, requestOrigin, verifySameOrigin } from "../lib/http.js";

export const maxDuration = 300;
const DEFAULT_CHROMIUM_PACK = "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

async function waitForAssets(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        })));
  });
}

async function render(page, document) {
  await page.setContent(document.html, { waitUntil: ["domcontentloaded", "networkidle0"], timeout: 120000 });
  await waitForAssets(page);
  return page.pdf({ printBackground: true, preferCSSPageSize: true, timeout: 120000 });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const type = String(req.query?.tipo || "").toLowerCase();
      if (!new Set(["a4", "movil"]).has(type)) return json(res, 400, { ok: false, error: "Usa tipo=a4 o tipo=movil." });
      const state = await getCatalogState();
      const target = type === "a4" ? state.pdfA4Url : state.pdfMobileUrl;
      res.statusCode = 302;
      res.setHeader("Location", target);
      res.setHeader("Cache-Control", "no-store");
      return res.end();
    } catch {
      return json(res, 500, { ok: false, error: "No fue posible localizar el PDF vigente." });
    }
  }
  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  if (!verifySameOrigin(req)) return json(res, 403, { ok: false, error: "Origen de solicitud no permitido." });

  let browser;
  const uploaded = [];
  try {
    requireAdmin(req);
    if (!hasDatabase()) return json(res, 503, { ok: false, error: "La base de datos cloud todavía no está configurada." });
    const payload = await readJson(req, 4096);
    const revision = Number(payload?.revision);
    const before = await getCatalogState();
    if (!Number.isInteger(revision) || revision !== before.revision) {
      return json(res, 409, { ok: false, error: "El catálogo cambió. Recarga antes de regenerar los PDF." });
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(process.env.CHROMIUM_PACK_URL || DEFAULT_CHROMIUM_PACK),
      headless: chromium.headless
    });
    const page = await browser.newPage();
    const origin = requestOrigin(req);
    const [a4, mobile] = [buildA4Html(before.catalog, origin), buildMobileHtml(before.catalog, origin)];
    const a4Buffer = await render(page, a4);
    const mobileBuffer = await render(page, mobile);

    const stamp = Date.now();
    const a4Blob = await put(`pdf/revision-${revision}/${stamp}-catalogo-a4.pdf`, a4Buffer, { access: "public", contentType: "application/pdf", addRandomSuffix: false });
    uploaded.push(a4Blob.url);
    const mobileBlob = await put(`pdf/revision-${revision}/${stamp}-catalogo-movil.pdf`, mobileBuffer, { access: "public", contentType: "application/pdf", addRandomSuffix: false });
    uploaded.push(mobileBlob.url);

    const state = await updatePdfState(revision, a4Blob.url, mobileBlob.url);
    if (!state) {
      await del(uploaded);
      return json(res, 409, { ok: false, error: "El catálogo cambió durante la generación. Vuelve a intentarlo." });
    }
    return json(res, 200, { ok: true, ...state, pages: { a4: a4.pageCount, mobile: mobile.pageCount } });
  } catch (error) {
    if (uploaded.length) await del(uploaded).catch(() => {});
    const status = error.statusCode || 500;
    return json(res, status, { ok: false, error: status === 500 ? `No fue posible generar los PDF: ${error.message}` : error.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
