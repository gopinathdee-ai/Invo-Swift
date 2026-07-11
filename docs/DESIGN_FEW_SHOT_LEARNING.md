# Design Document: Few-Shot Learning for Invoice Extraction

**Document Version:** 1.0  
**Date:** 2026-07-11  
**Status:** Design Review  
**Author:** InvoSwift Development Team

---

## 1. Overview

This document describes the design for implementing few-shot learning capabilities in InvoSwift. The feature enables Claude to learn from recent user corrections on similar invoices and apply those patterns to future extractions from the same vendor, without requiring fine-tuning or external training.

### Purpose
Enable the invoice extraction engine to adapt to vendor-specific patterns based on corrections made during the review process, improving accuracy over time with minimal cost and latency impact.

---

## 2. Problem Statement

### Current State
- Each invoice is extracted independently using static rules
- User corrections are stored but not fed back into extraction logic
- Similar invoices from the same vendor may repeat the same extraction errors
- No learning mechanism to improve extraction quality over time

### Impact
- Higher manual review burden as vendors repeat patterns
- Wasted corrections (same error on next invoice requires manual fix again)
- Poor user experience (users see same mistakes repeatedly)

### Desired State
- Claude recognizes patterns in recent corrections
- Applies learned patterns to new invoices from same vendor
- Reduces manual corrections over time
- Improves extraction accuracy without model changes

---

## 3. Solution Architecture

### High-Level Flow

```
Invoice Upload
    ↓
Retrieve Recent Corrections (for vendor)
    ↓
Format Corrections as Examples
    ↓
Build Enhanced System Prompt (base rules + examples)
    ↓
Send to Claude with Examples Embedded
    ↓
Extract + Return
    ↓
User Reviews & Corrects (if needed)
    ↓
Store Correction (for future invoices)
```

### Key Components

1. **Correction Tracking Module**
   - Captures differences between extracted and corrected values
   - Stores corrections in database with metadata
   - Indexes by vendor for quick retrieval

2. **Example Formatter**
   - Converts stored corrections into prompt-friendly examples
   - Formats with clear lesson extraction
   - Prioritizes recent corrections

3. **Enhanced Extraction Engine**
   - Queries for recent corrections before extraction
   - Injects examples into system prompt
   - Maintains backward compatibility

4. **Feedback Loop**
   - Automatically captures corrections made during review
   - Stores with timestamp and reviewed-by metadata
   - Expires old corrections (keeps rolling window)

---

## 4. Data Model

### New Database Schema

```sql
-- Track corrections for learning
CREATE TABLE extraction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  extracted_value TEXT,
  corrected_value TEXT NOT NULL,
  confidence_before TEXT, -- 'high', 'medium', 'low'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_corrections_vendor_reviewed 
  ON extraction_corrections(vendor_name, reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;

CREATE INDEX idx_corrections_invoice 
  ON extraction_corrections(invoice_id);
```

### Invoices Table Changes

```sql
-- Add field to track if corrections were applied during extraction
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS 
  applied_corrections BOOLEAN DEFAULT FALSE;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS 
  correction_examples_count INTEGER DEFAULT 0;
```

### Data Retention Policy
- Keep last 50 corrections per vendor
- Retain corrections for 90 days
- Auto-expire after rolling window

---

## 5. API Changes

### New Endpoints

#### GET `/api/corrections/{vendorName}`
**Purpose:** Retrieve recent corrections for a vendor  
**Query Params:**
- `limit` (optional): number of corrections, default 3, max 5
- `days` (optional): only corrections from last N days, default 30

**Response:**
```json
{
  "vendor_name": "ACME Corp",
  "correction_count": 3,
  "corrections": [
    {
      "invoice_number": "INV-2026-001",
      "field_name": "due_date",
      "extracted_value": "2026-03-05",
      "corrected_value": "2026-04-05",
      "lesson": "Due date was off by 1 month - check if payment terms affect calculation"
    }
  ]
}
```

