// components/InvoiceTable.tsx
import { StatusBadge } from "./StatusBadge";

export type InvoiceRow = {
  id: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  currency: string | null;
  status: string;
  needs_review: boolean;
};

function formatAmount(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency ?? "CAD" }).format(amount);
}

function formatDate(date: string | null) {
  if (!date) return "—";
  // Handle ISO strings with or without time
  if (date.includes("T")) return date.split("T")[0];
  // Already in YYYY-MM-DD format
  if (date.match(/^\d{4}-\d{2}-\d{2}$/)) return date;
  return date;
}

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return (
      <div
        className="rounded-lg px-6 py-12 text-center text-sm"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-muted)" }}
      >
        No invoices yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--bg)", color: "var(--ink-muted)" }}>
            <th className="text-left font-medium px-4 py-2.5">Vendor</th>
            <th className="text-left font-medium px-4 py-2.5">Invoice #</th>
            <th className="text-left font-medium px-4 py-2.5">Date</th>
            <th className="text-right font-medium px-4 py-2.5">Amount</th>
            <th className="text-left font-medium px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              onClick={() => (window.location.href = `/review/${inv.id}`)}
              className="cursor-pointer hover:bg-[var(--bg)] transition-colors"
              style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <td className="px-4 py-3">{inv.vendor_name ?? "—"}</td>
              <td className="px-4 py-3 font-ledger">{inv.invoice_number ?? "—"}</td>
              <td className="px-4 py-3 font-ledger" style={{ color: "var(--ink-muted)" }}>
                {formatDate(inv.invoice_date)}
              </td>
              <td className="px-4 py-3 text-right font-ledger">
                {formatAmount(inv.total_amount, inv.currency)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={inv.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
