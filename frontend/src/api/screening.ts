import api from './client';
import type { ScreeningScore } from '../types/candidate';

export const screeningApi = {
  scoreSingle: (jobId: string, candidateId: string, language?: string) =>
    api.post<ScreeningScore>('/screening/score', { job_id: jobId, candidate_id: candidateId, language }).then(r => r.data),

  scoreBatch: (jobId: string, language?: string) =>
    api.post('/screening/score-batch', { job_id: jobId, language }).then(r => r.data),

  getRankings: (jobId: string, topN?: number) =>
    api.get<ScreeningScore[]>(`/screening/job/${jobId}/rankings`, { params: topN ? { top_n: topN } : {} }).then(r => r.data),

  getScore: (scoreId: string) =>
    api.get<ScreeningScore>(`/screening/score/${scoreId}`).then(r => r.data),

  shortlist: (jobId: string, topN: number = 10) =>
    api.post(`/screening/job/${jobId}/shortlist`, { job_id: jobId, top_n: topN }).then(r => r.data),

  rescoreBatch: (jobId: string, language?: string) =>
    api.post(`/screening/job/${jobId}/rescore`, null, { params: { language } }).then(r => r.data),

  getScoreByCandidate: (candidateId: string, jobId?: string) =>
    api.get<ScreeningScore>(`/screening/score/by-candidate/${candidateId}`, { params: jobId ? { job_id: jobId } : {} }).then(r => r.data),
};
