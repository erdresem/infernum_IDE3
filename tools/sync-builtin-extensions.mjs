import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const codeRoot = path.resolve(process.argv[2] || process.cwd());
const productPath = path.join(codeRoot, 'product.json');
if (!fs.existsSync(productPath)) {
  console.error(`[Infernum] Cannot find ${productPath}`);
  process.exit(1);
}

// Code-OSS uses product.extensionsGallery for both runtime extension search and
// built-in extension downloads. For reproducible upstream built-ins, temporarily
// let its own downloader use their pinned GitHub repositories + SHA256 values.
// Infernum itself is already staged locally at the exact version, so it is not
// downloaded from a third-party gallery.
const original = fs.readFileSync(productPath);
const product = JSON.parse(original.toString('utf8'));
const gallery = product.extensionsGallery;
delete product.extensionsGallery;
fs.writeFileSync(productPath, JSON.stringify(product, null, '\t') + '\n');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let status = 1;
try {
  const result = spawnSync(npm, ['run', 'download-builtin-extensions'], {
    cwd: codeRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  status = result.status ?? 1;
  if (result.error) throw result.error;
} finally {
  // Restore Infernum's Open VSX runtime gallery even if downloading fails.
  fs.writeFileSync(productPath, original);
}

if (status !== 0) {
  console.error(`[Infernum] Built-in extension sync failed with exit code ${status}.`);
  process.exit(status);
}
console.log('[Infernum] Upstream built-ins synchronized from their pinned sources; Open VSX restored for runtime extension discovery.');
