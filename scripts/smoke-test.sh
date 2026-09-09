#!/usr/bin/env bash
#
# Post-deploy checks against the live EC2 backend.
#
#   ./scripts/smoke-test.sh 3.110.135.118
#
# Each check prints PASS/FAIL/WARN and the script exits non-zero if anything FAILed, so it can be
# the last line of a deploy without anyone having to read the output.
#
# Deliberately runs INSIDE the container for the font check. The rate-card and invoice outage was
# a packaging bug — the files existed in the repo and were absent from the image — so a check run
# anywhere else would have passed throughout the entire outage.

set -uo pipefail

HOST="${1:-}"
KEY="$(dirname "$0")/../Nationwide.pem"
USER="ec2-user"
REMOTE_DIR="/home/ec2-user/Nation-Wide"

if [ -z "$HOST" ]; then
  echo "usage: $0 <ec2-host-or-ip>" >&2
  exit 2
fi

chmod 600 "$KEY" 2>/dev/null || true
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new $USER@$HOST"
failures=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; failures=$((failures + 1)); }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; }

echo "Smoke testing $HOST"

# 1. The service is up at all.
if $SSH "curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1"; then
  pass "backend answers /api/v1/health"
else
  fail "backend is not answering /api/v1/health"
fi

# 2. The PDF fonts are in the image. This is the direct check on the rate-card/invoice fix:
#    @react-pdf/renderer reads a registered font at render time and throws ENOENT if it is gone,
#    which is what made every rate card and every GST invoice 500 in the container.
if $SSH "cd $REMOTE_DIR && docker compose exec -T backend ls assets/fonts/NotoSans-Regular.ttf assets/fonts/NotoSans-Bold.ttf >/dev/null 2>&1"; then
  pass "NotoSans fonts present in the container (rate cards + invoices can render)"
else
  fail "NotoSans fonts MISSING in the container — rate cards and invoices will 500. Image was not rebuilt after the Dockerfile fix; run deploy-backend.sh again."
fi

# 3. Storage. Both rate cards and invoices are written to S3 after rendering.
if $SSH "cd $REMOTE_DIR && docker compose exec -T backend printenv S3_BUCKET_NAME >/dev/null 2>&1"; then
  pass "S3_BUCKET_NAME is set"
else
  fail "S3_BUCKET_NAME is unset — generated PDFs cannot be stored"
fi

# 4. Mail. A WARN, not a FAIL: the app runs fine without it, but partner onboarding silently
#    breaks, and the generated password is unrecoverable once the send is skipped.
if $SSH "cd $REMOTE_DIR && docker compose exec -T backend printenv BREVO_API_KEY >/dev/null 2>&1"; then
  pass "BREVO_API_KEY is set (partner credential emails will send)"
else
  warn "BREVO_API_KEY is NOT set — creating a pickup partner will appear to succeed but never email their password, and that password cannot be recovered. Set it before onboarding anyone."
fi

# 5. Nothing crash-looping. A container that restarts every 30s can still answer one health probe.
restarts=$($SSH "cd $REMOTE_DIR && docker compose ps --format '{{.Name}} {{.Status}}' 2>/dev/null | grep backend" 2>/dev/null || true)
if echo "$restarts" | grep -qi "restarting"; then
  fail "backend container is restarting: $restarts"
else
  pass "backend container is stable: ${restarts:-unknown}"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed."
  exit 1
fi
echo "All checks passed."
