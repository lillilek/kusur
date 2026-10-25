#!/usr/bin/env sh
# Run from any directory AFTER pulling the intended release into this checkout.
set -eu
cd "$(dirname "$0")"
test -f .env || { echo 'Create deploy/.env using .env.example first'; exit 1; }
docker compose build web
docker compose up -d --wait elasticsearch
# Reindexing replaces this corpus only and briefly interrupts search.
docker compose stop web
docker compose run --rm indexer
docker compose up -d --wait web
echo 'Tsakorpus is ready at http://127.0.0.1:7342/search'
echo 'For public HTTPS: docker compose --profile public up -d proxy'
