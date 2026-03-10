export interface Job {
  id: string;
  title: string;
  department: string;
  seniority_level: string;
  employment_type: string;
  location: string | null;
  description: string;
  requirements: string[] | null;
  preferred_skills: string[] | null;
  min_salary: number | null;
  max_salary: number | null;
  currency: string;
  benefits: string[] | null;
  status: string;
  target_score: number | null;
  created_at: string;
  updated_at: string;
}

export type JobCreate = Omit<Job, 'id' | 'created_at' | 'updated_at'>;
export type JobUpdate = Partial<JobCreate>;

export interface JobStats {
  job_id: string;
  total_candidates: number;
  screened_candidates: number;
  shortlisted_candidates: number;
  avg_score: number | null;
  status: string;
}
