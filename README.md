# The Bastion (MVP)

Self-hosted approval gateway for AI-agent actions.

## Packages

- `bastion-core/` — approval server + web UI + SQLite audit store
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

## Run

```bash
# terminal 1
npm run dev -w plugins/bastion-github

# terminal 2
npm run dev -w bastion-core
```

Core serves:
- Agent API: `POST /request`, `POST /request/:id/confirm`, `GET /request/:id`
- Human UI + admin API at root (`/`) and `/api/*`

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
