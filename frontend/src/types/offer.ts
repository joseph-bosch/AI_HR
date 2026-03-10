export interface OfferTemplate {
  id: string;
  name: string;
  department: string | null;
  role_type: string | null;
  content: string;
  placeholders: string[] | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type TemplateCreate = Pick<OfferTemplate, 'name' | 'content'> & {
  department?: string;
  role_type?: string;
  placeholders?: string[];
};

export type TemplateUpdate = Partial<TemplateCreate & { is_active: number }>;

export interface Offer {
  id: string;
  job_id: string;
  candidate_id: string;
  template_id: string | null;
  content: string;
  offer_data: Record<string, unknown> | null;
  pdf_path: string | null;
  status: string;
  generation_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferGenerateRequest {
  job_id: string;
  candidate_id: string;
  template_id: string;
  offer_data: Record<string, unknown>;
}
