#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# docker-dev.sh — Worktree-aware Docker Compose wrapper
#
# Detects whether the current directory is a git worktree and automatically
# assigns COMPOSE_PROJECT_NAME and WEB_PORT so that multiple worktrees can
# run independent Docker Compose stacks without port collisions.
#
# Usage:
#   bash scripts/docker-dev.sh up --build   (default when no args)
#   bash scripts/docker-dev.sh down
#   bash scripts/docker-dev.sh logs -f
#   WEB_PORT=3005 bash scripts/docker-dev.sh up --build   (manual override)
# ---------------------------------------------------------------------------

# ── Worktree detection ──

git_common_dir="$(git rev-parse --git-common-dir 2>/dev/null)"
git_dir="$(git rev-parse --git-dir 2>/dev/null)"

if [[ "$git_common_dir" != "$git_dir" ]]; then
  # We are inside a worktree
  worktree_name="$(basename "$(pwd)")"
  is_worktree=true
else
  worktree_name=""
  is_worktree=false
fi

# ── Port calculation ──

hash_name() {
  # Simple hash: sum of ASCII codes mod 49, plus 1 (offset 0 reserved for main)
  local name="$1"
  local sum=0
  for (( i=0; i<${#name}; i++ )); do
    sum=$(( sum + $(printf '%d' "'${name:$i:1}") ))
  done
  echo $(( sum % 49 + 1 ))
}

if [[ "$is_worktree" == true ]]; then
  offset=$(hash_name "$worktree_name")
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-seedbook-dev-${worktree_name}}"
  export WEB_PORT="${WEB_PORT:-$(( 3001 + offset ))}"
else
  export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-seedbook-dev}"
  export WEB_PORT="${WEB_PORT:-3001}"
fi

# ── Info ──

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$is_worktree" == true ]]; then
  echo "  Worktree:  $worktree_name"
fi
echo "  Project:   $COMPOSE_PROJECT_NAME"
echo "  Web port:  $WEB_PORT → http://localhost:$WEB_PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Run docker compose ──

args=("$@")
if [[ ${#args[@]} -eq 0 ]]; then
  args=(up --build)
fi

# Port collision check — only when starting services
if [[ "${args[0]}" == "up" ]] && command -v lsof &>/dev/null; then
  if lsof -iTCP:"$WEB_PORT" -sTCP:LISTEN -t &>/dev/null; then
    echo "⚠  Port $WEB_PORT is already in use."
    echo "   Override with: WEB_PORT=<port> $0 $*"
    exit 1
  fi
fi

exec docker compose -f docker-compose.dev.yml "${args[@]}"
