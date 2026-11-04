import { AgentProfile, ProviderConfig, ProviderKind, providerRequiresApiKey } from '../core/types';

const PROVIDERS_KEY = 'infernum.providers.v1';
const AGENTS_KEY = 'infernum.agents.v1';
const ACTIVE_AGENT_KEY = 'infernum.activeAgent.v1';
const PRIMARY_PROVIDER_KEY = 'infernum.primaryProvider.v1';

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export class AgentManager {
  constructor(private readonly context: any) {}

  providers(): ProviderConfig[] { return this.context.globalState.get(PROVIDERS_KEY, []); }
  agents(): AgentProfile[] { return this.context.globalState.get(AGENTS_KEY, []); }
  activeAgentId(): string | undefined { return this.context.globalState.get(ACTIVE_AGENT_KEY); }
  primaryProviderId(): string | undefined { return this.context.globalState.get(PRIMARY_PROVIDER_KEY); }
  primaryProvider(): ProviderConfig | undefined {
    const provider = this.providers().find(item => item.id === this.primaryProviderId());
    return provider?.enabled ? provider : undefined;
  }

  async initialize(): Promise<void> {
    let agents = this.agents();
    if (!agents.length) {
      const universal = {
        id: id('agent'), name: 'Infernum Universal', icon: '✦',
        description: 'One model for architecture, implementation, debugging, review and explanation.',
        systemPrompt: 'You are Infernum, a senior full-stack software engineer and technical partner. Handle the complete task yourself: understand requirements, design architecture and UX, implement, debug, test, review security and explain trade-offs. Work end-to-end instead of delegating to other agents or models.',
        providerId: null, temperature: 0.3, maxTokens: 8192, enabled: true, createdAt: Date.now()
      };
      agents = [universal];
      await this.context.globalState.update(AGENTS_KEY, agents);
      await this.context.globalState.update(ACTIVE_AGENT_KEY, universal.id);
    }

    // Migrate an existing installation to one shared execution model without deleting profiles.
    const current = this.providers().find(provider => provider.id === this.primaryProviderId() && provider.enabled);
    if (!current || (providerRequiresApiKey(current.kind) && !await this.providerKey(current.id))) await this.chooseFallbackPrimary();
    if (!this.activeAgentId() && agents[0]) await this.context.globalState.update(ACTIVE_AGENT_KEY, agents[0].id);
  }

  async addProvider(input: { kind: ProviderKind; name: string; model: string; baseUrl?: string }, apiKey = ''): Promise<ProviderConfig> {
    const provider: ProviderConfig = {
      id: id('provider'), kind: input.kind, name: input.name.trim(), model: input.model,
      ...(input.baseUrl ? { baseUrl: input.baseUrl.trim() } : {}), enabled: true, addedAt: Date.now()
    };
    if (apiKey) await this.context.secrets.store(this.secretName(provider.id), apiKey);
    else if (providerRequiresApiKey(provider.kind)) throw new Error(`API key is required for ${provider.name}.`);
    await this.context.globalState.update(PROVIDERS_KEY, [...this.providers(), provider]);
    const primary = this.primaryProvider();
    if (!primary || (providerRequiresApiKey(primary.kind) && !await this.providerKey(primary.id))) await this.context.globalState.update(PRIMARY_PROVIDER_KEY, provider.id);
    return provider;
  }

  async updateProvider(providerId: string, patch: Partial<Pick<ProviderConfig, 'name' | 'model' | 'enabled' | 'baseUrl'>>): Promise<void> {
    const next = this.providers().map(p => p.id === providerId ? { ...p, ...patch } : p);
    await this.context.globalState.update(PROVIDERS_KEY, next);
    if (this.primaryProviderId() === providerId && patch.enabled === false) await this.chooseFallbackPrimary(providerId);
    else if (patch.enabled === true && !this.primaryProvider() && (!providerRequiresApiKey(next.find(p => p.id === providerId)?.kind || 'custom') || await this.providerKey(providerId))) await this.context.globalState.update(PRIMARY_PROVIDER_KEY, providerId);
  }

  async setPrimaryProvider(providerId: string): Promise<void> {
    const provider = this.providers().find(item => item.id === providerId && item.enabled);
    if (!provider) throw new Error('Choose an enabled provider to use as the Primary Model.');
    if (providerRequiresApiKey(provider.kind) && !await this.providerKey(providerId)) throw new Error(`API key for ${provider.name} is missing. Reconnect this provider in Agent Hub.`);
    await this.context.globalState.update(PRIMARY_PROVIDER_KEY, providerId);
  }

  private async chooseFallbackPrimary(excludingId?: string): Promise<void> {
    for (const provider of this.providers()) {
      if (provider.id !== excludingId && provider.enabled && (!providerRequiresApiKey(provider.kind) || await this.providerKey(provider.id))) {
        await this.context.globalState.update(PRIMARY_PROVIDER_KEY, provider.id);
        return;
      }
    }
    await this.context.globalState.update(PRIMARY_PROVIDER_KEY, undefined);
  }

  async replaceProviderKey(providerId: string, apiKey: string): Promise<void> {
    if (apiKey) await this.context.secrets.store(this.secretName(providerId), apiKey);
    else await this.context.secrets.delete(this.secretName(providerId));
  }

  async providerKey(providerId: string): Promise<string | undefined> {
    return this.context.secrets.get(this.secretName(providerId));
  }

  async removeProvider(providerId: string): Promise<void> {
    await this.context.secrets.delete(this.secretName(providerId));
    await this.context.globalState.update(PROVIDERS_KEY, this.providers().filter(p => p.id !== providerId));
    // Legacy provider assignments are kept only as profile metadata; runtime always uses Primary Model.
    if (this.primaryProviderId() === providerId) await this.chooseFallbackPrimary(providerId);
  }

  async addAgent(input: Partial<AgentProfile> & { name: string }): Promise<AgentProfile> {
    const agent: AgentProfile = {
      id: id('agent'), name: input.name.trim(), icon: input.icon || '✦', description: input.description || 'Custom Infernum agent',
      systemPrompt: input.systemPrompt || 'You are a helpful software development agent.',
      providerId: input.providerId || null, ...(input.model ? { model: input.model } : {}),
      temperature: typeof input.temperature === 'number' ? input.temperature : 0.3,
      maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : 4096,
      enabled: true, createdAt: Date.now()
    };
    await this.context.globalState.update(AGENTS_KEY, [...this.agents(), agent]);
    return agent;
  }

  async updateAgent(agentId: string, patch: Partial<AgentProfile>): Promise<void> {
    const next = this.agents().map(a => a.id === agentId ? { ...a, ...patch, id: a.id } : a);
    await this.context.globalState.update(AGENTS_KEY, next);
  }

  async removeAgent(agentId: string): Promise<void> {
    const agents = this.agents().filter(a => a.id !== agentId);
    await this.context.globalState.update(AGENTS_KEY, agents);
    if (this.activeAgentId() === agentId) await this.context.globalState.update(ACTIVE_AGENT_KEY, agents[0]?.id);
  }

  async setActiveAgent(agentId: string): Promise<void> {
    if (!this.agents().some(a => a.id === agentId)) throw new Error('Agent not found.');
    await this.context.globalState.update(ACTIVE_AGENT_KEY, agentId);
  }

  async duplicateAgent(agentId: string): Promise<AgentProfile> {
    const source = this.agents().find(a => a.id === agentId);
    if (!source) throw new Error('Agent not found.');
    return this.addAgent({ ...source, name: `${source.name} Copy` });
  }

  private secretName(providerId: string): string { return `infernum.apiKey.${providerId}`; }
}
