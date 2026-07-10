"use client";
// app/review/page.tsx — all invoices, filterable by status

import { useEffect, useState } from "react";
import { InvoiceTable, type InvoiceRow } from "@/components/InvoiceTable";

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "posted", label: "Posted" },
];

export default function ReviewQueuePage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [filter, setFilter] = useState("pending_review");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    fetch(`/api/invoices${qs}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoices(data.invoices ?? []);
        setLoading(false);
      });
  }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          Click an invoice to view the source PDF next to what was extracted.
        </p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={
              filter === f.value
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { background: "var(--surface)", color: "var(--ink-muted)", border: "1px solid var(--border)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {!loading && <InvoiceTable invoices={invoices} />}
    </div>
  );
}
