# Architecture

## Overview

The Bastion has two main components:

1. **Bastion Core** — the approval gateway (this repo)
2. **Plugins** — standalone API servers that execute actions against external services

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ AI Agent │────▶│ Bastion Core │────▶│ Plugin (GitHub)  │────▶│ GitHub   │
└──────────┘     │              │     │ holds creds      │     │ API      │
                 │ - queue      │     │ executes actions  │     └──────────┘
                 │ - approval   │     └─────────────────┘
                 │ - audit log  │
                 │ - trust tier │     ┌─────────────────┐     ┌──────────┐
                 │ - notify     │────▶│ Plugin (AWS)     │────▶│ AWS API  │
                 └──────────────┘     │ holds creds      │     └──────────┘
                                      │ executes actions  │
                                      └─────────────────┘
```

## Bastion Core

**Tech:** TypeScript, Express, better-sqlite3

### Responsibilities

- **Request queue** — receives action requests from agents, queues for approval
- **Approval workflow** — notifies human, waits for approve/reject, handles timeout
- **Trust engine** — configurable per-plugin, per-action auto-approve rules
- **Audit log** — every request, decision, and execution result is logged
- **Plugin registry** — knows which plugins are available and routes requests
- **Notification dispatch** — webhook, Telegram, Matrix, web push

### API

#### Agent-facing

```
POST /request
  Body: { plugin, action, params, ?timeout }
  → Blocks until approved/rejected/expired (up to timeout seconds)
  → Returns: { request_id, status, ?result, ?error }

GET /request/{id}
  → Returns current status of a request (for async polling)
```

#### Human-facing (approval)

```
POST /request/{id}/approve
POST /request/{id}/reject
  Body: { ?reason }
```

#### Admin

```
GET /plugins
  → List registered plugins and their action catalogs

GET /audit
  → Searchable audit log

GET /requests
  → List pending/recent requests
```

### Database (SQLite)

**requests** table:
- id, plugin, action, params (JSON), status (pending/approved/rejected/expired/error)
- created_at, decided_at, decided_by, executed_at
- result (JSON), error, ttl_seconds

**audit_log** table:
- id, request_id, event_type, timestamp, details (JSON)

## Plugins

Plugins are **standalone processes** that expose a standard HTTP API. See [Plugin Interface](plugin-interface.md).

### Why standalone processes?

- **Isolation** — plugin crash doesn't take down Bastion
- **Language-agnostic** — plugins can be Python, Go, Rust, Node, whatever
- **Security** — credentials stay in the plugin's process, never cross to core
- **Extensibility** — anyone can build and distribute plugins without touching core
- **User-extensible** — users can add custom actions to plugins via config

### Plugin lifecycle

1. User installs a plugin (pip, docker, binary, whatever)
2. User configures plugin's credentials and starts it
3. User registers plugin URL in Bastion's config
4. Bastion fetches the plugin's manifest on startup
5. Requests for that plugin get routed to its URL

## Configuration

```toml
[bastion]
host = "127.0.0.1"
port = 8100
db = "bastion.db"
default_ttl = 300  # seconds to wait for approval before auto-reject

[notification]
type = "webhook"  # or "telegram", "matrix"
url = "https://..."

[[plugins]]
name = "github"
url = "http://127.0.0.1:8101"

[[plugins]]
name = "aws"
url = "http://127.0.0.1:8102"
```

## Request Lifecycle

```
1. Agent sends POST /request {plugin: "github", action: "create_repo", params: {...}}
2. Core validates plugin exists, action exists (via cached manifest)
3. Core calls plugin's POST /validate to check params
4. Core checks trust tier:
   a. Auto-approve? → skip to step 7
   b. Needs approval? → continue
5. Core queues request, sends notification to human
6. Human approves/rejects (or request expires after TTL)
7. If approved: Core calls plugin's POST /execute
8. Plugin executes action, returns result
9. Core logs everything to audit, returns result to agent
```
