import { neon } from "@neondatabase/serverless";
import { del, list } from "@vercel/blob";
import { loadBundledCatalog } from "./catalog.js";

const BASELINE_MIGRATION = "20260713-contact-revision-zero";
const PDF_CLEANUP_MIGRATION = "20260713-remove-old-pdf-blobs";

export function hasDatabase() {
  return Boolean(databaseUrl());
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || "";
}

function client() {
  if (!hasDatabase()) throw new Error("Falta DATABASE_URL.");
  return neon(databaseUrl());
}

async function resetCloudBaseline(sql) {
  const contact = JSON.stringify(loadBundledCatalog().contact);
  await sql`
    WITH marker AS (
      INSERT INTO app_migrations (id) VALUES (${BASELINE_MIGRATION})
      ON CONFLICT (id) DO NOTHING RETURNING id
    ), cleared_history AS (
      DELETE FROM catalog_history WHERE EXISTS (SELECT 1 FROM marker)
    ), cleared_attempts AS (
      DELETE FROM login_attempts WHERE EXISTS (SELECT 1 FROM marker)
    )
    UPDATE catalog_state
    SET catalog = jsonb_set(catalog, '{contact}', (catalog -> 'contact') || CAST(${contact} AS jsonb)),
        revision = 0,
        pdf_revision = 0,
        pdf_a4_url = '/Vestalia_Catalogo_Cafeterias.pdf',
        pdf_mobile_url = '/Vestalia_Catalogo_Movil.pdf',
        updated_at = NOW(),
        pdf_updated_at = NOW()
    WHERE id = 1 AND EXISTS (SELECT 1 FROM marker)
  `;
}

async function cleanObsoletePdfBlobs(sql) {
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) return;
  const done = await sql`SELECT id FROM app_migrations WHERE id = ${PDF_CLEANUP_MIGRATION}`;
  if (done.length) return;
  try {
    const result = await list({ prefix: "pdf/", limit: 1000 });
    const urls = result.blobs.map(blob => blob.url);
    if (urls.length) await del(urls);
    await sql`INSERT INTO app_migrations (id) VALUES (${PDF_CLEANUP_MIGRATION}) ON CONFLICT (id) DO NOTHING`;
  } catch (error) {
    console.warn(`No fue posible limpiar los PDF Blob antiguos: ${error.message}`);
  }
}

let initialization;

