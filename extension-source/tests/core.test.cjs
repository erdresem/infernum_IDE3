const test = require('node:test');
const assert = require('node:assert/strict');
const { recommendedModel, normalizeMessages, parseSSE } = require('../dist/providers/base.js');
const { parseActionBlock } = require('../dist/agents/protocol.js');

test('model recommendation chooses a useful available model, never a hardcoded missing id', () => {
  const models = [{ id: 'embedding-3', name: 'embedding' }, { id: 'deepseek-chat', name: 'chat' }, { id: 'deepseek-reasoner', name: 'reasoner' }];
  assert.equal(recommendedModel(models, 'deepseek'), 'deepseek-chat');
  assert.equal(recommendedModel([{ id: 'custom-v4', name: 'v4' }], 'custom'), 'custom-v4');
});

test('model recommendation rejects an empty model list', () => {
  assert.throws(() => recommendedModel([], 'openai'), /no models/);
});

test('message normalization drops blank messages without changing valid content', () => {
  assert.deepEqual(normalizeMessages([{ role: 'user', content: '  ' }, { role: 'assistant', content: 'hello' }]), [{ role: 'assistant', content: 'hello' }]);
});

test('agent protocol extracts one safe workspace tool action', () => {
  assert.deepEqual(parseActionBlock('Let me inspect.\n<infernum_action>{"tool":"read_file","path":"src/main.ts"}</infernum_action>'), { tool: 'read_file', path: 'src/main.ts' });
});

test('agent protocol rejects unknown tools and malformed JSON', () => {
  assert.throws(() => parseActionBlock('<infernum_action>{"tool":"delete_everything"}</infernum_action>'), /Unsupported/);
  assert.throws(() => parseActionBlock('<infernum_action>{bad}</infernum_action>'), /Malformed/);
});

test('SSE parser handles CRLF frames and multi-line data payloads', async () => {
  const source = 'event: message\r\ndata: {"n":1}\r\n\r\ndata: [DONE]\r\n\r\n';
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(source)); controller.close(); } });
  const response = new Response(stream);
  const frames = [];
  await parseSSE(response, data => frames.push(data));
  assert.deepEqual(frames, ['{"n":1}', '[DONE]']);
});

const { OpenAICompatibleProvider } = require('../dist/providers/openai-compatible.js');
const { GeminiProvider } = require('../dist/providers/gemini.js');
const { AnthropicProvider } = require('../dist/providers/anthropic.js');
const { OpenAIProvider } = require('../dist/providers/openai.js');

