// schema.ts
// Defines the shape of data we want extracted from every invoice.
// Using Zod lets us both validate Claude's output AND generate the
// JSON schema we hand to the API in one place.

import { z } from "zod";

export const LineItemSchema = z.object({
  description: z.string().describe("Description of the product or service"),
  quantity: z.number().nullable().describe("Quantity, null if not specified"),
  unit_price: z.number().nullable().describe("Price per unit, null if not specified"),
  line_total: z.number().describe("Total for this line item"),
});

export const InvoiceExtractionSchema = z.object({
  // Vendor / issuer
  vendor_name: z.string().describe("Name of the company issuing the invoice"),
  vendor_address: z.string().nullable(),
  vendor_tax_id: z.string().nullable().describe("GST/HST number, EIN, VAT number, etc."),

  // Bill-to / customer
  bill_to_name: z.string().nullable(),
  bill_to_address: z.string().nullable(),

  // Invoice identifiers
  invoice_number: z.string().describe("Unique invoice identifier"),
  po_number: z.string().nullable().describe("Purchase order number, if referenced"),
  invoice_date: z.string().describe("ISO 8601 date, e.g. 2026-07-09"),
  due_date: z.string().nullable().describe("ISO 8601 date"),

  // Financials
  currency: z.string().describe("ISO 4217 currency code, e.g. CAD, USD"),
  subtotal: z.number().nullable(),
  tax_amount: z.number().nullable(),
  tax_rate_pct: z.number().nullable(),
  total_amount: z.number().describe("Grand total due"),

  // Line items
  line_items: z.array(LineItemSchema),

  // Extraction metadata — critical for building a safe review workflow
  confidence: z.enum(["high", "medium", "low"])
    .describe("Your confidence that every field above was read correctly from the document"),
  needs_review: z.boolean()
    .describe("True if any field was ambiguous, missing, handwritten, low image quality, or inconsistent (e.g. line items don't sum to subtotal)"),
  review_notes: z.string().nullable()
    .describe("If needs_review is true, briefly explain what's uncertain"),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
