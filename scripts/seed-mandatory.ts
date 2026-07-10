// scripts/seed-mandatory.ts
// Usage: npm run db:seed:mandatory
//
// Data the app assumes exists — safe (and expected) to run on every
// environment, including production, right after db:migrate. Idempotent:
// re-running just re-asserts these defaults via upsert.
//
// Add to DEFAULT_SETTINGS below as the app grows (e.g. auto-approval
// thresholds once you're ready to trust high-confidence extractions).

import { createClient } from "./lib/client";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  default_currency: "CAD",
  // Kept false until extraction quality has been validated against real
  // invoices — flip this on once you're ready to skip manual review for
  // high-confidence, low-risk invoices.
  auto_approval_enabled: false,
  auto_approval_max_amount: 0,
};

async function main() {
  const client = createClient();
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
