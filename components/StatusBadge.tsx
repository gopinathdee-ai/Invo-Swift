// components/StatusBadge.tsx
const STYLES: Record<string, { fg: string; bg: string; label: string }> = {
  processing: { fg: "#6366f1", bg: "#e0e7ff", label: "Processing" },
  failed: { fg: "#dc2626", bg: "#fee2e2", label: "Failed" },
  pending_review: { fg: "var(--pending-fg)", bg: "var(--pending-bg)", label: "Needs review" },
  ready: { fg: "#059669", bg: "#d1fae5", label: "Ready" },
  approved: { fg: "var(--approved-fg)", bg: "var(--approved-bg)", label: "Approved" },
  rejected: { fg: "var(--rejected-fg)", bg: "var(--rejected-bg)", label: "Rejected" },
  posted: { fg: "var(--posted-fg)", bg: "var(--posted-bg)", label: "Posted" },
};

export function StatusBadge({ status, needsReview }: { status: string; needsReview?: boolean }) {
  let displayStatus = status;
  if (status === "pending_review" && needsReview === false) {
    displayStatus = "ready";
  }
  const style = STYLES[displayStatus] ?? STYLES.pending_review;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: style.fg, background: style.bg }}
    >
      {style.label}
    </span>
  );
}
