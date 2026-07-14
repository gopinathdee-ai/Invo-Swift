// scripts/reset-prod.ts
// Usage: npm run db:prod:reset
//
// ⚠️  DESTRUCTIVE - Drops all tables from PRODUCTION database.
// Requires confirmation by typing "reset".

import readline from "readline";
import { createClientProd } from "./lib/client";

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
    const prompt = '⚠️  This will drop all tables in PRODUCTION. Type "\x1b[1m\x1b[31mRESET PRODUCTION DATABASE\x1b[0m" to confirm: ';
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "RESET PRODUCTION DATABASE");
    });
  });
}

async function main() {
  const confirmed = await confirmReset();
  if (!confirmed) {
    console.log("❌ Cancelled. No tables dropped.");
    process.exit(0);
  }

  const client = createClientProd();
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
