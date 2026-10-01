#!/usr/bin/env bash
#
# Ship the backend to the EC2 host and prove it came back up.
#
#   ./scripts/deploy-backend.sh 3.110.135.118
#   ./scripts/deploy-backend.sh 3.110.135.118 --dry-run
#
# What it does, in order: archive the current commit, copy it up, rebuild the backend image,
# restart it, then poll /health until it answers or the timeout is hit. A failed health check
# exits non-zero and prints the container logs, because a deploy that "finished" while the
# service is down is the failure this script exists to catch.
#
# `git archive HEAD` rather than scp'ing the working directory: it copies exactly the committed
# tree, so the box can never receive a half-saved local edit, and it excludes node_modules and
# .next for free (they are gitignored). Anything uncommitted is refused below.

set -euo pipefail

HOST="${1:-}"
DRY_RUN="${2:-}"
KEY="$(dirname "$0")/../Nationwide.pem"
USER="ec2-user"
REMOTE_DIR="/home/ec2-user/Nation-Wide"
HEALTH_PATH="/api/v1/health"
HEALTH_TIMEOUT_SECONDS=120

if [ -z "$HOST" ]; then
  echo "usage: $0 <ec2-host-or-ip> [--dry-run]" >&2
  exit 2
fi

if [ ! -f "$KEY" ]; then
  echo "Key not found at $KEY" >&2
  exit 2
fi

# OpenSSH refuses a key that is group/world readable. On Windows checkouts this is the single
# most common reason a deploy stops before it starts.
chmod 600 "$KEY" 2>/dev/null || true

# A deploy must correspond to a commit, or there is no way to say what is running in production.
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit or stash first — this deploys the committed tree, so" >&2
  echo "uncommitted changes would NOT be shipped and the box would silently lag your editor." >&2
  git status --short >&2
  exit 1
fi

COMMIT="$(git rev-parse --short HEAD)"
ARCHIVE="$(mktemp -t nw-deploy-XXXXXX).tar.gz"
trap 'rm -f "$ARCHIVE"' EXIT

echo "==> Packaging $COMMIT"
git archive --format=tar.gz -o "$ARCHIVE" HEAD

SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new $USER@$HOST"

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "==> Dry run. Would copy $(du -h "$ARCHIVE" | cut -f1) to $USER@$HOST:$REMOTE_DIR and rebuild."
  exit 0
fi

echo "==> Copying to $HOST"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$ARCHIVE" "$USER@$HOST:/tmp/nw-deploy.tar.gz"

echo "==> Extracting and rebuilding"
# backend/.env is NOT in the archive (gitignored) and must not be — it lives only on the box.
# Extracting over the top therefore leaves it untouched, which is why this is not a clean wipe.
$SSH bash -s <<REMOTE
set -euo pipefail
mkdir -p "$REMOTE_DIR"
cd "$REMOTE_DIR"

# Untarring over the top updates and adds, but never REMOVES. A source file deleted in this
# commit would otherwise linger on the box forever and still be compiled into the image — which
# is how a deleted controller keeps serving a route nobody can find in the repo. These three
# trees are pure source, fully contained in the archive, and hold nothing generated or secret
# (backend/.env is not under src/, node_modules is not either), so clearing them first makes the
# extraction authoritative.
rm -rf backend/src packages/shared-types/src frontend/app frontend/components

tar -xzf /tmp/nw-deploy.tar.gz -C "$REMOTE_DIR"
rm -f /tmp/nw-deploy.tar.gz

if [ ! -f backend/.env ]; then
  echo "backend/.env is missing on the host — compose will not start without it." >&2
  exit 1
fi

# Apply this commit's migrations BEFORE the new code starts.
#
# Without this the new build queries columns the database does not have yet, Prisma raises P2022,
# and every route touching the changed table 500s — while /health, which touches none of them,
# cheerfully reports the deploy a success. That is exactly the "finished while the service is
# down" failure the health check below was written to catch, and it walks straight past it.
#
# migrate deploy only applies pending migrations and never resets or generates, so re-running it
# on an up-to-date database is a no-op. It runs in the `build` stage image because the prisma CLI
# is a devDependency and so is absent from the runtime image; that stage is already built and
# cached by the compose build below.
echo "==> Applying migrations"
docker build -q -f backend/Dockerfile --target build -t nw-migrate .

# Two things this has to get right, both of which fail confusingly:
#
# 1. docker's --env-file does NOT strip surrounding quotes, so a .env holding
#    DATABASE_URL="postgres://..." reaches Prisma starting with a double quote and it rejects the
#    protocol. Hence the sed. Passing -e DATABASE_URL=... instead would put the database password
#    in the host's process list for anyone running ps, which is why this goes through a file.
# 2. The container must join the COMPOSE network. On the default bridge it reaches Postgres from
#    a different subnet than the backend does and pg_hba rejects it with P1010 — a permission
#    error that reads like bad credentials rather than the wrong source address.
umask 077
MIGRATE_ENV=/tmp/nw-migrate.env
sed -nE 's/^(DATABASE_URL|DIRECT_URL)=["'"'"']?(.*[^"'"'"'])["'"'"']?$/\1=\2/p' \
  backend/.env > "\$MIGRATE_ENV"
NETWORK="\$(docker inspect -f '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}{{end}}' \
  nation-wide-backend-1 2>/dev/null || echo nation-wide_default)"
trap 'rm -f "\$MIGRATE_ENV"' EXIT
docker run --rm --env-file "\$MIGRATE_ENV" \
  --network "\$NETWORK" --add-host=host.docker.internal:host-gateway \
  nw-migrate npx prisma migrate deploy --schema backend/prisma/schema.prisma

# --build is the whole point: the fix for rate cards and invoices is a new COPY line in the
# Dockerfile, and a plain restart reuses the old image and changes nothing.
docker compose up -d --build backend
REMOTE

echo "==> Waiting for health (up to ${HEALTH_TIMEOUT_SECONDS}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until $SSH "curl -fsS http://127.0.0.1:4000${HEALTH_PATH} >/dev/null 2>&1"; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "!! Backend did not become healthy. Last 60 log lines:" >&2
    $SSH "cd $REMOTE_DIR && docker compose logs --tail=60 backend" >&2
    exit 1
  fi
  sleep 3
done

echo "==> Deployed $COMMIT and healthy."
echo "    Next: run ./scripts/smoke-test.sh $HOST to exercise the PDF and mail paths."
