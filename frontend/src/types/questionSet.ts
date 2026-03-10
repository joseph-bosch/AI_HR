export interface QuestionItemTranslation {
  question_text?: string;
  interviewer_guidance?: string;
  good_answer_indicators?: string;
  red_flags?: string;
  scoring_rubric?: Record<string, string>;
}

export interface QuestionItem {
  id: string;
  question_set_id: string;
  category: string;
  question_text: string;
  interviewer_guidance: string | null;
  good_answer_indicators: string | null;
  red_flags: string | null;
  scoring_rubric: Record<string, string> | null;
  translations: Record<string, QuestionItemTranslation> | null;
  sort_order: number;
  is_required: number;
  created_at: string;
}

export interface QuestionSet {
  id: string;
  job_id: string;
  name: string;
  interview_round: string;
  status: string;
  generation_model: string | null;
  pdf_path: string | null;
  primary_language: string;
  created_at: string;
  updated_at: string;
  items: QuestionItem[] | null;
}

export interface QuestionSetGenerate {
  job_id: string;
  interview_round: string;
  preferences?: string;
  language?: string;
  total_count?: number;
  category_counts?: Record<string, number>;
}

export type QuestionItemCreate = Pick<QuestionItem, 'category' | 'question_text'> & {
  interviewer_guidance?: string;
  good_answer_indicators?: string;
  red_flags?: string;
  scoring_rubric?: Record<string, string>;
  is_required?: number;
};

export type QuestionItemUpdate = Partial<QuestionItemCreate>;
