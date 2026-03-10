import api from './client';
import type { QuestionSet, QuestionSetGenerate, QuestionItemCreate, QuestionItemUpdate } from '../types/questionSet';
import type { ChatMessage } from '../types/chat';

export const questionSetsApi = {
  generate: (data: QuestionSetGenerate) =>
    api.post<QuestionSet>('/question-sets/generate', data).then(r => r.data),

  get: (id: string) =>
    api.get<QuestionSet>(`/question-sets/${id}`).then(r => r.data),

  addQuestion: (setId: string, data: QuestionItemCreate) =>
    api.post(`/question-sets/${setId}/questions`, data).then(r => r.data),

  updateQuestion: (setId: string, qId: string, data: QuestionItemUpdate) =>
    api.put(`/question-sets/${setId}/questions/${qId}`, data).then(r => r.data),

  deleteQuestion: (setId: string, qId: string) =>
    api.delete(`/question-sets/${setId}/questions/${qId}`).then(r => r.data),

  reorder: (setId: string, itemIds: string[]) =>
    api.put(`/question-sets/${setId}/reorder`, { item_ids: itemIds }).then(r => r.data),

  finalize: (setId: string) =>
    api.post(`/question-sets/${setId}/finalize`).then(r => r.data),

  exportPdf: (setId: string) =>
    api.get(`/question-sets/${setId}/export/pdf`, { responseType: 'blob' }).then(r => r.data),

  listByJob: (jobId: string) =>
    api.get<QuestionSet[]>(`/question-sets/job/${jobId}`).then(r => r.data),
};

export async function* streamQuestionChat(
  questionSetId: string,
  message: string,
  history: ChatMessage[],
  language: string = 'en',
): AsyncGenerator<{ token?: string; done?: boolean; error?: string }> {
  const response = await fetch('/api/chat/questions-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      question_set_id: questionSetId,
      history: history.map(({ role, content }) => ({ role, content })),
      language,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Questions chat failed: ${response.status}`);
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
