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
- `read` — no side effects
- `write` — creates or modifies resources
- `destructive` — deletes resources or changes permissions

Risk levels are metadata for the human reviewer. In MVP, all actions require manual approval regardless of risk level. In future versions, users can configure auto-approve policies based on risk.

**params_schema** follows JSON Schema. Used for:
- Input validation before queuing
- Rendering the approval UI (human sees exactly what will happen)
- Documentation generation

### POST /validate

Validates params before the request is queued. Allows plugin-specific validation beyond JSON Schema.

```
POST /validate
Body: { "action": "create_repo", "params": { "name": "my-repo" } }

→ 200: { "valid": true }
→ 200: { "valid": false, "errors": ["Repo name cannot contain spaces"] }
```

### GET /actions/{action}/preview

Returns a human-readable preview of what will happen. **Required for all actions.**

```
GET /actions/create_repo/preview?name=my-repo&private=true

→ 200: {
    "summary": "Create private repository 'my-repo' under joshuaohana",
    "details": "This will create a new private repository at https://github.com/joshuaohana/my-repo with default settings."
  }
```

The preview is shown to the human in the approval UI. It should be clear, specific, and honest about what will happen.

### POST /execute

Executes an approved action. **Only called after human approval + OTP confirmation.**

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
│   ├── index.ts           # Express/Hono app with required endpoints
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

Adding a new GitHub action = adding config. No code, no PR.

## Transport

- Default: HTTP on localhost
- Plugins SHOULD bind to localhost only (credentials never leave the machine)
- Bastion core is the only client — plugins should reject requests from other sources
- For additional security, plugins can require a shared secret header from core
