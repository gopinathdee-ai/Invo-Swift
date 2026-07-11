# Sprint RAD: Few-Shot Learning Implementation

**Sprint Name:** Few-Shot Learning (MVP)  
**Sprint Number:** 1  
**Duration:** 1 Week  
**Start Date:** 2026-07-11  
**End Date:** 2026-07-18  
**Status:** Planning  

---

## 1. Sprint Overview

Implement the core few-shot learning capability: capture user corrections, retrieve them during extraction, and inject them into Claude's prompt. This MVP focuses on the happy path with no UI bells and whistles.

### Sprint Goal
Enable invoice extraction to learn from recent corrections on the same vendor's invoices, reducing manual correction overhead on subsequent invoices.

### Success Criteria
✅ Corrections tracked in database  
✅ Examples injected into extraction prompt  
✅ No regression in extraction quality  
✅ Feature works end-to-end for single vendor  
✅ All code reviewed and tested  

---

## 2. User Stories & Tasks

### Story 1: Track Corrections During Review
**Story Points:** 5  
**As a** user reviewing an invoice,  
**I want** my corrections to be captured and stored,  
**So that** they can be used to improve future extractions.

#### Tasks

**1.1 Create Database Schema** (2 pts)
- [ ] Create migration `0003_extraction_corrections.sql`
  - Table: `extraction_corrections` (id, invoice_id, vendor_name, field_name, extracted_value, corrected_value, reviewed_by, reviewed_at, created_at)
  - Indexes: (vendor_name, reviewed_at), (invoice_id)
- [ ] Add columns to `invoices`: `applied_corrections` BOOLEAN, `correction_examples_count` INTEGER
- [ ] Test migration applies cleanly
- [ ] Verify indexes are created

**Acceptance Criteria:**
- Migration runs successfully
- Indexes exist and are used by queries
- Old invoices unaffected

---

**1.2 Implement Correction Tracking API** (3 pts)
- [ ] Create `lib/corrections.ts`:
  ```typescript
  async function detectCorrections(original: Invoice, updated: Invoice): Promise<Corrections>
  async function saveCorrections(invoiceId: string, vendorName: string, corrections: Corrections, reviewedBy: string): Promise<void>
  ```
- [ ] Modify `POST /api/invoices/[id]` to:
  - Detect field changes between current and updated invoice
  - Call `saveCorrections` after successful update
  - Handle errors gracefully
- [ ] Test with sample invoices:
  - Change one field → 1 correction saved
  - Change multiple fields → multiple corrections saved
  - No changes → no corrections saved

**Acceptance Criteria:**
- Corrections saved with all metadata
- Only reviewed invoices generate corrections
- Errors don't block invoice save

---

### Story 2: Retrieve and Format Corrections for Extraction
**Story Points:** 5  
**As a** extraction engine,  
**I want** to fetch recent corrections for a vendor,  
**So that** I can learn from previous mistakes.

#### Tasks

**2.1 Implement Correction Retrieval** (2 pts)
- [ ] Create `lib/corrections.ts` functions:
  ```typescript
  async function getRecentCorrections(vendorName: string, limit: number = 3, days: number = 30): Promise<Correction[]>
  ```
- [ ] Query: `SELECT * FROM extraction_corrections WHERE vendor_name = ? AND reviewed_at > NOW() - INTERVAL ? ORDER BY reviewed_at DESC LIMIT ?`
- [ ] Test queries:
  - New vendor (no corrections) → empty array
  - Vendor with 5 corrections → returns 3 most recent
  - Very old corrections → filtered out (30 day window)

**Acceptance Criteria:**
- Query returns most recent N corrections
- Empty array if none found
- Respects time window filter
- Performance: <100ms for typical vendor

---

**2.2 Format Corrections as Prompt Examples** (3 pts)
- [ ] Create `lib/corrections.ts` function:
  ```typescript
  function formatCorrectionsAsExamples(corrections: Correction[]): string
  ```
- [ ] Generate example text:
  ```
  Example from {vendor_name} invoice {invoice_number}:
  - Field: {field_name}
  - Previously extracted: "{extracted_value}"
  - Correct value: "{corrected_value}"
  - Lesson: {auto-generated lesson based on field type}
  ```
- [ ] Test formatting:
  - Empty array → empty string (no examples)
  - 1 correction → formatted example
  - 5 corrections → 5 formatted examples
  - Special characters → properly escaped for prompt

