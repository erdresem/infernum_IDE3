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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const manager_1 = require("./agents/manager");
const engine_1 = require("./agents/engine");
const registry_1 = require("./providers/registry");
const context_1 = require("./workspace/context");
const tools_1 = require("./workspace/tools");
const view_provider_1 = require("./ui/view-provider");
async function activate(context) {
    const manager = new manager_1.AgentManager(context);
    await manager.initialize();
    const registry = new registry_1.ProviderRegistry();
    const contextManager = new context_1.ContextManager();
    const workspaceTools = new tools_1.WorkspaceTools(context);
    const engine = new engine_1.AgentEngine(manager, registry, contextManager, workspaceTools);
    const view = new view_provider_1.InfernumViewProvider(context, manager, registry, engine, workspaceTools);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('infernum.sidebar', view, { webviewOptions: { retainContextWhenHidden: true } }));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.open', async () => vscode.commands.executeCommand('workbench.view.extension.infernum')));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.addAgent', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.infernum');
        setTimeout(() => view.openHub(), 250);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.cancel', () => view.cancel()));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.importAgent', () => view.requestImport()));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.exportAgent', async () => {
        const agent = manager.agents().find((item) => item.id === manager.activeAgentId());
        if (agent)
            await view.requestExport(agent.id);
    }));
    const promptCommand = (command, mode, instruction) => vscode.commands.registerCommand(command, async () => {
        const editor = vscode.window.activeTextEditor;
        const selection = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
        const currentFile = editor ? `\nFile: ${vscode.workspace.asRelativePath(editor.document.uri)}` : '';
        let prompt = `${instruction}${currentFile}${selection ? `\n\nSelected code:\n\`\`\`\n${selection}\n\`\`\`` : ''}`;
        if (!selection && mode === 'chat') {
            const entered = await vscode.window.showInputBox({ prompt: 'What would you like Infernum to help with?', placeHolder: 'Ask about your project…' });
            if (!entered)
                return;
            prompt = entered;
        }
        await vscode.commands.executeCommand('workbench.view.extension.infernum');
        setTimeout(() => view.prefill(mode, prompt), 250);
    });
    context.subscriptions.push(promptCommand('infernum.ask', 'chat', 'Help me with the selected code.'));
    context.subscriptions.push(promptCommand('infernum.fix', 'agent', 'Investigate and fix the issue in the selected code. Use workspace tools and propose diffs; do not apply changes without my approval.'));
    context.subscriptions.push(promptCommand('infernum.explain', 'explain', 'Explain the selected code, its behavior and any important caveats.'));
    context.subscriptions.push(promptCommand('infernum.refactor', 'agent', 'Refactor the selected code while preserving behavior. Inspect related files and propose diffs for my review.'));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('workbench.colorTheme'))
            view.refreshTheme();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.refresh', () => view.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand('infernum.showDiffs', () => view.showPending()));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map