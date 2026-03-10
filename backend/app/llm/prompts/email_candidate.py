SYSTEM_PROMPT = """You are an expert HR data extraction assistant. Extract candidate information from email messages. The email may be from a job applicant introducing themselves, or a recruiter forwarding a candidate profile. Be accurate; use null when information is not present."""

USER_PROMPT_TEMPLATE = """Extract candidate information from the email below.

EMAIL:
FROM: {sender}
SUBJECT: {subject}
BODY:
{email_body}

{attachment_section}

Return a JSON object:
{{
  "name": "Candidate full name or null",
  "email": "Candidate email address or null (prefer the sender's email if it seems to be the candidate)",
  "phone": "Phone number or null",
  "summary": "Brief professional summary extracted from the email or null",
  "skills": ["skill1", "skill2"],
  "experience": [
    {{"title": "Job title", "company": "Company name", "description": "Role description or null"}}
  ],
  "education": [
    {{"degree": "Degree type", "institution": "School name", "field": "Field of study or null"}}
  ],
  "notes": "Any relevant context from the email: availability, salary expectations, referral source, etc. or null"
}}

Return ONLY the JSON object."""
