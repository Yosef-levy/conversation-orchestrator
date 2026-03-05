#!/usr/bin/env bash
# Stop the dev stack: kill frontend dev server, tear down Docker (backend + vLLM).
# Usage: ./scripts/stop.sh   (from repo root)
# To leave Docker running and only stop the frontend: SKIP_DOCKER=1 ./scripts/stop.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
PIDFILE="$REPO_ROOT/.dev-pids"

# Kill frontend process we started
if [[ -f "$PIDFILE" ]]; then
  pid=$(cat "$PIDFILE")
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "Stopping frontend (PID $pid)..."
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  echo "Frontend stopped."
else
  if command -v pkill &>/dev/null; then
    pkill -f "vite" 2>/dev/null || true
  fi
fi

# Optional: leave Docker running
if [[ "${SKIP_DOCKER}" != "1" ]]; then
  echo "Stopping Docker services..."
  docker compose -f docker-compose.dev.yml down
  echo "Docker services stopped."
fi

echo "Dev stack stopped."
