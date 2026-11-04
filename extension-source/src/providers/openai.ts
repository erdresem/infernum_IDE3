import { ChatMessage, GenerateOptions, ModelInfo } from '../core/types';
import { assertOk, BaseProvider, parseSSE } from './base';

export class OpenAIProvider extends BaseProvider {
  readonly kind = 'openai' as const;
  readonly label = 'OpenAI';
  private readonly root = 'https://api.openai.com/v1';

  async listModels(apiKey = ''): Promise<ModelInfo[]> {
    const response = await fetch(`${this.root}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(25000) });
    await assertOk(response);
    const json: any = await response.json();
    return (json.data || []).map((item: any) => ({ id: String(item.id || ''), name: String(item.id || '') }))
      .filter((model: ModelInfo) => model.id && /^(gpt-|o[134]-|chatgpt-)/i.test(model.id));
  }

  async generate(options: GenerateOptions): Promise<string> {
    const instructions = options.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const input: ChatMessage[] = options.messages.filter(m => m.role !== 'system');
    const response = await fetch(`${this.root}/responses`, {
      method: 'POST', headers: { Authorization: `Bearer ${options.apiKey || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model, input, ...(instructions ? { instructions } : {}), stream: true,
        max_output_tokens: options.maxTokens ?? 4096,
        // Responses API models differ in sampling parameter support; omit temperature for broad compatibility.
      }),
      signal: options.signal
    });
    await assertOk(response);
    let full = '';
    await parseSSE(response, data => {
      let event: any;
      try { event = JSON.parse(data); } catch { return; }
      if (event.type === 'error' || event.error) throw new Error(event.error?.message || event.message || 'OpenAI streaming error.');
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        full += event.delta; options.onToken?.(event.delta);
      }
    }, options.signal);
    return full;
  }
}
