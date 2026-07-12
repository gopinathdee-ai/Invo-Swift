// scripts/seed-mandatory-prod.ts
// Usage: npm run db:prod:seed:mandatory
//
// Data the app assumes exists — safe (and expected) to run on every
// environment, including production, right after db:prod:migrate. Uses .env.prod.
// Idempotent: re-running just re-asserts these defaults via upsert.
//
// Add to DEFAULT_SETTINGS below as the app grows (e.g. auto-approval
// thresholds once you're ready to trust high-confidence extractions).
//
// ⚠️  PRODUCTION SCRIPT - Requires confirmation to proceed.

import readline from "readline";
import { createClientProd } from "./lib/client";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  default_currency: "CAD",
  // Kept false until extraction quality has been validated against real
  // invoices — flip this on once you're ready to skip manual review for
  // high-confidence, low-risk invoices.
  auto_approval_enabled: false,
  auto_approval_max_amount: 0,
};

async function confirmProduction(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = '⚠️  This will seed settings on PRODUCTION. Type "\x1b[1m\x1b[31mProduction\x1b[0m" to confirm: ';
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer === "Production");
    });
  });
}

async function main() {
  const confirmed = await confirmProduction();
  if (!confirmed) {
    console.log("❌ Cancelled. No data seeded.");
    process.exit(0);
  }

  const client = createClientProd();
  await client.connect();

  try {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query(
        `insert into app_settings (key, value, updated_at)
         values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
      console.log(`  ✓ app_settings.${key} = ${JSON.stringify(value)}`);
    }
    console.log("Mandatory seed complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
