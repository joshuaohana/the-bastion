# The Bastion

A self-hosted, plugin-based approval gateway for AI agents.

Your agent proposes actions. You review and approve via CLI. The Bastion executes with its own credentials. **The LLM never holds service credentials** — it can only request, never act.

## ⚡ Quick Start

Follow **[QUICKSTART.md](QUICKSTART.md)** — zero to approving agent actions in ~5 minutes.

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
