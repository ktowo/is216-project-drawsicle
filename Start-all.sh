#!/usr/bin/env bash
# Starts Drawisicle: installs anything missing, creates server/.env, then runs the API
# (with its own local MongoDB unless server/.env has DB set) and the Vue client in the background.
# Works in Terminal on macOS/Linux and in Git Bash on Windows (Windows cmd: Start-all.bat).
#
#   ./Start-all.sh               API + client
#   ./Start-all.sh --mock        client only; the API runs inside the browser with demo data
#   ./Start-all.sh --install     reinstall dependencies even if they are already there
#   ./Start-all.sh --no-install  never install (stops if dependencies are missing)
#
# Logs and process ids go to .run/. Stop everything with ./Stop-all.sh

set -u

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
RUN_DIR="$ROOT/.run"
CLIENT_PORT=5173
API_WAIT_SECONDS=300
CLIENT_WAIT_SECONDS=120

MOCK=0
INSTALL=auto

usage() {
  cat <<'EOF'
Usage: ./Start-all.sh [--mock] [--install | --no-install] [--help]

  --mock        Start only the client, with the API running in the browser (no server or database)
  --install     Install dependencies again, even if node_modules already exists
  --no-install  Don't install anything; stop if dependencies are missing
  --help        Show this help

Stop everything with ./Stop-all.sh
EOF
}

for arg in "$@"; do
  case "$arg" in
    --mock) MOCK=1 ;;
    --install) INSTALL=always ;;
    --no-install) INSTALL=never ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

fail() {
  echo "" >&2
  echo "Error: $*" >&2
  exit 1
}

warn() {
  echo "Warning: $*" >&2
}

# ---------- Node.js ----------

command -v node >/dev/null 2>&1 ||
  fail "Node.js isn't installed. Install Node 22.18 or newer (24 LTS recommended) from https://nodejs.org, then run this again."

NODE_VERSION="$(node -p 'process.versions.node')"
IFS=. read -r NODE_MAJOR NODE_MINOR _ <<<"$NODE_VERSION"
if ((NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 18))); then
  fail "Node $NODE_VERSION is too old. Drawisicle needs Node 22.18 or newer (24 LTS recommended): https://nodejs.org"
fi

# ---------- Package manager ----------

# corepack can ask before downloading pnpm, which would hang a background start
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if command -v pnpm >/dev/null 2>&1; then
  PM=(pnpm)
elif command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then
  PM=(corepack pnpm)
elif command -v npm >/dev/null 2>&1; then
  PM=(npm)
  warn "pnpm wasn't found, so npm is used instead. The lockfiles are written by pnpm, so package versions may differ a little."
  warn "To use pnpm: npm install -g pnpm (or: corepack enable)"
else
  fail "No package manager found. Install Node.js from https://nodejs.org (it includes npm), then run this again."
fi

echo "Drawisicle: Node $NODE_VERSION, ${PM[*]}"

# ---------- Dependencies ----------

install_deps() {
  local dir=$1
  if [[ $INSTALL != always && -d "$dir/node_modules" ]]; then
    return 0
  fi
  if [[ $INSTALL == never ]]; then
    fail "$dir/node_modules is missing. Run without --no-install to install it."
  fi
  echo "Installing $dir dependencies with ${PM[*]} (this can take a few minutes the first time)..."
  (cd "$dir" && "${PM[@]}" install) || fail "Installing the $dir dependencies failed. See the messages above."
}

if ((MOCK == 0)); then
  install_deps server
fi
install_deps client

# ---------- server/.env ----------

# Value of KEY in server/.env, or the default given
env_value() {
  local value=''
  if [[ -f server/.env ]]; then
    value="$(grep -E "^[[:space:]]*$1[[:space:]]*=" server/.env | tail -n 1 | cut -d= -f2- | tr -d '\r')"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value#\"}"
    value="${value%\"}"
  fi
  echo "${value:-$2}"
}

if ((MOCK == 0)) && [[ ! -f server/.env ]]; then
  [[ -f server/.env.example ]] || fail "server/.env.example is missing, so server/.env can't be created."
  # Fresh random secrets in place of the placeholders; 'wx' never overwrites an existing file
  node - <<'EOF' || fail "Couldn't create server/.env."
