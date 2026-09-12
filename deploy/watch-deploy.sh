#!/bin/bash
# Vérifie s'il y a du nouveau code sur GitHub pour SkateHangar, et si
# oui, met à jour et reconstruit le conteneur Docker automatiquement.
#
# Prévu pour être lancé périodiquement via cron sur le Mac mini
# (voir README.md, section "Déploiement automatique").
#
# Important : on compare la remote à un fichier marqueur (.last_deployed),
# pas à HEAD local. Si HEAD local est mis à jour par un `git pull` fait à
# la main en dehors de ce script (donc sans jamais reconstruire l'image
# Docker), une comparaison HEAD-vs-remote croirait à tort que tout est
# déjà déployé et ne reconstruirait jamais l'image.

set -euo pipefail

REPO_DIR="$HOME/SkateHangar"
LOG_FILE="$REPO_DIR/deploy/watch-deploy.log"
MARKER_FILE="$REPO_DIR/deploy/.last_deployed"

cd "$REPO_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Vérification des mises à jour..." >> "$LOG_FILE"

git fetch origin master >> "$LOG_FILE" 2>&1

REMOTE=$(git rev-parse origin/master)
DEPLOYED=$(cat "$MARKER_FILE" 2>/dev/null || echo "")

if [ "$DEPLOYED" != "$REMOTE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Nouveau commit détecté ($DEPLOYED -> $REMOTE), déploiement..." >> "$LOG_FILE"
  git reset --hard origin/master >> "$LOG_FILE" 2>&1
  docker-compose up -d --build >> "$LOG_FILE" 2>&1
  echo "$REMOTE" > "$MARKER_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Déploiement terminé (marqueur mis à jour)." >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rien de nouveau." >> "$LOG_FILE"
fi
