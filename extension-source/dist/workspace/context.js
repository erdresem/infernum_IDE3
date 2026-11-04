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
exports.ContextManager = void 0;
const vscode = __importStar(require("vscode"));
function looksSensitive(relative) {
    return /(^|\/)(\.env(?:\..*)?|secrets?(?:\..*)?|credentials?(?:\..*)?|id_rsa|id_ed25519|service[-_]account(?:\..*)?)(?:$|\/)|\.(?:pem|key|p12|pfx|keystore)$/i.test(relative.replace(/\\/g, '/'));
}
class ContextManager {
    async buildContext(maxFiles) {
        const config = vscode.workspace.getConfiguration('infernum');
        const fileLimit = Math.max(10, Math.min(300, Number(maxFiles ?? config.get('maxContextFiles', 80))));
        const folders = (vscode.workspace.workspaceFolders || []);
        if (!folders.length)
            return 'No workspace folder is open.';
        const active = vscode.window.activeTextEditor;
        const parts = [`Workspace: ${folders.map((f) => f.name).join(', ')}`];
        if (active) {
            const relative = vscode.workspace.asRelativePath(active.document.uri);
            if (looksSensitive(relative)) {
                parts.push(`\nActive file withheld from model context because its path looks sensitive: ${relative}`);
            }
            else {
                parts.push(`\nActive file: ${relative}\n\`\`\`${active.document.languageId}\n${active.document.getText().slice(0, 22000)}\n\`\`\``);
                if (!active.selection.isEmpty) {
                    parts.push(`\nSelected code:\n\`\`\`\n${active.document.getText(active.selection).slice(0, 12000)}\n\`\`\``);
                }
            }
        }
        const diagnostics = vscode.languages.getDiagnostics().filter((entry) => entry[1].length > 0).slice(0, 30);
        if (diagnostics.length) {
            const summary = diagnostics.flatMap((entry) => entry[1].slice(0, 8).map((d) => `${vscode.workspace.asRelativePath(entry[0])}:${d.range.start.line + 1} [${d.severity === 0 ? 'Error' : d.severity === 1 ? 'Warning' : 'Info'}] ${d.message}`)).slice(0, 60);
            parts.push(`\nVS Code diagnostics:\n${summary.join('\n')}`);
        }
        const firstFolder = folders[0];
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(firstFolder, '**/*'), '**/{node_modules,.git,dist,build,out,.next,coverage}/**', fileLimit);
        const fileNames = files.map((uri) => vscode.workspace.asRelativePath(uri, false)).filter((name) => !looksSensitive(name));
        parts.push(`\nWorkspace files (up to ${fileLimit}):\n${fileNames.join('\n')}`);
        return parts.join('\n');
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=context.js.map