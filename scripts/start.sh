#!/usr/bin/env bash
# Start the full dev stack: Docker (backend + vLLM), frontend dev server, open UI in browser.
# Usage: ./scripts/start.sh   (from repo root)
# To skip Docker: SKIP_DOCKER=1 ./scripts/start.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
PIDFILE="$REPO_ROOT/.dev-pids"

if [[ "${SKIP_DOCKER}" != "1" ]]; then
  echo "Starting Docker services (backend + vLLM)..."
  docker compose -f docker-compose.dev.yml up -d --remove-orphans
  echo "Waiting for services (vLLM may take a few minutes to load the model; wait before sending messages)..."
  sleep 5
fi

if [[ -f "$PIDFILE" ]]; then
  rm -f "$PIDFILE"
fi
# Free port 5173 if still in use from a previous run
if command -v fuser &>/dev/null; then
  fuser -k 5173/tcp 2>/dev/null || true
  sleep 1
fi
echo "Starting frontend dev server..."
FRONTEND_LOG="$REPO_ROOT/.frontend-dev.log"
cd "$REPO_ROOT/src/frontend"
npm run dev 2>&1 | tee "$FRONTEND_LOG" &
FRONTEND_PID=$!
cd "$REPO_ROOT"
echo "$FRONTEND_PID" > "$PIDFILE"
echo "Frontend PID: $FRONTEND_PID (saved to $PIDFILE)"

sleep 4
# Detect actual URL from Vite output (e.g. Local: http://localhost:5174/)
URL="http://localhost:5173"
if [[ -f "$FRONTEND_LOG" ]]; then
  DETECTED=$(grep -oE 'http://localhost:[0-9]+' "$FRONTEND_LOG" | head -1)
  if [[ -n "$DETECTED" ]]; then
    URL="$DETECTED"
  fi
fi
if command -v xdg-open &>/dev/null; then
  xdg-open "$URL" 2>/dev/null || true
elif command -v wslview &>/dev/null; then
  wslview "$URL" 2>/dev/null || true
else
  echo "Open in your browser: $URL"
fi

echo "Dev stack is up. Backend: http://localhost:8000  Frontend: $URL"
echo "If you get 500 when sending a message, wait 1–2 min for vLLM to finish loading the model."
echo "To stop: ./scripts/stop.sh"
