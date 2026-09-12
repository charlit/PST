#!/bin/bash
# Vérifie s'il y a du nouveau code sur GitHub pour SkateHangar, et si
# oui, met à jour et reconstruit le conteneur Docker automatiquement.
#
# Prévu pour être lancé périodiquement via cron sur le Mac mini
# (voir README.md, section "Déploiement automatique").

set -euo pipefail

REPO_DIR="$HOME/SkateHangar"
LOG_FILE="$REPO_DIR/deploy/watch-deploy.log"

cd "$REPO_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Vérification des mises à jour..." >> "$LOG_FILE"

git fetch origin master >> "$LOG_FILE" 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Nouveau commit détecté ($LOCAL -> $REMOTE), déploiement..." >> "$LOG_FILE"
  git pull origin master >> "$LOG_FILE" 2>&1
  docker-compose up -d --build >> "$LOG_FILE" 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Déploiement terminé." >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rien de nouveau." >> "$LOG_FILE"
fi