export async function ensureDatabase() {
  if (!hasDatabase()) return false;
  if (!initialization) initialization = (async () => {
    const sql = client();
    await sql`CREATE TABLE IF NOT EXISTS catalog_state (
      id smallint PRIMARY KEY CHECK (id = 1), catalog jsonb NOT NULL, revision bigint NOT NULL DEFAULT 0,
      pdf_revision bigint NOT NULL DEFAULT 0, pdf_a4_url text NOT NULL, pdf_mobile_url text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW(), pdf_updated_at timestamptz
    )`;
    await sql`CREATE TABLE IF NOT EXISTS catalog_history (
      revision bigint PRIMARY KEY, catalog jsonb NOT NULL, pdf_revision bigint NOT NULL DEFAULT 0,
      pdf_a4_url text, pdf_mobile_url text, created_at timestamptz NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS login_attempts (
      ip_hash text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
      window_started_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS app_migrations (
      id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT NOW()
    )`;
    const bundled = JSON.stringify(loadBundledCatalog());
    await sql`INSERT INTO catalog_state (id, catalog, revision, pdf_revision, pdf_a4_url, pdf_mobile_url, pdf_updated_at)
      VALUES (1, CAST(${bundled} AS jsonb), 0, 0, '/Vestalia_Catalogo_Cafeterias.pdf', '/Vestalia_Catalogo_Movil.pdf', NOW())
      ON CONFLICT (id) DO NOTHING`;
    await resetCloudBaseline(sql);
    await cleanObsoletePdfBlobs(sql);
    return true;
  })().catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

function normalizeRow(row) {
  return {
    catalog: row.catalog,
    revision: Number(row.revision),
    pdfRevision: Number(row.pdf_revision || 0),
    pdfA4Url: row.pdf_a4_url || "/Vestalia_Catalogo_Cafeterias.pdf",
    pdfMobileUrl: row.pdf_mobile_url || "/Vestalia_Catalogo_Movil.pdf",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    pdfUpdatedAt: row.pdf_updated_at ? new Date(row.pdf_updated_at).toISOString() : null
  };
}

export async function getCatalogState() {
  if (!hasDatabase()) {
    return {
      catalog: loadBundledCatalog(), revision: 0, pdfRevision: 0,
      pdfA4Url: "/Vestalia_Catalogo_Cafeterias.pdf", pdfMobileUrl: "/Vestalia_Catalogo_Movil.pdf",
      updatedAt: null, pdfUpdatedAt: null, fallback: true
    };
  }
  await ensureDatabase();
  const sql = client();
  const rows = await sql`SELECT catalog, revision, pdf_revision, pdf_a4_url, pdf_mobile_url, updated_at, pdf_updated_at FROM catalog_state WHERE id = 1`;
  if (!rows.length) throw new Error("La base de datos no ha sido inicializada.");
  return normalizeRow(rows[0]);
}

export async function saveCatalog(catalog, expectedRevision) {
  await ensureDatabase();
  const sql = client();
  const serialized = JSON.stringify(catalog);
  const rows = await sql`
    WITH previous AS (
      SELECT catalog, revision, pdf_revision, pdf_a4_url, pdf_mobile_url, updated_at
      FROM catalog_state WHERE id = 1 AND revision = ${expectedRevision} FOR UPDATE
    ), archived AS (
      INSERT INTO catalog_history (revision, catalog, pdf_revision, pdf_a4_url, pdf_mobile_url, created_at)
      SELECT revision, catalog, pdf_revision, pdf_a4_url, pdf_mobile_url, updated_at FROM previous
      ON CONFLICT (revision) DO NOTHING
    )
    UPDATE catalog_state
    SET catalog = CAST(${serialized} AS jsonb), revision = revision + 1, updated_at = NOW()
    WHERE id = 1 AND revision = ${expectedRevision}
    RETURNING catalog, revision, pdf_revision, pdf_a4_url, pdf_mobile_url, updated_at, pdf_updated_at
  `;
  if (!rows.length) return null;
  await sql`DELETE FROM catalog_history WHERE revision < (SELECT GREATEST(revision - 50, 0) FROM catalog_state WHERE id = 1)`;
  return normalizeRow(rows[0]);
}

export async function updatePdfState(expectedRevision, a4Url, mobileUrl) {
  await ensureDatabase();
  const sql = client();
  const rows = await sql`
    UPDATE catalog_state
    SET pdf_revision = revision, pdf_a4_url = ${a4Url}, pdf_mobile_url = ${mobileUrl}, pdf_updated_at = NOW()
    WHERE id = 1 AND revision = ${expectedRevision}
    RETURNING catalog, revision, pdf_revision, pdf_a4_url, pdf_mobile_url, updated_at, pdf_updated_at
  `;
  return rows.length ? normalizeRow(rows[0]) : null;
}

export async function loginStatus(ipHash) {
  if (!hasDatabase()) return { blocked: false, remaining: 5 };
  await ensureDatabase();
  const sql = client();
  const rows = await sql`SELECT attempts, window_started_at FROM login_attempts WHERE ip_hash = ${ipHash}`;
  if (!rows.length) return { blocked: false, remaining: 5 };
  const fresh = Date.now() - new Date(rows[0].window_started_at).getTime() < 15 * 60 * 1000;
  const attempts = fresh ? Number(rows[0].attempts) : 0;
  return { blocked: attempts >= 5, remaining: Math.max(0, 5 - attempts) };
}

export async function registerLoginFailure(ipHash) {
  if (!hasDatabase()) return;
  await ensureDatabase();
  const sql = client();
  await sql`
    INSERT INTO login_attempts (ip_hash, attempts, window_started_at, updated_at)
    VALUES (${ipHash}, 1, NOW(), NOW())
    ON CONFLICT (ip_hash) DO UPDATE SET
      attempts = CASE WHEN login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END,
      window_started_at = CASE WHEN login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_started_at END,
      updated_at = NOW()
  `;
}

export async function clearLoginFailures(ipHash) {
  if (!hasDatabase()) return;
  await ensureDatabase();
  const sql = client();
  await sql`DELETE FROM login_attempts WHERE ip_hash = ${ipHash}`;
}
