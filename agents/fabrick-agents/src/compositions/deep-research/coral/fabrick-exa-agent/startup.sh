#!/bin/bash
# Coral wrapper for fabrick-exa-agent.
# Resolves AGENT_PATH relative to this script's location so it works
# regardless of whether coral-server invokes us from the repo path
# directly (via [registry] local_agents) or through a ~/.coral/agents
# symlink. `pwd -P` follows symlinks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

# Walk upward from SCRIPT_DIR to find the fabrick-agents package.json.
# Refactor-tolerant: agent dirs can move within the package (e.g. into
# composition subdirs) without breaking AGENT_PATH resolution.
find_agent_path() {
	local dir="$1"
	while [ "$dir" != "/" ]; do
		if [ -f "$dir/package.json" ] && grep -q '"name": "fabrick-agents"' "$dir/package.json" 2>/dev/null; then
			echo "$dir"
			return 0
		fi
		dir="$(dirname "$dir")"
	done
	echo "FATAL: could not locate fabrick-agents package.json above $SCRIPT_DIR" >&2
	exit 1
}

AGENT_PATH="$(find_agent_path "$SCRIPT_DIR")"
AGENT_KEY="exaAgent"

echo "=== Coral fabrick-exa-agent ==="
echo "Agent ID:       ${CORAL_AGENT_ID:-?}"
echo "Session ID:     ${CORAL_SESSION_ID:-?}"
echo "Connection URL: ${CORAL_CONNECTION_URL:-?}"
echo "Proxy URL:      ${CORAL_PROXY_URL_MAIN:-?}"
echo "Proxy model:    ${CORAL_PROXY_MODEL_MAIN:-?}"
echo "Agent path:     $AGENT_PATH"

if [ ! -d "$AGENT_PATH/node_modules" ]; then
	echo ">>> Installing dependencies (first run)..."
	cd "$AGENT_PATH" && bun install
fi

if [ -f "$AGENT_PATH/.env" ]; then
	set -a
	# shellcheck disable=SC1091
	source "$AGENT_PATH/.env"
	set +a
fi

cd "$AGENT_PATH"
echo ">>> Starting $AGENT_KEY coral worker..."
exec npx tsx src/coral-worker.ts "$AGENT_KEY"
