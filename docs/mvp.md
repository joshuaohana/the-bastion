# MVP Scope

## End-to-end flow

1. Agent submits `POST /request` with `{ plugin, action, params }`
2. Core validates action via plugin `/manifest` + `/validate`
3. Core fetches plugin preview via `/actions/:action/preview`
4. Request is stored as `PENDING`
5. Human reviews pending requests using `bastion` CLI
6. On approval, core generates 6-char OTP (A-Z0-9), stores bcrypt hash, returns OTP to CLI
7. Agent confirms with `POST /request/:id/confirm` + OTP
8. Core executes approved action via plugin `/execute`
9. Request transitions to `COMPLETED` or `ERROR`
10. Every state transition is written to `audit_log`

## Included in this MVP

- Bastion Core (TypeScript + Express + SQLite)
- CLI-first admin workflow (`bastion`): pending/show/approve/reject/audit/watch
- Header-based admin auth: `Authorization: Bearer <password>`
- OTP confirmation (single-use, max 3 attempts, TTL-aware)
- Background TTL expiration for pending/approved requests
- GitHub plugin with:
  - `create_repo` (write)
  - `list_repos` (read)
  - GitHub App auth and installation token caching
- Unit/integration tests for core lifecycle, OTP paths, TTL, and auth
