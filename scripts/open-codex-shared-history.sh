#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEX_APP="${CODEX_APP:-/Applications/Codex.app}"
CODEX_PROCESS="${CODEX_PROCESS:-$CODEX_APP/Contents/MacOS/Codex}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SYNC_SCRIPT="${SYNC_SCRIPT:-$SCRIPT_DIR/sync-history-provider.js}"
LOG="${CODEX_HISTORY_LOG:-$CODEX_HOME/open-codex-shared-history.log}"
PROVIDER="${CODEX_HISTORY_PROVIDER:-}"
CHOOSE_PROVIDER=0
SYNC_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      PROVIDER="${2:-}"
      shift 2
      ;;
    --choose-provider)
      CHOOSE_PROVIDER=1
      shift
      ;;
    --sync-only)
      SYNC_ONLY=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 64
      ;;
  esac
done

find_node() {
  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN:-}" ]]; then
    echo "$NODE_BIN"
  elif command -v node >/dev/null 2>&1; then
    command -v node
  elif [[ -x /opt/homebrew/bin/node ]]; then
    echo /opt/homebrew/bin/node
  elif [[ -x /usr/local/bin/node ]]; then
    echo /usr/local/bin/node
  else
    echo "node"
  fi
}

choose_provider() {
  local node_bin="$1"
  local providers_json providers_csv choice
  providers_json="$("$node_bin" "$SYNC_SCRIPT" --list-providers)"
  providers_csv="$("$node_bin" -e 'const providers = JSON.parse(process.argv[1]); console.log(providers.join(","));' "$providers_json")"

  if [[ -z "$providers_csv" ]]; then
    return 1
  fi

  if command -v osascript >/dev/null 2>&1; then
    choice="$(osascript \
      -e "set providerList to {$(echo "$providers_csv" | sed 's/,/","/g; s/^/"/; s/$/"/')}" \
      -e 'set chosenProvider to choose from list providerList with title "Codex Shared History" with prompt "Sync all local history to which provider before opening Codex?" default items {item 1 of providerList}' \
      -e 'if chosenProvider is false then error number -128' \
      -e 'item 1 of chosenProvider')"
    echo "$choice"
    return 0
  fi

  echo "${providers_csv%%,*}"
}

mkdir -p "$CODEX_HOME"
exec >> "$LOG" 2>&1

echo "[$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')] launcher started"

if /bin/ps -ef | /usr/bin/grep -F "$CODEX_PROCESS" | /usr/bin/grep -v grep >/dev/null; then
  echo "[$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')] Codex is already running; close Codex before syncing history"
  if [[ "$SYNC_ONLY" == "1" ]]; then
    exit 2
  fi
  /usr/bin/open -a "$CODEX_APP"
  exit 0
fi

NODE_BIN_RESOLVED="$(find_node)"

if [[ "$CHOOSE_PROVIDER" == "1" && -z "$PROVIDER" ]]; then
  PROVIDER="$(choose_provider "$NODE_BIN_RESOLVED")"
fi

if [[ -n "$PROVIDER" ]]; then
  echo "[$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')] syncing history to provider: $PROVIDER"
  "$NODE_BIN_RESOLVED" "$SYNC_SCRIPT" --provider "$PROVIDER"
else
  echo "[$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')] syncing history to current config provider"
  "$NODE_BIN_RESOLVED" "$SYNC_SCRIPT"
fi

if [[ "$SYNC_ONLY" == "1" ]]; then
  echo "[$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')] sync-only finished"
  exit 0
fi

echo "[$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')] opening Codex"
/usr/bin/open -a "$CODEX_APP"
