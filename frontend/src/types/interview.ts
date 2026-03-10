export interface EvaluationQuestion {
  id: string;
  text: string;
  category: string;
  order: number;
}

export interface EvaluationReport {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  cultural_fit_assessment: string;
  technical_assessment: string;
  communication_assessment: string;
  overall_recommendation: string;
  fit_score: number;
  detailed_notes: string;
}

export interface Evaluation {
  id: string;
  job_id: string;
  candidate_id: string;
  interview_round: string;
  interviewer_name: string | null;
  status: string;
  questions: EvaluationQuestion[] | null;
  answers: Record<string, string> | null;
  generated_report: EvaluationReport | null;
  evaluation_model: string | null;
  primary_language: string | null;
  report_translations: Record<string, EvaluationReport> | null;
  questions_translations: Record<string, EvaluationQuestion[]> | null;
  audio_path: string | null;
  transcript: string | null;
  transcript_status: 'none' | 'processing' | 'completed' | 'failed';
  hr_notes: string | null;
  report_edited: number;
  created_at: string;
  updated_at: string;
}

export interface TranscriptStatus {
  transcript_status: 'none' | 'processing' | 'completed' | 'failed';
  transcript: string | null;
}

export interface EvaluationCreate {
  job_id: string;
  candidate_id: string;
  interview_round: string;
  interviewer_name?: string;
  language?: string;
}