function sseResponse(payloads, eol = '\n') {
  const source = payloads.map(payload => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}${eol}${eol}`).join('');
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(source)); controller.close(); } });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function withMockFetch(mock, callback) {
  const original = global.fetch;
  global.fetch = mock;
  try { return await callback(); } finally { global.fetch = original; }
}

test('DeepSeek adapter discovers account models and streams Chat Completions', async () => {
  const adapter = new OpenAICompatibleProvider('deepseek', 'DeepSeek');
  await withMockFetch(async (url, init) => {
    assert.match(String(url), /api\.deepseek\.com\/models$/);
    assert.equal(init.headers.Authorization, 'Bearer secret-key');
    return Response.json({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] });
  }, async () => {
    assert.deepEqual((await adapter.listModels('secret-key')).map(m => m.id), ['deepseek-chat', 'deepseek-reasoner']);
  });
  let request;
  const answer = await withMockFetch(async (url, init) => {
    request = { url: String(url), init };
    return sseResponse([{ choices: [{ delta: { content: 'hello' } }] }, '[DONE]'], '\r\n');
  }, async () => adapter.generate({ apiKey: 'secret-key', model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(answer, 'hello');
  assert.match(request.url, /chat\/completions$/);
  assert.equal(JSON.parse(request.init.body).stream, true);
});

test('Gemini adapter uses API key header and Gemini SSE stream endpoint', async () => {
  const adapter = new GeminiProvider();
  let answer = '';
  await withMockFetch(async (url, init) => {
    assert.match(String(url), /models\/gemini-test:streamGenerateContent\?alt=sse$/);
    assert.equal(init.headers['x-goog-api-key'], 'gemini-secret');
    return sseResponse([{ candidates: [{ content: { parts: [{ text: 'Gemini ' }, { text: 'works' }] } }] }]);
  }, async () => { answer = await adapter.generate({ apiKey: 'gemini-secret', model: 'gemini-test', messages: [{ role: 'user', content: 'hi' }] }); });
  assert.equal(answer, 'Gemini works');
});

test('Anthropic adapter emits text deltas from Messages streaming events', async () => {
  const adapter = new AnthropicProvider();
  let answer = '';
  await withMockFetch(async (url, init) => {
    assert.match(String(url), /api\.anthropic\.com\/v1\/messages$/);
    assert.equal(init.headers['x-api-key'], 'claude-secret');
    assert.equal(init.headers['anthropic-version'], '2023-06-01');
    return sseResponse([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude ' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'works' } }, { type: 'message_stop' }]);
  }, async () => { answer = await adapter.generate({ apiKey: 'claude-secret', model: 'claude-test', messages: [{ role: 'user', content: 'hi' }] }); });
  assert.equal(answer, 'Claude works');
});

test('OpenAI adapter uses the official Responses API streaming events', async () => {
  const adapter = new OpenAIProvider();
  let answer = '';
  await withMockFetch(async (url, init) => {
    assert.match(String(url), /api\.openai\.com\/v1\/responses$/);
    assert.equal(init.headers.Authorization, 'Bearer openai-secret');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-test');
    assert.equal(body.stream, true);
    assert.equal(body.input[0].content, 'hi');
    return sseResponse([{ type: 'response.output_text.delta', delta: 'OpenAI ' }, { type: 'response.output_text.delta', delta: 'works' }, { type: 'response.completed' }]);
  }, async () => { answer = await adapter.generate({ apiKey: 'openai-secret', model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] }); });
  assert.equal(answer, 'OpenAI works');
});

test('provider stream errors propagate instead of being silently ignored', async () => {
  const adapter = new OpenAICompatibleProvider('deepseek', 'DeepSeek');
  await withMockFetch(async () => sseResponse([{ error: { message: 'invalid model' } }]), async () => {
    await assert.rejects(adapter.generate({ apiKey: 'key', model: 'bad', messages: [{ role: 'user', content: 'hi' }] }), /invalid model/);
  });
});


const { AgentManager } = require('../dist/agents/manager.js');

function mockContext(initial = {}) {
  const values = new Map(Object.entries(initial));
  const secretValues = new Map();
  return {
    globalState: {
      get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
      async update(key, value) { if (value === undefined) values.delete(key); else values.set(key, value); }
    },
    secrets: {
      async store(key, value) { secretValues.set(key, value); },
      async get(key) { return secretValues.get(key); },
      async delete(key) { secretValues.delete(key); }
    },
    values, secretValues
  };
}

test('new installation starts with one universal instruction profile', async () => {
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  assert.equal(manager.agents().length, 1);
  assert.equal(manager.agents()[0].name, 'Infernum Universal');
  assert.equal(manager.primaryProviderId(), undefined);
});

test('all instruction profiles share one explicitly selected primary provider', async () => {
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const first = await manager.addProvider({ kind: 'deepseek', name: 'DeepSeek account', model: 'deepseek-chat' }, 'deepseek-test-key');
  const second = await manager.addProvider({ kind: 'openai', name: 'OpenAI account', model: 'gpt-test' }, 'openai-test-key');
  assert.equal(manager.primaryProviderId(), first.id);
  const profile = await manager.addAgent({ name: 'Architect persona', providerId: second.id, model: 'another-model', systemPrompt: 'Think carefully about architecture.' });
  await manager.setActiveAgent(profile.id);
  assert.equal(manager.primaryProvider().id, first.id);
  await manager.setPrimaryProvider(second.id);
  assert.equal(manager.primaryProvider().id, second.id);
  assert.equal(manager.agents().find(item => item.id === profile.id).providerId, second.id);
  // The profile still stores legacy metadata, but runtime selection is global and singular.
  assert.equal(manager.primaryProvider().model, 'gpt-test');
});

test('disabling or removing the primary provider selects one connected fallback', async () => {
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const first = await manager.addProvider({ kind: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat' }, 'deepseek-key');
  const second = await manager.addProvider({ kind: 'openai', name: 'OpenAI', model: 'gpt-test' }, 'openai-key');
  await manager.updateProvider(first.id, { enabled: false });
  assert.equal(manager.primaryProviderId(), second.id);
  await manager.removeProvider(second.id);
  assert.equal(manager.primaryProviderId(), undefined);
});


test('the engine sends every profile through the one global provider and model', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
    return originalLoad.call(this, request, parent, isMain);
  };
  let AgentEngine;
  try { AgentEngine = require('../dist/agents/engine.js').AgentEngine; }
  finally { Module._load = originalLoad; }

  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const primary = await manager.addProvider({ kind: 'deepseek', name: 'Primary DeepSeek', model: 'deepseek-chat' }, 'deepseek-primary-key');
  const other = await manager.addProvider({ kind: 'openai', name: 'Legacy profile OpenAI', model: 'gpt-legacy' }, 'openai-profile-key');
  const persona = await manager.addAgent({ name: 'Architect persona', providerId: other.id, model: 'gpt-not-used', systemPrompt: 'Consider design trade-offs.' });
  await manager.setPrimaryProvider(primary.id);

  const calls = [];
  const registry = { get(kind) { return { generate: async options => { calls.push({ kind, model: options.model, apiKey: options.apiKey, system: options.messages[0].content }); return 'done'; } }; } };
  const engine = new AgentEngine(manager, registry, { buildContext: async () => 'workspace context' }, {});
  const result = await engine.run({
    agentId: persona.id, message: 'Build and test this feature', mode: 'code', history: [], signal: new AbortController().signal,
    callbacks: { onToken() {}, onStatus() {}, onAction() {}, onProposal() {} }
  });

  assert.equal(result, 'done');
  assert.equal(calls.length, 1);
  assert.deepEqual({ kind: calls[0].kind, model: calls[0].model, apiKey: calls[0].apiKey }, { kind: 'deepseek', model: 'deepseek-chat', apiKey: 'deepseek-primary-key' });
  assert.match(calls[0].system, /single AI model responsible/);
});

const { OllamaProvider } = require('../dist/providers/ollama.js');

function ndjsonResponse(events) {
  const source = events.map(event => JSON.stringify(event)).join('\n') + '\n';
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({
    start(controller) {
      // Split in the middle of JSON tokens to verify chunk-boundary handling.
      const midpoint = Math.max(1, Math.floor(bytes.length / 2));
      controller.enqueue(bytes.slice(0, midpoint));
      controller.enqueue(bytes.slice(midpoint));
      controller.close();
    }
  }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

test('Ollama discovers installed models through the native local API without an API key', async () => {
  const adapter = new OllamaProvider();
  await withMockFetch(async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:11434/api/tags');
    assert.equal(init.headers?.Authorization, undefined);
    return Response.json({ models: [{ name: 'qwen2.5-coder:7b', model: 'qwen2.5-coder:7b' }, { name: 'llama3.2:3b' }] });
  }, async () => {
    assert.deepEqual((await adapter.listModels()).map(model => model.id), ['qwen2.5-coder:7b', 'llama3.2:3b']);
  });
});

test('Ollama streams NDJSON chat chunks and forwards the system prompt', async () => {
  const adapter = new OllamaProvider();
  let request;
  const tokens = [];
  const answer = await withMockFetch(async (url, init) => {
    request = { url: String(url), init };
    return ndjsonResponse([
      { message: { role: 'assistant', content: 'Local ' }, done: false },
      { message: { role: 'assistant', content: 'model' }, done: false },
      { message: { role: 'assistant', content: '' }, done: true }
    ]);
  }, async () => adapter.generate({
    model: 'qwen2.5-coder:7b',
    messages: [{ role: 'system', content: 'You are a coding agent.' }, { role: 'user', content: 'Hello' }],
    onToken: token => tokens.push(token)
  }));
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.deepEqual(JSON.parse(request.init.body).messages.map(message => message.role), ['system', 'user']);
  assert.equal(JSON.parse(request.init.body).stream, true);
  assert.equal(request.init.headers.Authorization, undefined);
  assert.equal(answer, 'Local model');
  assert.deepEqual(tokens, ['Local ', 'model']);
});

test('LM Studio uses an OpenAI-compatible local endpoint with optional authentication', async () => {
  const adapter = new OpenAICompatibleProvider('lmstudio', 'LM Studio');
  await withMockFetch(async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:1234/v1/models');
    assert.equal(init.headers.Authorization, undefined);
    return Response.json({ data: [{ id: 'qwen2.5-coder-7b-instruct' }] });
  }, async () => {
    assert.equal((await adapter.listModels(undefined))[0].id, 'qwen2.5-coder-7b-instruct');
  });
});

test('Local OpenAI-compatible servers support model discovery and streamed completions without a key', async () => {
  const adapter = new OpenAICompatibleProvider('local', 'Local API');
  let answer = '';
  await withMockFetch(async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:8000/v1/models');
    assert.equal(init.headers.Authorization, undefined);
    return Response.json({ data: [{ id: 'Qwen/Qwen2.5-Coder-7B-Instruct' }] });
  }, async () => {
    const models = await adapter.listModels(undefined);
    assert.equal(models[0].id, 'Qwen/Qwen2.5-Coder-7B-Instruct');
  });
  await withMockFetch(async (url, init) => {
    assert.equal(String(url), 'http://127.0.0.1:8000/v1/chat/completions');
    assert.equal(init.headers.Authorization, undefined);
    return sseResponse([{ choices: [{ delta: { content: 'Local API works' } }] }, '[DONE]']);
  }, async () => { answer = await adapter.generate({ model: 'qwen-local', messages: [{ role: 'user', content: 'Hi' }] }); });
  assert.equal(answer, 'Local API works');
});

test('local-compatible adapters reject insecure public HTTP endpoints', async () => {
  const adapter = new OpenAICompatibleProvider('local', 'Local API');
  await assert.rejects(adapter.listModels(undefined, 'http://models.example.com/v1'), /Use HTTPS for remote providers/);
  await assert.rejects(adapter.listModels(undefined, 'http://localhost:1234/v1?token=secret'), /query parameters/);
});

test('Agent Manager accepts no-key local runtimes as connected Primary Models', async () => {
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const local = await manager.addProvider({ kind: 'ollama', name: 'Local Ollama', model: 'qwen2.5-coder:7b' });
  assert.equal(manager.primaryProviderId(), local.id);
  assert.equal(manager.primaryProvider().kind, 'ollama');
  assert.equal(await manager.providerKey(local.id), undefined);
  await manager.setPrimaryProvider(local.id);
});

test('Agent Engine sends local model requests without inventing an API key', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
    return originalLoad.call(this, request, parent, isMain);
  };
  let AgentEngine;
  try { AgentEngine = require('../dist/agents/engine.js').AgentEngine; }
  finally { Module._load = originalLoad; }
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const local = await manager.addProvider({ kind: 'ollama', name: 'Ollama', model: 'qwen2.5-coder:7b' });
  const calls = [];
  const registry = { get(kind) { return { generate: async options => { calls.push({ kind, options }); return 'local result'; } }; } };
  const engine = new AgentEngine(manager, registry, { buildContext: async () => 'workspace context' }, {});
  const result = await engine.run({ agentId: manager.activeAgentId(), message: 'Explain this project', mode: 'chat', history: [], signal: new AbortController().signal,
    callbacks: { onToken() {}, onStatus() {}, onAction() {}, onProposal() {} } });
  assert.equal(result, 'local result');
  assert.equal(calls[0].kind, 'ollama');
  assert.equal(calls[0].options.apiKey, undefined);
  assert.equal(calls[0].options.model, 'qwen2.5-coder:7b');
});

test('adding a cloud connection does not silently replace the currently selected local Primary Model', async () => {
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const local = await manager.addProvider({ kind: 'ollama', name: 'Ollama', model: 'qwen2.5-coder:7b' });
  const cloud = await manager.addProvider({ kind: 'openai', name: 'OpenAI', model: 'gpt-test' }, 'openai-test-key');
  assert.equal(manager.primaryProviderId(), local.id);
  await manager.setPrimaryProvider(cloud.id);
  assert.equal(manager.primaryProviderId(), cloud.id);
});

test('enabling a keyless local provider can restore it as Primary Model when none is active', async () => {
  const context = mockContext();
  const manager = new AgentManager(context);
  await manager.initialize();
  const local = await manager.addProvider({ kind: 'lmstudio', name: 'LM Studio', model: 'model-id' });
  await manager.updateProvider(local.id, { enabled: false });
  assert.equal(manager.primaryProviderId(), undefined);
  await manager.updateProvider(local.id, { enabled: true });
  assert.equal(manager.primaryProviderId(), local.id);
});
