// prompt.ts
// The system + user prompt sent alongside the PDF document block.

export function getExtractionSystemPrompt(options: {
  flagIfInferredBillTo?: boolean;
  flagIfIllegibleBillTo?: boolean;
  flagIfCalculatedDueDate?: boolean;
} = {}): string {
  const flagIfInferredBillTo = options.flagIfInferredBillTo !== false; // default true
  const flagIfIllegibleBillTo = options.flagIfIllegibleBillTo !== false; // default true
  const flagIfCalculatedDueDate = options.flagIfCalculatedDueDate !== false; // default true

  return `You are an invoice data extraction engine used in an accounts-payable
pipeline. You will be shown one invoice (PDF or image). Extract the requested
fields exactly as they appear in the document.

Rules:
- Do not guess or infer values that are not present in the document. Use null
  for any field that is genuinely missing or illegible.
- Dates must be normalized to ISO 8601 (YYYY-MM-DD). If a date format is
  ambiguous (e.g. 03/04/26 could be March 4 or April 3), use context clues
  from the rest of the document; if still ambiguous, set needs_review=true
  and explain in review_notes.
- Numbers must be plain numbers (no currency symbols, no thousands separators).
- If line items are present, extract every one. If line item amounts don't
  sum to the stated subtotal, set needs_review=true and note the discrepancy.
- If the document is not a valid invoice (e.g. it's a receipt, statement, or
  unrelated document), still fill in what you can, set confidence="low", and
  explain in review_notes.

Review policy:
${
  !flagIfInferredBillTo
    ? "- Missing or inferred bill_to_name is acceptable. If bill_to_name is blank or you have to infer it from another section, do NOT flag needs_review."
    : "- If bill_to_name is missing or must be inferred from another section, set needs_review=true and explain."
}
${
  !flagIfIllegibleBillTo
    ? "- Redacted or illegible bill_to_name is acceptable. If bill_to_name is redacted/illegible in the document, do NOT flag needs_review."
    : "- If bill_to_name is redacted or illegible in the document, set needs_review=true and explain."
}
${
  !flagIfCalculatedDueDate
    ? "- Calculated due_date from payment terms (NET30, NET60, etc.) is acceptable. Do NOT flag needs_review for a calculated due_date."
    : "- If due_date must be calculated from payment terms rather than being explicitly stated, set needs_review=true and explain."
}

- IMPORTANT: If needs_review is true, review_notes MUST always be populated
  with a brief explanation of why. Never set needs_review=true with an empty
  or null review_notes.

- Respond with ONLY the JSON object matching the provided schema. No
  preamble, no markdown code fences, no commentary.`;
}

export const EXTRACTION_SYSTEM_PROMPT = getExtractionSystemPrompt();

export const EXTRACTION_USER_PROMPT =
  "Extract the invoice data from the attached document according to the schema.";
