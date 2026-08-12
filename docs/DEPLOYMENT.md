# Deployment

GitHub Actions validates the application and publishes two images after every
push to `main`:

- `ghcr.io/soroushtaheri/risk-dashboard-web:<commit-sha>`
- `ghcr.io/soroushtaheri/risk-dashboard-api:<commit-sha>`

The `latest` aliases are convenient for inspection, but production must use the
immutable full commit SHA so the frontend and backend always move and roll back
together.

## Local production rehearsal

1. Copy `.env.example` to `.env` and keep `.env` untracked.
2. From `dashboard/`, run `docker compose build --pull`.
3. Run `docker compose up -d`.
4. Verify `http://localhost:3000/`, `http://localhost:3000/api/health`, and `http://localhost:3000/api/readiness`.
5. Inspect `docker compose ps` and container logs, then stop with `docker compose down`.

The public web container is the only published service. Its `/api/*` route forwards internally to FastAPI, so the browser sees one origin. Both containers use health checks and unprivileged users; the API has a read-only filesystem and bounded simulation schemas.

## Vala production layout

- The isolated Compose definition lives at `/srv/risk-theory/compose.yaml`.
- Root-only image configuration lives at `/srv/risk-theory/risk-theory.env`.
- Existing files under `/srv/vala/deploy` and `/etc/vala` are not changed.
- Nginx is the only service publishing host port 80.
- The CDN terminates TLS for `risk-theory.bluehour.cloud` and
  `api.risk-theory.bluehour.cloud`; Vala serves HTTP to the CDN origin.
- The web service keeps `/api/*` same-origin through its internal FastAPI proxy,
  while the API hostname also exposes FastAPI directly.
- `risk-theory-route-sync.timer` keeps one additive configuration file inside
  the running edge container without modifying the PMIS edge repository. The
  synchronizer tests the combined Nginx configuration before a graceful reload.
- Add proxy request-size, connection, and rate limits, especially for `/api/ruin` and `/api/collective-risk`.
- Preserve the 100-second upstream timeout only for bounded simulations; ordinary requests should use a shorter timeout.
- Send container logs to the homelab log destination without recording request bodies.
- Pin the deployed image digest and record the source checksum from `/api/source`.
- Run the reconciliation readiness check after every rollout.
- Ship the checksum-locked v2 month CSV and its generated entity tables read-only in the image; regeneration is an explicit build or maintenance step, not a runtime write.

## Rollback

Retain the prior web and API image digests. If readiness or the classroom walkthrough fails, restore both previous digests together, recreate the two services, and verify `/api/readiness` before restoring proxy traffic. The released v2 data artifacts are checksum-locked and no database or persistent user state needs migration.
