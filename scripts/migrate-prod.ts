// scripts/migrate-prod.ts
// Usage: npm run db:prod:migrate
//
// Applies every .sql file in /migrations, in filename order, that hasn't
// already been recorded in the _migrations table. Uses .env.prod for database connection.
// Each file runs inside its own transaction — if a migration fails partway through,
// it rolls back and later migrations are not attempted.
//
// ⚠️  PRODUCTION SCRIPT - Requires confirmation to proceed.

import fs from "fs";
import path from "path";
import readline from "readline";
import { createClientProd } from "./lib/client";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

async function confirmProduction(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = '⚠️  This will run migrations on PRODUCTION. Type "\x1b[1m\x1b[31mProduction\x1b[0m" to confirm: ';
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "Production");
    });
  });
}

async function main() {
  const confirmed = await confirmProduction();
  if (!confirmed) {
    console.log("❌ Cancelled. No migrations applied.");
    process.exit(0);
  }

  const client = createClientProd();
  await client.connect();

  try {
    await client.query(`
      create table if not exists _migrations (
        id serial primary key,
        name text not null unique,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows: applied } = await client.query<{ name: string }>("select name from _migrations");
    const appliedNames = new Set(applied.map((r) => r.name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pending = files.filter((f) => !appliedNames.has(f));

    if (pending.length === 0) {
      console.log("No pending migrations. Database is up to date.");
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`Applying ${file}...`);

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`  ✓ ${file}`);
      } catch (err) {
        await client.query("rollback");
        console.error(`  ✗ ${file} failed, rolled back.`);
        throw err;
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
