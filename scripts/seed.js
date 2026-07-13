import fs from "node:fs";
import { put } from "@vercel/blob";
import { getCatalogState, updatePdfState } from "../lib/db.js";

const state = await getCatalogState();
if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
  console.log("Catálogo inicial cargado. Sin autenticación Blob se conservan los PDF estáticos.");
  process.exit(0);
}

const [a4, mobile] = await Promise.all([
  put("pdf/cafeterias/revision-0/catalogo-a4-inicial.pdf", fs.readFileSync("Vestalia_Catalogo_Cafeterias.pdf"), { access: "public", contentType: "application/pdf", addRandomSuffix: false }),
  put("pdf/cafeterias/revision-0/catalogo-movil-inicial.pdf", fs.readFileSync("Vestalia_Catalogo_Movil.pdf"), { access: "public", contentType: "application/pdf", addRandomSuffix: false })
]);
await updatePdfState(state.revision, a4.url, mobile.url);
console.log("Catálogo y PDF iniciales cargados correctamente.");
