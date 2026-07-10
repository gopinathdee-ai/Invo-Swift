// components/StatusBadge.tsx
const STYLES: Record<string, { fg: string; bg: string; label: string }> = {
  pending_review: { fg: "var(--pending-fg)", bg: "var(--pending-bg)", label: "Needs review" },
  approved: { fg: "var(--approved-fg)", bg: "var(--approved-bg)", label: "Approved" },
  rejected: { fg: "var(--rejected-fg)", bg: "var(--rejected-bg)", label: "Rejected" },
  posted: { fg: "var(--posted-fg)", bg: "var(--posted-bg)", label: "Posted" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? STYLES.pending_review;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: style.fg, background: style.bg }}
    >
      {style.label}
    </span>
  );
}
