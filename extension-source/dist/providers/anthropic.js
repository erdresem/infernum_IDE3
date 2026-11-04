"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const base_1 = require("./base");
class AnthropicProvider extends base_1.BaseProvider {
    kind = 'anthropic';
    label = 'Anthropic Claude';
    root = 'https://api.anthropic.com';
    headers(apiKey = '') {
        return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
    }
    async listModels(apiKey = '') {
        const collected = [];
        let afterId = '';
        for (let page = 0; page < 10; page++) {
            const query = new URLSearchParams({ limit: '1000', ...(afterId ? { after_id: afterId } : {}) });
            const response = await fetch(`${this.root}/v1/models?${query.toString()}`, { headers: this.headers(apiKey), signal: AbortSignal.timeout(25000) });
            await (0, base_1.assertOk)(response);
            const json = await response.json();
            collected.push(...(json.data || []).filter((item) => !item.lifecycle || item.lifecycle === 'active')
                .map((item) => ({ id: String(item.id || ''), name: String(item.display_name || item.id || '') })).filter((m) => m.id));
            afterId = json.has_more ? String(json.last_id || '') : '';
            if (!afterId)
                break;
        }
        return collected;
    }
    async generate(options) {
        const system = options.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const messages = options.messages.filter(m => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
        const response = await fetch(`${this.root}/v1/messages`, {
            method: 'POST', headers: this.headers(options.apiKey || ''),
            body: JSON.stringify({ model: options.model, max_tokens: options.maxTokens ?? 4096, temperature: options.temperature ?? 0.3, ...(system ? { system } : {}), messages, stream: true }),
            signal: options.signal
        });
        await (0, base_1.assertOk)(response);
        let full = '';
        await (0, base_1.parseSSE)(response, data => {
            let event;
            try {
                event = JSON.parse(data);
            }
            catch {
                return; /* ignore malformed events */
            }
            if (event.type === 'error')
                throw new Error(event.error?.message || event.message || 'Anthropic streaming error.');
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
                full += event.delta.text;
                options.onToken?.(event.delta.text);
            }
        }, options.signal);
        return full;
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=anthropic.js.map