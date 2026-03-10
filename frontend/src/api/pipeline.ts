import apiClient from './client';
import type { PipelineEntry, PipelineEntryEnriched } from '../types/pipeline';

export async function addToPipeline(job_id: string, candidate_id: string, promoted_by?: string): Promise<PipelineEntryEnriched> {
  const { data } = await apiClient.post('/pipeline', { job_id, candidate_id, promoted_by });
  return data;
}

export async function getPipelineForJob(job_id: string): Promise<PipelineEntryEnriched[]> {
  const { data } = await apiClient.get(`/pipeline/job/${job_id}`);
  return data;
}

export async function getPipelineEntry(pipeline_id: string): Promise<PipelineEntry> {
  const { data } = await apiClient.get(`/pipeline/${pipeline_id}`);
  return data;
}

export async function advanceStage(
  pipeline_id: string,
  target_stage?: string,
  promoted_by?: string,
): Promise<PipelineEntry> {
  const { data } = await apiClient.put(`/pipeline/${pipeline_id}/advance`, { target_stage, promoted_by });
  return data;
}

export async function rejectCandidate(pipeline_id: string, rejection_reason: string): Promise<PipelineEntry> {
  const { data } = await apiClient.put(`/pipeline/${pipeline_id}/reject`, { rejection_reason });
  return data;
}

export async function removeFromPipeline(pipeline_id: string): Promise<void> {
  await apiClient.delete(`/pipeline/${pipeline_id}`);
}

export async function getPipelineRemark(pipeline_id: string, lang: string): Promise<{ remark: string }> {
  const { data } = await apiClient.get(`/pipeline/${pipeline_id}/remark`, { params: { lang } });
  return data;
}
