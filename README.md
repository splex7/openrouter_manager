# ClassKeys — OpenRouter Key Manager

A small professor/admin web app for provisioning and managing 50～100+ OpenRouter API keys.

## Features

- List OpenRouter keys and usage
- Search by student ID / student name
- Bulk-create keys from pasted roster text
- Per-key USD limits
- Daily / weekly / monthly reset
- Optional expiration date
- Enable / disable keys
- Change a key limit
- Delete keys
- One-time CSV export immediately after bulk creation
- Management API key stays server-side

## Security model

Never place the OpenRouter Management API key in browser JavaScript.

OpenRouter returns the plaintext API key only once when the key is created. This app deliberately does not persist plaintext student keys. After bulk creation, download the generated CSV and store it in an appropriately protected location.

For a real university deployment, add professor authentication before exposing this server to the internet.

## Run

Requires Node.js 18+.

```bash
export OPENROUTER_MANAGEMENT_KEY='your-management-key'
node server.js
```

Then open `http://localhost:8787`.