const fs = require('node:fs');
const crypto = require('node:crypto');
const secret = () => crypto.randomBytes(32).toString('hex');
let text = fs.readFileSync('server/.env.example', 'utf8');
text = text
  .replace(/^SECRET=.*$/m, `SECRET=${secret()}`)
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret()}`)
  .replace(/^ADMIN_EMAILS=.*$/m, 'ADMIN_EMAILS=');
fs.writeFileSync('server/.env', text, { flag: 'wx' });
EOF
  echo "Created server/.env with new secrets. It uses the built-in local database; set DB there to use MongoDB Atlas."
fi

API_PORT="$(env_value PORT 8000)"
DB_VALUE="$(env_value DB '')"
EXTERNAL_DB=0
if [[ -n $DB_VALUE && $DB_VALUE != \[* ]]; then
  EXTERNAL_DB=1
fi

API_URL="http://localhost:$API_PORT"
CLIENT_URL="http://localhost:$CLIENT_PORT"

# ---------- Helpers ----------

# 0 when the URL answers with a 2xx status
http_ok() {
  if command -v curl >/dev/null 2>&1; then
    curl -fs -o /dev/null --max-time 3 "$1"
  else
    node -e "fetch(process.argv[1], { signal: AbortSignal.timeout(3000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" "$1"
  fi
}

# 0 when anything answers on the URL at all
http_up() {
  if command -v curl >/dev/null 2>&1; then
    curl -s -o /dev/null --max-time 3 "$1"
  else
    node -e "fetch(process.argv[1], { signal: AbortSignal.timeout(3000) }).then(() => process.exit(0), () => process.exit(1))" "$1"
  fi
}

# start_bg <dir> <log> <pidfile> <command...>
start_bg() {
  local dir=$1 log=$2 pidfile=$3
  shift 3
  (
    cd "$dir" || exit 1
    nohup "$@" >"$log" 2>&1 </dev/null &
    echo $! >"$pidfile"
  )
}

# wait_for <label> <url> <seconds> <log> <pidfile> <check function>
wait_for() {
  local label=$1 url=$2 limit=$3 log=$4 pidfile=$5 check=$6
  local waited=0 pid
  printf 'Waiting for the %s' "$label"
  while ((waited < limit)); do
    if "$check" "$url"; then
      printf ' ready (%ss)\n' "$waited"
      return 0
    fi
    # nodemon keeps running after the app crashes, so look at the log too
    if grep -q 'app crashed' "$log" 2>/dev/null; then
      break
    fi
    pid="$(cat "$pidfile" 2>/dev/null)"
    if [[ -n $pid ]] && ! kill -0 "$pid" 2>/dev/null; then
      sleep 1
      if "$check" "$url"; then
        printf ' ready (%ss)\n' "$waited"
        return 0
      fi
      break
    fi
    printf '.'
    sleep 2
    waited=$((waited + 2))
  done
  printf '\n'
  echo "The $label didn't start. Last 30 lines of ${log#"$ROOT"/}:" >&2
  echo "------------------------------------------------------------" >&2
  tail -n 30 "$log" >&2
  echo "------------------------------------------------------------" >&2
  return 1
}

mkdir -p "$RUN_DIR"

# True when mongodb-memory-server already has a MongoDB binary, so starting the API won't download one.
# It looks in MONGOMS_DOWNLOAD_DIR (also read from server/.env), then ~/.cache/mongodb-binaries, then
# server/node_modules/.cache/mongodb-memory-server. MONGOMS_SYSTEM_BINARY means nothing is downloaded either.
mongo_binary_cached() {
  local pattern='mongod-*' version dir file
  [[ -n ${MONGOMS_SYSTEM_BINARY:-$(env_value MONGOMS_SYSTEM_BINARY '')} ]] && return 0
  version="${MONGOMS_VERSION:-$(env_value MONGOMS_VERSION '')}"
  [[ -n $version ]] && pattern="mongod-*-$version*"
  for dir in "${MONGOMS_DOWNLOAD_DIR:-$(env_value MONGOMS_DOWNLOAD_DIR '')}" \
    "$HOME/.cache/mongodb-binaries" "$ROOT/server/node_modules/.cache/mongodb-memory-server"; do
    [[ -n $dir ]] || continue
    for file in "$dir"/$pattern; do
      [[ -f $file && $file != *.md5 ]] && return 0
    done
  done
  return 1
}

# ---------- API ----------

if ((MOCK == 0)); then
  if http_ok "$API_URL/api/health"; then
    echo "The API is already running on $API_URL (not started again)."
  elif http_up "$API_URL"; then
    fail "Something else is using port $API_PORT. Stop it, or set PORT in server/.env (and VITE_PROXY_TARGET for the client)."
  else
    echo "Starting the API on $API_URL ..."
    if ((EXTERNAL_DB == 0)) && ! mongo_binary_cached; then
      echo "  First run: the local MongoDB is downloaded once (about 800 MB on Windows, less elsewhere)."
      echo "  This can take several minutes. Later starts take a few seconds."
    fi
    start_bg server "$RUN_DIR/server.log" "$RUN_DIR/server.pid" "${PM[@]}" run dev
    wait_for API "$API_URL/api/health" "$API_WAIT_SECONDS" "$RUN_DIR/server.log" "$RUN_DIR/server.pid" http_ok ||
      fail "The API didn't start. Fix the problem above, then run ./Stop-all.sh and ./Start-all.sh again."
  fi
fi

# ---------- Client ----------

CLIENT_SCRIPT=dev
((MOCK == 1)) && CLIENT_SCRIPT=dev:mock

if http_up "$CLIENT_URL"; then
  echo "The client is already running on $CLIENT_URL (not started again; run ./Stop-all.sh first to switch modes)."
else
  echo "Starting the client on $CLIENT_URL ($CLIENT_SCRIPT) ..."
  start_bg client "$RUN_DIR/client.log" "$RUN_DIR/client.pid" "${PM[@]}" run "$CLIENT_SCRIPT"
  wait_for client "$CLIENT_URL" "$CLIENT_WAIT_SECONDS" "$RUN_DIR/client.log" "$RUN_DIR/client.pid" http_up ||
    fail "The client didn't start. Fix the problem above, then run ./Stop-all.sh and ./Start-all.sh again."
fi

# ---------- Summary ----------

echo ""
echo "Drawisicle is running."
echo "  App:         $CLIENT_URL"
if ((MOCK == 1)); then
  echo "  Mode:        mock (the API runs in your browser; data is kept in this browser only)"
else
  echo "  API:         $API_URL/api/health"
fi
if ((MOCK == 0 && EXTERNAL_DB == 1)); then
  echo "  Database:    the one in server/.env (demo accounts: run '${PM[*]} run seed' in server/ to add them)"
fi
echo "  Demo login:  mika@demo.test / drawisicle123 (every demo account uses drawisicle123)"
if ((MOCK == 0)); then
  echo "  Logs:        .run/server.log and .run/client.log"
else
  echo "  Logs:        .run/client.log"
fi
echo ""
echo "Stop with ./Stop-all.sh"
