import { hasDatabase } from "../lib/db.js";
import { json, methodNotAllowed } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  json(res, 200, {
    ok: true,
    mode: "cloud",
    database: hasDatabase(),
    storage: Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN),
    pdfEngine: true
  });
}
