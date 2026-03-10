export type PipelineStage = 'hr_interview' | 'dept_interview' | 'third_interview' | 'decision';
export type PipelineStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface PipelineEntry {
  id: string;
  job_id: string;
  candidate_id: string;
  current_stage: PipelineStage;
  stage_status: PipelineStatus;
  rejection_reason: string | null;
  promoted_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineEntryEnriched extends PipelineEntry {
  candidate_name: string;
  candidate_email: string | null;
  overall_score: number | null;
  recommendation: string | null;
  completed_evaluations: number;
  question_sets: number;
  latest_fit_score: number | null;
}
