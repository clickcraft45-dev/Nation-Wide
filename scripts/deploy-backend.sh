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
tar -xzf /tmp/nw-deploy.tar.gz -C "$REMOTE_DIR"
rm -f /tmp/nw-deploy.tar.gz
cd "$REMOTE_DIR"

if [ ! -f backend/.env ]; then
  echo "backend/.env is missing on the host — compose will not start without it." >&2
  exit 1
fi

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
