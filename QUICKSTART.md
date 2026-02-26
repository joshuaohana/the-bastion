# ⚡ The Bastion Quick Start

Get from zero to approving agent actions in ~5 minutes.

## Prerequisites

- Node.js 18+
- npm
- A GitHub App (or [create one](https://github.com/settings/apps/new)) with repo permissions
- ~5 minutes

## ⚠️ Security: Install as the human, not the agent

**The Bastion must be installed and run as a different OS user than your AI agent.** If the agent can read Bastion's config, DB, or plugin credentials, the security model breaks. The agent should only know the API endpoint and its agent API key — nothing else.

## Step 1: Clone and install

```bash
cd ~
git clone https://github.com/joshuaohana/the-bastion.git
cd the-bastion
npm install
npm run build
```

## Step 2: Configure Bastion Core

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

## Step 3: Configure the GitHub Plugin

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

(Don't have a GitHub App yet? [Create one here](https://github.com/settings/apps/new) with admin/repo permissions. This should be a **separate** app from your agent's — see [When to Use Bastion](README.md#when-to-use-bastion-and-when-not-to) for why.)

## Step 4: Set up the CLI

Create `~/.bastion/config.json`:

```json
{
  "url": "http://127.0.0.1:8100",
  "password": "my-secret-password"
}
```

(This is the **plaintext** password — it gets sent to Bastion over localhost, where Bastion bcrypt-compares it against the hash in `bastion.json`.)

## Step 5: Start it up

```bash
# Terminal 1: start the GitHub plugin
npm run dev -w plugins/bastion-github

# Terminal 2: start Bastion core
npm run dev -w bastion-core
```

## Step 6: Smoke test

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

## Step 7: Interactive mode

Instead of checking manually, run:

```bash
bastion live
```

This polls for new requests and lets you approve/reject inline as they come in. Press `q` to quit.

## Optional: Run as systemd services

For production use, run Bastion Core and plugins as systemd services so they survive reboots:

```bash
# Bastion Core
sudo tee /etc/systemd/system/bastion.service >/dev/null <<'UNIT'
[Unit]
Description=The Bastion Core
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/the-bastion
ExecStart=/usr/bin/npm run start -w bastion-core
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

# GitHub Plugin
sudo tee /etc/systemd/system/bastion-github.service >/dev/null <<'UNIT'
[Unit]
Description=The Bastion GitHub Plugin
After=network.target
Before=bastion.service

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/the-bastion
ExecStart=/usr/bin/npm run start -w plugins/bastion-github
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now bastion-github bastion
```

## Troubleshooting

- **"Connection refused" on /request** — Is Bastion Core running? Check `curl http://127.0.0.1:8100/health`
- **"Unauthorized"** — Check your agent API key matches `agentApiKey` in `bastion.json`
- **"Plugin unreachable"** — Is the GitHub plugin running? Check `curl http://127.0.0.1:8101/health`
- **OTP rejected** — OTPs are single-use and expire after 5 minutes. Max 3 attempts per request.
- **"Permission denied" from GitHub** — Check your GitHub App has the required permissions and is installed on the target repos.
