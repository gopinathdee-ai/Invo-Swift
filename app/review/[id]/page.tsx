"use client";
// app/review/[id]/page.tsx
// Split view: source PDF on the left, editable extracted fields on the
// right. Save persists edits without changing status; Approve/Reject also
// change status and stamp reviewed_at.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { DatePickerInput } from "@/components/DatePickerInput";

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
  validation_notes: string | null;
  [key: string]: unknown;
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
  const [rawExtraction, setRawExtraction] = useState<unknown>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessStatus, setReprocessStatus] = useState<"idle" | "processing" | "success">("idle");
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Fallback to raw_extraction if columns are null
  const getInvoiceValue = (key: keyof Invoice): any => {
    if (!invoice) return null;
    const columnValue = invoice[key];
    if (columnValue !== null && columnValue !== undefined) return columnValue;

    // If null, try to get from raw_extraction
    if (rawExtraction && typeof rawExtraction === "object") {
      const extracted = rawExtraction as any;
      return extracted[key];
    }
    return null;
  };

  const formatNumberWithCommas = (value: any): string => {
    if (value === null || value === undefined || value === "") return "";
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const load = () => {
    fetch(`/api/invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setInvoice(data.invoice);
        setLineItems(data.lineItems ?? []);
        setPdfUrl(data.pdfUrl);
        setRawExtraction(data.rawExtraction);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!invoice) {
    return <p style={{ color: "var(--ink-muted)" }}>Loading…</p>;
  }

  const formatDateForInput = (value: unknown): string => {
    if (!value) return "";
    if (typeof value === "string") {
      // Handle ISO string with time portion
      if (value.includes("T")) return value.split("T")[0];
      // Already in YYYY-MM-DD format
      if (value.match(/^\d{4}-\d{2}-\d{2}$/)) return value;
      return value;
    }
    if (value instanceof Date) return value.toISOString().split("T")[0];
    if (typeof value === "number") {
      // Handle timestamp
      return new Date(value).toISOString().split("T")[0];
    }
    const str = String(value);
    // If it has T in it, extract the date part
    if (str.includes("T")) return str.split("T")[0];
    return str;
  };


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

  const reprocess = async () => {
    setConfirmDialog({
      open: true,
      title: "Reprocess Invoice",
      message: "Reprocess this invoice with the current extraction policy?",
      onConfirm: () => doReprocess(),
    });
  };

  const doReprocess = async () => {
    setConfirmDialog({ ...confirmDialog, open: false });
    setReprocessing(true);
    setReprocessStatus("processing");

    try {
      // Start the API call
      const fetchPromise = fetch(`/api/invoices/${id}/reprocess`, { method: "POST" });

      // Ensure at least 2 seconds of visible processing state
      const delayPromise = new Promise((resolve) => setTimeout(resolve, 2000));

      const res = await fetchPromise;

      if (res.ok) {
        // Wait for the delay to complete so user sees "Processing..."
        await delayPromise;
        setReprocessStatus("success");

        // Show success for 1.5 seconds before reloading
        await new Promise((resolve) => setTimeout(resolve, 1500));
        load();
        setReprocessStatus("idle");
      } else {
        await delayPromise;
        alert("Failed to reprocess invoice");
        setReprocessStatus("idle");
      }
    } catch (err) {
      alert("Reprocessing failed");
      setReprocessStatus("idle");
    } finally {
      setReprocessing(false);
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
            <StatusBadge status={invoice.status} needsReview={invoice.needs_review} />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => reprocess()}
            disabled={reprocessing}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:shadow-md transition-all flex items-center gap-2"
            style={{
              background:
                reprocessStatus === "success"
                  ? "var(--approved-bg)"
                  : reprocessStatus === "processing"
                    ? "var(--pending-bg)"
                    : "var(--surface)",
              border: "1px solid var(--border)",
              color:
                reprocessStatus === "success"
                  ? "var(--approved-fg)"
                  : reprocessStatus === "processing"
                    ? "var(--pending-fg)"
                    : "var(--ink-muted)",
              cursor: reprocessing ? "wait" : "pointer",
              opacity: reprocessing ? 0.7 : 1,
            }}
          >
            {reprocessStatus === "processing" ? (
              <>
                <i className="fas fa-spinner animate-spin" style={{ fontSize: "14px" }} />
                Processing...
              </>
            ) : reprocessStatus === "success" ? (
              <>
                <i className="fas fa-check" style={{ fontSize: "14px" }} />
                Reprocessed
              </>
            ) : (
              <>
                <i className="fas fa-sync-alt" style={{ fontSize: "14px" }} />
                Reprocess
              </>
            )}
          </button>
          <button
            onClick={() => save()}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:shadow-md transition-all"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}
          >
            Save edits
          </button>
          <button
            onClick={() => save("rejected")}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:shadow-md transition-all flex items-center gap-2"
            style={{ color: "var(--rejected-fg)", background: "var(--rejected-bg)" }}
          >
            <i className="fas fa-times" style={{ fontSize: "14px" }} />
            Reject
          </button>
          <button
            onClick={() => save("approved")}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:shadow-md transition-all flex items-center gap-2"
            style={{ color: "var(--accent-ink)", background: "var(--accent)" }}
          >
            <i className="fas fa-check" style={{ fontSize: "14px" }} />
            Approve
          </button>
        </div>
      </div>

      {invoice.needs_review && (
        <div
          className="rounded-lg p-4 text-sm border-l-4 flex items-start gap-3"
          style={{
            background: "var(--pending-bg)",
            color: "var(--pending-fg)",
            borderLeftColor: "var(--pending-fg)",
          }}
        >
          <i className="fas fa-exclamation-circle mt-0.5 flex-shrink-0" style={{ fontSize: "18px" }} />
          <div>
            <strong className="block">Flagged for review</strong>
            {invoice.review_notes && <p className="mt-1 text-xs opacity-90">{invoice.review_notes}</p>}
          </div>
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
            className="rounded-lg p-6 space-y-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-3 items-center gap-4">
                <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
                  {f.label}
                </label>
                {f.type === "date" ? (
                  <div className="col-span-2">
                    <DatePickerInput
                      value={(invoice[f.key] as string) ?? ""}
                      onChange={(value) => updateField(f.key, value)}
                    />
                  </div>
                ) : (
                  <input
                    type={f.type === "number" ? "text" : f.type ?? "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    value={
                      f.type === "number"
                        ? formatNumberWithCommas(getInvoiceValue(f.key as keyof Invoice))
                        : (getInvoiceValue(f.key as keyof Invoice) ?? "")
                    }
                    onChange={(e) => {
                      const rawValue = f.type === "number" ? e.target.value.replace(/,/g, "") : e.target.value;
                      updateField(f.key, rawValue);
                    }}
                    className="col-span-2 px-3 py-2.5 rounded-lg text-sm font-ledger focus:outline-none focus:ring-2 focus:ring-offset-2"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {invoice.validation_notes && (
            <div
              className="rounded-lg p-3 text-xs flex items-start gap-2 border-l-4"
              style={{
                background: "var(--bg)",
                color: "var(--ink-muted)",
                borderLeftColor: "var(--accent)",
              }}
            >
              <i className="fas fa-info-circle mt-0.5 flex-shrink-0" style={{ fontSize: "12px", color: "var(--accent)" }} />
              <div>
                <strong className="block text-xs">Validation info</strong>
                <p className="mt-1 opacity-90">{invoice.validation_notes}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-8 rounded-lg p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--ink)" }}>
          <i className="fas fa-list" style={{ fontSize: "14px", color: "var(--accent)" }} />
          Line items
        </h3>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm font-ledger">
            <thead style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                <th className="px-4 py-2 text-left font-medium" style={{ color: "var(--ink-muted)" }}>
                  Description
                </th>
                <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--ink-muted)" }}>
                  Qty
                </th>
                <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--ink-muted)" }}>
                  Unit Price
                </th>
                <th className="px-4 py-2 text-right font-medium" style={{ color: "var(--ink-muted)" }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 font-sans">{li.description}</td>
                  <td className="px-4 py-3 text-right">
                    {li.quantity ? Number(li.quantity).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {li.unit_price ? formatNumberWithCommas(li.unit_price) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--accent)] font-semibold">
                    {formatNumberWithCommas(li.line_total)}
                  </td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center font-sans"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    <i className="fas fa-inbox" style={{ fontSize: "20px", marginBottom: "8px", display: "block" }} />
                    No line items extracted
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <details className="mt-8 rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <summary
          className="cursor-pointer px-6 py-4 text-sm font-medium flex items-center gap-2 hover:bg-[var(--bg)] transition-colors"
          style={{ color: "var(--ink-muted)" }}
        >
          <i className="fas fa-code" style={{ fontSize: "14px" }} />
          Raw Extraction
          <i
            className="fas fa-chevron-down ml-auto transition-transform"
            style={{
              fontSize: "12px",
            }}
          />
        </summary>
        <pre
          className="mt-0 px-6 py-4 text-xs overflow-auto bg-[var(--bg)] border-t font-ledger"
          style={{ color: "var(--ink-muted)" }}
        >
          {JSON.stringify(rawExtraction, null, 2)}
        </pre>
      </details>

      {reprocessStatus === "processing" && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <div className="text-center">
            <i className="fas fa-spinner animate-spin" style={{ fontSize: "48px", color: "var(--accent)", marginBottom: "16px", display: "block" }} />
            <p style={{ color: "var(--ink)" }} className="text-sm font-medium">
              Reprocessing invoice...
            </p>
          </div>
        </div>
      )}

      {confirmDialog.open && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--ink)" }}>
              <i className="fas fa-question-circle" style={{ color: "var(--accent)" }} />
              {confirmDialog.title}
            </h2>
            <p className="mb-6" style={{ color: "var(--ink-muted)" }}>
              {confirmDialog.message}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: "var(--bg)", color: "var(--ink)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:shadow-lg"
                style={{ background: "var(--accent)" }}
              >
                <i className="fas fa-check mr-2" />
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
