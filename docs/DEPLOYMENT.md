# Deployment readiness

This repository is prepared for a later homelab deployment but does not make DNS, TLS, router, firewall, or public-host changes.

## Local production rehearsal

1. Copy `.env.example` to `.env` and keep `.env` untracked.
2. From `dashboard/`, run `docker compose build --pull`.
3. Run `docker compose up -d`.
4. Verify `http://localhost:3000/`, `http://localhost:3000/api/health`, and `http://localhost:3000/api/readiness`.
5. Inspect `docker compose ps` and container logs, then stop with `docker compose down`.

The public web container is the only published service. Its `/api/*` route forwards internally to FastAPI, so the browser sees one origin. Both containers use health checks and unprivileged users; the API has a read-only filesystem and bounded simulation schemas.

## Homelab checklist

- Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin before building the web image.
- Put the web service behind the existing reverse proxy; do not publish the API port.
- Terminate TLS at the reverse proxy and redirect HTTP to HTTPS.
- Add proxy request-size, connection, and rate limits, especially for `/api/ruin` and `/api/collective-risk`.
- Preserve the 100-second upstream timeout only for bounded simulations; ordinary requests should use a shorter timeout.
- Send container logs to the homelab log destination without recording request bodies.
- Pin the deployed image digest and record the source checksum from `/api/source`.
- Run the reconciliation readiness check after every rollout.
- Keep the original CSV outside writable container volumes.

## Rollback

Retain the prior web and API image digests. If readiness or the classroom walkthrough fails, restore both previous digests together, recreate the two services, and verify `/api/readiness` before restoring proxy traffic. Data are immutable and no database or persistent user state needs migration.

