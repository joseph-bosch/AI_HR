import api from './client';
import type { InterviewDecision } from '../types/decision';
import type { ChatMessage } from '../types/chat';

export const decisionApi = {
  generate: (pipelineId: string, language?: string) =>
    api.post<InterviewDecision>(
      `/decisions/generate/${pipelineId}`,
      null,
      { params: language ? { language } : {} }
    ).then(r => r.data),

  getByPipeline: (pipelineId: string) =>
    api.get<InterviewDecision>(`/decisions/pipeline/${pipelineId}`).then(r => r.data),

  setFinalDecision: (decisionId: string, final_decision: string, decision_reason?: string) =>
    api.put<InterviewDecision>(`/decisions/${decisionId}`, { final_decision, decision_reason }).then(r => r.data),
};

export async function* streamDecisionChat(
  decisionId: string,
  message: string,
  history: ChatMessage[],
  language: string,
): AsyncGenerator<{ type: string; content?: string; message?: string }> {
  const response = await fetch(`/api/decisions/${decisionId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(({ role, content }) => ({ role, content })),
      language,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Decision chat failed: ${response.status}`);
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
          yield JSON.parse(line.slice(6));
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  }
}
