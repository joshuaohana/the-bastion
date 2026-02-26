# MVP Scope

## What We're Building

A working Bastion that lets an AI agent request the creation of a GitHub repo, with human approval via OTP.

## Components

### 1. Bastion Core
- TypeScript + Express + better-sqlite3
- Agent API: `POST /request`, `POST /request/{id}/confirm`, `GET /request/{id}`
- Web UI: pending queue, approve (→ OTP), reject, audit log
- Password-protected web UI (set on first run)
- OTP: 6-char alphanumeric, bcrypt hashed, single-use, request-bound, 5-min TTL
- Rate limit: max 3 OTP attempts per request

### 2. GitHub Plugin
- Standalone TypeScript + Express service
- GitHub App authentication (user creates App, plugin holds creds)
- MVP action: `create_repo` (name, private, description, org)
- Implements full plugin interface: manifest, validate, preview, execute, health

### 3. Web UI
- Served by core on the same port
- Simple, functional (not pretty — MVP)
- Pages: login, pending requests, request detail + approve/reject, audit log
- Shows preview text from plugin for every request

## NOT in MVP
- Auto-approve / trust tiers (everything manual)
- Multiple notification channels (web UI only)
- OpenClaw plugin (agent uses curl/exec)
- Plugin marketplace / discovery
- Batch operations
- Multiple users / roles

## End-to-End Flow (MVP)

```
1. Agent: POST http://localhost:8100/request
   {"plugin":"github","action":"create_repo","params":{"name":"test-repo","private":true}}

2. Bastion: queues request, fetches preview from plugin
   → returns {"request_id":"abc123","status":"pending"}

3. Human: opens http://localhost:8100 in browser, logs in
   → sees: "Create private repository 'test-repo' under joshuaohana"
   → clicks Approve
   → sees OTP: "A7X9K2"

4. Human tells agent: "approved, code is A7X9K2"

5. Agent: POST http://localhost:8100/request/abc123/confirm
   {"otp":"A7X9K2"}

6. Bastion: verifies OTP, calls plugin POST /execute
   → plugin creates repo via GitHub API
   → returns {"status":"completed","result":{"url":"https://github.com/joshuaohana/test-repo"}}

7. Agent: "Done! Created https://github.com/joshuaohana/test-repo"
```

## Installation Layout

```
/opt/bastion/                  # or wherever, owned by bastion user
├── bastion-core/
│   ├── package.json
│   ├── bastion.json           # core config (password, plugin URLs)
│   ├── bastion.db             # SQLite (mode 600)
│   └── src/
├── plugins/
│   └── bastion-github/
│       ├── package.json
│       ├── plugin.json        # GitHub App creds + custom actions
│       └── src/
```

Both run as systemd services under the bastion user.
