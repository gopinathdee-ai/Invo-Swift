// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InvoSwift",
  description: "AP invoice extraction — proof of concept",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header
            className="border-b backdrop-blur-sm"
            style={{
              borderColor: "var(--border)",
              background: "rgba(255, 255, 255, 0.95)",
            }}
          >
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <a href="/" className="flex items-center gap-3 group">
                <img
                  src="/icon.png"
                  alt="InvoSwift"
                  className="w-8 h-8 rounded-lg transition-transform group-hover:scale-105"
                />
                <span className="font-bold text-lg tracking-tight" style={{ color: "var(--ink)" }}>
                  InvoSwift
                </span>
              </a>
              <nav className="flex gap-8 text-sm font-medium">
                <a
                  href="/"
                  className="transition-colors hover:text-[var(--accent)]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <i className="fas fa-cloud-upload-alt mr-1.5"></i>
                  Upload
                </a>
                <a
                  href="/review"
                  className="transition-colors hover:text-[var(--accent)]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <i className="fas fa-list-check mr-1.5"></i>
                  Review queue
                </a>
              </nav>
            </div>
          </header>
          <main className="max-w-6xl mx-auto px-6 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
