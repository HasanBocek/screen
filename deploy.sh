#!/usr/bin/env bash
# Rebuild share-screen and hot-swap the systemd service.
# Usage: ~/share-screen/deploy.sh   (prompts for sudo password for the restart)
set -euo pipefail
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22 >/dev/null
cd "$(dirname "$0")"
npm run build
if [ -n "${SUDO_PASSWORD:-}" ]; then
  echo "$SUDO_PASSWORD" | sudo -S systemctl restart share-screen
else
  sudo systemctl restart share-screen
fi
sleep 1
systemctl is-active share-screen
curl -sf http://localhost:4100/health && echo " — deployed OK"
