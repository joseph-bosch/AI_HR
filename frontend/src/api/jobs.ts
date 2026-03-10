import api from './client';
import type { Job, JobCreate, JobUpdate, JobStats } from '../types/job';

export interface WeightedItem {
  text: string;
  weight: number;
}

export interface GenerateDescriptionEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  message?: string;
  result?: { requirements?: WeightedItem[]; preferred_skills?: WeightedItem[] };
}

export const jobsApi = {
  list: (params?: { status?: string; department?: string; page?: number }) =>
    api.get<Job[]>('/jobs', { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Job>(`/jobs/${id}`).then(r => r.data),

  create: (data: JobCreate) =>
    api.post<Job>('/jobs', data).then(r => r.data),

  update: (id: string, data: JobUpdate) =>
    api.put<Job>(`/jobs/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/jobs/${id}`).then(r => r.data),

  getStats: (id: string) =>
    api.get<JobStats>(`/jobs/${id}/stats`).then(r => r.data),

  extractFromFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Record<string, unknown>>('/jobs/extract-from-file', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};

export async function* streamGenerateDescription(
  title: string,
  department: string,
  seniority_level: string,
  employment_type: string,
  language: string,
): AsyncGenerator<GenerateDescriptionEvent> {
  const response = await fetch('/api/jobs/generate-description', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, department, seniority_level, employment_type, language }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Generate description failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as GenerateDescriptionEvent;
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  }
}
