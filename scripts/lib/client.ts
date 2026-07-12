// scripts/lib/client.ts
// Loads .env.local or .env.prod (scripts run outside Next.js, which normally
// does this for you) and exposes a single-use pg Client for migration/seed scripts.

import "dotenv/config";
import { config } from "dotenv";
import { Client } from "pg";
import path from "path";

// Also try .env.local explicitly, since plain dotenv defaults to .env
config({ path: path.resolve(process.cwd(), ".env.local") });

function buildConnectionString(connectionString: string | undefined, envName: string): string {
  if (!connectionString) {
    throw new Error(`DATABASE_URL is not set. Add it to ${envName} (see .env.local.example).`);
  }

  // Ensure explicit sslmode to avoid pg-connection-string warnings
  if (!connectionString.includes("sslmode=")) {
    return connectionString + "?sslmode=verify-full";
  } else {
    return connectionString.replace(/sslmode=(prefer|require|verify-ca)/, "sslmode=verify-full");
  }
}

export function createClient() {
  const connectionString = buildConnectionString(process.env.DATABASE_URL, ".env.local");
  return new Client({ connectionString });
}

export function createClientProd() {
  // Load .env.prod explicitly
  config({ path: path.resolve(process.cwd(), ".env.prod"), override: true });

  const connectionString = buildConnectionString(process.env.DATABASE_URL, ".env.prod");
  return new Client({ connectionString });
}
