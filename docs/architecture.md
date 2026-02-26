# Architecture

## Overview

The Bastion has three main components:

1. **Bastion Core** — the approval gateway (this repo)
2. **Bastion CLI** — terminal tool for human approval and auditing
3. **Plugins** — standalone API servers that execute actions against external services

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ AI Agent │────▶│ Bastion Core │────▶│ Plugin (GitHub) │────▶│ GitHub   │
└──────────┘     │              │     │ holds creds     │     │ API      │
                 │ - queue      │     │ executes actions│     └──────────┘
┌──────────┐     │ - approval   │
│ Human    │────▶│ - audit log  │
│ (CLI)    │     │              │
└──────────┘     └──────────────┘
```

## Bastion Core

**Tech:** TypeScript, Express, better-sqlite3

### Responsibilities

- **Request queue** — receives action requests from agents, queues for approval
- **Approval workflow** — approve/reject, OTP issuance and confirmation
- **Audit log** — every request, decision, and execution result is logged
- **Plugin registry** — knows which plugins are available and routes requests

### API

#### Agent-facing

- `POST /request`
- `GET /request/:id`
- `POST /request/:id/confirm`

Auth: `Authorization: Bearer <agentApiKey>`

#### CLI-facing (admin)

- `GET /api/requests/pending`
- `GET /api/requests/:id`
- `POST /api/requests/:id/approve`
- `POST /api/requests/:id/reject`
- `GET /api/audit`

Auth: `Authorization: Bearer <password>`

## Bastion CLI

**Tech:** TypeScript, commander, chalk, built-in fetch/readline

### Commands

- `bastion pending` — list pending requests + previews
- `bastion show <request_id>` — show full request detail
- `bastion approve <request_id>` — approve and print OTP
- `bastion reject <request_id> [--reason ...]` — reject request
- `bastion audit` — view recent audit events
- `bastion watch` — polling interactive mode (every 2s) for inline approve/reject

### Configuration

CLI reads config from either:

1. `~/.bastion/config.json`
2. `BASTION_URL` + `BASTION_PASSWORD`

## Plugins

Plugins are **standalone processes** that expose a standard HTTP API. See [Plugin Interface](plugin-interface.md).

### Why standalone processes?

- **Isolation** — plugin crash doesn't take down Bastion
- **Language-agnostic** — plugins can be Python, Go, Rust, Node, whatever
- **Security** — credentials stay in the plugin's process, never cross to core
- **Extensibility** — anyone can build and distribute plugins without touching core

## Database (SQLite)

**requests** table:
- id, plugin, action, params (JSON), status
- otp_hash, otp_attempts
- created_at, decided_at, confirmed_at, executed_at
- result (JSON), error, ttl_seconds

**audit_log** table:
- id, request_id, event, timestamp, details (JSON)
