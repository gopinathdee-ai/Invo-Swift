// app/api/invoices/[id]/route.ts
// GET   -> single invoice + line items + a signed URL to view the source PDF
// PATCH -> edit fields and/or change status (approve / reject), records reviewer

import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSignedPdfUrl } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await queryOne("select * from invoices where id = $1", [params.id]);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const lineItems = await query("select * from invoice_line_items where invoice_id = $1", [params.id]);

    // storage_path is null for manually-entered/demo rows.
    const pdfUrl = invoice.storage_path ? await getSignedPdfUrl(invoice.storage_path as string) : null;

    return NextResponse.json({ invoice, lineItems, pdfUrl });
  } catch (err) {
    console.error("Get invoice error:", err);
    return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
  }
}

const ALLOWED_FIELDS = [
  "vendor_name",
  "vendor_address",
  "vendor_tax_id",
  "bill_to_name",
  "bill_to_address",
  "invoice_number",
  "po_number",
  "invoice_date",
  "due_date",
  "currency",
  "subtotal",
  "tax_amount",
  "tax_rate_pct",
  "total_amount",
  "status",
  "reviewed_by",
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      setClauses.push(`${key} = $${i}`);
      values.push(body[key] === "" ? null : body[key]);
      i++;
    }
  }

  if (body.status === "approved" || body.status === "rejected") {
    setClauses.push(`reviewed_at = now()`);
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  values.push(params.id);

  try {
    const invoice = await queryOne(
      `update invoices set ${setClauses.join(", ")} where id = $${i} returning *`,
      values
    );
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (err) {
    console.error("Update invoice error:", err);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