#### POST `/api/corrections`
**Purpose:** Record a correction when user saves edits  
**Body:**
```json
{
  "invoice_id": "uuid",
  "vendor_name": "ACME Corp",
  "corrections": {
    "due_date": {"extracted": "2026-03-05", "corrected": "2026-04-05"},
    "invoice_number": {"extracted": "INV-2026", "corrected": "INV-2026-001"}
  },
  "reviewed_by": "user@company.com"
}
```

### Modified Endpoints

#### POST `/api/invoices/upload` (modified)
- Before calling Claude, fetch recent corrections
- Inject examples into system prompt
- Track if examples were used in response

#### POST `/api/invoices/[id]/reprocess` (modified)
- Same as upload: fetch corrections, inject, extract

---

## 6. Implementation Details

### 6.1 Correction Tracking

**When corrections are captured:**
1. User edits invoice field in review interface
2. User clicks "Save edits"
3. PATCH `/api/invoices/[id]` endpoint detects changes
4. POST `/api/corrections` called with detected changes

**Correction Detection Logic:**
```typescript
function detectCorrections(original, updated, invoice) {
  const corrections = {};
  FIELDS.forEach(field => {
    if (original[field.key] !== updated[field.key]) {
      corrections[field.key] = {
        extracted: original[field.key],
        corrected: updated[field.key]
      };
    }
  });
  return corrections;
}
```

### 6.2 Example Formatting

**Prompt Injection Template:**
```
Here are recent corrections from {vendor_name} invoices you've extracted.
Apply these lessons to the current extraction:

{Example 1}
Field: {field_name}
Pattern: Extracted "{extracted}" but correct value was "{corrected}"
Lesson: {Auto-generated lesson}

{Example 2}
...

Now extract the current invoice applying these patterns:
```

**Auto-Generated Lessons:**
- Date differences: "Check if calendar math is needed (e.g., payment terms)"
- Numeric differences: "Verify decimal places match document format"
- String differences: "Look for hidden characters or formatting"
- Amount differences: "Cross-check if tax or fees are included"

### 6.3 Example Retrieval

```typescript
async function getRecentCorrectionsForVendor(
  vendorName: string,
  limit: number = 3
): Promise<Correction[]> {
  // Get recent, reviewed corrections
  return query(`
    SELECT 
      invoice_id,
      vendor_name,
      field_name,
      extracted_value,
      corrected_value,
      reviewed_at
    FROM extraction_corrections
    WHERE vendor_name = $1
      AND reviewed_at IS NOT NULL
      AND reviewed_at > NOW() - INTERVAL '30 days'
    ORDER BY reviewed_at DESC
    LIMIT $2
  `, [vendorName, limit]);
}
```

### 6.4 Prompt Modification

**Current System Prompt:**
```
You are an invoice extraction engine...
Rules:
- Dates must be ISO 8601
- Numbers without currency symbols
...
```

**Enhanced System Prompt:**
```
You are an invoice extraction engine...
Rules:
- Dates must be ISO 8601
- Numbers without currency symbols
...

RECENT CORRECTION EXAMPLES:
Here are patterns from recently reviewed invoices:

Example from Acme Corp invoice INV-2026-001:
- Field: due_date
- Previously extracted: "2026-03-05"
- Correct value: "2026-04-05"
- Lesson: Verify payment terms against invoice date; due date = invoice date + 30 days

Example from Acme Corp invoice INV-2026-002:
- Field: tax_amount
- Previously extracted: "150"
- Correct value: "155.50"
- Lesson: Tax amounts may include decimal cents

Apply these correction patterns when extracting the current invoice.
```

---

## 7. Workflow Integration

### User Journey

1. **First Invoice from Vendor**
   - No corrections exist
   - Extract with base rules
   - User corrects manually
   - Corrections stored

