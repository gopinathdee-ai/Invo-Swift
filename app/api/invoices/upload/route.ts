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
import { getExtractionSystemPrompt, EXTRACTION_USER_PROMPT } from "@/lib/extraction/prompt";
import { uploadInvoicePdf } from "@/lib/storage";
import { query, queryOne, PG_UNIQUE_VIOLATION } from "@/lib/db";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const invoiceToolSchema = zodToJsonSchema(InvoiceExtractionSchema, "InvoiceExtraction");

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  let invoiceId: string | null = null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pdf = buffer.toString("base64");

    // 1. Upload the original PDF first, so we keep the source document
    //    even if extraction fails.
    const storagePath = await uploadInvoicePdf(file.name, buffer);

    // 2. Create invoice record in "processing" state before attempting extraction
    let processingInvoice = await queryOne(
      `insert into invoices (original_filename, storage_path, status)
       values ($1, $2, 'processing')
       returning *`,
      [file.name, storagePath]
    );
    invoiceId = processingInvoice!.id;

    // 3. Ask Claude to extract structured fields.
    const systemPrompt = getExtractionSystemPrompt({
      flagIfInferredBillTo: process.env.NEEDS_REVIEW_IF_INFERRED_BILL_TO !== "false",
      flagIfIllegibleBillTo: process.env.NEEDS_REVIEW_IF_ILLEGIBLE_BILL_TO !== "false",
      flagIfCalculatedDueDate: process.env.NEEDS_REVIEW_IF_CALCULATED_DUE_DATE !== "false",
    });

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
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
      await queryOne(
        `update invoices set status = 'failed', review_notes = $1 where id = $2 returning *`,
        ["Extraction failed: Model did not return structured output", invoiceId]
      );
      return NextResponse.json({ error: "Model did not return structured output" }, { status: 502 });
    }

    const parsed = InvoiceExtractionSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      const errorMsg = `Extraction failed validation: ${JSON.stringify(parsed.error.format())}`;
      await queryOne(
        `update invoices set status = 'failed', review_notes = $1 where id = $2 returning *`,
        [errorMsg, invoiceId]
      );
      return NextResponse.json(
        { error: "Extraction failed validation", details: parsed.error.format() },
        { status: 422 }
      );
    }

    const extraction = parsed.data;

    // 4. Extra validation, verified server-side rather than trusting the
    //    model's self-reported needs_review.
    let needsReview = extraction.needs_review;
    let reviewNotes = extraction.review_notes ?? "";
    let validationNotes = extraction.validation_notes ?? "";

    if (extraction.subtotal != null && extraction.tax_amount != null) {
      const expectedTotal = extraction.subtotal + extraction.tax_amount;
      if (Math.abs(expectedTotal - extraction.total_amount) > 0.01) {
        needsReview = true;
        validationNotes += ` [Auto-check] subtotal + tax (${expectedTotal.toFixed(2)}) does not match total (${extraction.total_amount.toFixed(2)}).`;
      }
    }

    // Determine final status based on extraction outcome
    const finalStatus = needsReview ? "pending_review" : "ready";

    // 5. Update the processing invoice with extracted data
    let invoice;
    try {
      invoice = await queryOne(
        `update invoices set
           vendor_name = $1,
           vendor_tax_id = $2,
           bill_to_name = $3,
           invoice_number = $4,
           po_number = $5,
           invoice_date = $6,
           due_date = $7,
           currency = $8,
           subtotal = $9,
           tax_amount = $10,
           tax_rate_pct = $11,
           total_amount = $12,
           confidence = $13,
           needs_review = $14,
           review_notes = $15,
           validation_notes = $16,
           raw_extraction = $17,
           status = $18
         where id = $19
         returning *`,
        [
          extraction.vendor_name,
          extraction.vendor_tax_id,
          extraction.bill_to_name,
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
          validationNotes || null,
          JSON.stringify(extraction),
          finalStatus,
          invoiceId,
        ]
      );
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      if (pgErr.code === PG_UNIQUE_VIOLATION) {
        await queryOne(
          `update invoices set status = 'failed', review_notes = $1 where id = $2 returning *`,
          [`Duplicate: An invoice with number "${extraction.invoice_number}" from "${extraction.vendor_name}" already exists.`, invoiceId]
        );
        return NextResponse.json(
          {
            error: `An invoice with number "${extraction.invoice_number}" from "${extraction.vendor_name}" already exists.`,
          },
          { status: 409 }
        );
      }
      throw err;
    }

    // 6. Insert line items.
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
    if (invoiceId) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error during extraction";
      await queryOne(
        `update invoices set status = 'failed', review_notes = $1 where id = $2 returning *`,
        [errorMsg, invoiceId]
      );
    }
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
