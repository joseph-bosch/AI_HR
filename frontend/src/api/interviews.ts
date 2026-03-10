import api from './client';
import type { Evaluation, EvaluationCreate, TranscriptStatus } from '../types/interview';

export const interviewsApi = {
  startEvaluation: (data: EvaluationCreate) =>
    api.post<Evaluation>('/interviews/evaluations', data).then(r => r.data),

  getEvaluation: (id: string) =>
    api.get<Evaluation>(`/interviews/evaluations/${id}`).then(r => r.data),

  submitAnswer: (evalId: string, questionId: string, answer: string) =>
    api.put(`/interviews/evaluations/${evalId}/answer`, { question_id: questionId, answer }).then(r => r.data),

  generateReport: (evalId: string) =>
    api.post<Evaluation>(`/interviews/evaluations/${evalId}/generate-report`).then(r => r.data),

  getReport: (evalId: string) =>
    api.get(`/interviews/evaluations/${evalId}/report`).then(r => r.data),

  uploadAudio: (evalId: string, file: File) => {
    const form = new FormData();
    form.append('audio', file);
    return api.post(`/interviews/evaluations/${evalId}/upload-audio`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },

  getTranscriptStatus: (evalId: string) =>
    api.get<TranscriptStatus>(`/interviews/evaluations/${evalId}/transcript-status`).then(r => r.data),

  generateReportFromTranscript: (evalId: string) =>
    api.post<Evaluation>(`/interviews/evaluations/${evalId}/generate-report-from-transcript`).then(r => r.data),

  updateReport: (evalId: string, data: { generated_report?: Record<string, unknown> | null; hr_notes?: string | null }) =>
    api.put<Evaluation>(`/interviews/evaluations/${evalId}/report`, data).then(r => r.data),

  reScoreReport: (evalId: string) =>
    api.post<Evaluation>(`/interviews/evaluations/${evalId}/re-score`).then(r => r.data),

  listByJob: (jobId: string) =>
    api.get<Evaluation[]>(`/interviews/job/${jobId}/evaluations`).then(r => r.data),

  listByCandidate: (candidateId: string) =>
    api.get<Evaluation[]>(`/interviews/candidate/${candidateId}/evaluations`).then(r => r.data),
};
