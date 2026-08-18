#!/usr/bin/env bash
#
# Start, stop and inspect the local demo.
#
#   ./scripts/demo.sh start     backend + frontend, primed with the Apps Tracker
#   ./scripts/demo.sh status    is it up, and what is loaded
#   ./scripts/demo.sh reload    re-load the Apps Tracker (after a backend restart)
#   ./scripts/demo.sh stop      stop both
#   ./scripts/demo.sh logs      tail both logs
#
# Why a script rather than three commands in a README:
#
#   - The API key is read from frontend/.env.local, so the two halves can
#     never drift apart. backend/.env holds a DIFFERENT key, and using it by
#     accident makes every request 401 with no obvious cause.
#   - It refuses to start a SECOND `next dev`. Two of them share .next and
#     corrupt each other, which shows up as "missing required error
#     components" or a 404 on the login route.
#   - It loads the Apps Tracker ONLY, leaving the bank file as the live demo
#     moment. Loading everything up front spoils it.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.demo-logs"
mkdir -p "$LOGS"

WEB_PORT=3000
APPS_FILE="$ROOT/doc/Master Apps Tracker - 16JUL2026.xlsx"

env_value() { grep -E "^$1=" "$ROOT/frontend/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"'; }

API_URL="$(env_value PREPROCESS_API_URL)"
API_KEY="$(env_value PREPROCESS_API_KEY)"
API_PORT="${API_URL##*:}"

: "${API_URL:?PREPROCESS_API_URL missing from frontend/.env.local}"
: "${API_KEY:?PREPROCESS_API_KEY missing from frontend/.env.local}"

listening() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

wait_for() { # port, seconds
  for _ in $(seq "$2"); do listening "$1" && return 0; sleep 1; done
  return 1
}

start_backend() {
  if listening "$API_PORT"; then
    echo "  backend    already on :$API_PORT"
    return
  fi
  ( cd "$ROOT/backend" && setsid env \
      SUPABASE_DB_URL="postgresql://unused@localhost/none" \
      API_KEY="$API_KEY" LOG_LEVEL=WARNING \
      uv run uvicorn app.asgi:app --port "$API_PORT" \
      > "$LOGS/backend.log" 2>&1 < /dev/null & )
  if wait_for "$API_PORT" 30; then
    echo "  backend    started on :$API_PORT"
  else
    echo "  backend    FAILED — see $LOGS/backend.log"; return 1
  fi
}

# Production by default. `next dev` compiles every route on demand and takes
# 1.4-3.0s per page; the same pages served from a build take 70-180ms. That
# gap is what "the website is too slow" was. Pass `dev` to get hot reload back.
start_frontend() {
  if listening "$WEB_PORT"; then
    echo "  frontend   already on :$WEB_PORT (not starting a second one)"
    return
  fi
  rm -rf "$ROOT/frontend/.next"
  if [ "${MODE:-prod}" = "dev" ]; then
    ( cd "$ROOT/frontend" && setsid pnpm dev --port "$WEB_PORT" \
        > "$LOGS/frontend.log" 2>&1 < /dev/null & )
  else
    echo "  frontend   building…"
    ( cd "$ROOT/frontend" && pnpm build > "$LOGS/build.log" 2>&1 ) || {
      echo "  frontend   BUILD FAILED — see $LOGS/build.log"; return 1; }
    ( cd "$ROOT/frontend" && setsid pnpm start --port "$WEB_PORT" \
        > "$LOGS/frontend.log" 2>&1 < /dev/null & )
  fi
  if wait_for "$WEB_PORT" 90; then
    if [ "${MODE:-prod}" != "dev" ] && [ ! -f "$ROOT/frontend/.next/BUILD_ID" ]; then
      echo "  frontend   ERROR: :$WEB_PORT is held by another process."
      echo "             Run '$0 stop', then start again."
      return 1
    fi
    echo "  frontend   started on :$WEB_PORT (${MODE:-prod})"
  else
    echo "  frontend   FAILED — see $LOGS/frontend.log"; return 1
  fi
}

# Leaders are reference data the agency maintains — the Apps Tracker has no
# leader column, so nothing in an import can create them. Without at least one,
# the "add a fundraiser" form has nothing to assign to and every save fails
# validation. These names are real, taken from their own payroll reference.
seed_leaders() {
  for name in "Adora Viannca Lumbre" "Mark Joseph Ramayrat" "Jhon Carlo Magno"; do
    curl -s -X POST -H "Authorization: Bearer $API_KEY" \
      --get --data-urlencode "name=$name" "$API_URL/team/leaders" -o /dev/null
  done
  echo "  leaders    3 seeded"
}

load_apps() {
  [ -f "$APPS_FILE" ] || { echo "  load       SKIPPED — $APPS_FILE not found"; return; }
  ( cd "$ROOT/backend" && API_KEY="$API_KEY" FUNDPRO_API="$API_URL" \
      uv run python -m app.cli load "$APPS_FILE" 2>&1 | sed 's/^/  /' )
}

case "${1:-start}" in
  start)
    echo "Starting the demo…"
    start_backend || exit 1
    seed_leaders
    load_apps
    start_frontend || exit 1
    echo
    echo "  Open       http://localhost:$WEB_PORT"
    echo "  Sign in    admin@fundpro.local / demo1234"
    echo "  Upload     ~/Desktop/FundPro Demo Files/2 - Bank Status Report.xlsx"
    echo
    ;;

  stop)
    # Kill by NAME as well as by port, then WAIT for the port to actually free.
    # Killing one pid and moving on once left a six-hour-old dev server holding
    # :3000 while a fresh production build was written underneath it. The page
    # then served with no CSS, because dev and prod put stylesheets in
    # different places.
    pkill -f "next-server" 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    pkill -f "next start" 2>/dev/null
    pid="$(ss -ltnp 2>/dev/null | grep ":$API_PORT " | grep -oP 'pid=\K[0-9]+' | head -1)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
    for _ in $(seq 15); do
      if ! listening "$WEB_PORT" && ! listening "$API_PORT"; then break; fi
      sleep 1
    done
    echo "  stopped"
    ;;

  reload)
    listening "$API_PORT" || { echo "  backend is not running — use: $0 start"; exit 1; }
    load_apps
    ;;

  status)
    listening "$API_PORT" && echo "  backend    UP on :$API_PORT" || echo "  backend    DOWN"
    listening "$WEB_PORT"  && echo "  frontend   UP on :$WEB_PORT"  || echo "  frontend   DOWN"
    running=$(pgrep -c -f "next-server" 2>/dev/null || echo 0)
    [ "$running" -gt 1 ] && echo "  WARNING: $running dev servers running — they corrupt each other. Run: $0 stop"
    if listening "$API_PORT"; then
      ( cd "$ROOT/backend" && API_KEY="$API_KEY" FUNDPRO_API="$API_URL" \
          uv run python -m app.cli status 2>/dev/null | sed 's/^/  /' )
    fi
    ;;

  logs)
    tail -f "$LOGS/backend.log" "$LOGS/frontend.log"
    ;;

  *)
    sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit 1
    ;;
esac
