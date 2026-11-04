"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAICompatibleProvider = void 0;
const base_1 = require("./base");
const DEFAULT_URLS = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com/v1',
    lmstudio: 'http://127.0.0.1:1234/v1',
    local: 'http://127.0.0.1:8000/v1'
};
function isPrivateOrLoopbackHost(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal')
        return true;
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'))
        return true;
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
        return false;
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254);
}
class OpenAICompatibleProvider extends base_1.BaseProvider {
    kind;
    label;
    constructor(kind, label) { super(); this.kind = kind; this.label = label; }
    root(baseUrl) {
        const candidate = (baseUrl || DEFAULT_URLS[this.kind] || '').trim().replace(/\/+$/, '');
        let url;
        try {
            url = new URL(candidate);
        }
        catch {
            throw new Error('Enter a valid provider Base URL.');
        }
        if (url.username || url.password || url.search || url.hash)
            throw new Error('Do not put credentials, query parameters or fragments in the Base URL.');
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isPrivateOrLoopbackHost(url.hostname))) {
            throw new Error('Use HTTPS for remote providers. HTTP is allowed only for localhost or private-network local model servers.');
        }
        if (['lmstudio', 'local'].includes(this.kind) && url.protocol !== 'http:' && url.protocol !== 'https:')
            throw new Error('Unsupported local server protocol.');
        return candidate;
    }
    async listModels(apiKey, baseUrl) {
        const root = this.root(baseUrl);
        const headers = {};
        if (apiKey)
            headers.Authorization = `Bearer ${apiKey}`;
        const response = await fetch(`${root}/models`, { headers, signal: AbortSignal.timeout(25000) });
        if (this.kind === 'custom' && [404, 405, 501].includes(response.status))
            return [];
        await (0, base_1.assertOk)(response);
        const json = await response.json();
        const entries = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : [];
        return entries.map((item) => ({ id: String(item.id || item.name || ''), name: String(item.name || item.id || '') }))
            .filter((model) => model.id && !/embedding|whisper|tts|moderation|dall-e|transcription/i.test(model.id));
    }
    async generate(options) {
        const root = this.root(options.baseUrl);
        const messages = (0, base_1.normalizeMessages)(options.messages);
        const headers = { 'Content-Type': 'application/json' };
        if (options.apiKey)
            headers.Authorization = `Bearer ${options.apiKey}`;
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
        await (0, base_1.assertOk)(response);
        let full = '';
        await (0, base_1.parseSSE)(response, data => {
            if (data === '[DONE]')
                return;
            let event;
            try {
                event = JSON.parse(data);
            }
            catch {
                return; /* ignore non-JSON keepalives */
            }
            if (event.error)
                throw new Error(event.error.message || JSON.stringify(event.error));
            const token = event?.choices?.[0]?.delta?.content;
            if (typeof token === 'string' && token) {
                full += token;
                options.onToken?.(token);
            }
        }, options.signal);
        return full;
    }
}
exports.OpenAICompatibleProvider = OpenAICompatibleProvider;
//# sourceMappingURL=openai-compatible.js.map