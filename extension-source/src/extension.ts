import * as vscode from 'vscode';
import { AgentManager } from './agents/manager';
import { AgentEngine } from './agents/engine';
import { ProviderRegistry } from './providers/registry';
import { ContextManager } from './workspace/context';
import { WorkspaceTools } from './workspace/tools';
import { InfernumViewProvider } from './ui/view-provider';

export async function activate(context: any): Promise<void> {
  const manager = new AgentManager(context);
  await manager.initialize();
  const registry = new ProviderRegistry();
  const contextManager = new ContextManager();
  const workspaceTools = new WorkspaceTools(context);
  const engine = new AgentEngine(manager, registry, contextManager, workspaceTools);
  const view = new InfernumViewProvider(context, manager, registry, engine, workspaceTools);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('infernum.sidebar', view, { webviewOptions: { retainContextWhenHidden: true } }));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.open', async () => vscode.commands.executeCommand('workbench.view.extension.infernum')));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.addAgent', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.infernum');
    setTimeout(() => view.openHub(), 250);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.cancel', () => view.cancel()));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.importAgent', () => view.requestImport()));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.exportAgent', async () => {
    const agent = manager.agents().find((item: any) => item.id === manager.activeAgentId());
    if (agent) await view.requestExport(agent.id);
  }));

  const promptCommand = (command: string, mode: string, instruction: string) => vscode.commands.registerCommand(command, async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
    const currentFile = editor ? `\nFile: ${vscode.workspace.asRelativePath(editor.document.uri)}` : '';
    let prompt = `${instruction}${currentFile}${selection ? `\n\nSelected code:\n\`\`\`\n${selection}\n\`\`\`` : ''}`;
    if (!selection && mode === 'chat') {
      const entered = await vscode.window.showInputBox({ prompt: 'What would you like Infernum to help with?', placeHolder: 'Ask about your project…' });
      if (!entered) return;
      prompt = entered;
    }
    await vscode.commands.executeCommand('workbench.view.extension.infernum');
    setTimeout(() => view.prefill(mode, prompt), 250);
  });
  context.subscriptions.push(promptCommand('infernum.ask', 'chat', 'Help me with the selected code.'));
  context.subscriptions.push(promptCommand('infernum.fix', 'agent', 'Investigate and fix the issue in the selected code. Use workspace tools and propose diffs; do not apply changes without my approval.'));
  context.subscriptions.push(promptCommand('infernum.explain', 'explain', 'Explain the selected code, its behavior and any important caveats.'));
  context.subscriptions.push(promptCommand('infernum.refactor', 'agent', 'Refactor the selected code while preserving behavior. Inspect related files and propose diffs for my review.'));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event: any) => {
    if (event.affectsConfiguration('workbench.colorTheme')) view.refreshTheme();
  }));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.refresh', () => view.refresh()));
  context.subscriptions.push(vscode.commands.registerCommand('infernum.showDiffs', () => view.showPending()));
}

export function deactivate(): void { /* VS Code disposes registered subscriptions. */ }
