#!/bin/sh
# Starts BOTH the connector (with auto-restart) and the dashboard inside one container.
# The dashboard reaches the connector at localhost:4050 (same container), and they share
# /app/dashboard/data (the live state + KB).
set -e
cd /app

DATA=/app/dashboard/data
mkdir -p "$DATA"

# 1) (re)seed the STATIC knowledge base into the data dir. Safe over a persisted volume:
#    KB files are read-only knowledge, refreshed from the image; live files are never touched.
if [ -d /app/seed-kb ]; then
  cp -f /app/seed-kb/*.json "$DATA"/ 2>/dev/null || true
fi

# 2) sanity: a token is required to go live
if [ -z "$TELEGRAM_BOT_TOKEN" ] && ! grep -q '^TELEGRAM_BOT_TOKEN=.\+' /app/.env 2>/dev/null; then
  echo "[entrypoint] WARNING: TELEGRAM_BOT_TOKEN is empty — the connector will idle until you set it in .env"
fi

# 3) connector with auto-restart, in the background (writes its own status/log files)
(
  while true; do
    echo "[entrypoint] starting connector: node core/run-live.ts"
    node core/run-live.ts >> "$DATA/connector.log" 2>&1 || true
    echo "[entrypoint] connector exited — restarting in 3s"
    sleep 3
  done
) &

# 4) dashboard in the foreground (keeps the container alive; Docker restart policy covers crashes)
cd /app/dashboard
echo "[entrypoint] starting dashboard on :3939"
exec npm run start
