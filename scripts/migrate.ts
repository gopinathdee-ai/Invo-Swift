// scripts/migrate.ts
// Usage: npm run db:migrate
//
// Applies every .sql file in /migrations, in filename order, that hasn't
// already been recorded in the _migrations table. Each file runs inside
// its own transaction — if a migration fails partway through, it rolls
// back and later migrations are not attempted.

import fs from "fs";
import path from "path";
import { createClient } from "./lib/client";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

async function main() {
  const client = createClient();
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
