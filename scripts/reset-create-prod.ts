// scripts/reset-create-prod.ts
// Usage: npm run db:prod:reset:create
//
// ⚠️  DESTRUCTIVE - Drops all PRODUCTION tables, then recreates schema and seeds mandatory data.
// Chains: db:prod:reset → db:prod:migrate → db:prod:seed:mandatory
// Requires confirmation by typing "reset".

import { execSync } from "child_process";
import readline from "readline";

async function confirmReset(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = '⚠️  This will drop all tables in PRODUCTION and recreate them. Type "\x1b[1m\x1b[31mRESET PRODUCTION DATABASE\x1b[0m" to confirm: ';
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "RESET PRODUCTION DATABASE");
    });
  });
}

async function main() {
  const confirmed = await confirmReset();
  if (!confirmed) {
    console.log("❌ Cancelled.");
    process.exit(0);
  }

  try {
    const env = { ...process.env, SKIP_CONFIRMATION: "true" };

    console.log("\n📍 Step 1: Resetting PRODUCTION database...");
    execSync("npm run db:prod:reset", { stdio: "inherit", env });

    console.log("\n📍 Step 2: Running PRODUCTION migrations...");
    execSync("npm run db:prod:migrate", { stdio: "inherit", env });

    console.log("\n📍 Step 3: Seeding PRODUCTION mandatory data...");
    execSync("npm run db:prod:seed:mandatory", { stdio: "inherit", env });

    console.log("\n✓ PRODUCTION database reset and recreated successfully!");
  } catch (err) {
    console.error("\n✗ PRODUCTION reset chain failed:", (err as any).message);
    process.exit(1);
  }
}

main();
