#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CODE="${INFERNUM_CODE_OSS_DIR:-$ROOT/upstream/vscode}"
if [ ! -d "$CODE/.git" ]; then "$ROOT/scripts-clone.sh" "$CODE"; fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Install Node.js 24.22.1 and npm first (see .nvmrc).' >&2; exit 1
fi
NODE_VERSION="$(node -p 'process.versions.node')"
if [[ "$NODE_VERSION" != "24.22.1" ]]; then
  echo "Code-OSS 1.144.0 is pinned to Node 24.22.1; found $NODE_VERSION. Use nvm/fnm with $ROOT/.nvmrc." >&2
  exit 1
fi
if ! command -v g++ >/dev/null || ! command -v make >/dev/null; then
  echo 'Install build-essential, g++, make, libX11-dev, libxkbfile-dev, libsecret-1-dev, libkrb5-dev and python-is-python3.' >&2
  exit 1
fi
cd "$CODE"
npm install
node "$ROOT/tools/prepare-code-oss.mjs" "$CODE"
node "$ROOT/tools/sync-builtin-extensions.mjs" "$CODE"
npm run gulp -- vscode-linux-x64
OUT="$CODE/.build/VSCode-linux-x64"
if [ ! -d "$OUT" ]; then
  OUT="$(find "$CODE/.build" -maxdepth 2 -type d -name 'VSCode-linux-x64' -print -quit)"
fi
if [ -z "$OUT" ] || [ ! -d "$OUT" ]; then echo 'Build command completed but output folder was not found.' >&2; exit 1; fi
mkdir -p "$ROOT/dist"
ARCHIVE="$ROOT/dist/Infernum-IDE-0.7.0-Linux-x64.tar.gz"
tar -czf "$ARCHIVE" -C "$(dirname "$OUT")" "$(basename "$OUT")"
echo "Built: $ARCHIVE"
