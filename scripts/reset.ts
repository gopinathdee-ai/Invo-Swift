// scripts/reset.ts
// Usage: npm run db:reset
//
// ⚠️  DESTRUCTIVE - Drops all tables from the database.
// Requires confirmation by typing "reset".

import readline from "readline";
import { createClient } from "./lib/client";

async function confirmReset(): Promise<boolean> {
  // Skip confirmation if called from reset:create (SKIP_CONFIRMATION env var)
  if (process.env.SKIP_CONFIRMATION === "true") {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = '⚠️  This will \x1b[1m\x1b[31mDROP ALL TABLES\x1b[0m in the database. \x1b[1mType "reset"\x1b[0m to confirm: ';
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "reset");
    });
  });
}

async function main() {
  const confirmed = await confirmReset();
  if (!confirmed) {
    console.log("❌ Cancelled. No tables dropped.");
    process.exit(0);
  }

  const client = createClient();
  await client.connect();

  try {
    // Drop all tables in order (respecting foreign key constraints)
    const tables = [
      "invoice_line_items",
      "invoices",
      "app_settings",
      "_migrations",
    ];

    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`  ✓ Dropped ${table}`);
      } catch (err) {
        console.error(`  ✗ Failed to drop ${table}:`, (err as any).message);
        throw err;
      }
    }

    console.log("\n✓ All tables dropped successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
