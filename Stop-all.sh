#!/usr/bin/env bash
# Stops everything Start-all.sh started: the API, the client and the local MongoDB.
# Safe to run more than once. Works on macOS/Linux and in Git Bash on Windows.
#
# It stops the processes recorded in .run/*.pid, then anything still listening on the
# API, client and local database ports (a MongoDB can be left over when the API is killed).

set -u

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
RUN_DIR="$ROOT/.run"

case "$(uname -s 2>/dev/null)" in
  MINGW* | MSYS* | CYGWIN*) WINDOWS=1 ;;
  *) WINDOWS=0 ;;
esac

# Value of KEY in server/.env, or the default given
env_value() {
  local value=''
  if [[ -f server/.env ]]; then
    value="$(grep -E "^[[:space:]]*$1[[:space:]]*=" server/.env | tail -n 1 | cut -d= -f2- | tr -d '\r[:space:]"')"
  fi
  echo "${value:-$2}"
}

API_PORT="$(env_value PORT 8000)"
DB_PORT="$(env_value LOCAL_DB_PORT 27018)"
CLIENT_PORT=5173

STOPPED=0

# ---------- Unix ----------

# Children before parents, so the API gets the signal before the tools that started it
descendants() {
  local pid=$1 child
  command -v pgrep >/dev/null 2>&1 || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    descendants "$child"
    echo "$child"
  done
}

# TERM first (the API then shuts its MongoDB down cleanly), KILL whatever is left after a few seconds
terminate() {
  local pids=("$@") pid alive i
  ((${#pids[@]})) || return 0
  kill -TERM "${pids[@]}" 2>/dev/null
  for ((i = 0; i < 16; i++)); do
    alive=()
    for pid in "${pids[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive+=("$pid")
    done
    ((${#alive[@]})) || return 0
    sleep 0.5
  done
  kill -KILL "${alive[@]}" 2>/dev/null
  return 0
}

listening_pids_unix() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
  elif command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$port" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$'
  fi
}

# ---------- Windows (Git Bash) ----------

# $! in Git Bash is an MSYS process id; /proc knows the matching Windows one
windows_pid() {
  cat "/proc/$1/winpid" 2>/dev/null
}

listening_pids_windows() {
  local port=$1
  netstat -ano 2>/dev/null | tr -d '\r' |
    awk -v port=":$port" '$1 == "TCP" && $3 ~ /:0$/ && substr($2, length($2) - length(port) + 1) == port { print $5 }' |
    sort -u | grep -vx '0'
}

kill_windows_tree() {
  taskkill //PID "$1" //T //F >/dev/null 2>&1
}

# ---------- Stopping ----------

stop_recorded() {
  local name=$1 pidfile="$RUN_DIR/$1.pid" pid winpid
  [[ -f $pidfile ]] || return 0
  pid="$(tr -d '[:space:]' <"$pidfile")"
  rm -f "$pidfile"
  [[ $pid =~ ^[0-9]+$ ]] || return 0

  if ((WINDOWS == 1)); then
    winpid="$(windows_pid "$pid")"
    if [[ -n $winpid ]] && kill_windows_tree "$winpid"; then
      echo "Stopped the $name (process $winpid and its children)."
      STOPPED=$((STOPPED + 1))
    fi
    kill "$pid" 2>/dev/null
  elif kill -0 "$pid" 2>/dev/null; then
    # shellcheck disable=SC2207
    local tree=($(descendants "$pid") "$pid")
    terminate "${tree[@]}"
    echo "Stopped the $name (process $pid)."
    STOPPED=$((STOPPED + 1))
  fi
}

stop_port() {
  local label=$1 port=$2 pid pids
  if ((WINDOWS == 1)); then
    pids="$(listening_pids_windows "$port")"
    for pid in $pids; do
      if kill_windows_tree "$pid"; then
        echo "Stopped the $label on port $port (process $pid)."
        STOPPED=$((STOPPED + 1))
      fi
    done
  else
    pids="$(listening_pids_unix "$port")"
    if [[ -n $pids ]]; then
      # shellcheck disable=SC2086
      terminate $pids
      echo "Stopped the $label on port $port (process $(echo $pids | tr ' ' ','))."
      STOPPED=$((STOPPED + 1))
    fi
  fi
}

# Ask the local MongoDB to shut down cleanly before anything is killed: on Windows it would
# otherwise be killed outright and could lose its last writes. A failure only means the steps
# below do the stopping, as they always did.
stop_local_db() {
  local out
  [[ -f server/scripts/stop-local-db.js && -d server/node_modules ]] || return 0
  command -v node >/dev/null 2>&1 || return 0
  out="$(cd server && LOCAL_DB_PORT="$DB_PORT" node scripts/stop-local-db.js 2>/dev/null)" || true
  if [[ $out == Shut* ]]; then
    echo "$out"
    STOPPED=$((STOPPED + 1))
  fi
  return 0
}

stop_local_db
stop_recorded client
stop_recorded server

# The recorded processes are wrappers (pnpm, nodemon); whatever still holds a port goes too.
# The API comes before its database so it can close the connection first.
stop_port client "$CLIENT_PORT"
stop_port API "$API_PORT"
stop_port "local MongoDB" "$DB_PORT"

# A nodemon whose app was stopped keeps waiting for file changes. Only the one from this
# folder's server/ is stopped (other node tools, like a vite build, are left alone).
if ((WINDOWS == 0)) && command -v pgrep >/dev/null 2>&1; then
  pattern="$(printf '%s' "$ROOT" | sed 's/[][\\.*^$+?(){}|]/\\&/g')/server/node_modules/.*nodemon"
  leftovers="$(pgrep -f "$pattern" 2>/dev/null | grep -vx "$$")"
  if [[ -n $leftovers ]]; then
    # shellcheck disable=SC2086
    terminate $leftovers
    echo "Stopped a leftover nodemon (process $(echo $leftovers | tr ' ' ','))."
    STOPPED=$((STOPPED + 1))
  fi
elif ((WINDOWS == 1)) && command -v powershell.exe >/dev/null 2>&1; then
  # Backslashes like Windows writes them, and ' doubled for the PowerShell string
  backslash='\'
  quote="'"
  server_dir="$(pwd -W 2>/dev/null)/server/node_modules"
  server_dir="${server_dir//\//$backslash}"
  server_dir="${server_dir//$quote/$quote$quote}"
  leftovers="$(
    powershell.exe -NoProfile -NonInteractive -Command "
      \$dir = '$server_dir'.ToLower()
      Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" |
        Where-Object { \$_.CommandLine -and \$_.CommandLine.Replace('/', '\\').ToLower().Contains(\$dir) -and \$_.CommandLine -match 'nodemon' } |
        ForEach-Object { \$_.ProcessId }" 2>/dev/null | tr -d '\r'
  )"
  for pid in $leftovers; do
    if kill_windows_tree "$pid"; then
      echo "Stopped a leftover nodemon (process $pid)."
      STOPPED=$((STOPPED + 1))
    fi
  done
fi

rm -f "$RUN_DIR"/*.pid 2>/dev/null

if ((STOPPED == 0)); then
  echo "Nothing to stop: Drawisicle isn't running."
else
  echo "Drawisicle has stopped. Logs are kept in .run/."
fi
