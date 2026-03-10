SYSTEM_PROMPT = """You are an expert HR screening assistant. You evaluate candidate profiles against job descriptions objectively and fairly. You provide detailed scoring with clear explanations. You NEVER consider demographic information in your assessment - only skills, experience, and qualifications."""

USER_PROMPT_TEMPLATE = """Score this candidate's profile against the job description below. Evaluate ONLY based on skills, experience, and qualifications.

JOB DESCRIPTION:
---
Title: {job_title}
Department: {department}
Seniority: {seniority_level}
Description: {job_description}
Requirements: {requirements}
Preferred Skills: {preferred_skills}
---

CANDIDATE PROFILE (anonymized):
---
{candidate_profile}
---
{language_instruction}

Carefully read the candidate profile and job requirements above, then compute scores based solely on the evidence in the profile.

Return a JSON object with exactly these keys:
{{
  "overall_score": <number 0-100, weighted: skills 40% + experience 40% + education 20%>,
  "skill_match_score": <number 0-100, how well candidate skills match the required and preferred skills>,
  "experience_score": <number 0-100, how well years and type of experience match the seniority and requirements>,
  "education_score": <number 0-100, how well education matches the required qualifications>,
  "explanation": "<2-3 sentences referencing specific evidence from the candidate profile>",
  "strengths": ["<specific strength with evidence>", "<specific strength with evidence>"],
  "weaknesses": ["<specific gap or concern>", "<specific gap or concern>"],
  "recommendation": "<one of: strong_yes, yes, maybe, no>",
  "additional_insights": {{
    "career_trajectory": "<1-2 sentences on career direction and growth pattern based on work history>",
    "standout_qualities": ["<distinctive quality that makes this candidate memorable>", "<another standout quality>"],
    "risk_flags": ["<concern beyond job-fit, e.g. frequent role changes, unexplained gaps, scope mismatch>"],
    "cultural_indicators": "<1 sentence on inferred work style, collaboration preference, or culture-fit signals>"
  }}
}}

Recommendation thresholds: strong_yes=85+, yes=70-84, maybe=50-69, no=<50.
Each candidate must receive scores that reflect their unique profile — do NOT use placeholder or example numbers.
Return ONLY the JSON object."""
