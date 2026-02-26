# The Bastion

A self-hosted, plugin-based approval gateway for AI agents.

Your agent proposes actions. You review and approve via CLI. The Bastion executes with its own credentials. **The LLM never holds service credentials** — it can only request, never act.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/joshuaohana/the-bastion.git
cd the-bastion
npm install
npm run build
```

### 2. Configure Bastion Core

```bash
cp bastion.example.json bastion.json
```

Generate a hashed admin password and an agent API key:

```bash
# Hash your admin password
npx bastion-cli hash-password my-secret-password
# → $2a$10$... (copy this)

# Generate a random agent API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → a1b2c3... (copy this)
```

Edit `bastion.json`:

```json
{
  "host": "127.0.0.1",
  "port": 8100,
  "dbPath": "./bastion.db",
  "passwordHash": "$2a$10$...paste-your-hash-here...",
  "agentApiKey": "a1b2c3...paste-your-key-here...",
  "pluginUrls": {
    "github": "http://127.0.0.1:8101"
  },
  "defaultTtl": 300
}
```

### 3. Configure the GitHub Plugin

```bash
cp plugins/bastion-github/plugin.example.json plugins/bastion-github/plugin.json
```

Edit `plugins/bastion-github/plugin.json` with your GitHub App credentials:

```json
{
  "appId": 12345,
  "privateKeyPath": "/path/to/your-github-app.pem",
  "installationId": 67890,
  "defaultOwner": "your-github-username"
}
```

(Don't have a GitHub App yet? [Create one here](https://github.com/settings/apps/new) with repo permissions.)

### 4. Set up the CLI

Create `~/.bastion/config.json`:

```json
{
  "url": "http://127.0.0.1:8100",
  "password": "my-secret-password"
}
```

(This is the **plaintext** password — it gets sent to Bastion over localhost, where Bastion bcrypt-compares it against the hash in `bastion.json`.)

### 5. Start it up

```bash
# Terminal 1: start the GitHub plugin
npm run dev -w plugins/bastion-github

# Terminal 2: start Bastion core
npm run dev -w bastion-core
```

### 6. Try it out

In a third terminal, simulate what an agent would do:

```bash
# Submit a request (as the agent)
curl -X POST http://localhost:8100/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3...your-agent-key..." \
  -d '{"plugin":"github","action":"create_repo","params":{"name":"test-repo","private":true}}'

# → {"request_id":"abc-123-...","status":"pending"}
```

Now approve it with the CLI:

```bash
# See pending requests
bastion pending

# Approve it — prints an OTP
bastion approve abc-123-...

# ╔════════════════════════╗
# ║       OTP: A7X9K2      ║
# ╚════════════════════════╝
```

Confirm with the OTP (as the agent):

```bash
curl -X POST http://localhost:8100/request/abc-123-.../confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3...your-agent-key..." \
  -d '{"otp":"A7X9K2"}'

# → {"status":"completed","result":{"url":"https://github.com/..."}}
```

That's it. The repo is created. 🎉

### 7. Interactive mode

Instead of checking manually, run:

```bash
bastion live
```

This polls for new requests and lets you approve/reject inline as they come in. Press `q` to quit.

---

## When to Use Bastion (and When Not To)

Bastion isn't meant to replace your agent's existing tools. It's meant to **gate the dangerous ones.**

Most AI agents already have service credentials for their day-to-day work — a GitHub token for pushing code, an API key for fetching data, a database connection for reads. That's fine. Those are the operations your agent needs to do its job, and adding an approval step to every git push would make the agent useless.

Bastion is for the *other* operations — the ones where a mistake (or a compromised agent) could cause real damage:

| Let your agent do directly | Route through Bastion |
|---|---|
| Push branches, open PRs | Create/delete repositories |
| Read issues and comments | Modify repo settings, branch protection |
| Fetch data from APIs | Create/revoke API keys or credentials |
| Query databases | Drop tables, modify schemas |
| Read cloud resources | Provision/terminate infrastructure |

**The pattern:** Create a *second* set of credentials with elevated permissions. Give those credentials to Bastion, not to your agent. Your agent keeps its normal access for everyday work and requests Bastion when it needs to do something privileged.

This way:
- Your agent stays productive — no friction on routine operations
- Privileged operations get human review — the agent requests, you approve
- The agent never sees the elevated credentials — even if compromised, it can only *ask*
- You get a full audit trail of every privileged action

Think of it like `sudo` for AI agents. You don't run everything as root. You elevate when needed, with explicit approval.

## How It Works

```
Agent                    Bastion                  You (CLI)                Plugin
  │                        │                        │                       │
  │─POST /request─────────▶│                        │                       │
  │◀──{request_id}─────────│                        │                       │
  │                        │                        │                       │
  │  (agent tells you:     │                        │                       │
  │  "check bastion")      │                        │                       │
  │                        │                        │                       │
  │                        │◀──bastion approve──────│                       │
  │                        │──OTP────────────────────▶                      │
  │                        │                        │                       │
  │  (you give agent       │                        │                       │
  │   the OTP)             │                        │                       │
  │                        │                        │                       │
  │─POST /confirm {otp}──▶│                        │                       │
  │                        │─POST /execute──────────────────────────────────▶│
  │◀──result───────────────│◀───────────────────────────────────────result──│
```

## Security Model

- **Bastion runs as a different OS user** from the agent — the agent can't read config, DB, or passwords
- **Admin password is bcrypt-hashed** in `bastion.json` — even if the agent reads the file (it can't), it can't reverse the hash
- **OTPs are bcrypt-hashed** in the database, single-use, max 3 attempts, 5-minute TTL
- **Agent API key** is separate from admin password — the agent can submit requests but can't approve them
- **Plugin credentials** live in plugin config — the agent never sees them

## CLI Commands

```
bastion pending                       List pending requests
bastion show <id>                     Show request details + preview
bastion approve <id>                  Approve → prints OTP
bastion reject <id> [--reason "..."]  Reject request
bastion audit                         View audit log
bastion live                          Interactive mode (live feed)
bastion hash-password <password>      Generate bcrypt hash for config
```

## Packages

```
the-bastion/
├── bastion-core/              # Approval server (Express + SQLite)
├── bastion-cli/               # CLI tool for human approval
├── plugins/
│   └── bastion-github/        # GitHub plugin (GitHub App auth)
├── bastion.json               # Core config (you create from example)
└── docs/                      # Architecture, plugin interface, MVP spec
```

## Building & Testing

```bash
npm run build    # compile all packages
npm run test     # run all tests (12 tests across core + plugin)
```

## Roadmap

**Now (MVP)**
- Bastion Core with OTP approval flow
- GitHub plugin (create_repo, list_repos)
- CLI for review and approval

**Next**
- More GitHub actions (branch protection, collaborators, PRs, issues)
- AWS plugin (EC2, S3, IAM operations)
- Push notifications for pending requests
- Configurable auto-approve policies (user chooses what needs manual approval)
- OpenClaw plugin (native tool integration)

**Later**
- Community plugin ecosystem
- Web UI for approval (optional)
- Batch operations
- Dual approval for high-risk actions

**Philosophy:** Bastion core stays small. New capabilities come from plugins, not core bloat.

## Docs

- [Architecture](docs/architecture.md) — request lifecycle, DB schema, trust boundaries
- [Plugin Interface](docs/plugin-interface.md) — how to build plugins
- [MVP Scope](docs/mvp.md) — what's in v1

## License

MIT — © Joshua Ohana
