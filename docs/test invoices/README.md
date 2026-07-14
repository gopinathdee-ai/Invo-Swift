# Test Invoice Pack

50 synthetic PDF invoices for testing the invoice-intake app's extraction
pipeline, plus a ground-truth CSV so you can measure accuracy rather than
eyeball it.

## Contents

- **`pdfs/`** — 50 invoice PDFs, `invoice_01_...pdf` through `invoice_50_...pdf`
- **`ground_truth.csv`** — the exact values used to generate each invoice

## Layouts

Invoices cycle through 5 visually distinct templates (10 of each), so you're
testing extraction against real layout variety, not just one template:

| Layout | Style |
|---|---|
| `classic_table` | Traditional bordered line-item table |
| `minimal_modern` | Clean sans-serif, no borders, blue accent |
| `two_column` | Vendor / Bill-To side by side, shaded totals box |
| `compact_receipt` | Narrow receipt-style, dashed dividers |
| `letterhead_bold` | Dark header band, shaded alternating rows |

## Seeded edge cases (19 of the 50)

These are intentional, and are exactly the kind of thing your `needs_review`
logic should catch:

| Edge case | What it tests |
|---|---|
| `total_mismatch` | Subtotal + tax ≠ stated total — should trigger the server-side reconciliation check and force `needs_review = true` regardless of what Claude self-reports |
| `no_po` | No PO number on the document — `po_number` should come back `null`, not hallucinated |
| `no_due_date` | No due date printed — same idea |
| `many_items` | 8–11 line items — tests that the line-item table is read completely, not truncated |
| `usd` | Currency is USD, not the default CAD — tests that currency isn't assumed |
| `unusual_date_format` | Date printed as DD/MM/YYYY instead of the usual ISO format — tests date-parsing robustness |

The `edge_case` and `notes` columns in `ground_truth.csv` identify exactly
which invoices carry which case.

## How to use this for testing

1. Upload some or all of the PDFs through the app's `/` upload page.
2. For each one, compare what landed in the review queue against the
   matching row in `ground_truth.csv` (match on `filename` vs the invoice
   number extracted, or just eyeball vendor + invoice number).
3. Specifically check:
   - Did every `total_mismatch` invoice actually get flagged `needs_review`?
   - Did `no_po` / `no_due_date` invoices come back with `null`, not a
     guessed value?
   - Did `many_items` invoices capture every line item, not just the first
     few?
   - Did `usd` invoices get `currency: "USD"`, not defaulted to CAD?

If you want a quick pass/fail summary instead of manual comparison, this is
also a natural fit for a small script that pulls extracted rows from Neon
and diffs them against `ground_truth.csv` — happy to build that next if
useful.

## Note on the data

All vendor names, addresses, and business numbers are fictional (generated,
not real companies). Amounts and dates are randomized. Safe to use, share,
or commit to a test fixtures folder — nothing here is real.
