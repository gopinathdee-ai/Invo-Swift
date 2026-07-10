"use client";
// app/review/[id]/page.tsx
// Split view: source PDF on the left, editable extracted fields on the
// right. Save persists edits without changing status; Approve/Reject also
// change status and stamp reviewed_at.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";

type Invoice = {
  id: string;
  vendor_name: string | null;
  invoice_number: string | null;
  po_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: string;
  confidence: string | null;
  needs_review: boolean;
  review_notes: string | null;
};

type LineItem = {
  id: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number;
};

const FIELDS: { key: keyof Invoice; label: string; type?: string }[] = [
  { key: "vendor_name", label: "Vendor" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "po_number", label: "PO #" },
  { key: "invoice_date", label: "Invoice date", type: "date" },
  { key: "due_date", label: "Due date", type: "date" },
  { key: "currency", label: "Currency" },
  { key: "subtotal", label: "Subtotal", type: "number" },
  { key: "tax_amount", label: "Tax", type: "number" },
  { key: "total_amount", label: "Total", type: "number" },
];

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`/api/invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoice(data.invoice);
        setLineItems(data.lineItems ?? []);
        setPdfUrl(data.pdfUrl);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!invoice) {
    return <p style={{ color: "var(--ink-muted)" }}>Loading…</p>;
  }

  const updateField = (key: keyof Invoice, value: string) => {
    setInvoice((prev) => (prev ? { ...prev, [key]: value === "" ? null : value } : prev));
  };

  const save = async (statusOverride?: "approved" | "rejected") => {
    setSaving(true);
    const body: Record<string, unknown> = { ...invoice };
    if (statusOverride) body.status = statusOverride;

    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (res.ok) {
      if (statusOverride) router.push("/review");
      else load();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <a href="/review" className="text-sm" style={{ color: "var(--ink-muted)" }}>
            ← Back to review queue
          </a>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {invoice.vendor_name ?? "Unknown vendor"}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => save()}
            disabled={saving}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            Save edits
          </button>
          <button
            onClick={() => save("rejected")}
            disabled={saving}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{ color: "var(--rejected-fg)", background: "var(--rejected-bg)" }}
          >
            Reject
          </button>
          <button
            onClick={() => save("approved")}
            disabled={saving}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{ color: "var(--accent-ink)", background: "var(--accent)" }}
          >
            Approve
          </button>
        </div>
      </div>

      {invoice.needs_review && (
        <div
          className="rounded px-4 py-3 text-sm"
          style={{ background: "var(--pending-bg)", color: "var(--pending-fg)" }}
        >
          <strong>Flagged for review</strong>
          {invoice.review_notes ? ` — ${invoice.review_notes}` : ""}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* PDF preview */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", height: "75vh" }}>
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full" title="Invoice PDF" />
          ) : (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--ink-muted)" }}>
              PDF unavailable
            </div>
          )}
        </div>

        {/* Editable fields */}
        <div className="space-y-4">
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-3 items-center gap-2">
                <label className="text-sm" style={{ color: "var(--ink-muted)" }}>
                  {f.label}
                </label>
                <input
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "0.01" : undefined}
                  value={(invoice[f.key] as string | number | null) ?? ""}
                  onChange={(e) => updateField(f.key, e.target.value)}
                  className="col-span-2 px-2.5 py-1.5 rounded text-sm font-ledger"
                  style={{ border: "1px solid var(--border)" }}
                />
              </div>
            ))}
          </div>

          <div
            className="rounded-lg p-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-sm font-medium mb-2" style={{ color: "var(--ink-muted)" }}>
              Line items
            </h3>
            <table className="w-full text-sm font-ledger">
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-1.5 pr-2 font-sans">{li.description}</td>
                    <td className="py-1.5 pr-2 text-right">{li.quantity ?? ""}</td>
                    <td className="py-1.5 text-right">{li.line_total.toFixed(2)}</td>
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-2 text-center font-sans" style={{ color: "var(--ink-muted)" }}>
                      No line items extracted
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
