import { ChatMessage, GenerateOptions, ModelInfo } from '../core/types';
import { assertOk, BaseProvider, parseSSE } from './base';

export class GeminiProvider extends BaseProvider {
  readonly kind = 'gemini' as const;
  readonly label = 'Google Gemini';
  private readonly root = 'https://generativelanguage.googleapis.com/v1beta';

  async listModels(apiKey = ''): Promise<ModelInfo[]> {
    const collected: ModelInfo[] = [];
    let pageToken = '';
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
      const response = await fetch(`${this.root}/models?${query.toString()}`, {
        headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(25000)
      });
      await assertOk(response);
      const json: any = await response.json();
      collected.push(...(json.models || []).filter((item: any) => (item.supportedGenerationMethods || []).includes('generateContent'))
        .map((item: any) => ({ id: String(item.name || '').replace(/^models\//, ''), name: String(item.displayName || item.name || '') }))
        .filter((model: ModelInfo) => model.id));
      pageToken = json.nextPageToken || '';
      if (!pageToken) break;
    }
    return collected;
  }

  async generate(options: GenerateOptions): Promise<string> {
    const system = options.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = options.messages.filter(m => m.role !== 'system').map((message: ChatMessage) => ({
      role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }]
    }));
    const response = await fetch(`${this.root}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'x-goog-api-key': options.apiKey || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { temperature: options.temperature ?? 0.3, maxOutputTokens: options.maxTokens ?? 4096 } }),
      signal: options.signal
    });
    await assertOk(response);
    let full = '';
    await parseSSE(response, data => {
      let event: any;
      try { event = JSON.parse(data); } catch { return; /* ignore malformed events */ }
      if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));
      const token = (event.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
      if (token) { full += token; options.onToken?.(token); }
    }, options.signal);
    return full;
  }
}
