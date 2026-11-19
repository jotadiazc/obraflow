import postgres from "postgres";
import { fileURLToPath } from "node:url";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Define DATABASE_URL antes de ejecutar las migraciones.");

const sql = postgres(connectionString, { max: 1, fetch_types: false, connect_timeout: 10 });
try {
  const migration = "0001_initial_postgresql.sql";
  const [applied] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${migration}`.catch(() => []);
  if (applied) {
    console.log("La base de datos ya tiene la migración inicial.");
  } else {
    await sql.file(fileURLToPath(new URL(`../db/migrations/${migration}`, import.meta.url)));
    await sql`INSERT INTO schema_migrations (name) VALUES (${migration}) ON CONFLICT (name) DO NOTHING`;
    console.log("Migración PostgreSQL aplicada.");
  }
} finally {
  await sql.end({ timeout: 1 });
}
