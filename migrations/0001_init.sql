-- migrations/0001_init.sql
-- Core schema. Runs inside a transaction managed by scripts/migrate.ts.

create extension if not exists pgcrypto;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  storage_path text,                           -- R2 object key; null for manually-entered/demo rows

  vendor_name text,
  vendor_address text,
  vendor_tax_id text,

  bill_to_name text,
  bill_to_address text,

  invoice_number text,
  po_number text,
  invoice_date date,
  due_date date,

  currency text,
  subtotal numeric(12,2),
  tax_amount numeric(12,2),
  tax_rate_pct numeric(5,2),
  total_amount numeric(12,2),

  confidence text check (confidence in ('high', 'medium', 'low')),
  needs_review boolean not null default false,
  review_notes text,

  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'posted')),
  reviewed_by text,
  reviewed_at timestamptz,

  raw_extraction jsonb,
  created_at timestamptz not null default now()
);

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,4),
  unit_price numeric(12,4),
  line_total numeric(12,2) not null
);

-- Same vendor + invoice number shouldn't appear twice.
create unique index if not exists idx_invoices_vendor_invoice_number
  on invoices (vendor_name, invoice_number)
  where invoice_number is not null;

create index if not exists idx_invoices_status on invoices (status);
create index if not exists idx_invoices_needs_review on invoices (needs_review);

-- Small key/value table for app-level config (e.g. auto-approval
-- thresholds down the line). Mandatory seed populates sane defaults.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
