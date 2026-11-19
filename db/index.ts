import { env } from "cloudflare:workers";
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function getDb(): Sql {
  const connectionString = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("PostgreSQL no está configurado. Define DATABASE_URL o el binding HYPERDRIVE.");
  }

  return postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 8,
    idle_timeout: 5,
  });
}

export async function withDb<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = getDb();
  try {
    return await work(sql);
  } finally {
    await sql.end({ timeout: 1 });
  }
}
