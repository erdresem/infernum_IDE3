"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = void 0;
const anthropic_1 = require("./anthropic");
const gemini_1 = require("./gemini");
const openai_compatible_1 = require("./openai-compatible");
const openai_1 = require("./openai");
const ollama_1 = require("./ollama");
class ProviderRegistry {
    adapters = new Map();
    constructor() {
        this.adapters.set('deepseek', new openai_compatible_1.OpenAICompatibleProvider('deepseek', 'DeepSeek'));
        this.adapters.set('openai', new openai_1.OpenAIProvider());
        this.adapters.set('gemini', new gemini_1.GeminiProvider());
        this.adapters.set('anthropic', new anthropic_1.AnthropicProvider());
        this.adapters.set('ollama', new ollama_1.OllamaProvider());
        this.adapters.set('lmstudio', new openai_compatible_1.OpenAICompatibleProvider('lmstudio', 'LM Studio'));
        this.adapters.set('local', new openai_compatible_1.OpenAICompatibleProvider('local', 'Local OpenAI-compatible API'));
        this.adapters.set('custom', new openai_compatible_1.OpenAICompatibleProvider('custom', 'Custom API'));
    }
    get(kind) {
        const provider = this.adapters.get(kind);
        if (!provider)
            throw new Error(`Unsupported provider: ${kind}`);
        return provider;
    }
    labels() {
        return [...this.adapters.values()].map(item => ({ kind: item.kind, label: item.label }));
    }
}
exports.ProviderRegistry = ProviderRegistry;
//# sourceMappingURL=registry.js.map