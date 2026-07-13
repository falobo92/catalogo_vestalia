import { CatalogError, validateCatalog } from "../lib/catalog.js";
import { getCatalogState, hasDatabase, saveCatalog } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";
import { json, methodNotAllowed, readJson, verifySameOrigin } from "../lib/http.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const state = await getCatalogState();
      return json(res, 200, { ok: true, ...state });
    }
    if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
    if (!verifySameOrigin(req)) return json(res, 403, { ok: false, error: "Origen de solicitud no permitido." });
    requireAdmin(req);
    if (!hasDatabase()) return json(res, 503, { ok: false, error: "La base de datos cloud todavía no está configurada." });

    const payload = await readJson(req, 4 * 1024 * 1024);
    const revision = Number(payload?.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      return json(res, 400, { ok: false, error: "La revisión enviada no es válida." });
    }
    const catalog = validateCatalog(payload?.catalog);
    const state = await saveCatalog(catalog, revision);
    if (!state) {
      return json(res, 409, {
        ok: false,
        error: "El catálogo cambió en otra pestaña. Recarga antes de volver a guardar."
      });
    }
    return json(res, 200, { ok: true, ...state });
  } catch (error) {
    const status = error.statusCode || (error instanceof CatalogError ? 400 : 500);
    return json(res, status, { ok: false, error: status === 500 ? "No fue posible guardar el catálogo." : error.message });
  }
}
