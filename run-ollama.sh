#!/usr/bin/env bash
# Runs Ollama on this computer for Drawsicle's art style matching, and publishes it to the
# deployed site through a Cloudflare Tunnel protected by Cloudflare Access (Zero Trust).
# Works on macOS/Linux and in Git Bash on Windows (Windows cmd: run-ollama.bat).
#
#   ./run-ollama.sh               start Ollama and the tunnel, download the models if missing
#   ./run-ollama.sh --background  the same, but download models in the background (Start-all uses this)
#   ./run-ollama.sh --no-pull     don't download models
#   ./run-ollama.sh --stop        stop the Ollama and tunnel this script started
#
# Settings: ollama.env next to this script (copy ollama.env.example), or the environment.
#   OLLAMA_VISION_MODEL      vision model that describes art     (default qwen2.5vl:3b)
#   OLLAMA_EMBED_MODEL       text embedding model                (default nomic-embed-text)
#   OLLAMA_PORT              port Ollama listens on, this computer only (default 11434)
#   CLOUDFLARE_TUNNEL_TOKEN  token of your Cloudflare Tunnel; leave empty to keep Ollama local
# The full set-up (tunnel, Access application, service token, server settings) is in docs/VISION.md.

set -u

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

MODE=start
PULL=foreground
for arg in "$@"; do
  case "$arg" in
    --background) PULL=background ;;
    --no-pull) PULL=none ;;
    --stop) MODE=stop ;;
    -h | --help)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

# ollama.env: KEY=VALUE lines; the environment wins over the file
if [[ -f ollama.env ]]; then
  while IFS='=' read -r key value; do
    key="$(echo "$key" | tr -d '[:space:]')"
    [[ -z $key || $key == \#* ]] && continue
    value="$(echo "$value" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')"
    [[ -z ${!key:-} ]] && export "$key=$value"
  done <ollama.env
fi

VISION_MODEL="${OLLAMA_VISION_MODEL:-qwen2.5vl:3b}"
EMBED_MODEL="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
PORT="${OLLAMA_PORT:-11434}"
LOCAL_URL="http://127.0.0.1:$PORT"

stop_pidfile() {
  local name=$1 file="$RUN_DIR/$1.pid" pid winpid
  [[ -f $file ]] || return 0
  pid="$(tr -d '[:space:]' <"$file")"
  rm -f "$file"
  [[ $pid =~ ^[0-9]+$ ]] || return 0
  winpid="$(cat "/proc/$pid/winpid" 2>/dev/null)"
  if [[ -n $winpid ]]; then
    taskkill //PID "$winpid" //T //F >/dev/null 2>&1 && echo "Stopped $name."
  elif kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null && echo "Stopped $name."
  fi
}

if [[ $MODE == stop ]]; then
  stop_pidfile cloudflared
  stop_pidfile ollama
  exit 0
fi

up() {
  if command -v curl >/dev/null 2>&1; then
    curl -fs -o /dev/null --max-time 3 "$LOCAL_URL/api/tags"
  else
    node -e "fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" "$LOCAL_URL/api/tags" 2>/dev/null
  fi
}

# ---------- Ollama ----------

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama isn't installed, so art style matching uses colours and texture only."
  echo "  To add the vision model: install Ollama from https://ollama.com/download, then run ./run-ollama.sh"
  exit 0
fi

if up; then
  echo "Ollama is already running on $LOCAL_URL."
else
  echo "Starting Ollama on $LOCAL_URL (this computer only) ..."
  (
    # Only this computer can reach it directly; the tunnel is the way in from outside
    export OLLAMA_HOST="127.0.0.1:$PORT"
    nohup ollama serve >"$RUN_DIR/ollama.log" 2>&1 </dev/null &
    echo $! >"$RUN_DIR/ollama.pid"
  )
  for _ in $(seq 1 30); do
    up && break
    sleep 1
  done
  up || { echo "Ollama didn't start. See .run/ollama.log" >&2; exit 1; }
fi

# ---------- Models ----------

have_model() {
  OLLAMA_HOST="127.0.0.1:$PORT" ollama list 2>/dev/null | awk 'NR > 1 { print $1 }' | grep -qE "^$1(:latest)?$"
}

pull() {
  local model=$1
  if have_model "$model"; then
    echo "Model $model is ready."
    return
  fi
  case $PULL in
    none) echo "Model $model is missing (run without --no-pull to download it)." ;;
    background)
      echo "Downloading $model in the background (see .run/ollama-pull.log). Style tags start working when it's done."
      (OLLAMA_HOST="127.0.0.1:$PORT" nohup ollama pull "$model" >>"$RUN_DIR/ollama-pull.log" 2>&1 </dev/null &)
      ;;
    *)
      echo "Downloading $model (a few GB the first time) ..."
      OLLAMA_HOST="127.0.0.1:$PORT" ollama pull "$model" || echo "Downloading $model failed; try again later." >&2
      ;;
  esac
}

pull "$VISION_MODEL"
pull "$EMBED_MODEL"

# ---------- Cloudflare Tunnel (Zero Trust) ----------

if [[ -z ${CLOUDFLARE_TUNNEL_TOKEN:-} ]]; then
  echo ""
  echo "Ollama is only reachable from this computer. For local development put this in server/.env:"
  echo "  OLLAMA_URL=$LOCAL_URL"
  echo "To let the deployed site use it, set CLOUDFLARE_TUNNEL_TOKEN in ollama.env (see docs/VISION.md)."
  exit 0
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared isn't installed, so the tunnel can't start." >&2
  echo "  Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

if [[ -f $RUN_DIR/cloudflared.pid ]] && kill -0 "$(cat "$RUN_DIR/cloudflared.pid")" 2>/dev/null; then
  echo "The Cloudflare Tunnel is already running."
else
  echo "Starting the Cloudflare Tunnel ..."
  (
    # The token is passed through the environment so it doesn't show up in the process list
    export TUNNEL_TOKEN="$CLOUDFLARE_TUNNEL_TOKEN"
    nohup cloudflared tunnel --no-autoupdate run >"$RUN_DIR/cloudflared.log" 2>&1 </dev/null &
    echo $! >"$RUN_DIR/cloudflared.pid"
  )
  sleep 3
  if grep -qiE 'Registered tunnel connection|Connection .* registered' "$RUN_DIR/cloudflared.log" 2>/dev/null; then
    echo "The tunnel is connected."
  else
    echo "The tunnel is starting; check .run/cloudflared.log if the site can't reach Ollama."
  fi
fi

echo ""
echo "Ollama is published through your tunnel. The site's server needs (Vercel environment variables):"
echo "  OLLAMA_URL=https://<the tunnel's public hostname>"
echo "  CF_ACCESS_CLIENT_ID=<service token id>   CF_ACCESS_CLIENT_SECRET=<service token secret>"
echo "Stop with ./run-ollama.sh --stop (Stop-all.sh does this too)."
