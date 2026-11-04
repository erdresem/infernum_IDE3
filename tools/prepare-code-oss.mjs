import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codeRoot = path.resolve(process.argv[2] || path.join(kitRoot, 'upstream', 'vscode'));
const productPath = path.join(codeRoot, 'product.json');
const codePackagePath = path.join(codeRoot, 'package.json');

function fail(message) { console.error(`\n[Infernum] ERROR: ${message}`); process.exit(1); }
if (!fs.existsSync(productPath) || !fs.existsSync(codePackagePath)) {
  fail(`No Code-OSS checkout at ${codeRoot}. Run scripts/clone-upstream first.`);
}
const codePkg = JSON.parse(fs.readFileSync(codePackagePath, 'utf8'));
if (codePkg.version !== '1.144.0') {
  fail(`Expected microsoft/vscode 1.144.0, found ${codePkg.version}. This fork is pinned to 1.144.0 so patches remain reproducible.`);
}
const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
const backup = `${productPath}.infernum-upstream`;
if (!fs.existsSync(backup)) fs.copyFileSync(productPath, backup);

Object.assign(product, {
  nameShort: 'Infernum',
  nameLong: 'Infernum IDE',
  applicationName: 'infernum',
  dataFolderName: '.infernum',
  sharedDataFolderName: '.infernum-shared',
  serverApplicationName: 'infernum-server',
  serverDataFolderName: '.infernum-server',
  tunnelApplicationName: 'infernum-tunnel',
  win32MutexName: 'infernum',
  win32TunnelServiceMutex: 'infernum-tunnelservice',
  win32TunnelMutex: 'infernum-tunnel',
  win32DirName: 'Infernum IDE',
  win32NameVersion: 'Infernum IDE',
  win32RegValueName: 'InfernumIDE',
  win32AppUserModelId: 'Infernum.IDE',
  win32ShellNameShort: 'Infernum IDE',
  win32x64AppId: '{{c4970202-9b62-4cda-847c-42960fd841d6}',
  win32arm64AppId: '{{6a8a6e17-0f89-4b3f-bcb4-7a49a2f4c0c0}',
  win32x64UserAppId: '{{cb5fa2bd-f976-4f45-b0e8-8a6f18c9ee0a}',
  win32arm64UserAppId: '{{8bb77fc0-c78c-49a9-92c7-5bd8a3a0c1c2}',
  darwinBundleIdentifier: 'com.infernum.ide',
  darwinProfileUUID: '4A0C8BD9-13D0-48B2-A7C9-2A48A2F30F70',
  darwinProfilePayloadUUID: '73D7A72B-1DA8-4CE7-9B36-BA2F1E8C6F91',
  linuxDesktopName: 'infernum-ide',
  linuxIconName: 'infernum',
  urlProtocol: 'infernum',
  agentsTelemetryAppName: 'infernum',
  reportIssueUrl: ''
});
// Use Open VSX for open-source extension discovery. Microsoft Marketplace is not configured.
product.extensionsGallery = {
  serviceUrl: 'https://open-vsx.org/vscode/gallery',
  itemUrl: 'https://open-vsx.org/vscode/item',
  extensionUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',
  resourceUrlTemplate: 'https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}'
};
product.linkProtectionTrustedDomains = [...new Set([...(product.linkProtectionTrustedDomains || []), 'https://open-vsx.org'])];
// The shipped editor must not point the default Chat UI at a Microsoft Copilot product configuration.
delete product.defaultChatAgent;
delete product.trustedExtensionAuthAccess;
delete product.builtInExtensionsEnabledWithAutoUpdates;
delete product.webviewContentExternalBaseUrlTemplate;
if (Array.isArray(product.onboardingKeymaps)) {
  product.onboardingKeymaps = product.onboardingKeymaps.map((entry, index) => index === 0
    ? { ...entry, label: 'Infernum', description: 'Default Infernum IDE shortcuts' }
    : entry);
}
if (Array.isArray(product.onboardingThemes)) {
  const preferred = { id: 'infernum-midnight', label: 'Infernum Midnight', themeId: 'Infernum Midnight', type: 'dark' };
  product.onboardingThemes = [preferred, ...product.onboardingThemes.filter(entry => entry.id !== preferred.id)];
}

const infernumName = 'infernum-labs.infernum-code';
const infernumVersion = '0.4.0';
const existing = Array.isArray(product.builtInExtensions) ? product.builtInExtensions : [];
product.builtInExtensions = existing.filter(e => e.name !== infernumName);
product.builtInExtensions.push({
  name: infernumName,
  version: infernumVersion,
  sha256: '0000000000000000000000000000000000000000000000000000000000000000',
  repo: '', // local .build/builtInExtensions copy is staged before packaging
  metadata: {
    id: 'aa4a9a77-c9f4-4ae9-9be0-499dd8d2e7a1',
    publisherId: {
      publisherId: 'c52a9633-3101-4e9a-a96b-31a6e98c1772',
      publisherName: 'infernum-labs',
      displayName: 'Infernum Labs',
      flags: ''
    },
    publisherDisplayName: 'Infernum Labs'
  }
});
fs.writeFileSync(productPath, JSON.stringify(product, null, '\t') + '\n');

// Compile the user-supplied extension source with Code-OSS's installed TypeScript.
const extensionSource = path.join(kitRoot, 'extension-source');
const stageName = infernumName;
const stagePath = path.join(codeRoot, '.build', 'builtInExtensions', stageName);
fs.rmSync(stagePath, { recursive: true, force: true });
fs.mkdirSync(path.dirname(stagePath), { recursive: true });
const tsc = path.join(codeRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
if (!fs.existsSync(tsc)) fail('Code-OSS dependencies are not installed. Run npm install in the Code-OSS checkout first.');
const compile = spawnSync(tsc, ['--project', path.join(extensionSource, 'tsconfig.json')], { cwd: extensionSource, stdio: 'inherit', shell: process.platform === 'win32' });
if (compile.status !== 0) fail('Infernum extension TypeScript compilation failed.');
fs.cpSync(extensionSource, stagePath, {
  recursive: true,
  filter: (source) => !source.split(path.sep).includes('node_modules') && !source.split(path.sep).includes('tests')
});
// The exact version is checked by Code-OSS builtInExtensions.ts before it packages the local directory.
const stagedPkgPath = path.join(stagePath, 'package.json');
const stagedPkg = JSON.parse(fs.readFileSync(stagedPkgPath, 'utf8'));
if (stagedPkg.version !== infernumVersion) fail(`Staged Infernum version is ${stagedPkg.version}, expected ${infernumVersion}.`);

// Replace common desktop icons where the upstream path exists; Linux/Windows installers pick these up.
const branding = path.join(kitRoot, 'branding');
const replacements = [
  [path.join(branding, 'infernum.ico'), path.join(codeRoot, 'resources', 'win32', 'code.ico')],
  [path.join(branding, 'infernum.png'), path.join(codeRoot, 'resources', 'linux', 'code.png')]
];
for (const [source, destination] of replacements) {
  if (fs.existsSync(source) && fs.existsSync(path.dirname(destination))) fs.copyFileSync(source, destination);
}

console.log(`[Infernum] Patched Code-OSS ${codePkg.version} at ${codeRoot}`);
console.log(`[Infernum] Product branding: Infernum IDE`);
console.log(`[Infernum] Extension staged as built-in: ${infernumName}@${infernumVersion}`);
console.log(`[Infernum] Extension gallery: Open VSX`);
