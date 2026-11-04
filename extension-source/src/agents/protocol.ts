export interface AgentAction { tool: string; [key: string]: any; }
const ALLOWED = new Set(['list_files', 'read_file', 'search_text', 'propose_file_edit', 'run_command']);
export function parseActionBlock(text: string): AgentAction | null {
  const match = text.match(/<infernum_action>\s*([\s\S]*?)\s*<\/infernum_action>/i);
  if (!match) return null;
  let value: any;
  try { value = JSON.parse(match[1]); } catch { throw new Error('Malformed action JSON. Return one valid JSON object inside the action tags.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.tool !== 'string' || !ALLOWED.has(value.tool)) {
    throw new Error('Unsupported or invalid agent tool.');
  }
  return value as AgentAction;
}
export function actionPrompt(): string {
  return [
    'You are operating inside Infernum Code Agent Mode. You can inspect the workspace and propose changes using the tools below.',
    'To call a tool, output exactly one block and no surrounding prose: <infernum_action>{"tool":"...", ...}</infernum_action>. Then wait for its result.',
    'Available tools:',
    '{"tool":"list_files","pattern":"optional glob pattern"}',
    '{"tool":"read_file","path":"workspace-relative path"}',
    '{"tool":"search_text","query":"text to search","pattern":"optional glob"}',
    '{"tool":"propose_file_edit","path":"workspace-relative path","content":"complete new file content"}',
    '{"tool":"run_command","command":"shell command"}',
    'File edits are proposals only; the user must inspect and explicitly accept each diff. Never claim a change was applied before acceptance.',
    'Shell commands always require explicit user confirmation. Prefer read-only inspection and existing test commands. Never request secrets or exfiltrate environment data.',
    'Use workspace-relative paths. Read only what is relevant. Do not fabricate command results.',
    'When done, respond normally with a concise summary, changed-file proposal list, and tests run.'
  ].join('\n');
}
