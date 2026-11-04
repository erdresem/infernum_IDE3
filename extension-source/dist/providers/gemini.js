"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const base_1 = require("./base");
class GeminiProvider extends base_1.BaseProvider {
    kind = 'gemini';
    label = 'Google Gemini';
    root = 'https://generativelanguage.googleapis.com/v1beta';
    async listModels(apiKey = '') {
        const collected = [];
        let pageToken = '';
        for (let page = 0; page < 10; page++) {
            const query = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
            const response = await fetch(`${this.root}/models?${query.toString()}`, {
                headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(25000)
            });
            await (0, base_1.assertOk)(response);
            const json = await response.json();
            collected.push(...(json.models || []).filter((item) => (item.supportedGenerationMethods || []).includes('generateContent'))
                .map((item) => ({ id: String(item.name || '').replace(/^models\//, ''), name: String(item.displayName || item.name || '') }))
                .filter((model) => model.id));
            pageToken = json.nextPageToken || '';
            if (!pageToken)
                break;
        }
        return collected;
    }
    async generate(options) {
        const system = options.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const contents = options.messages.filter(m => m.role !== 'system').map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }]
        }));
        const response = await fetch(`${this.root}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse`, {
            method: 'POST', headers: { 'x-goog-api-key': options.apiKey || '', 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { temperature: options.temperature ?? 0.3, maxOutputTokens: options.maxTokens ?? 4096 } }),
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
            if (event.error)
                throw new Error(event.error.message || JSON.stringify(event.error));
            const token = (event.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
            if (token) {
                full += token;
                options.onToken?.(token);
            }
        }, options.signal);
        return full;
    }
}
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=gemini.js.map