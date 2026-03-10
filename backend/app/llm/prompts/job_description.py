DESCRIPTION_SYSTEM_PROMPT = """You are an expert HR business partner with 15+ years of experience writing compelling job descriptions. Write engaging, specific, and realistic job descriptions that attract high-quality candidates. Be concrete about responsibilities, avoid generic filler phrases, and paint a clear picture of the role and its impact."""

DESCRIPTION_PROMPT_TEMPLATE = """Write a professional job description for this position:

Job Title: {job_title}
Department: {department}
Seniority Level: {seniority_level}
Employment Type: {employment_type}

Write 3-4 engaging paragraphs covering:
1. Role overview and its strategic importance to the organization
2. Key responsibilities and day-to-day activities
3. What success looks like in the first 6–12 months
4. Team environment and growth opportunities

Do NOT include a requirements or skills section — those will be handled separately.
Be specific, action-oriented, and avoid clichés like "fast-paced environment" or "team player".

{language_instruction}"""

REQUIREMENTS_PROMPT_TEMPLATE = """Based on the job description below, generate a JSON object with specific, realistic requirements and preferred skills — each with an importance weight.

Job Title: {job_title}
Department: {department}
Seniority Level: {seniority_level}

Job Description:
{description}

Return JSON with exactly this structure:
{{
  "requirements": [
    {{"text": "<specific requirement>", "weight": <integer 1-10>}}
  ],
  "preferred_skills": [
    {{"text": "<specific skill or qualification>", "weight": <integer 1-10>}}
  ]
}}

Guidelines:
- requirements: 5-8 must-have qualifications (experience, education, hard skills, certifications)
- preferred_skills: 4-6 nice-to-have attributes (bonus tools, soft skills, domain knowledge)
- Weight 10 = critical/eliminatory, 1 = minor differentiator
- Make items specific to the role and seniority level (avoid vague items like "good communication")

{language_instruction}

Return ONLY the JSON object."""
