import { ensureDatabase } from "../lib/db.js";

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.NEON_DATABASE_URL) {
  console.error("Falta DATABASE_URL (o POSTGRES_URL/NEON_DATABASE_URL).");
  process.exit(1);
}

await ensureDatabase();
console.log("Base de datos inicializada correctamente.");
