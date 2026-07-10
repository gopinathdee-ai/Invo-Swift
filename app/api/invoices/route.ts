// app/api/invoices/route.ts
// GET /api/invoices?status=pending_review — list invoices, newest first.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");

  try {
    const invoices = status
      ? await query("select * from invoices where status = $1 order by created_at desc", [status])
      : await query("select * from invoices order by created_at desc");

    return NextResponse.json({ invoices });
  } catch (err) {
    console.error("List invoices error:", err);
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}
