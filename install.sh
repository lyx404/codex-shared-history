#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-$HOME/Applications}"
APP_NAME="Codex Shared History.app"

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_DIR/$APP_NAME"
cp -R "$SCRIPT_DIR/$APP_NAME" "$TARGET_DIR/"
chmod +x "$TARGET_DIR/$APP_NAME/Contents/MacOS/codex-shared-history"
chmod +x "$TARGET_DIR/$APP_NAME/Contents/Resources/open-codex-shared-history.sh"
chmod +x "$TARGET_DIR/$APP_NAME/Contents/Resources/sync-history-provider.js"

echo "Installed: $TARGET_DIR/$APP_NAME"
