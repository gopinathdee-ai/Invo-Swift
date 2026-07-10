// lib/db.ts
// Pooled pg client for use inside API routes. Neon's standard connection
// string works fine with plain node-postgres over TLS.

import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=require") ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Postgres unique_violation error code, used to detect duplicate
// (vendor_name, invoice_number) pairs.
export const PG_UNIQUE_VIOLATION = "23505";
