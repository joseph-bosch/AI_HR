import api from './client';
import type { Candidate, CandidateUpdate, Resume } from '../types/candidate';

export interface EmailPreview {
  preview_id: string;
  sender: string;
  subject: string;
  email_body_preview: string;
  has_attachment: boolean;
  attachment_filename: string | null;
  extracted_info: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    summary: string | null;
    notes: string | null;
  };
}

export interface ConfirmEmailRequest {
  preview_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  notes: string;
}

export interface DuplicateInfo {
  new_candidate_id: string;
  new_candidate_name: string;
  existing_candidate_id: string;
  existing_candidate_name: string;
}

export interface ResolveDuplicateRequest {
  new_candidate_id: string;
  existing_candidate_id: string;
  job_id: string;
  action: 'skip' | 'replace';
}

export const candidatesApi = {
  list: (params?: { status?: string; page?: number }) =>
    api.get<Candidate[]>('/candidates', { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Candidate>(`/candidates/${id}`).then(r => r.data),

  update: (id: string, data: CandidateUpdate) =>
    api.put<Candidate>(`/candidates/${id}`, data).then(r => r.data),

  uploadResume: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<Candidate>('/candidates/upload-resume', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  uploadBulk: (files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return api.post('/candidates/upload-bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  getResume: (candidateId: string) =>
    api.get<Resume>(`/candidates/${candidateId}/resume`).then(r => r.data),

  reparse: (candidateId: string) =>
    api.post(`/candidates/${candidateId}/resume/reparse`).then(r => r.data),

  delete: (candidateId: string) =>
    api.delete(`/candidates/${candidateId}`).then(r => r.data),

  checkDuplicates: (job_id: string, candidate_ids: string[]) =>
    api.post<{ duplicates: DuplicateInfo[] }>('/candidates/check-duplicates', { job_id, candidate_ids })
      .then(r => r.data),

  resolveDuplicate: (payload: ResolveDuplicateRequest) =>
    api.post('/candidates/resolve-duplicate', payload).then(r => r.data),

  uploadEmail: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<EmailPreview>('/candidates/upload-email', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  confirmEmail: (payload: ConfirmEmailRequest) =>
    api.post<Candidate>('/candidates/confirm-email', payload).then(r => r.data),
};
