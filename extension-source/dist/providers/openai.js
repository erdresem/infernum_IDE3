"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const base_1 = require("./base");
class OpenAIProvider extends base_1.BaseProvider {
    kind = 'openai';
    label = 'OpenAI';
    root = 'https://api.openai.com/v1';
    async listModels(apiKey = '') {
        const response = await fetch(`${this.root}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(25000) });
        await (0, base_1.assertOk)(response);
        const json = await response.json();
        return (json.data || []).map((item) => ({ id: String(item.id || ''), name: String(item.id || '') }))
            .filter((model) => model.id && /^(gpt-|o[134]-|chatgpt-)/i.test(model.id));
    }
    async generate(options) {
        const instructions = options.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const input = options.messages.filter(m => m.role !== 'system');
        const response = await fetch(`${this.root}/responses`, {
            method: 'POST', headers: { Authorization: `Bearer ${options.apiKey || ''}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: options.model, input, ...(instructions ? { instructions } : {}), stream: true,
                max_output_tokens: options.maxTokens ?? 4096,
                // Responses API models differ in sampling parameter support; omit temperature for broad compatibility.
            }),
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
                return;
            }
            if (event.type === 'error' || event.error)
                throw new Error(event.error?.message || event.message || 'OpenAI streaming error.');
            if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                full += event.delta;
                options.onToken?.(event.delta);
            }
        }, options.signal);
        return full;
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=openai.js.map