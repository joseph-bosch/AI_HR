export interface SalaryRecommendation {
  suggested: number | null;
  range: [number, number] | null;
  rationale: string;
}

export interface InterviewStageSummary {
  stage: string;
  fit_score: number;
  recommendation: string;
  summary: string;
}

export interface DecisionReport {
  overall_recommendation: 'hire' | 'reject' | 'hold';
  confidence: number;
  strengths_summary: string;
  risk_summary: string;
  technical_verdict: string;
  cultural_verdict: string;
  salary_recommendation: SalaryRecommendation;
  lessons_learned: string[];
  interview_stages_summary: InterviewStageSummary[];
}

export interface InterviewDecision {
  id: string;
  pipeline_id: string;
  job_id: string;
  candidate_id: string;
  final_decision: 'hire' | 'reject' | 'hold' | null;
  decision_reason: string | null;
  generated_report: DecisionReport | null;
  generation_model: string | null;
  created_at: string;
  updated_at: string;
}
