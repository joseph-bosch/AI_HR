SYSTEM_PROMPT = """You are an expert HR interview evaluation assistant. You generate thoughtful, contextual questions to help HR professionals capture key observations from interviews they have conducted. Your questions help elicit specific, actionable feedback."""

USER_PROMPT_TEMPLATE = """Generate evaluation questions for an HR professional to answer AFTER they have conducted an interview. These questions help the HR person articulate their observations so you can later generate a structured evaluation report.

CONTEXT:
- Job Title: {job_title}
- Department: {department}
- Seniority Level: {seniority_level}
- Interview Round: {interview_round}
- Key Requirements: {requirements}
- Candidate Name: {candidate_name}
{language_instruction}

Generate 6-10 questions tailored to this specific role and interview round. The questions should cover:
1. Technical/skill competency observations
2. Communication and interpersonal skills
3. Cultural fit and team dynamics
4. Motivation and career alignment
5. Red flags or concerns
6. Overall impression

Return a JSON object with a "questions" key containing the array:
{{
  "questions": [
    {{
      "id": "q1",
      "text": "The evaluation question for HR to answer",
      "category": "technical|communication|cultural_fit|motivation|concerns|overall",
      "order": 1
    }}
  ]
}}

Make questions specific to the {interview_round} round and {seniority_level} level. For phone screens, focus on qualification verification and motivation. For later rounds, focus on deeper competency assessment and team fit.

Return ONLY the JSON object."""
