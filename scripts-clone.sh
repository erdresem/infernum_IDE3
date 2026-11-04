#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-$ROOT/upstream/vscode}"
TAG="1.144.0"
BRANCH="infernum/0.7.0"
if [ -d "$DEST/.git" ]; then
  CURRENT="$(git -C "$DEST" describe --tags --exact-match 2>/dev/null || true)"
  if [ "$CURRENT" != "$TAG" ]; then
    echo "Existing checkout is not tag $TAG (found: ${CURRENT:-untagged})." >&2
    echo "Remove it or pass a new destination, then rerun this script." >&2
    exit 1
  fi
else
  mkdir -p "$(dirname "$DEST")"
  git clone --depth 1 --branch "$TAG" https://github.com/microsoft/vscode.git "$DEST"
fi
if ! git -C "$DEST" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$DEST" switch -c "$BRANCH" "$TAG"
else
  git -C "$DEST" switch "$BRANCH"
fi
printf 'Code-OSS %s checked out on branch %s at %s\n' "$TAG" "$BRANCH" "$DEST"
