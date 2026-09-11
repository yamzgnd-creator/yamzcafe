#!/usr/bin/env bash
#
# YAMZ Cafe — ONE-COMMAND deploy to an existing Hostinger VPS.
#
# Run this from YOUR OWN COMPUTER (not the VPS), from inside the
# frontend_v54 folder:
#
#     bash push-to-vps.sh
#
# It will: sync the code -> install -> build -> restart PM2 -> health check.
#
# ---------------------------------------------------------------------------
# FIRST-TIME SETUP (do this once)
# ---------------------------------------------------------------------------
# Create a file named .deploy.env next to this script:
#
#     VPS_HOST=123.45.67.89          # your Hostinger VPS IP or domain
#     VPS_USER=root                  # SSH user
#     VPS_PATH=/var/www/yamz-cafe/frontend_v54   # where the app lives on the VPS
#     VPS_PORT=22                    # SSH port (optional, defaults to 22)
#     APP_NAME=yamz-cafe             # PM2 process name (optional)
#
# .deploy.env is gitignored and never uploaded to the server.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Load config
# ---------------------------------------------------------------------------
if [ -f ".deploy.env" ]; then
  # shellcheck disable=SC1091
  set -a; source .deploy.env; set +a
fi

VPS_HOST="${VPS_HOST:-}"
VPS_USER="${VPS_USER:-root}"
VPS_PATH="${VPS_PATH:-/var/www/yamz-cafe/frontend_v54}"
VPS_PORT="${VPS_PORT:-22}"
APP_NAME="${APP_NAME:-yamz-cafe}"

if [ -z "$VPS_HOST" ]; then
  cat <<'MSG'
ERROR: VPS_HOST is not set.

Create a .deploy.env file next to this script containing:

    VPS_HOST=your.vps.ip.address
    VPS_USER=root
    VPS_PATH=/var/www/yamz-cafe/frontend_v54

...then run this script again.

Or pass it inline for a one-off run:

    VPS_HOST=1.2.3.4 VPS_PATH=/var/www/yamz-cafe/frontend_v54 bash push-to-vps.sh
MSG
  exit 1
fi

SSH_TARGET="${VPS_USER}@${VPS_HOST}"
SSH_OPTS=(-p "$VPS_PORT" -o StrictHostKeyChecking=accept-new)

echo "=============================================="
echo " Deploying to : ${SSH_TARGET}:${VPS_PATH}"
echo " PM2 process  : ${APP_NAME}"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# 0. Local sanity checks
# ---------------------------------------------------------------------------
if [ ! -f "server.cjs" ]; then
  echo "ERROR: server.cjs not found. Run this from inside the frontend_v54 folder."
  exit 1
fi

command -v rsync >/dev/null 2>&1 || {
  echo "ERROR: rsync is not installed on your computer."
  echo "  macOS:   brew install rsync   (or use the built-in one)"
  echo "  Ubuntu:  sudo apt install rsync"
  echo "  Windows: run this from WSL or Git Bash with rsync available"
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Verify we can reach the VPS and the target folder exists
# ---------------------------------------------------------------------------
echo "==> [1/5] Checking SSH connection..."
if ! ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "test -d '$VPS_PATH'"; then
  echo ""
  echo "ERROR: could not connect, or '$VPS_PATH' does not exist on the VPS."
  echo "       Check VPS_HOST / VPS_USER / VPS_PATH in .deploy.env."
  exit 1
fi

# The app must already have a .env on the server — we never overwrite it.
if ! ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "test -f '$VPS_PATH/.env'"; then
  echo ""
  echo "ERROR: $VPS_PATH/.env is missing on the VPS."
  echo "       The app cannot reach the database without it. Create it first."
  exit 1
fi
echo "    OK"

# ---------------------------------------------------------------------------
# 2. Sync the source code (never touching runtime data)
# ---------------------------------------------------------------------------
echo ""
echo "==> [2/5] Uploading code..."
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude='.env' \
  --exclude='.deploy.env' \
  --exclude='/public/uploads/***' \
  --exclude='uploads/' \
  --exclude='logs/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='dist.previous/' \
  --exclude='.git/' \
  --exclude='.mgx/' \
  ./ "${SSH_TARGET}:${VPS_PATH}/"
echo "    Upload complete"

# ---------------------------------------------------------------------------
# 3-5. Build and restart on the server
# ---------------------------------------------------------------------------
echo ""
echo "==> [3/5] Installing dependencies and building on the VPS..."

ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
  "APP_NAME='$APP_NAME' bash -s" <<'REMOTE' "$VPS_PATH"
set -euo pipefail

APP_PATH="$1"
APP_NAME="${APP_NAME:-yamz-cafe}"

cd "$APP_PATH"

export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.local/share/pnpm"
# pick up nvm-installed node if present
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true

command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm missing on VPS. Run: npm i -g pnpm"; exit 1; }
command -v pm2  >/dev/null 2>&1 || { echo "ERROR: pm2 missing on VPS. Run: npm i -g pm2";  exit 1; }

# Uploaded images live under public/uploads/<category>. These must exist and be
# writable by the Node process, otherwise uploads succeed in the UI but the
# files are never saved and the images render broken.
mkdir -p logs
mkdir -p public/uploads/menu public/uploads/students public/uploads/logos public/uploads/backgrounds

if [ ! -w public/uploads ]; then
  echo "WARNING: public/uploads is not writable by $(whoami) — image uploads will fail."
fi

# keep a rollback copy of the working build
if [ -d dist ]; then
  rm -rf dist.previous
  cp -r dist dist.previous
fi

pnpm install --prefer-offline

if ! pnpm run build; then
  echo ""
  echo "ERROR: build failed on the VPS. Live site left untouched."
  if [ -d dist.previous ]; then
    rm -rf dist
    mv dist.previous dist
    echo "       Previous build restored."
  fi
  exit 1
fi

echo ""
echo "==> [4/5] Restarting PM2..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save >/dev/null

echo ""
echo "==> [5/5] Health check..."
PORT_CHECK="${PORT:-3000}"
sleep 4
if curl -fsS "http://127.0.0.1:${PORT_CHECK}/api/config" >/dev/null 2>&1; then
  echo "    Server is responding on port ${PORT_CHECK}"
  rm -rf dist.previous
  pm2 status "$APP_NAME"
else
  echo "    WARNING: no response on port ${PORT_CHECK}"
  echo "    Recent logs:"
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  echo "    (dist.previous/ kept for rollback)"
  exit 1
fi
REMOTE

echo ""
echo "=============================================="
echo " DEPLOY SUCCESSFUL"
echo "=============================================="
echo ""
echo "Live now:"
echo "  - Auto-Subscribe tab in Parent Pre-Ordering"
echo "  - /api/meal-subscriptions endpoints"
echo "    (meal_subscriptions table auto-creates on first use)"
echo ""
echo "Useful follow-ups:"
echo "  ssh -p ${VPS_PORT} ${SSH_TARGET} 'pm2 logs ${APP_NAME} --lines 50'"
echo "  ssh -p ${VPS_PORT} ${SSH_TARGET} 'pm2 status'"