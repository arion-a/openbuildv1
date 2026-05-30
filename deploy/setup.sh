#!/bin/bash
set -euo pipefail

echo "=== OpenBuild AWS Setup ==="
echo "Run this on a fresh Ubuntu 24.04 t3.large instance"
echo ""

# System packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Create openbuild user
sudo useradd -r -m -d /opt/openbuild -s /bin/bash openbuild
sudo usermod -aG docker openbuild

# Install opencode
curl -fsSL https://opencode.ai/install | sudo bash

# Clone the repo (or copy files)
echo ""
echo "Next steps:"
echo "1. Copy project files to /opt/openbuild/"
echo "2. Copy .env.example to /opt/openbuild/.env and fill in values"
echo "3. Copy firebase-adminsdk.json to /opt/openbuild/"
echo "4. Run: cd /opt/openbuild/deploy && docker compose up -d"
echo "5. Wait 30s, then setup Gitea admin (see init-gitea.sh)"
echo "6. Build the app: cd /opt/openbuild && npm install && npm run build"
echo "7. Build frontend: cd apps/web && npm run build"
echo "8. Install service: sudo cp deploy/openbuild-api.service /etc/systemd/system/"
echo "9. Start: sudo systemctl enable --now openbuild-api"
echo ""
echo "Cloudflare Tunnel routes (set in Zero Trust dashboard):"
echo "  yourdomain.com   -> http://localhost:41935"
echo "  *.yourdomain.com -> http://localhost:41935"
