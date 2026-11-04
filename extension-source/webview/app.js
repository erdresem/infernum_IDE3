(() => {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('app');
  const state = {
    initialised: false, defaultMode: 'agent', agents: [], providers: [], templates: [], activeAgentId: null, primaryProviderId: null, pending: [], settings: { glass: 72, accent: '#a78bfa' },
    workspace: 'Workspace', tab: 'chat', mode: 'agent', messages: [], running: false, status: 'Ready', actions: [], attachments: [], modal: null
  };
  const modeLabels = { chat: 'Chat', agent: 'Agent', code: 'AI Code', debug: 'Debug', explain: 'Explain', plan: 'Plan', review: 'Review', creative: 'Creative AI' };
  const providerLabels = { deepseek: 'DeepSeek', gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude', ollama: 'Ollama (local)', lmstudio: 'LM Studio (local)', local: 'Local OpenAI-compatible', custom: 'Custom API' };
  const $ = (selector, parent = root) => parent.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const activeAgent = () => state.agents.find(a => a.id === state.activeAgentId) || state.agents[0];
  const primaryProvider = () => state.providers.find(p => p.id === state.primaryProviderId && p.enabled && p.connected) || state.providers.find(p => p.enabled && p.connected);
  const post = payload => vscode.postMessage(payload);

  function markdown(text) {
    let safe = esc(text);
    const code = [];
    safe = safe.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, body) => {
      const mark = `@@CODE${code.length}@@`;
      code.push(`<pre><code>${body.replace(/\n$/, '')}</code></pre>`);
      return mark;
    });
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^### (.*)$/gm, '<strong>$1</strong>')
      .replace(/^## (.*)$/gm, '<strong>$1</strong>')
      .replace(/^- (.*)$/gm, '• $1')
      .replace(/\n/g, '<br>');
    return safe.replace(/@@CODE(\d+)@@/g, (_, index) => code[Number(index)] || '');
  }

  function render() {
    document.documentElement.style.setProperty('--infernum-accent', state.settings.accent || '#a78bfa');
    document.documentElement.style.setProperty('--infernum-glass', String(state.settings.glass ?? 72));
    const agent = activeAgent();
    const provider = primaryProvider();
    root.innerHTML = `
      <div class="app">
        <header class="topbar">
          <div class="brand"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M17.8 3.2c.8 5-5.8 6.7-6.3 12.4-.2 2.2.8 3.8 2.1 4.9-.2-3.1 2.5-4.7 4.1-6.4 3.8 3.3 5.4 6.2 3.8 10.1-1.4 3.3-4.8 4.9-8.1 3.9C6.5 26 5.1 18.6 8.5 13.7c2.4-3.5 7.5-5.1 9.3-10.5Z" fill="white"/><path d="M22.4 12.8c3.3 3.6 4.5 7 2.3 11.6" stroke="#e9ddff" stroke-width="2" stroke-linecap="round"/></svg></div>
          <div class="brand-copy"><strong>INFERNUM</strong><small>AI-native development</small></div>
          <span class="workspace-name" title="${esc(state.workspace)}">${esc(state.workspace)}</span>
          <button class="icon-btn" data-action="settings" title="Appearance & settings" aria-label="Settings">⚙</button>
        </header>
        <nav class="tabs" aria-label="Infernum modes">
          <button class="tab ${state.mode === 'agent' && state.tab === 'chat' ? 'active' : ''}" data-mode="agent" title="Agent">✦ <span>Agent</span></button>
          <button class="tab" data-mode="editor" title="Focus the native Code-OSS editor">⌘ <span>Editor</span></button>
          <button class="tab ${state.mode === 'code' && state.tab === 'chat' ? 'active' : ''}" data-mode="code" title="AI Code">{ } <span>AI Code</span></button>
          <button class="tab ${state.mode === 'creative' && state.tab === 'chat' ? 'active' : ''}" data-mode="creative" title="Creative AI">✧ <span>Creative</span></button>
        </nav>
        <nav class="subtabs" aria-label="Infernum tools">
          <button class="subtab ${state.tab === 'library' ? 'active' : ''}" data-tab="library">Profiles</button>
          <button class="subtab ${state.tab === 'hub' ? 'active' : ''}" data-tab="hub">Models${state.providers.length ? ` · ${state.providers.length}` : ''}</button>
          <span class="subtab-spacer"></span>
          <button class="subtab" data-action="settings" title="Infernum appearance settings">Settings</button>
        </nav>
        <div class="content">
          <section class="panel ${state.tab === 'chat' ? 'active' : ''}" id="chat-panel">
            <div class="chat-toolbar">
              <div class="toolbar-main">
                <select id="agent-select" aria-label="Instruction profile">${state.agents.map(a => `<option value="${esc(a.id)}" ${a.id === agent?.id ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('')}</select>
                <select id="mode-select" aria-label="Task mode">${Object.entries(modeLabels).map(([k,v]) => `<option value="${k}" ${state.mode === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
                <button class="mode-chip ${state.mode === 'agent' ? 'agent' : ''}" data-action="toggle-agent-mode" title="Switch between Chat and Agent Mode">${state.mode === 'agent' ? 'AUTO' : 'ASK'}</button>
              </div>
              <div class="primary-model-row"><span>PRIMARY MODEL</span><select id="runtime-select" aria-label="One model used for every task" title="This single model handles planning, coding, debugging, review and explanations">${state.providers.filter(p => p.enabled && p.connected).map(p => `<option value="${esc(p.id)}" ${p.id === (provider?.id || state.primaryProviderId) ? 'selected' : ''}>${esc(p.name)} · ${esc(p.model)}</option>`).join('') || '<option value="">Connect a provider in Agent Hub</option>'}</select></div>
            </div>
            <div class="messages" id="messages">
              ${state.messages.length ? state.messages.map((m, i) => `<article class="message ${m.role}"><div class="message-head"><span class="avatar">${m.role === 'user' ? 'Y' : esc(agent?.icon || '✦')}</span><strong>${m.role === 'user' ? 'You' : esc(agent?.name || 'Infernum')}</strong><span>${m.time || ''}</span></div><div class="message-body">${markdown(m.content)}</div></article>`).join('') : welcome(agent, provider)}
              ${state.actions.length ? `<div class="action-log">${state.actions.slice(-8).map(a => `↳ ${esc(a)}`).join('<br>')}</div>` : ''}
              ${renderPending()}
            </div>
            <div class="statusline">${state.running ? '<span class="pulse"></span>' : '<span>◦</span>'}<span>${esc(state.status)}</span><span style="margin-left:auto">${provider ? `${esc(provider.name)} · ${esc(provider.model)} · all tasks`  : 'No provider connected'}</span></div>
            <div class="composer-wrap">
              <div class="attachments">${state.attachments.map((a, i) => `<span class="file-pill">▤ ${esc(a.name)} <button data-action="remove-attachment" data-index="${i}" style="border:0;background:none;color:inherit;padding:0 0 0 4px">×</button></span>`).join('')}</div>
              <div class="composer">
                <textarea id="prompt" placeholder="Message Infernum… (Enter to send, Shift+Enter for newline)" aria-label="Message Infernum"></textarea>
                <div class="composer-foot">
                  <button class="icon-btn" data-action="attach" title="Attach text files" aria-label="Attach files">＋</button>
                  <input id="file-input" type="file" multiple hidden accept=".txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.py,.java,.go,.rs,.yaml,.yml,.toml,.sh,.sql,.xml,.csv,.log" />
                  <span class="composer-hint">${state.mode === 'agent' ? 'One model inspects, plans and proposes diffs · approval required' : 'One Primary Model handles this task with workspace context'}</span>
                  ${state.running ? '<button class="btn danger" data-action="stop">Stop</button>' : '<button class="btn primary" data-action="send">Send ↗</button>'}
                </div>
              </div>
            </div>
          </section>
          <section class="panel ${state.tab === 'library' ? 'active' : ''}" id="library-panel">
            <div class="section-scroll">
              <div class="section-head"><div><h2>Agent Library</h2><p>Optional instruction styles for one shared model</p></div><button class="btn primary" data-action="new-agent">＋ New</button></div>
              <div class="inline-note"><strong>Single-model execution:</strong> one Primary Model performs every task, including architecture, UI, coding, debugging, tests and review. Profiles only adjust instructions; they never start other models or delegate work.</div>
              ${state.agents.map(a => {
                return `<div class="card"><div class="card-top"><div class="card-icon">${esc(a.icon)}</div><div style="min-width:0;flex:1"><div class="card-title">${esc(a.name)}</div><div class="card-meta">Instruction profile · shares the Primary Model</div></div>${a.id === state.activeAgentId ? '<span class="provider-state">ACTIVE</span>' : ''}</div><div class="card-desc">${esc(a.description || '')}</div><div class="card-actions"><button class="btn small primary" data-action="use-agent" data-id="${esc(a.id)}">Use agent</button><button class="btn small" data-action="edit-agent" data-id="${esc(a.id)}">Configure</button><button class="btn small" data-action="duplicate-agent" data-id="${esc(a.id)}">Duplicate</button><button class="btn small" data-action="export-agent" data-id="${esc(a.id)}">Export</button><button class="btn small danger" data-action="remove-agent" data-id="${esc(a.id)}">Delete</button></div></div>`;
              }).join('')}
              <div class="section-head" style="margin-top:17px"><div><h2>Starter templates</h2><p>Create a role profile in one click</p></div><span class="card-meta">${state.templates.length} roles</span></div>
              ${state.templates.map((t, i) => `<div class="card"><div class="card-top"><div class="card-icon">${esc(t.icon)}</div><div style="min-width:0;flex:1"><div class="card-title">${esc(t.name)}</div><div class="card-meta">${esc(t.description)}</div></div><button class="btn small" data-action="use-template" data-index="${i}">＋ Add</button></div></div>`).join('')}
              <div class="card-actions"><button class="btn" data-action="import-agent">Import agent JSON</button></div>
            </div>
          </section>
          <section class="panel ${state.tab === 'hub' ? 'active' : ''}" id="hub-panel">
            <div class="section-scroll">
              <div class="section-head"><div><h2>Infernum Agent Hub</h2><p>Connect cloud APIs or local model servers</p></div><button class="btn primary" data-action="add-provider">＋ Add AI Agent</button></div>
              <div class="inline-note"><strong>One model does everything.</strong> Connect one or more cloud providers or local runtimes, then select a single Primary Model in Chat. That exact provider/model handles every mode and every instruction profile. Switching a profile never switches the model.</div>
              ${state.providers.length ? state.providers.map(p => `<div class="card"><div class="card-top"><div class="card-icon">${providerGlyph(p.kind)}</div><div style="flex:1;min-width:0"><div class="card-title">${esc(p.name)}</div><div class="card-meta">${esc(providerLabels[p.kind])} · ${esc(p.model)}</div></div><span class="provider-state ${p.enabled ? '' : 'off'}">${p.connected && p.enabled ? '● CONNECTED' : p.enabled ? '● KEY MISSING' : '○ DISABLED'}</span></div><div class="card-actions"><button class="btn small" data-action="rename-provider" data-id="${esc(p.id)}">Rename / model</button><button class="btn small" data-action="change-key" data-id="${esc(p.id)}">Credentials / URL</button><button class="btn small" data-action="toggle-provider" data-id="${esc(p.id)}" data-enabled="${p.enabled ? 'false' : 'true'}">${p.enabled ? 'Disable' : 'Enable'}</button><button class="btn small danger" data-action="remove-provider" data-id="${esc(p.id)}">Remove</button></div></div>`).join('') : '<div class="empty">No model connections yet.<br>Add a cloud API or start a local model server.</div>'}
              <div class="section-head" style="margin-top:18px"><div><h2>Supported connections</h2><p>Official APIs and OpenAI-compatible endpoints</p></div></div>
              <div class="card"><div class="card-title">Cloud + local runtimes</div><div class="card-desc">Connect Ollama directly, LM Studio, or any local OpenAI-compatible server such as vLLM, LocalAI, llama.cpp or Jan. Local servers do not need an API key unless you enable authentication. See the README for setup steps.</div></div>
              <div class="card"><div class="card-title">One active model · separate API billing</div><div class="card-desc">A ChatGPT Plus or Pro subscription does not provide an OpenAI API key or API credits. Provider API usage is billed by the provider.</div></div>
            </div>
          </section>
        </div>
      </div>
      <div id="modal-root">${renderModal()}</div>
    `;
    bind();
    if (state.settings) {
      document.documentElement.style.setProperty('--infernum-accent', state.settings.accent || '#a78bfa');
      document.documentElement.style.setProperty('--infernum-glass', String(state.settings.glass ?? 72));
    }
    const messages = $('#messages'); if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function welcome(agent, provider) {
    return `<div class="welcome"><div class="welcome-mark">✦</div><h2>Welcome to Infernum</h2><p>${provider ? `Ready when you are, ${esc(agent?.name || 'developer')}.` : 'Connect an AI provider in Agent Hub to start building with your own agents.'}<br>Context-aware assistance, right inside VS Code.</p><div class="suggestion-grid"><button class="suggestion" data-suggest="Explain the architecture of this project and identify its main modules.">⌂ Understand this project</button><button class="suggestion" data-suggest="Review this workspace for bugs and security issues. Give findings by severity.">◉ Review my code</button><button class="suggestion" data-suggest="Plan the implementation of the next major feature in this project.">✧ Plan a feature</button><button class="suggestion" data-suggest="Find the most relevant tests and run them. Explain failures.">⌁ Run and debug tests</button></div><div style="margin-top:14px"><button class="btn" data-action="${provider ? 'new-agent' : 'add-provider'}">${provider ? 'Create an instruction profile' : '＋ Connect your first provider'}</button></div></div>`;
  }

  function renderPending() {
    if (!state.pending.length) return '';
    return `<div class="pending-wrap"><div style="font-size:10px;font-weight:650">Pending file proposals</div>${state.pending.map(item => `<div class="pending-card"><div class="pending-title">▤ ${esc(item.path)}</div><div class="pending-sub">Review the opened diff. The workspace file is unchanged until you accept.</div><div class="pending-actions"><button class="btn small primary" data-action="accept-change" data-id="${esc(item.id)}">Accept</button><button class="btn small" data-action="reject-change" data-id="${esc(item.id)}">Reject</button><button class="btn small" data-action="open-file" data-path="${esc(item.path)}">Open file</button></div></div>`).join('')}</div>`;
  }

  function providerGlyph(kind) { return ({ deepseek: '◈', gemini: '✧', openai: '◎', anthropic: '◉', ollama: '🦙', lmstudio: '▣', local: '⌘', custom: '⌘' })[kind] || '✦'; }

  function renderModal() {
    if (!state.modal) return '';
    const m = state.modal;
    if (m.type === 'provider') {
      const editProvider = state.providers.find(p => p.id === m.providerId);
      const kind = editProvider?.kind || m.kind || 'deepseek';
      const customModel = ['custom', 'local'].includes(kind);
      const local = ['ollama', 'lmstudio', 'local'].includes(kind);
      const needsUrl = ['ollama', 'lmstudio', 'local', 'custom'].includes(kind);
      const defaults = { ollama: 'http://127.0.0.1:11434', lmstudio: 'http://127.0.0.1:1234/v1', local: 'http://127.0.0.1:8000/v1' };
      const keyHint = local ? 'Optional — leave blank unless authentication is enabled on your local server.' : 'Paste your provider API key';
      const urlHint = kind === 'ollama' ? 'http://127.0.0.1:11434' : kind === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : kind === 'local' ? 'http://127.0.0.1:8000/v1' : 'https://api.example.com/v1';
      const helpText = kind === 'ollama' ? 'Ollama native API · installs models with `ollama pull` · default port 11434.' : kind === 'lmstudio' ? 'Start the Local Server in LM Studio → Developer. OpenAI-compatible API · default port 1234.' : kind === 'local' ? 'OpenAI-compatible local server (vLLM, LocalAI, llama.cpp, Jan, etc.). Use its /v1 API root.' : kind === 'custom' ? 'Custom remote endpoint · HTTPS + OpenAI-compatible Chat Completions.' : 'API key is stored only in VS Code SecretStorage after a successful connection test.';
      return `<div class="modal-backdrop" data-action="close-backdrop"><form class="modal" id="provider-form"><div class="modal-head"><h2>${editProvider ? `Connect ${esc(editProvider.name)}` : 'Add AI Agent'}</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div>
        ${!editProvider ? `<div class="field"><label>Provider / runtime</label><select id="provider-kind">${Object.entries(providerLabels).map(([k,v]) => `<option value="${k}" ${kind === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>` : `<div class="inline-note">Updating connection details for ${esc(editProvider.name)}. Credentials are replaced only after a successful connection test.</div>`}
        <div class="field"><label>Connection name</label><input id="provider-name" required maxlength="60" value="${esc(editProvider?.name || providerLabels[kind])}" placeholder="My ${esc(providerLabels[kind])} account"></div>
        <div class="field"><label>API Key ${local ? '(optional for local servers)' : ''}</label><input id="provider-key" type="password" ${local ? '' : 'required minlength="8"'} autocomplete="off" placeholder="${esc(keyHint)}"><small>${local ? 'Local runtimes normally work without an API key. If you enabled server authentication, paste that token here.' : 'The key is sent to the Extension Host and stored in VS Code SecretStorage.'}</small></div>
        <div class="field custom-field" style="display:${needsUrl ? 'grid' : 'none'}"><label>${kind === 'custom' ? 'Custom API · OpenAI-compatible' : kind === 'ollama' ? 'Ollama server URL' : kind === 'lmstudio' ? 'LM Studio server URL' : 'Local API server URL'}</label><input id="provider-url" value="${esc(editProvider?.baseUrl || defaults[kind] || '')}" placeholder="${urlHint}"><small>${esc(helpText)} HTTP is allowed only for localhost/private-network addresses; use HTTPS for remote endpoints.</small></div>
        <div class="field"><label>Model</label><select id="provider-model" style="display:${customModel ? 'none' : 'block'}"><option value="">Test connection to load models…</option></select><input id="provider-custom-model" style="display:${customModel ? 'block' : 'none'}" value="${esc(editProvider?.model || '')}" placeholder="e.g. Qwen/Qwen2.5-Coder-7B-Instruct"><small>${customModel ? 'Enter the exact model ID shown by your local server. Infernum will test it with a small request.' : 'Infernum discovers available chat models from the server. The selected model will handle every task.'}</small></div>
        <div class="inline-note" id="provider-result">${esc(helpText)} Test the connection to discover models and verify generation.</div>
        <div class="modal-foot"><button type="button" class="btn" data-action="test-provider">Test connection</button><button type="submit" class="btn primary">${editProvider ? 'Save connection' : 'Add AI Agent'}</button></div>
      </form></div>`;
    }
    if (m.type === 'agent') {
      const agent = m.agent || {};
      return `<div class="modal-backdrop" data-action="close-backdrop"><form class="modal" id="agent-form"><div class="modal-head"><h2>${agent.id ? 'Configure agent' : 'Create AI agent'}</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div>
        <div class="row-fields"><div class="field"><label>Name</label><input id="agent-name" required maxlength="60" value="${esc(agent.name || '')}" placeholder="Infernum Architect"></div><div class="field"><label>Icon / avatar</label><input id="agent-icon" maxlength="4" value="${esc(agent.icon || '✦')}" placeholder="✦"></div></div>
        <div class="field"><label>Description</label><input id="agent-description" maxlength="160" value="${esc(agent.description || '')}" placeholder="What this agent specializes in"></div>
        <div class="field"><label>System instruction</label><textarea id="agent-prompt" required maxlength="10000">${esc(agent.systemPrompt || 'You are a helpful software development agent.')}</textarea></div>
        <div class="inline-note">This profile always runs on the global Primary Model selected in the chat toolbar. It cannot switch providers or models.</div>
        <div class="row-fields"><div class="field"><label>Temperature · <span id="temperature-value">${Number(agent.temperature ?? .3).toFixed(1)}</span></label><input id="agent-temperature" type="range" min="0" max="1.5" step="0.1" value="${Number(agent.temperature ?? .3)}"></div><div class="field"><label>Max output tokens</label><input id="agent-max-tokens" type="number" min="256" max="32000" step="256" value="${Number(agent.maxTokens || 4096)}"></div></div>
        <div class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Save agent</button></div>
      </form></div>`;
    }
    if (m.type === 'rename-provider') {
      const p = state.providers.find(item => item.id === m.providerId);
      if (!p) return '';
      return `<div class="modal-backdrop" data-action="close-backdrop"><form class="modal" id="rename-provider-form"><div class="modal-head"><h2>Provider settings</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>Connection name</label><input id="rename-provider-name" value="${esc(p.name)}" required></div><div class="field"><label>Default model</label><input id="rename-provider-model" value="${esc(p.model)}" required></div><div class="inline-note">Choose the model this connection will use. When this provider is selected as Primary Model, the same model handles every task and every profile.</div><div class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Save settings</button></div></form></div>`;
    }
    if (m.type === 'settings') {
      return `<div class="modal-backdrop" data-action="close-backdrop"><form class="modal" id="settings-form"><div class="modal-head"><h2>Appearance</h2><button type="button" class="icon-btn" data-action="close-modal">×</button></div><div class="field"><label>Liquid Glass intensity · <span id="glass-value">${state.settings.glass}</span>%</label><input id="glass-range" type="range" min="0" max="100" step="1" value="${state.settings.glass}"></div><div class="field"><label>Accent color</label><input id="accent-color" type="color" value="${esc(state.settings.accent)}"></div><div class="inline-note">The UI follows VS Code's active editor, sidebar, input and foreground color tokens. This accent and glass intensity only affect Infernum.</div><div class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Apply</button></div></form></div>`;
    }
    return '';
  }

  function bind() {
    root.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); }));
    root.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => {
      const mode = el.dataset.mode;
      if (mode === 'editor') { post({ type: 'focusEditor' }); return; }
      state.tab = 'chat'; state.mode = mode; render();
    }));
    root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', event => {
      const action = el.dataset.action;
      if (action === 'close-backdrop' && event.target !== el) return;
      handleAction(action, el.dataset).catch(error => toast(error.message || String(error)));
    }));
    root.querySelectorAll('[data-suggest]').forEach(el => el.addEventListener('click', () => { $('#prompt').value = el.dataset.suggest; $('#prompt').focus(); }));
    const agentSelect = $('#agent-select'); if (agentSelect) agentSelect.addEventListener('change', () => post({ type: 'selectAgent', agentId: agentSelect.value }));
    const modeSelect = $('#mode-select'); if (modeSelect) modeSelect.addEventListener('change', () => { state.mode = modeSelect.value; render(); });
    const runtimeSelect = $('#runtime-select'); if (runtimeSelect) runtimeSelect.addEventListener('change', () => post({ type: 'setPrimaryProvider', providerId: runtimeSelect.value }));
    const prompt = $('#prompt'); if (prompt) prompt.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
    const fileInput = $('#file-input'); if (fileInput) fileInput.addEventListener('change', async () => {
      for (const file of Array.from(fileInput.files || [])) {
        if (file.size > 350000) { toast(`${file.name} is larger than 350 KB and was skipped.`); continue; }
        try { state.attachments.push({ name: file.name, content: await file.text() }); }
        catch { toast(`Could not read ${file.name}.`); }
      }
      render();
    });
    const providerKind = $('#provider-kind'); if (providerKind) providerKind.addEventListener('change', () => {
      const kind = providerKind.value;
      const local = ['ollama', 'lmstudio', 'local'].includes(kind);
      const customModel = ['custom', 'local'].includes(kind);
      const needsUrl = ['ollama', 'lmstudio', 'local', 'custom'].includes(kind);
      const customField = $('.custom-field'); if (customField) customField.style.display = needsUrl ? 'grid' : 'none';
      const name = $('#provider-name'); if (name) name.value = providerLabels[kind];
      const key = $('#provider-key'); if (key) { key.required = !local; key.minLength = local ? 0 : 8; key.placeholder = local ? 'Optional local API token' : 'Paste your API key'; }
      const url = $('#provider-url'); if (url) url.value = ({ ollama: 'http://127.0.0.1:11434', lmstudio: 'http://127.0.0.1:1234/v1', local: 'http://127.0.0.1:8000/v1' })[kind] || '';
      const modelSelect = $('#provider-model'); const modelInput = $('#provider-custom-model');
      if (modelSelect) modelSelect.style.display = customModel ? 'none' : 'block';
      if (modelInput) { modelInput.style.display = customModel ? 'block' : 'none'; modelInput.value = ''; }
      const result = $('#provider-result'); if (result) result.textContent = local ? 'Local model server selected. API key is optional; test the server to load installed models.' : 'Test the connection to load available models.';
    });
    const temperature = $('#agent-temperature'); if (temperature) temperature.addEventListener('input', () => { $('#temperature-value').textContent = Number(temperature.value).toFixed(1); });
    const glass = $('#glass-range'); if (glass) glass.addEventListener('input', () => { $('#glass-value').textContent = glass.value; });
    const providerForm = $('#provider-form'); if (providerForm) providerForm.addEventListener('submit', event => { event.preventDefault(); saveProvider(); });
    const agentForm = $('#agent-form'); if (agentForm) agentForm.addEventListener('submit', event => { event.preventDefault(); saveAgent(); });
    const renameForm = $('#rename-provider-form'); if (renameForm) renameForm.addEventListener('submit', event => { event.preventDefault(); const p = state.providers.find(item => item.id === state.modal.providerId); post({ type: 'updateProvider', providerId: p.id, name: $('#rename-provider-name').value.trim(), model: $('#rename-provider-model').value.trim() }); state.modal = null; render(); });
    const settingsForm = $('#settings-form'); if (settingsForm) settingsForm.addEventListener('submit', event => { event.preventDefault(); post({ type: 'settings', value: { glass: Number($('#glass-range').value), accent: $('#accent-color').value } }); state.modal = null; render(); });
  }

  async function handleAction(action, data) {
    switch (action) {
      case 'settings': state.modal = { type: 'settings' }; render(); break;
      case 'close-modal': state.modal = null; render(); break;
      case 'close-backdrop': state.modal = null; render(); break;
      case 'add-provider': state.modal = { type: 'provider' }; state.tab = 'hub'; render(); break;
      case 'test-provider': testProvider(); break;
      case 'send': sendMessage(); break;
      case 'stop': post({ type: 'cancel' }); break;
      case 'attach': $('#file-input').click(); break;
      case 'remove-attachment': state.attachments.splice(Number(data.index), 1); render(); break;
      case 'toggle-agent-mode': state.mode = state.mode === 'agent' ? 'chat' : 'agent'; render(); break;
      case 'new-agent': state.modal = { type: 'agent' }; render(); break;
      case 'edit-agent': state.modal = { type: 'agent', agent: state.agents.find(a => a.id === data.id) }; render(); break;
      case 'use-agent': post({ type: 'selectAgent', agentId: data.id }); state.tab = 'chat'; render(); break;
      case 'duplicate-agent': post({ type: 'duplicateAgent', agentId: data.id }); break;
      case 'remove-agent': post({ type: 'removeAgent', agentId: data.id }); break;
      case 'export-agent': post({ type: 'exportAgent', agentId: data.id }); break;
      case 'import-agent': post({ type: 'importAgent' }); break;
      case 'use-template': {
        const t = state.templates[Number(data.index)];
        if (t) post({ type: 'addAgent', agent: { name: t.name, icon: t.icon, description: t.description, systemPrompt: t.systemPrompt, temperature: .3, maxTokens: 4096 } });
        break;
      }
      case 'rename-provider': state.modal = { type: 'rename-provider', providerId: data.id }; render(); break;
      case 'change-key': state.modal = { type: 'provider', providerId: data.id }; render(); break;
      case 'toggle-provider': post({ type: 'toggleProvider', providerId: data.id, enabled: data.enabled === 'true' }); break;
      case 'remove-provider': post({ type: 'removeProvider', providerId: data.id }); break;
      case 'accept-change': post({ type: 'acceptChange', changeId: data.id }); break;
      case 'reject-change': post({ type: 'rejectChange', changeId: data.id }); break;
      case 'open-file': post({ type: 'openFile', path: data.path }); break;
    }
  }

  function saveProvider() {
    const editProvider = state.providers.find(p => p.id === state.modal?.providerId);
    const kind = editProvider?.kind || $('#provider-kind').value;
    const local = ['ollama', 'lmstudio', 'local'].includes(kind);
    const name = $('#provider-name').value.trim();
    const apiKey = $('#provider-key').value.trim();
    const model = ['custom', 'local'].includes(kind) ? $('#provider-custom-model').value.trim() : $('#provider-model').value;
    const baseUrl = ['custom', 'ollama', 'lmstudio', 'local'].includes(kind) ? ($('#provider-url').value.trim() || undefined) : undefined;
    if (!name || (!apiKey && !local)) { toast(local ? 'Enter a connection name.' : 'Enter a connection name and API key.'); return; }
    $('#provider-result').textContent = 'Testing the server and discovering models…';
    const payload = { type: editProvider ? 'updateProviderKey' : 'addProvider', requestId: Date.now(), providerId: editProvider?.id, kind, name, apiKey, model, baseUrl };
    post(payload);
    const submit = $('#provider-form button[type="submit"]'); if (submit) submit.disabled = true;
  }

  function testProvider() {
    const editProvider = state.providers.find(p => p.id === state.modal?.providerId);
    const kind = editProvider?.kind || $('#provider-kind').value;
    const local = ['ollama', 'lmstudio', 'local'].includes(kind);
    const apiKey = $('#provider-key').value.trim();
    const model = ['custom', 'local'].includes(kind) ? $('#provider-custom-model').value.trim() : $('#provider-model').value;
    const baseUrl = ['custom', 'ollama', 'lmstudio', 'local'].includes(kind) ? ($('#provider-url').value.trim() || undefined) : undefined;
    if (!apiKey && !local) { $('#provider-result').textContent = 'Enter an API key first.'; return; }
    const payload = { type: 'testProvider', requestId: Date.now(), kind, apiKey, name: $('#provider-name').value.trim(), model, baseUrl };
    $('#provider-result').textContent = 'Testing server connection and discovering available models…';
    post(payload);
    const button = $('.modal-foot button'); if (button) button.disabled = true;
  }

  function saveAgent() {
    const agent = {
      name: $('#agent-name').value.trim(), icon: $('#agent-icon').value.trim() || '✦', description: $('#agent-description').value.trim(),
      systemPrompt: $('#agent-prompt').value, providerId: null,
      temperature: Number($('#agent-temperature').value), maxTokens: Math.max(256, Math.min(32000, Number($('#agent-max-tokens').value) || 4096))
    };
    if (!agent.name || !agent.systemPrompt.trim()) { toast('Name and system instruction are required.'); return; }
    const existing = state.modal.agent;
    if (existing?.id) post({ type: 'updateAgent', agentId: existing.id, patch: agent });
    else post({ type: 'addAgent', agent });
    state.modal = null; render();
  }

  function sendMessage() {
    if (state.running) return;
    const prompt = $('#prompt');
    let message = prompt?.value.trim() || '';
    if (state.attachments.length) {
      message += `\n\nAttached files:\n${state.attachments.map(file => `### ${file.name}\n\`\`\`\n${file.content}\n\`\`\``).join('\n\n')}`;
    }
    if (!message) return;
    const agent = activeAgent();
    if (!agent) { toast('Create an agent first.'); return; }
    if (!primaryProvider()) { toast('Connect a provider and choose the Primary Model in Agent Hub.'); state.tab = 'hub'; render(); return; }
    state.messages.push({ role: 'user', content: message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    state.messages.push({ role: 'assistant', content: '', time: '' });
    state.actions = [];
    state.attachments = [];
    if (prompt) prompt.value = '';
    const history = state.messages.slice(0, -2).filter(m => m.content).map(m => ({ role: m.role, content: m.content }));
    state.running = true; state.status = 'Starting…'; render();
    post({ type: 'send', message, agentId: agent.id, mode: state.mode, history });
  }

  function toast(message) {
    const old = $('.toast'); if (old) old.remove();
    const element = document.createElement('div'); element.className = 'toast'; element.textContent = message;
    root.appendChild(element); setTimeout(() => element.remove(), 3600);
  }

  window.addEventListener('message', event => {
    const message = event.data || {};
    switch (message.type) {
      case 'state': { const first = !state.initialised; Object.assign(state, message.state); if (first) state.mode = state.defaultMode || 'agent'; state.initialised = true; render(); break; }
      case 'providerTested': {
        const result = $('#provider-result');
        const select = $('#provider-model');
        if (select) {
          const existing = select.value;
          select.innerHTML = message.models.map(m => `<option value="${esc(m.id)}">${esc(m.name)} · ${esc(m.id)}</option>`).join('');
          select.value = message.models.some(m => m.id === existing) ? existing : message.recommendedModel;
        }
        const customModel = $('#provider-custom-model'); if (customModel && !customModel.value.trim()) customModel.value = message.recommendedModel || '';
        if (result) result.textContent = `Connected. ${message.count} text-capable models found. Recommended: ${message.recommendedModel}.`;
        const button = $('.modal-foot button'); if (button) button.disabled = false;
        break;
      }
      case 'started': state.running = true; state.status = 'Generating…'; render(); break;
      case 'delta': {
        const last = state.messages[state.messages.length - 1];
        if (last?.role === 'assistant') last.content += message.token;
        state.status = 'Receiving response…';
        const area = $('#messages'); if (area) {
          const empty = $('.message:last-child .message-body', area);
          if (empty) empty.innerHTML = markdown(last.content);
          else render();
          area.scrollTop = area.scrollHeight;
        }
        break;
      }
      case 'status': state.status = message.text || 'Working…'; {
        const line = $('.statusline span:nth-child(2)'); if (line) line.textContent = state.status;
        break;
      }
      case 'agentAction': state.actions.push(message.text); {
        const area = $('#messages'); if (area) { const old = $('.action-log', area); if (old) old.innerHTML = state.actions.slice(-8).map(a => `↳ ${esc(a)}`).join('<br>'); else render(); area.scrollTop = area.scrollHeight; }
        break;
      }
      case 'pending': state.pending = message.pending || []; {
        const area = $('#messages'); if (area) { const old = $('.pending-wrap', area); if (old) old.outerHTML = renderPending(); else if (state.pending.length) area.insertAdjacentHTML('beforeend', renderPending()); }
        break;
      }
      case 'complete': state.running = false; state.status = 'Complete'; render(); break;
      case 'cancelled': state.running = false; state.status = 'Stopped'; render(); break;
      case 'error': {
        if (state.modal?.type === 'provider') { const result = $('#provider-result'); if (result) result.textContent = `Connection failed: ${message.message}`; root.querySelectorAll('.modal-foot button').forEach(button => button.disabled = false); toast(message.message); break; }
        state.running = false; state.status = 'Error';
        const last = state.messages[state.messages.length - 1];
        if (last?.role === 'assistant' && !last.content) last.content = `**Error:** ${message.message}`;
        else state.messages.push({ role: 'assistant', content: `**Error:** ${message.message}` });
        render(); toast(message.message); break;
      }
      case 'toast': toast(message.message); break;
      case 'providerSaved': state.modal = null; render(); break;
      case 'settingsSaved': state.settings = message.settings; render(); break;
      case 'tab': state.tab = message.tab; render(); break;
      case 'prefill': state.tab = 'chat'; state.mode = message.mode || state.mode; render(); $('#prompt').value = message.message || ''; $('#prompt').focus(); break;
      case 'themeChanged': render(); break;
    }
  });
  render();
  post({ type: 'ready' });
})();
