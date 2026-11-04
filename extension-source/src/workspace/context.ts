import * as vscode from 'vscode';

function looksSensitive(relative: string): boolean {
  return /(^|\/)(\.env(?:\..*)?|secrets?(?:\..*)?|credentials?(?:\..*)?|id_rsa|id_ed25519|service[-_]account(?:\..*)?)(?:$|\/)|\.(?:pem|key|p12|pfx|keystore)$/i.test(relative.replace(/\\/g, '/'));
}

export class ContextManager {
  async buildContext(maxFiles?: number): Promise<string> {
    const config = vscode.workspace.getConfiguration('infernum');
    const fileLimit = Math.max(10, Math.min(300, Number(maxFiles ?? config.get('maxContextFiles', 80))));
    const folders = (vscode.workspace.workspaceFolders || []) as any[];
    if (!folders.length) return 'No workspace folder is open.';
    const active = vscode.window.activeTextEditor;
    const parts: string[] = [`Workspace: ${folders.map((f: any) => f.name).join(', ')}`];

    if (active) {
      const relative = vscode.workspace.asRelativePath(active.document.uri);
      if (looksSensitive(relative)) {
        parts.push(`\nActive file withheld from model context because its path looks sensitive: ${relative}`);
      } else {
        parts.push(`\nActive file: ${relative}\n\`\`\`${active.document.languageId}\n${active.document.getText().slice(0, 22000)}\n\`\`\``);
        if (!active.selection.isEmpty) {
          parts.push(`\nSelected code:\n\`\`\`\n${active.document.getText(active.selection).slice(0, 12000)}\n\`\`\``);
        }
      }
    }

    const diagnostics = vscode.languages.getDiagnostics().filter((entry: any) => entry[1].length > 0).slice(0, 30);
    if (diagnostics.length) {
      const summary = diagnostics.flatMap((entry: any) => entry[1].slice(0, 8).map((d: any) =>
        `${vscode.workspace.asRelativePath(entry[0])}:${d.range.start.line + 1} [${d.severity === 0 ? 'Error' : d.severity === 1 ? 'Warning' : 'Info'}] ${d.message}`
      )).slice(0, 60);
      parts.push(`\nVS Code diagnostics:\n${summary.join('\n')}`);
    }

    const firstFolder = folders[0];
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(firstFolder, '**/*'), '**/{node_modules,.git,dist,build,out,.next,coverage}/**', fileLimit);
    const fileNames = files.map((uri: any) => vscode.workspace.asRelativePath(uri, false)).filter((name: string) => !looksSensitive(name));
    parts.push(`\nWorkspace files (up to ${fileLimit}):\n${fileNames.join('\n')}`);
    return parts.join('\n');
  }
}
