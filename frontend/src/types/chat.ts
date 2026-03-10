export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools_used?: string[];
}

export interface StreamChunk {
  chunk?: string;
  done?: boolean;
  tools_used?: string[];
  error?: string;
}
