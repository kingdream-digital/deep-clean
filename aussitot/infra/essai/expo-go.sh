#!/usr/bin/env bash
# Ouvre Aussitôt dans Expo Go sur un téléphone, comme Deep Clean : à lancer
# sur le serveur, dans une session tmux (pour qu'il reste allumé après la
# déconnexion SSH), depuis une copie du dépôt sur la branche d'Aussitôt.
#
#   tmux new -s aussitot
#   bash ~/aussitot-essai/aussitot/infra/essai/expo-go.sh http://api-aussitot.141.253.112.12.sslip.io
#
# Puis scanner le QR code : application Expo Go (Android) ou appareil photo (iPhone).
# Version installable de développement (dictée vocale) : DEV_CLIENT=1 bash …/expo-go.sh <adresse>
# Guide complet : docs/TESTER-SUR-TELEPHONE.md
set -euo pipefail

API_URL="${1:-${EXPO_PUBLIC_API_URL:-}}"
if [ -z "$API_URL" ]; then
  echo "Indiquez l'adresse de l'API d'essai, par exemple :"
  echo "  bash $0 http://api-aussitot.141.253.112.12.sslip.io"
  exit 1
fi
API_URL="${API_URL%/}"
# 8081 est déjà utilisé par le serveur Expo de Deep Clean.
PORT="${PORT:-8082}"

cd "$(dirname "$0")/../.."   # dossier aussitot/

echo "→ Mise à jour du code"
git pull --ff-only || echo "  (mise à jour impossible : on continue avec le code présent)"

# Dépendances réinstallées seulement si elles ont changé.
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -f node_modules/.aussitot-lock ] || [ "$(cat node_modules/.aussitot-lock)" != "$LOCK_HASH" ]; then
  echo "→ Installation des dépendances de l'application (quelques minutes la première fois)"
  npm ci -w @aussitot/app -w @aussitot/shared --include-workspace-root --no-audit --no-fund
  echo "$LOCK_HASH" > node_modules/.aussitot-lock
fi

echo "→ Vérification de l'API : $API_URL/ready"
if curl -fsS --max-time 10 "$API_URL/ready"; then
  echo
else
  echo "  Attention : l'API ne répond pas. Vérifiez le déploiement dans Coolify (statut « Running »)."
fi

cd apps/app
MODE=()
if [ "${DEV_CLIENT:-0}" = "1" ]; then MODE=(--dev-client); fi
echo "→ Démarrage d'Expo (port $PORT, tunnel) : scannez le QR code qui va s'afficher."
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start --tunnel --port "$PORT" --clear ${MODE[@]+"${MODE[@]}"}
