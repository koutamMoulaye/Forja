#!/bin/sh
# Forja: installation in one command (macOS, Linux).
#
#   ./install.sh                 build, create the administrator, start, open the browser
#   ./install.sh --demo          ... and load the demo project
#   ./install.sh --ollama        ... with an Ollama container (several GB more)
#   ./install.sh --no-browser    do not open the browser
#   ./install.sh --keep-build-cache   keep Docker's build cache after the build
#
# Needs Docker with the compose plugin. Data stays in Docker volumes (forja_forja-data,
# forja_forja-secrets): `docker compose down` keeps them, `docker compose down -v`
# deletes them.
set -eu

cd "$(dirname "$0")"

DEMO=""
PROFILE=""
BROWSER=1
KEEP_CACHE=0
for arg in "$@"; do
  case "$arg" in
    --demo) DEMO="--demo" ;;
    --ollama) PROFILE="--profile ollama" ;;
    --no-browser) BROWSER=0 ;;
    --keep-build-cache) KEEP_CACHE=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

PORT="${FORJA_WEB_PORT:-3000}"
NEEDED_GB=4
[ -n "$PROFILE" ] && NEEDED_GB=12

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nErreur : %s\n' "$1" >&2; exit 1; }

say "Prérequis"
command -v docker >/dev/null 2>&1 || fail "Docker est introuvable : installez Docker Desktop ou Docker Engine."
docker info >/dev/null 2>&1 || fail "Docker ne répond pas : démarrez Docker puis relancez."
docker compose version >/dev/null 2>&1 || fail "le plugin docker compose (v2) est requis."
echo "Docker $(docker version --format '{{.Server.Version}}'), $(docker compose version --short)"

FREE_KB=$(df -Pk . | awk 'NR==2 {print $4}')
FREE_GB=$((FREE_KB / 1024 / 1024))
echo "Espace libre : ${FREE_GB} Go (au moins ${NEEDED_GB} Go nécessaires)"
[ "$FREE_GB" -ge "$NEEDED_GB" ] || fail "pas assez d'espace disque pour construire les images."
if [ -n "$PROFILE" ]; then
  echo "Profil ollama : l'image Ollama pèse environ 4 Go, chaque modèle plusieurs Go de plus."
fi

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  if ! docker compose ps --status running web 2>/dev/null | grep -q web; then
    fail "le port $PORT est déjà utilisé : FORJA_WEB_PORT=3001 ./install.sh"
  fi
fi

if [ -n "$PROFILE" ]; then
  # Kept in .env, so that a later `docker compose up -d` starts the same services.
  touch .env
  grep -q '^COMPOSE_PROFILES=' .env || echo 'COMPOSE_PROFILES=ollama' >> .env
  grep -q '^FORJA_OLLAMA_URL=' .env || echo 'FORJA_OLLAMA_URL=http://ollama:11434' >> .env
  export FORJA_OLLAMA_URL=http://ollama:11434
fi

say "Construction des images"
docker compose build
# Former Forja images left without a tag, then the build cache (intermediate layers),
# not needed once the images exist; --keep-build-cache keeps the latter.
docker image prune -f --filter dangling=true \
  --filter "label=org.opencontainers.image.source=https://github.com/koutamMoulaye/Forja" >/dev/null
if [ "$KEEP_CACHE" -eq 0 ]; then
  echo "Suppression du cache de construction Docker (--keep-build-cache pour le garder)"
  docker builder prune -f >/dev/null
fi

say "Premier démarrage"
# shellcheck disable=SC2086
docker compose run --rm --no-deps api forja init $DEMO

say "Démarrage"
# shellcheck disable=SC2086
docker compose $PROFILE up -d
URL="http://localhost:$PORT"
printf 'Attente de %s ' "$URL"
i=0
until curl -fsS "$URL/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 90 ] || fail "Forja ne répond pas : docker compose logs"
  printf '.'
  sleep 2
done
echo " prêt."

if [ "$BROWSER" -eq 1 ]; then
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  fi
fi
if [ -n "$PROFILE" ]; then
  echo "Modèle local : docker compose exec ollama ollama pull qwen3.5:9b (environ 6 Go),"
  echo "puis Réglages > Fournisseur IA > Ollama."
fi
say "Forja tourne sur $URL (arrêt : docker compose down)"
