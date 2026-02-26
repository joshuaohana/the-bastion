# The Bastion (MVP)

Self-hosted approval gateway for AI-agent actions.

## Packages

- `bastion-core/` — approval server + SQLite audit store
- `bastion-cli/` — human approval CLI (`bastion`)
- `plugins/bastion-github/` — GitHub plugin implementing Bastion plugin interface

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
cp bastion.example.json bastion.json
cp plugins/bastion-github/plugin.example.json plugins/bastion-github/plugin.json
# edit both config files
```

For CLI config, create `~/.bastion/config.json`:

```json
{
  "url": "http://127.0.0.1:8100",
  "password": "your-admin-password"
}
```

You can also use env vars: `BASTION_URL` and `BASTION_PASSWORD`.

## Run

```bash
# terminal 1
npm run dev -w plugins/bastion-github

# terminal 2
npm run dev -w bastion-core
```

## CLI usage

```bash
bastion pending
bastion show <request_id>
bastion approve <request_id>
bastion reject <request_id> --reason "optional reason"
bastion audit
bastion watch
```

Core APIs used by agent + CLI:
- Agent API: `POST /request`, `POST /request/:id/confirm`, `GET /request/:id`
- CLI/Admin API: `GET /api/requests/pending`, `GET /api/requests/:id`, `POST /api/requests/:id/approve`, `POST /api/requests/:id/reject`, `GET /api/audit`

Admin authentication is a simple header: `Authorization: Bearer <password>`.

## Build + Test

```bash
npm run build
npm run test
```

## Notes

- OTP is 6-char alphanumeric (A-Z0-9), bcrypt-hashed, single-use, max 3 attempts.
- Request states are strict: `PENDING -> APPROVED -> CONFIRMED -> EXECUTING -> COMPLETED`
  (or `REJECTED` / `EXPIRED` / `ERROR`).
- All request lifecycle transitions are written to `audit_log`.
- Plugin previews are required before request creation.

See:
- `docs/architecture.md`
- `docs/plugin-interface.md`
- `docs/mvp.md`
