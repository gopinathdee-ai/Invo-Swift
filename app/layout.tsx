// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice Intake",
  description: "AP invoice extraction — proof of concept",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-sm flex items-center justify-center text-xs font-ledger font-semibold"
                  style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                >
                  IN
                </span>
                <span className="font-semibold tracking-tight">Invoice Intake</span>
              </a>
              <nav className="flex gap-5 text-sm" style={{ color: "var(--ink-muted)" }}>
                <a href="/" className="hover:text-[var(--ink)]">Upload</a>
                <a href="/review" className="hover:text-[var(--ink)]">Review queue</a>
              </nav>
            </div>
          </header>
          <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
