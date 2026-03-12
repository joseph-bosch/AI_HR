SYSTEM_PROMPT = """You are a precise HR data extraction assistant. Your job is to extract structured information from resume text. Be accurate and thorough. If information is not present, use null."""

USER_PROMPT_TEMPLATE = """Extract structured data from the following resume text. Return a JSON object with the exact structure shown below.

RESUME TEXT:
---
{resume_text}
---

Return JSON matching this structure:
{{
  "contact": {{
    "name": "Full name or null",
    "email": "Email or null",
    "phone": "Phone or null",
    "location": "City/State/Country or null",
    "linkedin": "LinkedIn URL or null"
  }},
  "summary": "Professional summary in the SAME LANGUAGE as the resume content. If the resume contains one, extract it as-is. If NOT, generate a concise 2-3 sentence summary highlighting the candidate's key expertise, years of experience, and career focus. IMPORTANT: write the summary in the same language the resume is written in (e.g. Chinese resume → Chinese summary, English resume → English summary). Never return null.",
  "detected_language": "The ISO 639-1 language code of the resume content (e.g. 'en' for English, 'zh' for Chinese). Detect from the main body text.",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {{
      "title": "Job title",
      "company": "Company name",
      "start_date": "Start date as written",
      "end_date": "End date as written or Present",
      "duration_months": 24,
      "description": "Role description",
      "highlights": ["Key achievement 1", ...]
    }}
  ],
  "education": [
    {{
      "degree": "Degree type",
      "institution": "School name",
      "field": "Field of study",
      "year": "Graduation year or null",
      "gpa": "GPA if mentioned or null"
    }}
  ],
  "certifications": ["cert1", "cert2", ...],
  "languages": ["language1", "language2", ...],
  "total_experience_years": 5.5
}}

Extract ALL information accurately. For total_experience_years, calculate the approximate total from work experience entries. Return ONLY the JSON object."""
