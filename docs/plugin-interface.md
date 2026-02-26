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

## Building a Plugin

A plugin is just an HTTP server. Here's the minimal structure:

```
bastion-github/
├── src/
│   ├── index.ts           # Express app with the required endpoints
│   ├── actions/           # One file per action
│   │   ├── create-repo.ts
│   │   └── list-repos.ts
│   └── config.ts          # Plugin credentials and settings
├── plugin.json            # Plugin config (creds, user-defined actions)
├── package.json
└── README.md
```

### User-Extensible Actions

Users can add custom actions to any plugin without modifying plugin code. In `plugin.json`:

```json
{
  "credentials": {
    "appId": 12345,
    "privateKeyPath": "/path/to/key.pem",
    "installationId": 67890
  },
  "customActions": {
    "create_branch_protection": {
      "description": "Set branch protection rules",
      "risk": "write",
      "method": "PUT",
      "endpoint": "/repos/{owner}/{repo}/branches/{branch}/protection",
      "paramsSchema": {
        "type": "object",
        "properties": {
          "owner": { "type": "string" },
          "repo": { "type": "string" },
          "branch": { "type": "string", "default": "main" }
        },
        "required": ["owner", "repo"]
      },
      "bodyTemplate": {
        "required_pull_request_reviews": {
          "required_approving_review_count": 1
        },
        "enforce_admins": true
      }
    }
  }
}
```

This way, adding a new GitHub action is just config — no code, no PR.

## Transport

- Default: HTTP on localhost
- Plugins SHOULD bind to localhost only (credentials never leave the machine)
- If remote plugins are needed, use mTLS or a tunnel