2. **Second Invoice from Vendor**
   - 1 correction found
   - Extract with example embedded
   - Fewer corrections needed
   - New correction added

3. **Third+ Invoices**
   - Up to 5 examples embedded
   - Accuracy improves with more examples
   - Learning accelerates

### Review Page Changes
```typescript
// When loading invoice for review
const corrections = await fetch(`/api/corrections/${invoice.vendor_name}`);

// Display indicator
if (corrections.correction_count > 0) {
  show("📚 {N} learning examples were used for this extraction")
}
```

---

## 8. Technical Considerations

### Performance Impact
- **Context Size:** 3 examples ≈ 1-2k tokens (+5-10% per request)
- **Latency:** +50-100ms for DB query to fetch corrections
- **Query Efficiency:** Indexed queries (vendor_name, reviewed_at)
- **Mitigation:** Cache recent corrections in memory for 1 hour

### Token Cost
- Each correction example ≈ 300-400 tokens
- 3 examples per extraction = ~1000 tokens extra
- Cost increase: ~10-15% depending on invoice complexity
- ROI: Fewer manual corrections = lower overall token usage

### Accuracy Trade-offs
- **Pro:** Better accuracy on vendor-specific patterns
- **Con:** Could overfit to bad corrections if user made mistakes
- **Mitigation:** Only use corrections marked as "reviewed_at" (user confirmed)

### Vendor Segmentation
- Per-vendor examples (not global)
- Prevents cross-vendor pattern pollution
- Vendors have unique invoice formats

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Bad corrections propagate | Medium | High | Only use reviewed corrections, UI warning if unusual pattern |
| Context bloat | Low | Medium | Limit to 3-5 examples, monitor token usage |
| Outdated patterns | Low | Medium | 30-day rolling window, refresh on vendor policy changes |
| Performance degradation | Low | Medium | Query caching, async correction fetch |
| User confusion | Medium | Low | Show indicator when examples used, explain feature |

---

## 10. Rollout Strategy

### Phase 1: Foundation (Sprint 1)
- Add correction tracking schema
- Implement correction API endpoints
- Modify upload/reprocess to query corrections
- Test with single vendor

### Phase 2: Enhancement (Sprint 2)
- UI indicators showing correction count
- Admin dashboard for correction review
- Manual correction quality review tools

### Phase 3: Optimization (Sprint 3+)
- Auto-expiry and retention policies
- Performance monitoring
- A/B testing (with/without examples)
- Analytics on correction patterns

---

## 11. Success Metrics

- **Extraction Accuracy:** % of invoices requiring zero manual corrections (target: +20%)
- **Manual Correction Reduction:** Average corrections per invoice (target: -30%)
- **User Adoption:** % of vendors with active corrections (target: 70%+)
- **Token Efficiency:** Average tokens per extraction (monitor for cost increases)
- **Latency:** P95 extraction latency (target: <100ms additional)

---

## 12. Future Enhancements

1. **Multi-field Pattern Recognition**
   - Detect correlations (e.g., if vendor changes date format, check PO format too)
   
2. **Confidence Weighting**
   - Weight examples by how confident Claude was initially
   - "If I was wrong about this before, pay extra attention"

3. **Cross-Vendor Learning (Optional)**
   - Global patterns for common mistakes (e.g., date format confusion)
   - With safeguards against vendor-specific noise

4. **Fine-Tuning Bridge**
   - Use correction data to identify candidates for actual fine-tuning
   - When 100+ corrections converge, fine-tune model

5. **User Feedback Integration**
   - Let users rate if correction examples helped
   - Improve example selection based on feedback

---

## 13. Questions for Stakeholders

1. Should corrections be visible/editable by users, or only automatic?
2. How long to keep corrections (30 days, 90 days, indefinite)?
3. Should corrections require manual approval, or trust all reviewed corrections?
4. Should we track which examples were actually used in extraction?
5. Future: Fine-tune model once sufficient corrections accumulate?

---

**Document End**
