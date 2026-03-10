export interface Candidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CandidateUpdate = Partial<Pick<Candidate, 'first_name' | 'last_name' | 'email' | 'phone' | 'linkedin_url' | 'status' | 'notes'>>;

export interface Resume {
  id: string;
  candidate_id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number | null;
  parsed_data: ParsedResume | null;
  anonymized_data: Record<string, unknown> | null;
  parse_status: string;
  parse_error: string | null;
  created_at: string;
}

export interface ParsedResume {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  summary?: string;
  skills?: string[];
  experience?: {
    title: string;
    company: string;
    start_date: string;
    end_date: string;
    duration_months: number;
    description: string;
    highlights: string[];
  }[];
  education?: {
    degree: string;
    institution: string;
    field: string;
    year: string;
    gpa: string | null;
  }[];
  certifications?: string[];
  languages?: string[];
  total_experience_years?: number;
}

export interface ScoreTranslation {
  explanation?: string;
  strengths?: string[];
  weaknesses?: string[];
}

export interface AdditionalInsights {
  career_trajectory?: string;
  standout_qualities?: string[];
  risk_flags?: string[];
  cultural_indicators?: string;
}

export interface ScreeningScore {
  id: string;
  job_id: string;
  candidate_id: string;
  resume_id: string;
  overall_score: number;
  skill_match_score: number | null;
  experience_score: number | null;
  education_score: number | null;
  explanation: string;
  strengths: string[] | null;
  weaknesses: string[] | null;
  recommendation: string | null;
  scoring_model: string | null;
  additional_insights: AdditionalInsights | null;
  status: string;
  primary_language: string | null;
  score_translations: Record<string, ScoreTranslation> | null;
  created_at: string;
}
