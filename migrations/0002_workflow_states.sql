-- migrations/0002_workflow_states.sql
-- Add new workflow states and validation_notes field

-- Add validation_notes column for separating auto-check issues from Claude's review flags
alter table invoices add column if not exists validation_notes text;

-- Update status enum to include: processing (during extraction), failed (extraction error), ready (no issues)
-- Note: PostgreSQL doesn't allow altering enum directly, so we recreate the constraint
alter table invoices drop constraint if exists invoices_status_check;

alter table invoices add constraint invoices_status_check
  check (status in ('processing', 'failed', 'pending_review', 'ready', 'approved', 'rejected', 'posted'));
