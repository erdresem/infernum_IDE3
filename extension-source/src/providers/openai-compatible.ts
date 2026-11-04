import { GenerateOptions, ModelInfo, ProviderKind } from '../core/types';
import { assertOk, BaseProvider, normalizeMessages, parseSSE } from './base';

const DEFAULT_URLS: Partial<Record<ProviderKind, string>> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
  local: 'http://127.0.0.1:8000/v1'
};

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal') return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254);
}

export class OpenAICompatibleProvider extends BaseProvider {
  readonly kind: ProviderKind;
  readonly label: string;
  constructor(kind: ProviderKind, label: string) { super(); this.kind = kind; this.label = label; }

  private root(baseUrl?: string): string {
    const candidate = (baseUrl || DEFAULT_URLS[this.kind] || '').trim().replace(/\/+$/, '');
    let url: URL;
    try { url = new URL(candidate); } catch { throw new Error('Enter a valid provider Base URL.'); }
    if (url.username || url.password || url.search || url.hash) throw new Error('Do not put credentials, query parameters or fragments in the Base URL.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isPrivateOrLoopbackHost(url.hostname))) {
      throw new Error('Use HTTPS for remote providers. HTTP is allowed only for localhost or private-network local model servers.');
    }
    if (['lmstudio', 'local'].includes(this.kind) && url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported local server protocol.');
    return candidate;
  }

  async listModels(apiKey?: string, baseUrl?: string): Promise<ModelInfo[]> {
    const root = this.root(baseUrl);
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(`${root}/models`, { headers, signal: AbortSignal.timeout(25000) });
    if (this.kind === 'custom' && [404, 405, 501].includes(response.status)) return [];
    await assertOk(response);
    const json: any = await response.json();
    const entries = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
    return entries.map((item: any) => ({ id: String(item.id || item.name || ''), name: String(item.name || item.id || '') }))
      .filter((model: ModelInfo) => model.id && !/embedding|whisper|tts|moderation|dall-e|transcription/i.test(model.id));
  }

  async generate(options: GenerateOptions): Promise<string> {
    const root = this.root(options.baseUrl);
    const messages = normalizeMessages(options.messages);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
    const response = await fetch(`${root}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 4096,
        stream: true
      }),
      signal: options.signal
    });
    await assertOk(response);
    let full = '';
    await parseSSE(response, data => {
      if (data === '[DONE]') return;
      let event: any;
      try { event = JSON.parse(data); } catch { return; /* ignore non-JSON keepalives */ }
      if (event.error) throw new Error(event.error.message || JSON.stringify(event.error));
      const token = event?.choices?.[0]?.delta?.content;
      if (typeof token === 'string' && token) { full += token; options.onToken?.(token); }
    }, options.signal);
    return full;
  }
}
