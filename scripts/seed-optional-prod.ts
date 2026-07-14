// scripts/seed-optional-prod.ts
// Usage: npm run db:prod:seed:optional
//
// Demo data for production-like environments — lets you test extraction flows
// without uploading real PDFs. Uses .env.prod for database connection.
// Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, safe to re-run.
//
// ⚠️  WARNING: This is for staging/demo only. Do NOT run against production
// databases with real data unless you understand the implications.
//
// ⚠️  PRODUCTION SCRIPT - Requires confirmation to proceed.

import readline from "readline";
import { createClientProd } from "./lib/client";

const DEMO_INVOICES = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    original_filename: "demo-keltech-invoice-1042.pdf",
    vendor_name: "Keltech Communications Inc.",
    invoice_number: "INV-1042",
    invoice_date: "2026-06-01",
    due_date: "2026-06-30",
    currency: "CAD",
    subtotal: 4200.0,
    tax_amount: 210.0,
    total_amount: 4410.0,
    confidence: "high",
    needs_review: false,
    status: "pending_review",
    line_items: [
      { description: "Two-way radio network survey", quantity: 1, unit_price: 2500, line_total: 2500 },
      { description: "Repeater installation labor", quantity: 8, unit_price: 212.5, line_total: 1700 },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    original_filename: "demo-vendor-mismatch-9981.pdf",
    vendor_name: "Aurozix Supplies Ltd.",
    invoice_number: "9981",
    invoice_date: "2026-06-15",
    due_date: null,
    currency: "CAD",
    subtotal: 1000.0,
    tax_amount: 50.0,
    total_amount: 1100.0,
    confidence: "medium",
    needs_review: true,
    review_notes: "[Auto-check] subtotal + tax (1050.00) does not match total (1100.00).",
    status: "pending_review",
    line_items: [{ description: "Office equipment", quantity: 2, unit_price: 500, line_total: 1000 }],
  },
];

async function confirmProduction(): Promise<boolean> {
  // Skip confirmation if called from reset:create (SKIP_CONFIRMATION env var)
  if (process.env.SKIP_CONFIRMATION === "true") {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = '⚠️  This will seed demo data on PRODUCTION. Type "\x1b[1m\x1b[31mProduction\x1b[0m" to confirm: ';
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
    for (const inv of DEMO_INVOICES) {
      const { rows } = await client.query(
        `insert into invoices (
           id, original_filename, storage_path, vendor_name, invoice_number,
           invoice_date, due_date, currency, subtotal, tax_amount, total_amount,
           confidence, needs_review, review_notes, status
         ) values ($1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (id) do nothing
         returning id`,
        [
          inv.id,
          inv.original_filename,
          inv.vendor_name,
          inv.invoice_number,
          inv.invoice_date,
          inv.due_date,
          inv.currency,
          inv.subtotal,
          inv.tax_amount,
          inv.total_amount,
          inv.confidence,
          inv.needs_review,
          inv.review_notes ?? null,
          inv.status,
        ]
      );

      if (rows.length === 0) {
        console.log(`  – ${inv.invoice_number} already exists, skipped`);
        continue;
      }

      for (const li of inv.line_items) {
        await client.query(
          `insert into invoice_line_items (invoice_id, description, quantity, unit_price, line_total)
           values ($1,$2,$3,$4,$5)`,
          [inv.id, li.description, li.quantity, li.unit_price, li.line_total]
        );
      }
      console.log(`  ✓ seeded ${inv.invoice_number}`);
    }
    console.log("Optional seed complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
