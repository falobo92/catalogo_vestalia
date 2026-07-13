import path from "node:path";
import { put } from "@vercel/blob";
import { requireAdmin } from "../lib/auth.js";
import { json, methodNotAllowed, readBody, verifySameOrigin } from "../lib/http.js";

export const config = { api: { bodyParser: false } };

function safeName(value) {
  const name = path.basename(String(value || "producto.webp"), path.extname(String(value || "")));
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "producto";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
    if (!verifySameOrigin(req)) return json(res, 403, { ok: false, error: "Origen de solicitud no permitido." });
    requireAdmin(req);
    if (!process.env.BLOB_READ_WRITE_TOKEN) return json(res, 503, { ok: false, error: "Vercel Blob todavía no está configurado." });

    const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (contentType !== "image/webp") {
      return json(res, 415, { ok: false, error: "La imagen debe enviarse optimizada en formato WebP." });
    }
    const body = await readBody(req, 4 * 1024 * 1024);
    if (!body.length) return json(res, 400, { ok: false, error: "La imagen está vacía." });
    const filename = safeName(req.headers["x-file-name"]);
    const blob = await put(`images/${Date.now()}-${filename}.webp`, body, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: true
    });
    return json(res, 201, { ok: true, path: blob.url, url: blob.url, type: "image/webp" });
  } catch (error) {
    const status = error.statusCode || (/tamaño permitido/i.test(error.message) ? 413 : 500);
    return json(res, status, { ok: false, error: status === 500 ? "No fue posible subir la imagen." : error.message });
  }
}
