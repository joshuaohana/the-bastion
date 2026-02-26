# The Bastion

A self-hosted, plugin-based approval gateway for AI agents.

Your agent proposes actions. You review and approve. The Bastion executes with its own credentials. **The LLM never holds service credentials** — it can only request, never act.

## The Key Insight

The agent doesn't get permission to act. The agent asks The Bastion to act on its behalf. The Bastion holds the credentials, reviews the request, and — only with human approval — executes the action and returns the result.

## How It Works

```
AI Agent → POST /request → Bastion (queues) → Notification to human
                                                    ↓
                          Human reviews exact action → Approve / Reject
                                                    ↓
                            Bastion executes via plugin (holds creds)
                                                    ↓
                            Result returned to agent
```

## Architecture

**Bastion Core** handles:
- Request queuing and approval workflow
- Trust tiers (approve-all → auto-approve reads → auto-approve patterns → always-manual)
- Audit logging (every request, approval, rejection, execution)
- Plugin discovery and routing
- Human notification (webhook, chat integrations)

**Plugins** are standalone API servers that:
- Conform to the [Plugin Interface](docs/plugin-interface.md)
- Hold their own service credentials
- Define available actions with risk classifications
- Execute approved actions and return results
- Can be community-built, self-hosted, extended by users

## Quick Start

```bash
# Install Bastion core
pip install the-bastion

# Install a plugin (e.g., GitHub)
pip install bastion-github

# Configure
cp bastion.example.toml bastion.toml
# Edit bastion.toml — add your plugin URLs and notification settings

# Run
bastion serve
```

## Agent Integration

Any agent that can make HTTP calls can use The Bastion:

```python
import requests

# Request an action (blocks until approved/rejected/timeout)
resp = requests.post("http://localhost:8100/request", json={
    "plugin": "github",
    "action": "create_repo",
    "params": {"name": "my-repo", "private": True}
}, timeout=300)

# Result
print(resp.json())
# {"request_id": "abc123", "status": "approved", "result": {"url": "https://github.com/..."}}
```

For OpenClaw, there's a built-in Bastion tool — the agent just calls `bastion(plugin="github", action="create_repo", ...)`.

## Trust Tiers

| Tier | Behavior | Example |
|------|----------|---------|
| 0 | All actions require approval | MVP default |
| 1 | Auto-approve reads | `list_repos` goes through, `create_repo` needs approval |
| 2 | Auto-approve configured patterns | User-defined safe writes |
| 3 | Always require approval | Destructive ops — forever manual |

Trust is configurable per-plugin and per-action.

## Part of the OI Security Suite

```
┌─────────────────────────────────────────┐
│              AI Agent                    │
├─────────────┬───────────┬───────────────┤
│  Speakeasy  │ The Moat  │  The Bastion  │
│  (auth)     │ (inbound) │  (outbound)   │
│  who gets   │ scans     │  gates what   │
│  in         │ what      │  goes out     │
│             │ comes in  │               │
└─────────────┴───────────┴───────────────┘
```

- **[Speakeasy](https://github.com/joshuaohana/speakeasy)** — controls who gets access to your agent
- **[The Moat](https://github.com/joshuaohana/the-moat)** — scans and blocks malicious inbound content
- **The Bastion** — gates and approves outbound actions

## License

MIT — © Joshua Ohana / Ohana Industries
