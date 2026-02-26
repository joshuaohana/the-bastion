# The Bastion

A self-hosted, plugin-based approval gateway for AI agents.

Your agent proposes actions. You review and approve. The Bastion executes with its own credentials. **The LLM never holds service credentials** — it can only request, never act.

## How It Works

```
Agent                    Bastion                   Human                    Plugin
  │                        │                        │                        │
  │─POST /request─────────▶│                        │                        │
  │                        │──show in web UI────────▶│                        │
  │                        │                        │──review + approve──────▶│
  │                        │                        │◀──OTP generated─────────│
  │◀──"pending"────────────│                        │                        │
  │                        │                        │                        │
  │  (human gives OTP      │                        │                        │
  │   via chat)            │                        │                        │
  │                        │                        │                        │
  │─POST /confirm {otp}──▶│                        │                        │
  │                        │─POST /execute──────────────────────────────────▶│
  │                        │◀───────────────────────────────────────result───│
  │◀──result───────────────│                        │                        │
```

1. Agent submits a request to Bastion
2. Human reviews the request in Bastion's web UI (with a plain-English preview)
3. Human approves → Bastion generates a one-time code (OTP)
4. Human gives the OTP to the agent via normal conversation
5. Agent confirms with the OTP → Bastion executes via plugin → returns result

**The OTP is the proof that a human approved.** It's single-use, bound to that specific request, and useless without Bastion.

## Security Model

The agent **cannot self-approve** because:

- Bastion runs as a **separate OS user** from the agent — the agent can't read Bastion's DB, config, or process memory
- The web UI is **password-protected** and only accessible to the human
- OTPs are **hashed in the database** — even if the agent could read the DB (it can't), it couldn't extract the OTP
- OTPs are **single-use** and **bound to a specific request** — can't be reused or applied to a different action
- Plugin credentials live in Bastion's config — the agent never sees them
- Plugins only accept requests from Bastion, not directly from the agent

**The agent giving the OTP back to Bastion is the design, not a vulnerability.** The human chose to give it — that IS the approval.

### Installation Best Practice

> **Install Bastion as a separate OS user from your AI agent.** The agent should have no read access to Bastion's data directory, config, or plugin credentials. This is your security boundary.

```bash
# Example: agent runs as "friday", bastion runs as "bastion" or your user
sudo useradd -r -s /bin/false bastion
# Install and configure as the bastion user
# Agent can only reach POST /request and POST /confirm endpoints
```

## Architecture

**Bastion Core** handles:
- Request queuing and approval workflow
- OTP generation and verification
- Audit logging (every request, approval, rejection, execution)
- Plugin discovery and routing
- Web UI for human review and approval

**Plugins** are standalone API servers that:
- Conform to the [Plugin Interface](docs/plugin-interface.md)
- Hold their own service credentials (never exposed to agents or core)
- Define available actions with risk classifications and previews
- Execute approved actions and return results
- Are user-extensible via config (add actions without code)

## Quick Start

```bash
# Install Bastion core
npm install -g the-bastion

# Install a plugin (e.g., GitHub)
npm install -g bastion-github

# Configure
cp bastion.example.json bastion.json
# Edit bastion.json — set password, plugin URLs

# Run
bastion serve
```

## Agent Integration

Any agent that can make HTTP calls can use The Bastion:

```bash
# Submit a request
curl -X POST http://localhost:8100/request \
  -H "Content-Type: application/json" \
  -d '{"plugin":"github","action":"create_repo","params":{"name":"my-repo","private":true}}'

# → {"request_id":"abc123","status":"pending"}

# After human approves and gives you the OTP:
curl -X POST http://localhost:8100/request/abc123/confirm \
  -H "Content-Type: application/json" \
  -d '{"otp":"A7X9K2"}'

# → {"status":"approved","result":{"url":"https://github.com/..."}}
```

## Tech Stack

- **Core:** TypeScript, Express, SQLite (better-sqlite3)
- **Plugins:** Standalone HTTP servers (any language, TS reference implementations)
- **Web UI:** Served by core, password-protected

## License

MIT
