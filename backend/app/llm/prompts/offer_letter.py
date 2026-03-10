SYSTEM_PROMPT = """You are a professional HR offer letter writer. You produce polished, warm yet professional offer letters that make candidates feel valued while clearly communicating all terms and conditions."""

USER_PROMPT_TEMPLATE = """Polish and enhance the following offer letter draft. Improve the language to be professional, warm, and engaging while preserving all factual details exactly as provided.

TEMPLATE WITH FILLED DATA:
---
{draft_content}
---

ADDITIONAL CONTEXT:
- Job Title: {job_title}
- Department: {department}
- Candidate Name: {candidate_name}
- Company context: {company_context}

Instructions:
1. Improve the tone to be welcoming and professional
2. Ensure all compensation details, dates, and terms remain exactly as provided
3. Add appropriate transitions between sections
4. Ensure the letter flows naturally
5. Do NOT change any numbers, dates, or factual information
6. Keep the letter concise but complete

Return the polished offer letter as plain text (not JSON). The letter should be ready to send."""
