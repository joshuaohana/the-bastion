# Architecture

## Overview

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ AI Agent │────▶│ Bastion Core │────▶│ Plugin (GitHub)  │────▶│ GitHub   │
└──────────┘     │              │     │ holds creds      │     │ API      │
                 │ - queue      │     │ executes actions  │     └──────────┘
                 │ - approval   │     └─────────────────┘
                 │ - OTP verify │
                 │ - audit log  │     ┌─────────────────┐     ┌──────────┐
                 │ - web UI     │────▶│ Plugin (AWS)     │────▶│ AWS API  │
                 └──────────────┘     │ holds creds      │     └──────────┘
                                      └─────────────────┘
```

## Bastion Core

**Tech:** TypeScript, Express, better-sqlite3

### Responsibilities

- **Request queue** — receives action requests from agents, queues for approval
- **Approval workflow** — shows requests in web UI, generates OTP on approval
- **OTP verification** — validates agent-submitted OTPs (hashed, single-use, request-bound)
- **Audit log** — every request, decision, and execution result is logged
- **Plugin registry** — knows which plugins are available and routes requests
- **Web UI** — password-protected interface for human review and approval

### API

#### Agent-facing

```
POST /request
  Body: { plugin, action, params }
  → Returns: { request_id, status: "pending" }

POST /request/{id}/confirm
  Body: { otp }
  → Returns: { status, result?, error? }

GET /request/{id}
  → Returns current status of a request
```

#### Human-facing (web UI)

```
GET /ui/pending        → List pending requests with previews
POST /ui/approve/{id}  → Approve request, returns OTP to display
POST /ui/reject/{id}   → Reject request with optional reason
GET /ui/audit          → Searchable audit log
GET /ui/plugins        → List registered plugins and their actions
```

### Database (SQLite)

**requests** table:
- id (TEXT, UUID)
- plugin (TEXT)
- action (TEXT)
- params (TEXT, JSON)
- preview (TEXT) — human-readable description of what will happen
- status (TEXT) — pending | approved | confirmed | executing | completed | rejected | expired | error
- otp_hash (TEXT, nullable) — bcrypt hash of OTP, set on approval
- created_at (INTEGER, unix ms)
- decided_at (INTEGER, nullable)
- confirmed_at (INTEGER, nullable)
- executed_at (INTEGER, nullable)
- result (TEXT, nullable, JSON)
- error (TEXT, nullable)
- ttl_seconds (INTEGER, default 300)

**audit_log** table:
- id (INTEGER, autoincrement)
- request_id (TEXT)
- event (TEXT) — created | approved | rejected | confirmed | executed | expired | error
- timestamp (INTEGER, unix ms)
- details (TEXT, JSON)

### Request Lifecycle

```
PENDING ──▶ APPROVED (OTP generated) ──▶ CONFIRMED (OTP matched) ──▶ EXECUTING ──▶ COMPLETED
   │              │                            │                          │
   ▼              ▼                            ▼                          ▼
EXPIRED       REJECTED                     (bad OTP → stays APPROVED)   ERROR
```

1. Agent sends `POST /request`
2. Core validates plugin + action exist (via cached manifest)
3. Core calls plugin's `POST /validate` to check params
4. Core calls plugin's `GET /actions/{action}/preview` for human-readable summary
5. Core queues request (status: PENDING), returns request_id
6. Human opens web UI, sees pending request with preview
7. Human approves → Core generates OTP, hashes it, stores hash, shows plaintext to human
8. Human gives OTP to agent via conversation
9. Agent calls `POST /request/{id}/confirm {otp}`
10. Core verifies OTP (bcrypt compare), transitions to CONFIRMED
11. Core calls plugin's `POST /execute`
12. Core logs result, transitions to COMPLETED, returns result to agent

### OTP Security

- Generated: 6 alphanumeric characters (A-Z0-9), ~2 billion combinations
- Stored: bcrypt hash only (plaintext shown once to human in web UI, never stored)
- Single-use: deleted/invalidated after successful confirm
- Request-bound: OTP only valid for the specific request_id it was generated for
- TTL: expires with the request (default 5 minutes)
- Rate-limited: max 3 confirm attempts per request, then locked

## Configuration

```json
{
  "host": "127.0.0.1",
  "port": 8100,
  "db": "/var/lib/bastion/bastion.db",
  "password": "$2b$10$...",
  "defaultTtl": 300,
  "plugins": [
    { "name": "github", "url": "http://127.0.0.1:8101" },
    { "name": "aws", "url": "http://127.0.0.1:8102" }
  ]
}
```

## Trust Boundaries

```
┌─────────────────────────────────────┐
│ Agent user (e.g., "friday")         │
│ - Can reach Bastion HTTP API only   │
│ - POST /request, POST /confirm     │
│ - Cannot read DB, config, plugins   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Bastion user (e.g., "bastion")      │
│ - Owns DB, config, plugin configs   │
│ - Runs core + plugins               │
│ - Web UI password-protected         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Human                               │
│ - Accesses web UI (password)        │
│ - Reviews and approves requests     │
│ - Relays OTP to agent               │
└─────────────────────────────────────┘
```
