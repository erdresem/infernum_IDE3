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
exports.WorkspaceTools = void 0;
const vscode = __importStar(require("vscode"));
const path = require('node:path');
const childProcess = require('node:child_process');
class WorkspaceTools {
    context;
    pending = new Map();
    constructor(context) {
        this.context = context;
    }
    root() {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder)
            throw new Error('Open a workspace folder before using project tools.');
        return folder.uri;
    }
    isSensitive(relativePath) {
        return /(^|\/)(\.env(?:\..*)?|secrets?(?:\..*)?|credentials?(?:\..*)?|id_rsa|id_ed25519|service[-_]account(?:\..*)?)(?:$|\/)|\.(?:pem|key|p12|pfx|keystore)$/i.test(relativePath.replace(/\\/g, '/'));
    }
    resolve(relativePath) {
        if (typeof relativePath !== 'string' || !relativePath.trim())
            throw new Error('A workspace-relative path is required.');
        if (this.isSensitive(relativePath))
            throw new Error('This path looks like a secret or credential file and is withheld from agent tools by default.');
        const root = this.root();
        const rootPath = path.resolve(root.fsPath);
        const target = path.resolve(rootPath, relativePath);
        const relative = path.relative(rootPath, target);
        if (!relative || relative === '.' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error('Path must refer to a file inside the workspace.');
        }
        return { uri: vscode.Uri.file(target), relative: relative.split(path.sep).join('/'), rootPath };
    }
    async assertNoSymlink(target, relativePath) {
        let cursor = this.root();
        const parts = relativePath.split(/[\\/]+/).filter(Boolean);
        for (let index = 0; index < parts.length; index++) {
            cursor = vscode.Uri.joinPath(cursor, parts[index]);
            try {
                const stat = await vscode.workspace.fs.stat(cursor);
                const symlink = vscode.FileType?.SymbolicLink ?? 64;
                if ((stat.type & symlink) !== 0)
                    throw new Error('Symbolic links are not accessible to Infernum workspace tools.');
            }
            catch (error) {
                if (error instanceof Error && error.message.includes('Symbolic links'))
                    throw error;
                if (index < parts.length - 1)
                    throw new Error(`Workspace path does not exist: ${relativePath}`);
            }
        }
    }
    async execute(action, onAction) {
        switch (action.tool) {
            case 'list_files': return this.listFiles(action.pattern);
            case 'read_file': return this.readFile(action.path);
            case 'search_text': return this.searchText(action.query, action.pattern);
            case 'propose_file_edit': return this.proposeFileEdit(action.path, action.content, onAction);
            case 'run_command': return this.runCommand(action.command, onAction);
            default: throw new Error(`Unknown tool: ${action.tool}`);
        }
    }
    async listFiles(pattern) {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder)
            throw new Error('Open a workspace folder before listing files.');
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern || '**/*'), '**/{node_modules,.git,dist,build,out,.next,coverage}/**', 250);
        return files.map((uri) => vscode.workspace.asRelativePath(uri, false)).filter((name) => !this.isSensitive(name)).join('\n') || '(no files found)';
    }
    async readFile(relativePath) {
        const target = this.resolve(relativePath);
        await this.assertNoSymlink(target.uri, target.relative);
        const bytes = await vscode.workspace.fs.readFile(target.uri);
        const content = new TextDecoder().decode(bytes);
        return content.length > 30000 ? `${content.slice(0, 30000)}\n\n[truncated after 30,000 characters]` : content;
    }
    async searchText(query, pattern) {
        if (typeof query !== 'string' || !query.trim())
            throw new Error('Search query is required.');
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder)
            throw new Error('Open a workspace folder before searching files.');
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern || '**/*'), '**/{node_modules,.git,dist,build,out,.next,coverage}/**', 120);
        const hits = [];
        const needle = query.toLowerCase();
        for (const uri of files) {
            if (hits.length >= 80)
                break;
            if (this.isSensitive(vscode.workspace.asRelativePath(uri, false)))
                continue;
            try {
                const relative = vscode.workspace.asRelativePath(uri, false);
                await this.assertNoSymlink(uri, relative);
                const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
                const lines = text.split(/\r?\n/);
                for (let index = 0; index < lines.length; index++) {
                    if (lines[index].toLowerCase().includes(needle)) {
                        hits.push(`${vscode.workspace.asRelativePath(uri, false)}:${index + 1}: ${lines[index].slice(0, 300)}`);
                        if (hits.length >= 80)
                            break;
                    }
                }
            }
            catch { /* skip unreadable and binary files */ }
        }
        return hits.join('\n') || '(no matches found)';
    }
    async proposeFileEdit(relativePath, content, onAction) {
        if (typeof content !== 'string')
            throw new Error('Proposed file content must be a string.');
        if (content.length > 500000)
            throw new Error('A single file proposal is limited to 500 KB.');
        const target = this.resolve(relativePath);
        await this.assertNoSymlink(target.uri, target.relative);
        let original = null;
        try {
            original = new TextDecoder().decode(await vscode.workspace.fs.readFile(target.uri));
        }
        catch { /* new file */ }
        const id = `change_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const change = { id, path: target.relative, content, original, createdAt: Date.now() };
        this.pending.set(id, change);
        onAction?.(`Prepared diff for ${target.relative}`);
        const storage = this.context.globalStorageUri;
        await vscode.workspace.fs.createDirectory(storage);
        const beforeUri = vscode.Uri.joinPath(storage, `${id}.before`);
        const afterUri = vscode.Uri.joinPath(storage, `${id}.after`);
        await vscode.workspace.fs.writeFile(beforeUri, new TextEncoder().encode(original ?? ''));
        await vscode.workspace.fs.writeFile(afterUri, new TextEncoder().encode(content));
        await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, `Infernum proposal · ${target.relative}`, { preview: true });
        return `Diff proposal ${id} created for ${target.relative}. It is NOT applied. User must accept it in the Infernum panel.`;
    }
    listPending() { return [...this.pending.values()]; }
    async acceptChange(changeId) {
        const change = this.pending.get(changeId);
        if (!change)
            throw new Error('This proposal is no longer available.');
        const target = this.resolve(change.path);
        await this.assertNoSymlink(target.uri, target.relative);
        const edit = new vscode.WorkspaceEdit();
        if (change.original === null) {
            try {
                await vscode.workspace.fs.stat(target.uri);
                throw new Error(`The file ${change.path} now exists. Reject this proposal and ask the agent to review the new file.`);
            }
            catch (error) {
                if (error instanceof Error && error.message.startsWith('The file '))
                    throw error;
            }
            edit.createFile(target.uri, { overwrite: false, ignoreIfExists: false });
            edit.insert(target.uri, new vscode.Position(0, 0), change.content);
        }
        else {
            const latest = new TextDecoder().decode(await vscode.workspace.fs.readFile(target.uri));
            if (latest !== change.original)
                throw new Error(`The file ${change.path} changed after this diff was prepared. Review a fresh proposal to avoid overwriting newer work.`);
            const document = await vscode.workspace.openTextDocument(target.uri);
            edit.replace(target.uri, new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)), change.content);
        }
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied)
            throw new Error('VS Code could not apply this edit. The proposal remains available.');
        this.pending.delete(changeId);
        await vscode.workspace.saveAll(false);
    }
    rejectChange(changeId) { this.pending.delete(changeId); }
    async runCommand(command, onAction) {
        if (typeof command !== 'string' || !command.trim() || command.length > 1000)
            throw new Error('Provide a command shorter than 1,000 characters.');
        const answer = await vscode.window.showWarningMessage(`Infernum wants to run this shell command from the workspace directory:\n\n${command}\n\nCommands can modify files or access the network. Run only if you trust this request.`, { modal: true }, 'Run command');
        if (answer !== 'Run command')
            return 'User declined command execution.';
        onAction?.(`Running: ${command}`);
        const cwd = this.root().fsPath;
        return new Promise((resolve, reject) => {
            const child = childProcess.exec(command, { cwd, timeout: 90000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
                const output = [`$ ${command}`, stdout ? `STDOUT:\n${stdout.slice(0, 16000)}` : '', stderr ? `STDERR:\n${stderr.slice(0, 8000)}` : '', error ? `EXIT: ${error.code ?? error.message}` : 'EXIT: 0'].filter(Boolean).join('\n\n');
                if (error && !stdout && !stderr)
                    resolve(output);
                else
                    resolve(output);
            });
            child.on('error', (error) => reject(error));
        });
    }
}
exports.WorkspaceTools = WorkspaceTools;
//# sourceMappingURL=tools.js.map