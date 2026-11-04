"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const base_1 = require("./base");
async function parseNdjson(response, consume, signal) {
    if (!response.body)
        throw new Error('Ollama streaming response body is unavailable.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const flushLines = (final = false) => {
        const lines = buffer.split(/\r?\n/);
        buffer = final ? '' : (lines.pop() || '');
        if (final && lines.length === 0 && buffer.trim())
            lines.push(buffer);
        for (const line of lines) {
            if (!line.trim())
                continue;
            let event;
            try {
                event = JSON.parse(line);
            }
            catch {
                throw new Error(`Ollama returned an invalid streaming event: ${line.slice(0, 160)}`);
            }
            if (event.error)
                throw new Error(String(event.error));
            consume(event);
        }
    };
    try {
        while (true) {
            if (signal?.aborted)
                throw new DOMException('Generation cancelled', 'AbortError');
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            flushLines();
        }
        buffer += decoder.decode();
        flushLines(true);
    }
    finally {
        reader.releaseLock();
    }
}
class OllamaProvider extends base_1.BaseProvider {
    kind = 'ollama';
    label = 'Ollama';
    root(baseUrl) {
        const candidate = (baseUrl || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
        let url;
        try {
            url = new URL(candidate);
        }
        catch {
            throw new Error('Enter a valid Ollama server URL.');
        }
        const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        const localHost = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'host.docker.internal' || hostname === '::1' ||
            hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:') ||
            /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname) ||
            (() => { const m = hostname.match(/^172\.(\d+)\./); return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31); })();
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost))
            throw new Error('Ollama HTTP is allowed only on localhost or a private network. Use HTTPS for remote servers.');
        if (url.username || url.password || url.search || url.hash)
            throw new Error('Do not put credentials, query parameters or fragments in the Ollama URL.');
        return candidate;
    }
    async listModels(apiKey, baseUrl) {
        const headers = {};
        if (apiKey)
            headers.Authorization = `Bearer ${apiKey}`;
        const response = await fetch(`${this.root(baseUrl)}/api/tags`, { headers, signal: AbortSignal.timeout(25000) });
        await (0, base_1.assertOk)(response);
        const json = await response.json();
        return (Array.isArray(json.models) ? json.models : []).map((item) => ({
            id: String(item.name || item.model || ''), name: String(item.name || item.model || '')
        })).filter((model) => model.id);
    }
    async generate(options) {
        const headers = { 'Content-Type': 'application/json' };
        if (options.apiKey)
            headers.Authorization = `Bearer ${options.apiKey}`;
        const response = await fetch(`${this.root(options.baseUrl)}/api/chat`, {
            method: 'POST', headers,
            body: JSON.stringify({
                model: options.model,
                messages: (0, base_1.normalizeMessages)(options.messages),
                stream: true,
                options: { temperature: options.temperature ?? 0.3 }
            }),
            signal: options.signal
        });
        await (0, base_1.assertOk)(response);
        let full = '';
        await parseNdjson(response, event => {
            const token = event?.message?.content;
            if (typeof token === 'string' && token) {
                full += token;
                options.onToken?.(token);
            }
        }, options.signal);
        return full;
    }
}
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=ollama.js.map