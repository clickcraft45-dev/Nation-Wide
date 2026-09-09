# Deployment

Two halves, deployed two different ways.

| Part | Runs on | How it deploys |
|---|---|---|
| Frontend | Cloudflare Workers | Automatic — GitHub Actions on push to the `frontend` branch |
| Backend | EC2 (Docker Compose) | Manual — `scripts/deploy-backend.sh` |

PostgreSQL runs **directly on the EC2 host**, not in a container. Redis runs in Compose. See
`docker-compose.yml` for why.

---

## Backend → EC2

```bash
# From the repo root, on the sujith-v1.0 branch, with everything committed.
./scripts/deploy-backend.sh <ec2-host-or-ip>
./scripts/smoke-test.sh     <ec2-host-or-ip>
```

The deploy script archives the **committed** tree (`git archive HEAD`), copies it up, runs
`docker compose up -d --build backend`, and polls `/api/v1/health` until it answers. It refuses to
run with a dirty working tree, because otherwise the box silently lags your editor and there is no
way to say which code is in production.

`--build` is not optional. Several fixes live in the `Dockerfile` itself, and a plain
`docker compose restart` reuses the existing image and changes nothing.

### What is not shipped

`backend/.env` is gitignored, so it is **not** in the archive and is never overwritten. It lives
only on the host. A new environment variable therefore has to be added there by hand — deploying
will not carry it up.

---

## Frontend → Cloudflare

```bash
npm run ship -- "what changed"
```

This commits, pushes `sujith-v1.0`, and fast-forwards the `frontend` and `backend` branches to the
same commit. The push to `frontend` triggers `.github/workflows/frontend-deploy.yml`.

Pushing the `backend` branch deploys nothing on its own — it is a marker of what *should* be on the
box. The EC2 deploy is still the manual step above.

`NEXT_PUBLIC_*` values are inlined into the client bundle at **build** time. Changing one requires a
rebuild; a redeploy alone will not pick it up.

---

## Database migrations

```bash
cd backend && npx prisma migrate deploy
```

Only needed when `backend/prisma/migrations/` gained a directory. Run it against the host's
Postgres **before** the new image starts serving, so the running code never sees a schema it
predates.

---

## Environment variables that break things quietly

These do not stop the app booting. They fail later, in ways that look like application bugs.

| Variable | Missing means |
|---|---|
| `S3_BUCKET_NAME` | Rate cards and invoices render, then fail to store. Both are statutory records. |
| `BREVO_API_KEY` | Creating a pickup partner appears to succeed but never emails their password — **and that password is unrecoverable**. `MailService.send` returns `false` rather than throwing, by design, so nothing surfaces but a log line. |
| `PUBLIC_FRONTEND_URL` | Password-reset and partner-login links point at whatever `FRONTEND_URL` happens to list first, which may be `localhost`. Also the email header logo. |
| `DATABASE_URL` | Fails loudly at boot. The good case. |

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are deliberately **not** read anywhere. On EC2 the SDK
picks up the instance IAM role. See `StorageService`.

---

## Verifying a deploy

`./scripts/smoke-test.sh <host>` covers health, the PDF font assets, S3 config, mail config, and
whether the container is crash-looping.

The font check runs *inside* the container on purpose. The rate-card and GST-invoice outage was a
packaging bug — the `.ttf` files were present in the repo and absent from the image, because the
runtime stage copied `dist` and `prisma` but not `assets`. Any check run outside the container
would have passed for the entire outage.

Beyond the script, click through once:

1. Admin → Pricing → PDF Generator → generate a rate card.
2. Mark an order paid and confirm its invoice PDF downloads.
3. Create a throwaway pickup partner and confirm the credentials email arrives.

---

## Rollback

```bash
git checkout <last-good-sha>
./scripts/deploy-backend.sh <host>
git checkout sujith-v1.0
```

The frontend rolls back from the Actions tab — `workflow_dispatch` on the deploy workflow exists
for exactly this, so a rollback needs no commit.

---

## SSH key

`Nationwide.pem` sits in the repo root and is gitignored (`*.pem`). It has never been committed;
keep it that way. `deploy-backend.sh` chmods it to 600 before use, since OpenSSH refuses a
group-readable key and a Windows checkout usually produces one.
