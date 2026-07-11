// app/api/invoices/[id]/reprocess/route.ts
// POST -> re-extract an existing invoice from its stored PDF

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { InvoiceExtractionSchema } from "@/lib/extraction/schema";
import { getExtractionSystemPrompt, EXTRACTION_USER_PROMPT } from "@/lib/extraction/prompt";
import { getSignedPdfUrl, downloadPdfFromStorage } from "@/lib/storage";
import { query, queryOne } from "@/lib/db";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const invoiceToolSchema = zodToJsonSchema(InvoiceExtractionSchema, "InvoiceExtraction");

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // 1. Get the existing invoice to find the stored PDF
    const invoice = await queryOne("select * from invoices where id = $1", [params.id]);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.storage_path) {
      return NextResponse.json(
        { error: "Invoice has no stored PDF to reprocess" },
        { status: 400 }
      );
    }

    // 2. Download the PDF from storage
    const pdfBuffer = await downloadPdfFromStorage(invoice.storage_path as string);
    const base64Pdf = pdfBuffer.toString("base64");

    // 3. Re-extract with Claude using current policy
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

    // 4. Validate line items
    let needsReview = extraction.needs_review;
    let reviewNotes = extraction.review_notes ?? "";
    if (extraction.subtotal != null && extraction.tax_amount != null) {
      const expectedTotal = extraction.subtotal + extraction.tax_amount;
      if (Math.abs(expectedTotal - extraction.total_amount) > 0.01) {
        needsReview = true;
        reviewNotes += ` [Auto-check] subtotal + tax (${expectedTotal.toFixed(2)}) does not match total (${extraction.total_amount.toFixed(2)}).`;
      }
    }

    // 5. Update the invoice row
    const updatedInvoice = await queryOne(
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
        raw_extraction = $16,
        status = 'pending_review'
      where id = $17
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
        JSON.stringify(extraction),
        params.id,
      ]
    );

    // 6. Replace line items
    await query("delete from invoice_line_items where invoice_id = $1", [params.id]);
    for (const item of extraction.line_items) {
      await query(
        `insert into invoice_line_items (invoice_id, description, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5)`,
        [params.id, item.description, item.quantity, item.unit_price, item.line_total]
      );
    }

    return NextResponse.json({ invoice: updatedInvoice }, { status: 200 });
  } catch (err) {
    console.error("Invoice reprocess error:", err);
    return NextResponse.json({ error: "Reprocessing failed" }, { status: 500 });
  }
}
