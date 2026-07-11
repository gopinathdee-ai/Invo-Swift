# InvoSwift — Proof of Concept

A click-through internal app: drop PDF invoices in, watch Claude extract the
fields, review/edit/approve on a split-screen PDF + form view.

**Hosting:** Vercel · **Database:** Neon (Postgres) · **File storage:** Cloudflare R2

## Pages

- **`/`** — Upload page. Drag-and-drop PDFs, see them extracted in real
  time, view the most recent invoices.
- **`/review`** — Full review queue, filterable by status (needs review /
  approved / rejected / posted).
- **`/review/[id]`** — Detail view: source PDF on the left, editable
  extracted fields + line items on the right. Save edits, or Approve/Reject.

## Why R2 for storage

Neon is Postgres only — it doesn't host files. Supabase bundled file storage
with its database, but since you're using Neon, PDFs need a separate object
store. R2 is S3-compatible, so `lib/storage.ts` uses the standard AWS SDK v3
(`@aws-sdk/client-s3`) pointed at R2's endpoint — no Cloudflare-specific SDK
needed. Files are kept private in the bucket; the review page gets a
short-lived presigned URL to display the PDF, same pattern as the earlier
Supabase/Vercel Blob signed-URL approaches. R2 has a generous, permanent
free tier (10 GB storage, 1M writes/month, 10M reads/month, zero egress
ever), which comfortably covers this at POC and small-business scale.

## Setup

### 1. Anthropic Console — Claude API access
The Claude API is separate from any claude.ai subscription you may have —
it's billed per token and needs its own key and credits:
- Sign in at **console.anthropic.com** (create an organization if you
  haven't already)
- **Settings → Billing** → add a payment method and load credits (there's
  no free tier for API usage; you're billed for what you use)
- **Settings → API Keys → Create Key** → copy it once, it won't be shown
  again — this is your `ANTHROPIC_API_KEY`

### 2. Install dependencies
```bash
npm install
```

### 3. Neon project
- Create a project at neon.tech (or use an existing one)
- Copy the **pooled** connection string from the dashboard

### 4. Cloudflare R2
- Cloudflare dashboard → R2 → Create bucket (e.g. `invoices`)
- R2 → Manage API Tokens → Create API Token → scope it to that bucket with
  **Object Read & Write** permission
- Note your Cloudflare Account ID (shown on the R2 overview page) and the
  Access Key ID / Secret Access Key from the token you just created
- A card on file is required to enable R2, even to stay within the free tier

### 5. Environment variables
Copy `.env.local.example` to `.env.local` and fill in:
- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL` (optional — defaults to `claude-sonnet-5` if unset)
- `DATABASE_URL` (Neon pooled connection string)
- `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME`

When deploying to Vercel, add the same variables in Project Settings →
Environment Variables.

### 6. Run the database scripts
```bash
npm run db:migrate          # creates all tables (idempotent, tracks applied migrations)
npm run db:seed:mandatory   # required app config (safe to run in any environment, including prod)
npm run db:seed:optional    # demo invoices for local testing — do NOT run in production
```

### 7. Run it
```bash
npm run dev
```
Visit `http://localhost:3000`.

## Database scripts, in detail

- **`npm run db:migrate`** — runs every `.sql` file in `/migrations`, in
  order, that hasn't already been applied (tracked in a `_migrations`
  table). Each file runs in its own transaction; a failure rolls back and
  stops before touching later migrations. Add new migrations as
  `0002_whatever.sql`, etc. — never edit an already-applied file.
- **`npm run db:seed:mandatory`** — upserts config the app expects to exist
  (currently just default `app_settings`, like the not-yet-enabled
  auto-approval threshold). Idempotent; run this in every environment right
  after `db:migrate`, including production.
- **`npm run db:seed:optional`** — inserts a couple of demo invoices (fixed
  IDs, `ON CONFLICT DO NOTHING`) so you can click through `/review` without
  uploading real PDFs first. Local/dev only.

## How it works

1. You drop a PDF on `/`.
2. `POST /api/invoices/upload` uploads the PDF to the private R2 bucket,
   sends it to Claude with a forced structured-output tool call, validates
   the response with Zod, double-checks that subtotal + tax = total, and
   inserts the invoice + line items into Neon with
   `status = 'pending_review'`.
3. Duplicate `(vendor_name, invoice_number)` pairs are rejected at the
   database level (unique index) and surfaced as an error in the upload UI.
4. On `/review/[id]`, you see the original PDF (via a presigned, time-limited
   R2 URL) next to the extracted fields. Anything Claude flagged
   (`needs_review`) shows a banner explaining why. You can correct fields
   inline, then Approve or Reject.
5. Approved/rejected invoices are stamped with `reviewed_at`. There's no
   accounting-system push yet — that's the natural next step once you've
   picked a target (QuickBooks, Xero, etc.) and confirmed extraction
   quality on real invoices.

## Known gaps (fine for a POC, not for production)

- **No auth.** Anyone with the URL can upload/approve. Add auth before more
  than a couple of people on your team use it.
- **No pagination** on the review queue — fine for dozens of invoices, will
  need it once volume grows.
- **Single-file upload endpoint** — the dropzone uploads files one at a time
  in parallel requests; there's no batch/queue system yet, which matters
  once you're doing email/folder automation.
- **No retry/backoff** on the Claude API call — a transient failure just
  surfaces as an error on that one file; re-upload it.

## Next steps once this proves out

- Email intake: a dedicated inbox that pipes attachments into the same
  `/api/invoices/upload` endpoint
- Folder watch: a scheduled job polling a shared drive folder
- Push approved invoices to your accounting system's API
- Flip `auto_approval_enabled` in `app_settings` once you trust
  `confidence: "high"` + `needs_review: false` on your actual invoice mix