**Acceptance Criteria:**
- Examples are valid, readable prompt text
- No prompt injection vulnerabilities
- Consistent formatting across examples

---

### Story 3: Inject Corrections Into Extraction Prompt
**Story Points:** 5  
**As a** Claude,  
**I want** to receive recent correction examples in my system prompt,  
**So that** I can apply learned patterns to the current extraction.

#### Tasks

**3.1 Modify Extraction System Prompt** (2 pts)
- [ ] Update `lib/extraction/prompt.ts`:
  ```typescript
  export function getExtractionSystemPrompt(options: {
    flagIfInferredBillTo?: boolean;
    flagIfIllegibleBillTo?: boolean;
    flagIfCalculatedDueDate?: boolean;
    correctionExamples?: string; // NEW
  }): string
  ```
- [ ] Add examples section to prompt template:
  ```
  [existing rules...]
  
  RECENT CORRECTION PATTERNS:
  {correctionExamples}
  
  Apply these patterns when extracting the current invoice.
  ```
- [ ] If no examples, section is omitted gracefully

**Acceptance Criteria:**
- Prompt includes examples when provided
- Prompt is valid with or without examples
- No regression in extraction quality (test with non-example extraction)

---

**3.2 Integrate Corrections Into Upload Endpoint** (3 pts)
- [ ] Modify `POST /api/invoices/upload/route.ts`:
  - Before calling Claude:
    ```typescript
    const corrections = await getRecentCorrections(extractedVendorName);
    const examplesText = formatCorrectionsAsExamples(corrections);
    ```
  - Pass to `getExtractionSystemPrompt({ ..., correctionExamples: examplesText })`
  - Update response to include `{ correction_examples_count: corrections.length }`
  
- [ ] Modify `POST /api/invoices/[id]/reprocess/route.ts` (same logic)
- [ ] Test:
  - First invoice from vendor → 0 examples used
  - Second invoice from vendor → 1 example used (assuming first was corrected)
  - Extraction quality doesn't degrade with examples
  - Response includes count of examples used

**Acceptance Criteria:**
- Examples injected into prompt without errors
- Extraction still succeeds with examples
- Response metadata tracks example count
- No performance regression

---

### Story 4: Create Correction API Endpoints
**Story Points:** 3  
**As a** admin or developer,  
**I want** to view and inspect corrections,  
**So that** I can understand what the system is learning.

#### Tasks

**4.1 Implement GET /api/corrections/{vendor}** (2 pts)
- [ ] Route: `GET /api/corrections/[vendor]?limit=3&days=30`
- [ ] Response:
  ```json
  {
    "vendor_name": "ACME Corp",
    "correction_count": 3,
    "corrections": [
      { "field_name": "...", "extracted": "...", "corrected": "..." }
    ]
  }
  ```
- [ ] Test:
  - Returns 200 with corrections
  - Returns 404 or empty if vendor not found
  - Query params respected

**Acceptance Criteria:**
- Endpoint returns correct data
- Pagination works (limit)
- Time filter works (days)

---

**4.2 Implement POST /api/corrections (Direct Logging)** (1 pt)
- [ ] Route for manual correction logging (used by PATCH endpoint)
- [ ] Already called by invoice PATCH handler

**Acceptance Criteria:**
- Corrections stored correctly
- Validation prevents invalid entries

---

### Story 5: Testing & Validation
**Story Points:** 5  
**As a** QA engineer,  
**I want** to verify corrections work end-to-end,  
**So that** the feature is production-ready.

#### Tasks

**5.1 Unit Tests** (2 pts)
- [ ] Test correction detection:
  - `detectCorrections()` with various field changes
  - Edge cases: null values, empty strings, special chars
- [ ] Test example formatting:
  - `formatCorrectionsAsExamples()` with various inputs
  - Proper escaping of special characters
- [ ] Test correction retrieval:
  - Query with different time windows
  - Vendor not found scenario
  - Sorting by recency

**Acceptance Criteria:**
- All tests pass
- Coverage >80% for correction logic

---

**5.2 Integration Tests** (2 pts)
- [ ] End-to-end flow:
  - Upload invoice 1 from ACME → extract, no examples used
  - Save corrections to invoice 1
  - Upload invoice 2 from ACME → extract, 1 example used
  - Verify correction was applied in prompt
  - Verify response metadata correct

- [ ] Extraction quality tests:
  - Extract sample invoices without examples (baseline)
  - Extract same invoices with examples
  - No regression in accuracy
  - Track token usage increase

