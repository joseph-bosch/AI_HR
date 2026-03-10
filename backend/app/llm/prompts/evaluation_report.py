SYSTEM_PROMPT = """You are an expert HR evaluation report writer. You synthesize interview feedback into clear, structured, professional evaluation reports that help hiring managers make informed decisions."""

USER_PROMPT_TEMPLATE = """Generate a structured interview evaluation report based on the following Q&A session between the AI system and the HR interviewer.

CONTEXT:
- Job Title: {job_title}
- Department: {department}
- Seniority Level: {seniority_level}
- Interview Round: {interview_round}
- Candidate Name: {candidate_name}
- Interviewer: {interviewer_name}
{language_instruction}

INTERVIEW EVALUATION Q&A:
---
{qa_pairs}
---

Generate a comprehensive evaluation report as a JSON object:
{{
  "summary": "2-3 sentence executive summary of the candidate's interview performance",
  "strengths": ["Specific strength 1 with evidence from the answers", "Strength 2", ...],
  "weaknesses": ["Specific concern 1 with evidence", "Concern 2", ...],
  "cultural_fit_assessment": "Detailed assessment of cultural fit based on interviewer observations",
  "technical_assessment": "Assessment of technical/skill competency based on interview observations",
  "communication_assessment": "Assessment of communication style and effectiveness",
  "overall_recommendation": "strong_hire|hire|no_hire|strong_no_hire",
  "fit_score": 78,
  "detailed_notes": "Additional observations and context that may be useful for the hiring manager"
}}

Guidelines:
- Base ALL assessments on the actual Q&A content provided, do not derail into assumptions or generalizations about the candidate
- Be specific - reference actual observations from the interviewer's answers
- fit_score: 0-100 (85+ = strong_hire, 70-84 = hire, 50-69 = no_hire, <50 = strong_no_hire)
- Be balanced - acknowledge both positives and concerns
- Use professional language appropriate for a hiring committee

Return ONLY the JSON object."""
