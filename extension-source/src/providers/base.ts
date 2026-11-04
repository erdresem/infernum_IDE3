import { ChatMessage, GenerateOptions, ModelInfo, ProviderAdapter } from '../core/types';

export async function readError(response: Response): Promise<string> {
  let body = '';
  try { body = await response.text(); } catch { /* response body may be unavailable */ }
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || parsed?.message || parsed?.error || body;
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch { /* retain plain response */ }
  return `${response.status} ${response.statusText}: ${String(detail).slice(0, 900)}`;
}

export function assertOk(response: Response): Promise<Response> {
  if (!response.ok) return readError(response).then(message => { throw new Error(message); });
  return Promise.resolve(response);
}

export async function parseSSE(response: Response, consume: (data: string) => void, signal?: AbortSignal): Promise<void> {
  if (!response.body) throw new Error('Streaming response body is unavailable.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match && match.index !== undefined) {
        const frame = buffer.slice(0, match.index).replace(/\r/g, '');
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) consume(data);
        match = /\r?\n\r?\n/.exec(buffer);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const data = buffer.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data) consume(data);
    }
  } finally { reader.releaseLock(); }
}

export function recommendedModel(models: ModelInfo[], kind: string): string {
  if (!models.length) throw new Error('The provider returned no models available for text generation.');
  const patterns: Record<string, RegExp[]> = {
    deepseek: [/deepseek-chat/i, /deepseek-v/i],
    openai: [/^gpt-6/i, /^gpt-5/i, /^gpt-4\.1/i],
    anthropic: [/claude-sonnet/i, /claude-opus/i, /claude-haiku/i],
    gemini: [/gemini-.*flash/i, /gemini-.*pro/i],
    custom: [],
    ollama: [/coder/i, /qwen/i, /deepseek/i],
    lmstudio: [],
    local: []
  };
  const sorted = [...models].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  for (const pattern of patterns[kind] || []) {
    const found = sorted.find(model => pattern.test(model.id));
    if (found) return found.id;
  }
  return models[0].id;
}

export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(message => message.content.trim().length > 0);
}

export abstract class BaseProvider implements ProviderAdapter {
  abstract readonly kind: any;
  abstract readonly label: string;
  abstract listModels(apiKey?: string, baseUrl?: string): Promise<ModelInfo[]>;
  abstract generate(options: GenerateOptions): Promise<string>;
}