**Acceptance Criteria:**
- Full flow works without errors
- Examples are actually used (verify in prompt)
- No accuracy degradation

---

**5.3 Manual Testing Checklist** (1 pt)
- [ ] Test with 2+ different vendors
- [ ] Test with various correction patterns (dates, amounts, text)
- [ ] Verify corrections persist across sessions
- [ ] Check for any UI/UX issues
- [ ] Monitor error logs during testing

---

## 3. Database Changes

### Migration: `0003_extraction_corrections.sql`

```sql
-- Track corrections for learning
CREATE TABLE extraction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  extracted_value TEXT,
  corrected_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

-- Efficient queries for recent corrections
CREATE INDEX idx_corrections_vendor_reviewed 
  ON extraction_corrections(vendor_name, reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;

CREATE INDEX idx_corrections_invoice 
  ON extraction_corrections(invoice_id);

-- Invoice table additions
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS applied_corrections BOOLEAN DEFAULT FALSE;

ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS correction_examples_count INTEGER DEFAULT 0;
```

**Rollback Plan:**
```sql
DROP INDEX IF EXISTS idx_corrections_vendor_reviewed;
DROP INDEX IF EXISTS idx_corrections_invoice;
DROP TABLE IF EXISTS extraction_corrections;
ALTER TABLE invoices DROP COLUMN IF EXISTS applied_corrections;
ALTER TABLE invoices DROP COLUMN IF EXISTS correction_examples_count;
```

---

## 4. Code Changes Summary

### New Files
- `lib/corrections.ts` - Correction tracking and retrieval logic
- `migrations/0003_extraction_corrections.sql` - Database schema
- `__tests__/corrections.test.ts` - Unit tests
- `__tests__/integration/corrections.integration.test.ts` - Integration tests

### Modified Files
- `app/api/invoices/[id]/route.ts` - PATCH handler calls correction tracking
- `app/api/invoices/upload/route.ts` - Query corrections, inject into prompt
- `app/api/invoices/[id]/reprocess/route.ts` - Same as upload
- `lib/extraction/prompt.ts` - Accept correctionExamples parameter

### New Endpoints
- `GET /api/corrections/{vendor}` - Retrieve corrections for vendor
- `POST /api/corrections` - Log correction (internal use)

---

## 5. Testing Strategy

### Unit Tests (files to test)
```
lib/corrections.ts:
  ✓ detectCorrections() - various field changes
  ✓ formatCorrectionsAsExamples() - formatting and escaping
  ✓ getRecentCorrections() - query and filtering
  ✓ saveCorrections() - data persistence

lib/extraction/prompt.ts:
  ✓ getExtractionSystemPrompt() - with/without examples
```

### Integration Tests
```
API Flow:
  ✓ Upload invoice 1 from vendor A
  ✓ Correct fields on invoice 1
  ✓ Upload invoice 2 from vendor A (should use examples)
  ✓ Verify examples in extraction prompt

Edge Cases:
  ✓ New vendor with no corrections
  ✓ Vendor with >5 corrections (limit to most recent 3)
  ✓ Very old corrections (>30 days, filtered out)
  ✓ Special characters in corrections
```

### Manual Testing
```
[ ] Test with ACME Corp invoices (existing sample)
[ ] Test with new vendor
[ ] Check database records
[ ] Monitor extraction latency and token usage
[ ] Review prompt contents (verify examples included)
```

---

## 6. Acceptance Criteria

### Definition of Done
- [x] All code reviewed and approved
- [x] All unit tests pass (>80% coverage)
- [x] All integration tests pass
- [x] Manual testing checklist completed
- [x] No regressions in existing functionality
- [x] Database migration tested and reversible
- [x] Code deployed to staging
- [x] Staging testing passed by QA
- [x] Documentation updated (code comments, README if needed)

### Acceptance Test Scenarios

**Scenario 1: First Correction Creates Example**
```
Given: Upload invoice 1 from ACME Corp
When: System extracts and stores data
Then: No corrections yet (no examples)

Given: User corrects due_date field
When: User saves edits
Then: Correction stored in extraction_corrections table

Given: Upload invoice 2 from ACME Corp
When: System retrieves corrections for ACME Corp
Then: 1 correction example found and injected into prompt
And: Response includes correction_examples_count = 1
```

