// app/api/invoices/route.ts
// GET /api/invoices?status=pending_review — list invoices, newest first.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");

  try {
    let invoices;
    if (status === "pending_review") {
      // "Needs review" filter: show invoices with data quality issues
      invoices = await query(
        "select * from invoices where needs_review = true order by created_at desc"
      );
    } else if (status === "ready") {
      // "Ready" filter: show invoices without issues
      invoices = await query(
        "select * from invoices where status = 'ready' order by created_at desc"
      );
    } else if (status) {
      // Other statuses (failed, approved, rejected, posted)
      invoices = await query(
        "select * from invoices where status = $1 order by created_at desc",
        [status]
      );
    } else {
      // No filter: show all
      invoices = await query("select * from invoices order by created_at desc");
    }

    return NextResponse.json({ invoices });
  } catch (err) {
    console.error("List invoices error:", err);
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}
