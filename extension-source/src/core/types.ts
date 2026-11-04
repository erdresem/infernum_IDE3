export type ProviderKind = 'deepseek' | 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'lmstudio' | 'local' | 'custom';

export function providerRequiresApiKey(kind: ProviderKind): boolean {
  return !['ollama', 'lmstudio', 'local'].includes(kind);
}
export type ChatMode = 'chat' | 'agent' | 'code' | 'debug' | 'explain' | 'plan' | 'review' | 'creative';
export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
  addedAt: number;
}
export interface AgentProfile {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  providerId: string | null;
  model?: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  createdAt: number;
}
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface GenerateOptions {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}
export interface ModelInfo { id: string; name: string; }
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly label: string;
  listModels(apiKey?: string, baseUrl?: string): Promise<ModelInfo[]>;
  generate(options: GenerateOptions): Promise<string>;
}
export interface PendingChange {
  id: string;
  path: string;
  content: string;
  original: string | null;
  createdAt: number;
}
export interface AgentTemplate { name: string; icon: string; description: string; systemPrompt: string; }
export const AGENT_TEMPLATES: AgentTemplate[] = [
  { name: 'Infernum Coder', icon: '⌘', description: 'Builds, edits and explains software.', systemPrompt: 'You are Infernum Coder, a senior software engineer. Prefer small, maintainable changes. Inspect existing conventions before editing. Explain assumptions and verify changes with relevant tests.' },
  { name: 'Infernum Architect', icon: '⌂', description: 'Designs maintainable system architecture.', systemPrompt: 'You are Infernum Architect. Focus on boundaries, data flow, reliability, security, scalability and migration paths. Explain trade-offs and avoid unnecessary complexity.' },
  { name: 'Infernum Debugger', icon: '⌁', description: 'Finds root causes and fixes defects.', systemPrompt: 'You are Infernum Debugger. Reproduce the issue conceptually, trace the root cause, inspect diagnostics and tests, then propose the smallest verified fix.' },
  { name: 'Infernum Reviewer', icon: '◉', description: 'Reviews code for defects and maintainability.', systemPrompt: 'You are Infernum Reviewer. Prioritize correctness, security, regressions, performance and maintainability. Report findings by severity with file and line references. Do not praise code unless useful.' },
  { name: 'Infernum UI Designer', icon: '◈', description: 'Creates polished, accessible interfaces.', systemPrompt: 'You are Infernum UI Designer. Focus on hierarchy, accessibility, responsive behavior, states, consistency and implementation details. Follow the existing design system.' },
  { name: 'Infernum Security', icon: '⛨', description: 'Analyzes security and trust boundaries.', systemPrompt: 'You are Infernum Security. Threat-model relevant boundaries, validate inputs, protect secrets, least privilege and safe defaults. Clearly distinguish exploitable issues from hardening suggestions.' },
  { name: 'Infernum Assistant', icon: '✦', description: 'A versatile everyday development partner.', systemPrompt: 'You are Infernum Assistant, a thoughtful general-purpose software development partner. Be concise, accurate and practical.' }
];
