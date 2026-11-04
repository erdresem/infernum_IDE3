import { ProviderAdapter, ProviderKind } from '../core/types';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OpenAICompatibleProvider } from './openai-compatible';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderKind, ProviderAdapter>();
  constructor() {
    this.adapters.set('deepseek', new OpenAICompatibleProvider('deepseek', 'DeepSeek'));
    this.adapters.set('openai', new OpenAIProvider());
    this.adapters.set('gemini', new GeminiProvider());
    this.adapters.set('anthropic', new AnthropicProvider());
    this.adapters.set('ollama', new OllamaProvider());
    this.adapters.set('lmstudio', new OpenAICompatibleProvider('lmstudio', 'LM Studio'));
    this.adapters.set('local', new OpenAICompatibleProvider('local', 'Local OpenAI-compatible API'));
    this.adapters.set('custom', new OpenAICompatibleProvider('custom', 'Custom API'));
  }
  get(kind: ProviderKind): ProviderAdapter {
    const provider = this.adapters.get(kind);
    if (!provider) throw new Error(`Unsupported provider: ${kind}`);
    return provider;
  }
  labels(): Array<{ kind: ProviderKind; label: string }> {
    return [...this.adapters.values()].map(item => ({ kind: item.kind, label: item.label }));
  }
}
