#!/bin/bash
# Coral wrapper for fabrick-exa-agent.
# Resolves AGENT_PATH relative to this script's location so it works
# regardless of whether coral-server invokes us from the repo path
# directly (via [registry] local_agents) or through a ~/.coral/agents
# symlink. `pwd -P` follows symlinks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AGENT_PATH="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
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
