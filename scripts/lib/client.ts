// scripts/lib/client.ts
// Loads .env.local (scripts run outside Next.js, which normally does this
// for you) and exposes a single-use pg Client for migration/seed scripts.

import "dotenv/config";
import { config } from "dotenv";
import { Client } from "pg";
import path from "path";

// Also try .env.local explicitly, since plain dotenv defaults to .env
config({ path: path.resolve(process.cwd(), ".env.local") });

export function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.local.example).");
  }
  return new Client({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? undefined : { rejectUnauthorized: false },
  });
}
