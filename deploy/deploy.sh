#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/openbuild"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Building OpenBuild ==="

# Build API
echo "[1/3] Building API..."
cd "$REPO_DIR/apps/api"
npm install --production=false
npx tsc

# Build Web
echo "[2/3] Building frontend..."
cd "$REPO_DIR/apps/web"
npm install --production=false
npm run build

# Deploy
echo "[3/3] Deploying to $DEPLOY_DIR..."
sudo mkdir -p "$DEPLOY_DIR/sessions"
sudo chown -R openbuild:openbuild "$DEPLOY_DIR"

# Copy built files
sudo rsync -a --delete "$REPO_DIR/apps/api/dist/" "$DEPLOY_DIR/apps/api/dist/"
sudo rsync -a --delete "$REPO_DIR/apps/api/node_modules/" "$DEPLOY_DIR/apps/api/node_modules/"
sudo rsync -a "$REPO_DIR/apps/api/package.json" "$DEPLOY_DIR/apps/api/"
sudo rsync -a --delete "$REPO_DIR/apps/api/src/db/" "$DEPLOY_DIR/apps/api/src/db/"
sudo rsync -a --delete "$REPO_DIR/apps/web/dist/" "$DEPLOY_DIR/apps/web/dist/"
sudo rsync -a --delete "$REPO_DIR/deploy/" "$DEPLOY_DIR/deploy/"

# Install systemd service
sudo cp "$DEPLOY_DIR/deploy/openbuild-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart openbuild-api

echo ""
echo "=== Deploy complete ==="
echo "Check status: sudo systemctl status openbuild-api"
echo "View logs: sudo journalctl -u openbuild-api -f"
