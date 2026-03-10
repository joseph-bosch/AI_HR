SYSTEM_PROMPT = """You are an expert HR analyst. Your task is to extract structured job posting information from documents. Be precise and thorough. If a field is not present in the document, use null."""

USER_PROMPT_TEMPLATE = """Extract job posting information from the document below and return a JSON object.

DOCUMENT TEXT:
---
{document_text}
---

Return JSON with exactly this structure:
{{
  "title": "Job title or null",
  "department": "Department name or null",
  "seniority_level": "junior or mid or senior or lead or director — choose the best match, or null",
  "employment_type": "full-time or part-time or contract — choose the best match, default full-time",
  "location": "Location/city or null",
  "description": "Full job description text (combine all descriptive paragraphs) or null",
  "requirements": [
    {{"text": "specific requirement", "weight": 8}}
  ],
  "preferred_skills": [
    {{"text": "specific skill or qualification", "weight": 5}}
  ],
  "min_salary": null,
  "max_salary": null,
  "currency": "USD",
  "benefits": ["benefit1", "benefit2"]
}}

Rules:
- seniority_level: must be exactly one of: junior, mid, senior, lead, director
- employment_type: must be exactly one of: full-time, part-time, contract
- requirements: extract from sections like "Requirements", "Qualifications", "Must have", "We need"
- preferred_skills: extract from "Nice to have", "Preferred", "Bonus", "Ideal candidate"
- If requirements/preferred_skills sections are not clearly separated, make your best judgment
- Weights: 8–10 = critical, 5–7 = important, 1–4 = minor differentiator
- benefits: extract any mentioned perks, allowances, insurance, leave, etc.
- salary: extract only if explicitly mentioned as numbers, otherwise null
- Return ONLY the JSON object, no explanation"""
