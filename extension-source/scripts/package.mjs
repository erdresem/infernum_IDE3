import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'infernum-vsix-'));
const extension = path.join(staging, 'extension');
fs.mkdirSync(extension, { recursive: true });

const include = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'dist', 'media', 'webview', 'themes', 'icons'];
for (const entry of include) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) throw new Error(`Missing build input: ${entry}. Run npm run compile first.`);
  fs.cpSync(source, path.join(extension, entry), { recursive: true });
}

const contentTypes = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="html" ContentType="text/html" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="map" ContentType="application/json" />
</Types>`;
fs.writeFileSync(path.join(staging, '[Content_Types].xml'), contentTypes);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${esc(pkg.name)}" Version="${esc(pkg.version)}" Publisher="${esc(pkg.publisher)}" />
    <DisplayName>${esc(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${esc(pkg.description)}</Description>
    <Tags>${esc((pkg.keywords || []).join(';'))}</Tags>
    <Categories>${esc((pkg.categories || []).join(';'))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${esc(pkg.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="false" />
      <Property Id="Microsoft.VisualStudio.Services.Branding.Color" Value="#171326" />
      <Property Id="Microsoft.VisualStudio.Services.Branding.Theme" Value="dark" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/media/icon.png" />
  </Assets>
</PackageManifest>`;
fs.writeFileSync(path.join(staging, 'extension.vsixmanifest'), manifest);
const output = path.join(root, `${pkg.name}-${pkg.version}.vsix`);
if (fs.existsSync(output)) fs.unlinkSync(output);
execFileSync('zip', ['-X', '-r', output, '[Content_Types].xml', 'extension.vsixmanifest', 'extension'], { cwd: staging, stdio: 'inherit' });
fs.rmSync(staging, { recursive: true, force: true });
console.log(`Created ${output}`);