**Scenario 2: Multiple Corrections Build Pattern**
```
Given: Invoice 1 corrected (due_date)
And: Invoice 2 corrected (tax_amount)
And: Invoice 3 corrected (invoice_number)
When: Upload invoice 4 from same vendor
Then: 3 examples in prompt (all recent corrections)
And: Extraction quality improves
```

**Scenario 3: Time Window Filtering**
```
Given: 5 corrections, oldest is 45 days old
When: Query with 30-day window
Then: Only 4 corrections returned (oldest filtered)
```

---

## 7. Dependencies & Blockers

### External Dependencies
- Anthropic Claude API (no new deps, already used)
- PostgreSQL (no new deps, already used)

### Internal Dependencies
- None; feature is self-contained

### Potential Blockers
1. **Performance**: If correction queries too slow, add caching
2. **Token Cost**: Monitor token increase; may exceed budget
3. **Accuracy**: If examples hurt accuracy, rollback feature flag

### Mitigation
- Cache recent corrections for 1 hour
- Monitor costs daily during testing
- A/B test with/without examples
- Feature flag for quick disable if needed

---

## 8. Timeline & Estimates

| Task | Story | Points | Owner | Est. Days | Status |
|------|-------|--------|-------|-----------|--------|
| Create DB schema | 1.1 | 2 | Backend | 0.5 | Not Started |
| Correction tracking API | 1.2 | 3 | Backend | 1 | Not Started |
| Retrieve corrections | 2.1 | 2 | Backend | 0.5 | Not Started |
| Format examples | 2.2 | 3 | Backend | 1 | Not Started |
| Modify prompt | 3.1 | 2 | Backend | 0.5 | Not Started |
| Integrate into extraction | 3.2 | 3 | Backend | 1 | Not Started |
| Create APIs | 4.1 | 2 | Backend | 0.5 | Not Started |
| Unit tests | 5.1 | 2 | QA/Dev | 1 | Not Started |
| Integration tests | 5.2 | 2 | QA/Dev | 1 | Not Started |
| Manual testing | 5.3 | 1 | QA | 0.5 | Not Started |
| Code review & fixes | Sprint | - | Team | 1 | Not Started |
| **TOTAL** | | **23 pts** | | **7 days** | |

**Capacity:** 5 points/day (1 dev) = 35 points available  
**Velocity:** 23 points = 4-5 days of actual work  
**Buffer:** 2-3 days for testing, fixes, code review

---

## 9. Risk & Mitigation

| Risk | Probability | Severity | Mitigation |
|------|-------------|----------|-----------|
| Prompt injection via corrections | Low | High | Escape special chars, validate corrections before storing |
| Token cost spike | Medium | Medium | Monitor daily, calculate impact, set alerts |
| Accuracy regression | Low | High | Test extraction quality, A/B test with/without examples |
| Performance degradation | Medium | Low | Cache corrections, async queries, index optimization |
| Bad data in corrections | Medium | Low | Only use reviewed corrections, add validation |

---

## 10. Success Metrics

**Track During & After Sprint:**
- Extraction latency: Should increase <100ms per request
- Token usage: Monitor 10-15% increase (acceptable)
- Correction accuracy: Examples shouldn't introduce bad data
- Code quality: 80%+ test coverage, zero critical issues

**Track After Real Usage:**
- Manual corrections per vendor: Target -20% reduction
- User satisfaction: Survey after 2 weeks
- System adoption: % of vendors using feature (target 70%+)

---

## 11. Sprint Kickoff Checklist

- [ ] All stories discussed and estimated
- [ ] Database changes reviewed
- [ ] API design reviewed
- [ ] Test strategy approved
- [ ] Owner assigned for each task
- [ ] Tools/access confirmed (IDE, DB, Claude API)
- [ ] Feature flag created (for safe rollback)
- [ ] Monitoring/alerting configured
- [ ] Staging environment ready

---

## 12. Sprint Closeout Checklist

- [ ] All tasks completed or formally deferred
- [ ] All tests passing on main branch
- [ ] Code review sign-off from tech lead
- [ ] QA sign-off on manual testing
- [ ] Release notes prepared
- [ ] User documentation updated
- [ ] Runbook for troubleshooting created
- [ ] Metrics dashboard created
- [ ] Team retrospective scheduled

---

**Document End**

---

**Prepared by:** InvoSwift Development Team  
**Date:** 2026-07-11  
**For Review By:** Tech Lead, Product Manager, QA Lead
