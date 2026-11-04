"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfernumViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("../core/types");
const base_1 = require("../providers/base");
const LABELS = {
    deepseek: 'DeepSeek', gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude',
    ollama: 'Ollama (local)', lmstudio: 'LM Studio (local)', local: 'Local OpenAI-compatible', custom: 'Custom API'
};
class InfernumViewProvider {
    context;
    manager;
    registry;
    engine;
    tools;
    view;
    controller;
    settings = { glass: 72, accent: '#a78bfa' };
    constructor(context, manager, registry, engine, tools) {
        this.context = context;
        this.manager = manager;
        this.registry = registry;
        this.engine = engine;
        this.tools = tools;
        this.settings = context.globalState.get('infernum.uiSettings', this.settings);
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'webview'), vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
        webviewView.webview.html = this.html(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => this.handle(message).catch((error) => this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) })));
        webviewView.onDidDispose(() => { this.controller?.abort(); this.view = undefined; });
    }
    html(webview) {
        const nonce = Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62))).join('');
        const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'app.js'));
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'style.css'));
        const logo = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'logo.svg'));
        const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};`;
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="${csp}"><link rel="stylesheet" href="${style}"><title>Infernum AI</title></head><body><div id="app" data-logo="${logo}"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    }
    post(message) { this.view?.webview.postMessage(message); }
    cancel() { this.controller?.abort(); }
    async refresh() { await this.sync(); }
    async showPending() { this.post({ type: 'tab', tab: 'chat' }); this.post({ type: 'pending', pending: this.tools.listPending().map(c => ({ id: c.id, path: c.path, createdAt: c.createdAt })) }); }
    refreshTheme() { this.post({ type: 'themeChanged' }); }
    async state() {
        const providers = await Promise.all(this.manager.providers().map(async (provider) => ({
            ...provider, connected: !(0, types_1.providerRequiresApiKey)(provider.kind) || Boolean(await this.manager.providerKey(provider.id)), label: LABELS[provider.kind]
        })));
        const agents = this.manager.agents();
        return {
            providers, agents, activeAgentId: this.manager.activeAgentId(), primaryProviderId: this.manager.primaryProviderId(), pending: this.tools.listPending().map(c => ({ id: c.id, path: c.path, createdAt: c.createdAt })),
            templates: (await Promise.resolve().then(() => __importStar(require('../core/types')))).AGENT_TEMPLATES,
            settings: this.settings,
            workspace: vscode.workspace.workspaceFolders?.[0]?.name || 'No workspace',
            defaultMode: vscode.workspace.getConfiguration('infernum').get('defaultMode', 'agent')
        };
    }
    async sync() { this.post({ type: 'state', state: await this.state() }); }
    async handle(message) {
        if (!message || typeof message.type !== 'string')
            return;
        switch (message.type) {
            case 'ready':
                await this.sync();
                break;
            case 'selectAgent':
                await this.manager.setActiveAgent(message.agentId);
                await this.sync();
                break;
            case 'setPrimaryProvider':
                await this.manager.setPrimaryProvider(String(message.providerId || ''));
                await this.sync();
                break;
            case 'testProvider': {
                const input = this.validateProviderInput(message);
                const verified = await this.verifyProvider(input);
                this.post({ type: 'providerTested', requestId: message.requestId, models: verified.models, recommendedModel: verified.model, count: verified.models.length });
                break;
            }
            case 'addProvider': {
                const input = this.validateProviderInput(message);
                const verified = await this.verifyProvider(input);
                const model = verified.model;
                const provider = await this.manager.addProvider({ kind: input.kind, name: input.name, model, baseUrl: input.baseUrl }, input.apiKey);
                this.post({ type: 'providerSaved' });
                this.post({ type: 'toast', message: `${provider.name} connected · ${model}` });
                await this.sync();
                break;
            }
            case 'updateProviderKey': {
                const provider = this.manager.providers().find(p => p.id === message.providerId);
                if (!provider)
                    throw new Error('Provider not found.');
                const input = this.validateProviderInput({ ...message, kind: provider.kind, name: message.name || provider.name, baseUrl: message.baseUrl || provider.baseUrl });
                const verified = await this.verifyProvider(input);
                const model = verified.model;
                await this.manager.replaceProviderKey(provider.id, input.apiKey || '');
                await this.manager.updateProvider(provider.id, { name: input.name, model, baseUrl: input.baseUrl });
                this.post({ type: 'providerSaved' });
                this.post({ type: 'toast', message: `Credentials updated for ${provider.name}.` });
                await this.sync();
                break;
            }
            case 'removeProvider': {
                const provider = this.manager.providers().find(p => p.id === message.providerId);
                if (!provider)
                    break;
                const answer = await vscode.window.showWarningMessage(`Remove ${provider.name} and delete its API key from VS Code SecretStorage?`, { modal: true }, 'Remove');
                if (answer === 'Remove') {
                    await this.manager.removeProvider(provider.id);
                    await this.sync();
                }
                break;
            }
            case 'toggleProvider':
                await this.manager.updateProvider(message.providerId, { enabled: Boolean(message.enabled) });
                await this.sync();
                break;
            case 'updateProvider':
                await this.manager.updateProvider(message.providerId, { name: message.name, model: message.model });
                await this.sync();
                break;
            case 'addAgent': {
                const input = message.agent || {};
                if (!String(input.name || '').trim())
                    throw new Error('Agent name is required.');
                await this.manager.addAgent(input);
                await this.sync();
                break;
            }
            case 'duplicateAgent':
                await this.manager.duplicateAgent(message.agentId);
                await this.sync();
                break;
            case 'removeAgent': {
                const answer = await vscode.window.showWarningMessage('Delete this agent profile?', { modal: true }, 'Delete');
                if (answer === 'Delete')
                    await this.manager.removeAgent(message.agentId);
                await this.sync();
                break;
            }
            case 'updateAgent':
                await this.manager.updateAgent(message.agentId, message.patch || {});
                await this.sync();
                break;
            case 'acceptChange':
                await this.tools.acceptChange(message.changeId);
                this.post({ type: 'toast', message: 'Change applied.' });
                await this.sync();
                break;
            case 'rejectChange':
                this.tools.rejectChange(message.changeId);
                await this.sync();
                break;
            case 'cancel':
                this.controller?.abort();
                this.post({ type: 'status', text: 'Stopping…' });
                break;
            case 'send':
                await this.send(message);
                break;
            case 'settings':
                this.settings = { ...this.settings, ...message.value };
                this.settings.glass = Math.max(0, Math.min(100, Number(this.settings.glass)));
                if (!/^#[0-9a-f]{6}$/i.test(this.settings.accent))
                    this.settings.accent = '#a78bfa';
                await this.context.globalState.update('infernum.uiSettings', this.settings);
                this.post({ type: 'settingsSaved', settings: this.settings });
                break;
            case 'openHub':
                this.post({ type: 'tab', tab: 'hub' });
                break;
            case 'focusEditor':
                await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
                break;
            case 'importAgent':
                await this.importAgent();
                break;
            case 'exportAgent':
                await this.exportAgent(message.agentId);
                break;
            case 'openFile': {
                const file = vscode.workspace.workspaceFolders?.[0] && vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, message.path);
                if (file) {
                    const doc = await vscode.workspace.openTextDocument(file);
                    await vscode.window.showTextDocument(doc);
                }
                break;
            }
        }
    }
    async verifyProvider(input) {
        const adapter = this.registry.get(input.kind);
        let models = [];
        let listError;
        try {
            models = await adapter.listModels(input.apiKey, input.baseUrl);
        }
        catch (error) {
            listError = error;
            if (!['custom', 'local'].includes(input.kind) || !input.model)
                throw error;
        }
        const listed = models.find(item => item.id === input.model);
        if (listed)
            return { models, model: listed.id };
        if (['custom', 'local'].includes(input.kind) && input.model) {
            await adapter.generate({ ...(input.apiKey ? { apiKey: input.apiKey } : {}), baseUrl: input.baseUrl, model: input.model,
                messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 16, temperature: 0 });
            return { models, model: input.model };
        }
        if (models.length)
            return { models, model: (0, base_1.recommendedModel)(models, input.kind) };
        if (listError)
            throw listError;
        throw new Error('No text-generation models were returned. Download a model first or check the local server.');
    }
    validateProviderInput(message) {
        const kind = String(message.kind || '');
        if (!['deepseek', 'gemini', 'openai', 'anthropic', 'ollama', 'lmstudio', 'local', 'custom'].includes(kind))
            throw new Error('Choose a supported provider.');
        const name = String(message.name || LABELS[kind]).trim();
        if (!name || name.length > 60)
            throw new Error('Connection name must contain 1–60 characters.');
        const apiKey = String(message.apiKey || '').trim();
        if ((0, types_1.providerRequiresApiKey)(kind) && (apiKey.length < 8 || apiKey.length > 4096))
            throw new Error('Enter a valid API key.');
        if (!(0, types_1.providerRequiresApiKey)(kind) && apiKey.length > 4096)
            throw new Error('API key is too long.');
        const usesBaseUrl = ['ollama', 'lmstudio', 'local', 'custom'].includes(kind);
        const defaults = {
            ollama: 'http://127.0.0.1:11434', lmstudio: 'http://127.0.0.1:1234/v1', local: 'http://127.0.0.1:8000/v1'
        };
        const baseUrl = usesBaseUrl ? String(message.baseUrl || defaults[kind] || '').trim() : undefined;
        if (usesBaseUrl) {
            let url;
            try {
                url = new URL(baseUrl || '');
            }
            catch {
                throw new Error('Enter a valid Base URL.');
            }
            if (url.username || url.password || url.search || url.hash)
                throw new Error('Do not put credentials, query parameters or fragments in the Base URL.');
            const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
            const privateHost = host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal' || host === '::1' ||
                host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') ||
                /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || (() => { const m = host.match(/^172\.(\d+)\./); return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31); })();
            if (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost)) {
                throw new Error('Use HTTPS for remote APIs. HTTP is allowed only for localhost or private-network local model servers.');
            }
            if (kind === 'ollama' && !privateHost && url.protocol !== 'https:')
                throw new Error('Ollama must use localhost/private network HTTP or HTTPS.');
            if (kind === 'custom' && url.protocol !== 'https:' && !privateHost)
                throw new Error('Custom remote APIs must use HTTPS.');
        }
        const model = String(message.model || '').trim();
        if (model.length > 200)
            throw new Error('Model identifier is too long.');
        return { kind, name, ...(apiKey ? { apiKey } : {}), model, ...(baseUrl ? { baseUrl } : {}) };
    }
    async send(message) {
        if (this.controller)
            this.controller.abort();
        this.controller = new AbortController();
        const controller = this.controller;
        const callbacks = {
            onToken: (token) => this.post({ type: 'delta', token }),
            onStatus: (text) => this.post({ type: 'status', text }),
            onAction: (text) => this.post({ type: 'agentAction', text }),
            onProposal: () => this.post({ type: 'pending', pending: this.tools.listPending().map(c => ({ id: c.id, path: c.path, createdAt: c.createdAt })) })
        };
        this.post({ type: 'started' });
        try {
            await this.engine.run({
                agentId: String(message.agentId || this.manager.activeAgentId() || ''),
                message: String(message.message || '').slice(0, 30000),
                mode: ['chat', 'agent', 'code', 'debug', 'explain', 'plan', 'review', 'creative'].includes(message.mode) ? message.mode : 'chat',
                history: Array.isArray(message.history) ? message.history.filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-20) : [],
                signal: controller.signal, callbacks
            });
            if (!controller.signal.aborted)
                this.post({ type: 'complete' });
        }
        catch (error) {
            if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError'))
                this.post({ type: 'cancelled' });
            else
                this.post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
        finally {
            if (this.controller === controller)
                this.controller = undefined;
        }
    }
    async requestImport() { await this.importAgent(); }
    async requestExport(agentId) { await this.exportAgent(agentId); }
    openHub() { this.post({ type: 'tab', tab: 'hub' }); }
    prefill(mode, message) { this.post({ type: 'prefill', mode: ['chat', 'agent', 'code', 'debug', 'explain', 'plan', 'review', 'creative'].includes(mode) ? mode : 'chat', message }); }
    async importAgent() {
        const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Infernum Agent': ['json'] }, openLabel: 'Import Agent' });
        if (!files?.[0])
            return;
        const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(files[0]));
        const data = JSON.parse(text);
        await this.manager.addAgent({ name: data.name || 'Imported Agent', icon: data.icon, description: data.description, systemPrompt: data.systemPrompt,
            providerId: null, temperature: data.temperature, maxTokens: data.maxTokens });
        this.post({ type: 'toast', message: 'Agent imported. Assign a provider in Agent Library.' });
        await this.sync();
    }
    async exportAgent(agentId) {
        const agent = this.manager.agents().find(a => a.id === agentId);
        if (!agent)
            throw new Error('Agent not found.');
        const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`${agent.name.replace(/[^\w.-]+/g, '-')}.infernum-agent.json`), filters: { JSON: ['json'] } });
        if (!uri)
            return;
        const safe = { name: agent.name, icon: agent.icon, description: agent.description, systemPrompt: agent.systemPrompt, temperature: agent.temperature, maxTokens: agent.maxTokens };
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(safe, null, 2)));
        this.post({ type: 'toast', message: 'Agent exported without provider credentials.' });
    }
}
exports.InfernumViewProvider = InfernumViewProvider;
//# sourceMappingURL=view-provider.js.map