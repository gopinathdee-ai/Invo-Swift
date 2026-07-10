// app/api/invoices/upload/route.ts
//
// Full pipeline: receive PDF -> upload to R2 (private) -> extract
// fields via Claude -> validate -> insert invoice + line items into Neon.
// Duplicate (vendor_name, invoice_number) is rejected at the DB level via
// the unique index in migrations/0001_init.sql.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { InvoiceExtractionSchema } from "@/lib/extraction/schema";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "@/lib/extraction/prompt";
import { uploadInvoicePdf } from "@/lib/storage";
import { query, queryOne, PG_UNIQUE_VIOLATION } from "@/lib/db";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const invoiceToolSchema = zodToJsonSchema(InvoiceExtractionSchema, "InvoiceExtraction");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pdf = buffer.toString("base64");

    // 1. Upload the original PDF first, so we keep the source document
    //    even if extraction fails.
    const storagePath = await uploadInvoicePdf(file.name, buffer);

    // 2. Ask Claude to extract structured fields.
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
            { type: "text", text: EXTRACTION_USER_PROMPT },
          ],
        },
      ],
      tools: [
        {
          name: "record_invoice_extraction",
          description: "Records the extracted invoice fields.",
          // @ts-expect-error - zod-to-json-schema output is compatible at runtime
          input_schema: invoiceToolSchema.definitions?.InvoiceExtraction ?? invoiceToolSchema,
        },
      ],
      tool_choice: { type: "tool", name: "record_invoice_extraction" },
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock) {
      return NextResponse.json({ error: "Model did not return structured output" }, { status: 502 });
    }

    const parsed = InvoiceExtractionSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Extraction failed validation", details: parsed.error.format() },
        { status: 422 }
      );
    }

    const extraction = parsed.data;

    // 3. Extra validation, verified server-side rather than trusting the
    //    model's self-reported needs_review.
    let needsReview = extraction.needs_review;
    let reviewNotes = extraction.review_notes ?? "";
    if (extraction.subtotal != null && extraction.tax_amount != null) {
      const expectedTotal = extraction.subtotal + extraction.tax_amount;
      if (Math.abs(expectedTotal - extraction.total_amount) > 0.01) {
        needsReview = true;
        reviewNotes += ` [Auto-check] subtotal + tax (${expectedTotal.toFixed(2)}) does not match total (${extraction.total_amount.toFixed(2)}).`;
      }
    }

    // 4. Insert the invoice row.
    let invoice;
    try {
      invoice = await queryOne(
        `insert into invoices (
           original_filename, storage_path, vendor_name, vendor_address, vendor_tax_id,
           bill_to_name, bill_to_address, invoice_number, po_number, invoice_date, due_date,
           currency, subtotal, tax_amount, tax_rate_pct, total_amount,
           confidence, needs_review, review_notes, status, raw_extraction
         ) values (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending_review',$20
         )
         returning *`,
        [
          file.name,
          storagePath,
          extraction.vendor_name,
          extraction.vendor_address,
          extraction.vendor_tax_id,
          extraction.bill_to_name,
          extraction.bill_to_address,
          extraction.invoice_number,
          extraction.po_number,
          extraction.invoice_date,
          extraction.due_date,
          extraction.currency,
          extraction.subtotal,
          extraction.tax_amount,
          extraction.tax_rate_pct,
          extraction.total_amount,
          extraction.confidence,
          needsReview,
          reviewNotes || null,
          JSON.stringify(extraction),
        ]
      );
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === PG_UNIQUE_VIOLATION) {
        return NextResponse.json(
          {
            error: `An invoice with number "${extraction.invoice_number}" from "${extraction.vendor_name}" already exists.`,
          },
          { status: 409 }
        );
      }
      throw err;
    }

    // 5. Insert line items.
    for (const item of extraction.line_items) {
      await query(
        `insert into invoice_line_items (invoice_id, description, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5)`,
        [invoice!.id, item.description, item.quantity, item.unit_price, item.line_total]
      );
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    console.error("Invoice upload/extraction error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
