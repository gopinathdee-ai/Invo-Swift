"use client";
// app/page.tsx — upload page + recent invoices

import { useCallback, useEffect, useState } from "react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { InvoiceTable, type InvoiceRow } from "@/components/InvoiceTable";

export default function HomePage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/invoices");
    const data = await res.json();
    setInvoices(data.invoices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload invoices</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          Drop PDF invoices below. Each one is read automatically and queued for review.
        </p>
      </div>

      <UploadDropzone onUploaded={refresh} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
            Recent invoices
          </h2>
          <a href="/review" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            View review queue →
          </a>
        </div>
        {!loading && <InvoiceTable invoices={invoices.slice(0, 8)} />}
      </div>
    </div>
  );
}
