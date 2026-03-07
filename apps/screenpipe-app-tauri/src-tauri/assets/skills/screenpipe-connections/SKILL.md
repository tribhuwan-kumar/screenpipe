---
name: screenpipe-connections
description: Manage the user's connected integrations (Telegram, Slack, Discord, Email, Todoist, Teams). Use when the user wants to send messages, create tasks, or interact with any connected service. Query the connections API to discover which services are connected and get their credentials.
---

# Screenpipe Connections

The user can connect external services (Telegram, Slack, Discord, Email, Todoist, Microsoft Teams) through Screenpipe's connections system. Credentials are stored locally at `~/.screenpipe/connections.json`.

The API runs at `http://localhost:3030/connections`.

## List all connections

```bash
curl http://localhost:3030/connections
```

Returns all available integrations and whether they are connected:

```json
{
  "data": [
    { "id": "telegram", "name": "Telegram", "connected": true, ... },
    { "id": "slack", "name": "Slack", "connected": false, ... }
  ]
}
```

## Get saved credentials for a connection

```bash
curl http://localhost:3030/connections/telegram
```

Returns:

```json
{
  "credentials": {
    "bot_token": "123456:ABC-DEF...",
    "chat_id": "5776185278"
  }
}
```

## How to use connected services

Once you have the credentials from the API, use them directly:

### Telegram
```bash
BOT_TOKEN="<from credentials>"
CHAT_ID="<from credentials>"
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${CHAT_ID}\", \"text\": \"Hello from Screenpipe!\"}"
```

### Slack
```bash
WEBHOOK_URL="<from credentials>"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Screenpipe!"}'
```

### Discord
```bash
WEBHOOK_URL="<from credentials>"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from Screenpipe!"}'
```

### Email (SMTP)
Credentials: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `from_address`.
Use curl or a script to send via SMTP.

### Todoist
```bash
API_TOKEN="<from credentials>"
curl -X POST "https://api.todoist.com/rest/v2/tasks" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"content": "Task from Screenpipe"}'
```

### Microsoft Teams
```bash
WEBHOOK_URL="<from credentials>"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Screenpipe!"}'
```

## Workflow

1. First, call `GET /connections` to see which services are connected
2. For any connected service, call `GET /connections/:id` to get credentials
3. Use the credentials directly to interact with the service's API
4. If a service is not connected, tell the user to connect it in Settings > Connections
