#!/usr/bin/env bash
#
# YAMZ Cafe — update an EXISTING Hostinger VPS deployment.
#
# Assumes the VPS is already set up (Node.js, pnpm, PM2, Nginx all installed
# and the app has been deployed at least once).
#
# Usage on the VPS:
#   cd /var/www/yamz-cafe/frontend_v54
#   bash deploy-update.sh
#
# It preserves .env, public/uploads/ and logs/ — it only rebuilds and restarts.

set -euo pipefail

APP_NAME="yamz-cafe"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$APP_DIR"

echo "==> App directory: $APP_DIR"

# ---------------------------------------------------------------------------
# 1. Safety checks
# ---------------------------------------------------------------------------
if [ ! -f "server.cjs" ]; then
  echo "ERROR: server.cjs not found in $APP_DIR."
  echo "       Run this script from inside the frontend_v54 folder."
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "ERROR: .env is missing. The app cannot connect to the database without it."
  echo "       Create it first (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET)."
  exit 1
fi

command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not installed. Run: npm install -g pnpm"; exit 1; }
command -v pm2  >/dev/null 2>&1 || { echo "ERROR: pm2 not installed. Run: npm install -g pm2";  exit 1; }

# Uploaded images live under public/uploads/<category>. These must exist and be
# writable by the Node process, otherwise uploads appear to succeed in the UI but
# the files are never saved and the images render broken.
mkdir -p logs
mkdir -p public/uploads/menu public/uploads/students public/uploads/logos public/uploads/backgrounds

if [ ! -w public/uploads ]; then
  echo "WARNING: public/uploads is not writable by $(whoami) — image uploads will fail."
fi

# ---------------------------------------------------------------------------
# 2. Back up the current build so we can roll back if something breaks
# ---------------------------------------------------------------------------
if [ -d "dist" ]; then
  rm -rf dist.previous
  cp -r dist dist.previous
  echo "==> Previous build backed up to dist.previous/"
fi

# ---------------------------------------------------------------------------
# 3. Install dependencies and build
# ---------------------------------------------------------------------------
echo "==> Installing dependencies..."
pnpm install

echo "==> Building frontend..."
if ! pnpm run build; then
  echo ""
  echo "ERROR: Build failed. The live site is untouched and still running."
  if [ -d "dist.previous" ]; then
    rm -rf dist
    mv dist.previous dist
    echo "       Previous build restored."
  fi
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Restart under PM2
# ---------------------------------------------------------------------------
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "==> Restarting $APP_NAME..."
  pm2 restart "$APP_NAME" --update-env
else
  echo "==> $APP_NAME not running under PM2 yet, starting it..."
  pm2 start ecosystem.config.cjs --env production
fi

pm2 save

# ---------------------------------------------------------------------------
# 5. Health check
# ---------------------------------------------------------------------------
PORT="${PORT:-3000}"
echo "==> Waiting for the server to come up on port $PORT..."
sleep 4

if curl -fsS "http://127.0.0.1:${PORT}/api/config" >/dev/null 2>&1; then
  echo ""
  echo "SUCCESS: $APP_NAME is up and responding on port $PORT."
  rm -rf dist.previous
else
  echo ""
  echo "WARNING: the server did not respond on port $PORT."
  echo "         Check the logs with:  pm2 logs $APP_NAME --lines 60"
  echo "         (dist.previous/ was kept so you can roll back if needed.)"
  exit 1
fi

echo ""
pm2 status "$APP_NAME"
echo ""
echo "Done. New features in this release:"
echo "  - Meal Auto-Subscribe tab in the Parent Pre-Ordering page"
echo "  - /api/meal-subscriptions endpoints (meal_subscriptions table"
echo "    is created automatically on first request)"