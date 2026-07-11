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
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.local.example).");
  }

  // Ensure explicit sslmode to avoid pg-connection-string warnings
  if (!connectionString.includes("sslmode=")) {
    connectionString += "?sslmode=verify-full";
  } else {
    connectionString = connectionString.replace(/sslmode=(prefer|require|verify-ca)/, "sslmode=verify-full");
  }

  return new Client({ connectionString });
}
