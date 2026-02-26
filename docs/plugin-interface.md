# Plugin Interface

Every Bastion plugin is a standalone HTTP server that implements these endpoints.

## Required Endpoints

### GET /manifest

Returns the plugin's capabilities.

```json
{
  "name": "github",
  "version": "0.1.0",
  "description": "GitHub operations via GitHub App",
  "actions": {
    "create_repo": {
      "description": "Create a new repository",
      "risk": "write",
      "params_schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string", "description": "Repository name" },
          "private": { "type": "boolean", "default": true },
          "description": { "type": "string" },
          "org": { "type": "string", "description": "Organization (omit for personal)" }
        },
        "required": ["name"]
      }
    },
    "list_repos": {
      "description": "List repositories",
      "risk": "read",
      "params_schema": {
        "type": "object",
        "properties": {
          "org": { "type": "string" }
        }
      }
    }
  }
}
```

**Risk levels:**
- `read` — no side effects, safe to auto-approve at trust tier 1+
- `write` — creates or modifies resources
- `destructive` — deletes resources or changes permissions, always tier 3 (manual)

**params_schema** follows JSON Schema. Bastion core uses this for:
- Input validation before queuing
- Rendering the approval UI (human sees exactly what will happen)
- Documentation generation

### POST /validate

Validates params before the request is queued. Allows plugin-specific validation beyond JSON Schema (e.g., "repo name can't contain spaces").

```
POST /validate
Body: { "action": "create_repo", "params": { "name": "my-repo" } }

→ 200: { "valid": true }
→ 200: { "valid": false, "errors": ["Repo name cannot contain spaces"] }
```

### POST /execute

Executes an approved action. **Only called after human approval** (or auto-approve via trust tier).

```
POST /execute
Body: { "action": "create_repo", "params": { "name": "my-repo", "private": true } }

→ 200: {
    "success": true,
    "result": {
      "url": "https://github.com/joshuaohana/my-repo",
      "id": 123456,
      "full_name": "joshuaohana/my-repo"
    }
  }

→ 200: {
    "success": false,
    "error": "Repository already exists"
  }
```

### GET /health

Simple health check.

```
→ 200: { "status": "ok", "name": "github", "version": "0.1.0" }
```

## Optional Endpoints

### GET /actions/{action}/preview

Returns a human-readable preview of what will happen. Used in the approval UI.

```
GET /actions/create_repo/preview?name=my-repo&private=true

→ 200: {
    "summary": "Create private repository 'my-repo' under joshuaohana",
    "details": "This will create a new private repository at https://github.com/joshuaohana/my-repo"
  }
```

## Building a Plugin

A plugin is just an HTTP server. Here's the minimal structure:

```
bastion-github/
├── bastion_github/
│   ├── __init__.py
│   ├── server.py          # FastAPI app with the 4 required endpoints
│   ├── actions/           # One file per action
│   │   ├── create_repo.py
│   │   └── list_repos.py
│   └── config.py          # Plugin credentials and settings
├── plugin.toml            # Plugin metadata + user-extensible action config
├── pyproject.toml
└── README.md
```

### User-Extensible Actions

Users can add custom actions to any plugin without modifying plugin code. In `plugin.toml`:

```toml
[plugin]
name = "github"

[credentials]
app_id = 12345
private_key_path = "/path/to/key.pem"
installation_id = 67890

# Built-in actions are defined in code.
# Users can add more here:

[actions.custom.create_branch_protection]
description = "Set branch protection rules"
risk = "write"
# Maps to a GitHub API call
method = "PUT"
endpoint = "/repos/{owner}/{repo}/branches/{branch}/protection"
params_schema = '''
{
  "type": "object",
  "properties": {
    "owner": { "type": "string" },
    "repo": { "type": "string" },
    "branch": { "type": "string", "default": "main" }
  },
  "required": ["owner", "repo"]
}
'''
# Request body template (Jinja2)
body_template = '''
{
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "enforce_admins": true
}
'''
```

This way, adding a new GitHub action is just config — no code, no PR.

## Transport

- Default: HTTP on localhost
- Plugins SHOULD bind to localhost only (credentials never leave the machine)
- If remote plugins are needed, use mTLS or a tunnel
