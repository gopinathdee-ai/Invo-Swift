// scripts/reset-create.ts
// Usage: npm run db:reset:create
//
// ⚠️  DESTRUCTIVE - Drops all tables, then recreates schema and seeds mandatory data.
// Chains: reset → migrate → seed:mandatory
// Requires confirmation by typing "reset".

import { execSync } from "child_process";
import readline from "readline";

async function confirmReset(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = '⚠️  This will \x1b[1m\x1b[31mDROP ALL TABLES\x1b[0m and recreate them. \x1b[1mType "reset"\x1b[0m to confirm: ';
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "reset");
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

    console.log("\n📍 Step 1: Resetting database...");
    execSync("npm run db:reset", { stdio: "inherit", env });

    console.log("\n📍 Step 2: Running migrations...");
    execSync("npm run db:migrate", { stdio: "inherit", env });

    console.log("\n📍 Step 3: Seeding mandatory data...");
    execSync("npm run db:seed:mandatory", { stdio: "inherit", env });

    console.log("\n✓ Database reset and recreated successfully!");
  } catch (err) {
    console.error("\n✗ Reset chain failed:", (err as any).message);
    process.exit(1);
  }
}

main();
