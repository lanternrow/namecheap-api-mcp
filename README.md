# namecheap-api-mcp

[![npm version](https://img.shields.io/npm/v/namecheap-api-mcp.svg)](https://www.npmjs.com/package/namecheap-api-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for the **[Namecheap API](https://www.namecheap.com/support/api/intro/)** — manage domains, DNS, contacts, registrar locks, and view SSL certificates and pricing, straight from your AI assistant.

Built for [Claude Code](https://claude.ai/claude-code) and any MCP-compatible AI tool.

Part of **[The SEO Engine](https://lanternrow.com/seo-engine/)** toolkit by [Rex Jones](https://rexjones.me) — AI-powered SEO and social media tooling for agencies and businesses.

## Safety model

This server ships **read + safe-write** tools only. It can read your account and change DNS / nameserver / forwarding / lock **configuration** (all reversible), but it **deliberately excludes anything that spends money or is irreversible**: no domain registration, renewal, reactivation, transfers, SSL purchase/activation, add-funds, or account/address mutation. You can fork and add those if you need them.

## Quick start

### 1. Enable Namecheap API access

1. Go to **Profile → Tools → [Namecheap API Access](https://ap.www.namecheap.com/settings/tools/apiaccess/)** and toggle it **ON**. (Production access requires account eligibility: 20+ domains, OR a $50+ balance, OR $50+ lifetime spend.)
2. Copy your **API key**.
3. **Whitelist the public IPv4** of the machine that will run this server (the API rejects any non-whitelisted IP with error `1011150`).

### 2. Configure your MCP client

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "npx",
      "args": ["-y", "namecheap-api-mcp"],
      "env": {
        "NAMECHEAP_API_USER": "your_username",
        "NAMECHEAP_API_KEY": "your_api_key",
        "NAMECHEAP_CLIENT_IP": "your.whitelisted.ip.v4"
      }
    }
  }
}
```

### Option: clone and build

```bash
git clone https://github.com/lanternrow/namecheap-api-mcp.git
cd namecheap-api-mcp
npm install
npm run build
```

Then point your client at `node /path/to/namecheap-api-mcp/dist/index.js`. For local credentials you can keep a gitignored `.env` (copy `.env.example`) and launch with Node's native flag: `node --env-file=.env dist/index.js`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NAMECHEAP_API_USER` | Yes | Your Namecheap account username (API user). |
| `NAMECHEAP_API_KEY` | Yes | API key from Profile → Tools → API Access. **Secret.** |
| `NAMECHEAP_CLIENT_IP` | Yes | The whitelisted public IPv4 of this machine. |
| `NAMECHEAP_USERNAME` | No | Defaults to `NAMECHEAP_API_USER`; differs only for reseller sub-users. |
| `NAMECHEAP_ENVIRONMENT` | No | `production` (default) or `sandbox`. |

## Tools

### Read

| Tool | Description |
|------|-------------|
| `check_connection` | Verify credentials + IP whitelist; returns the account balance summary. |
| `list_domains` | List domains with expiry, lock, auto-renew, and WhoisGuard status (paged/searchable). |
| `get_domain_info` | Detailed info for one domain. |
| `check_domains` | Check availability + premium pricing (up to 50 at once). |
| `get_domain_contacts` | Registrant / Tech / Admin / AuxBilling contacts. |
| `get_registrar_lock` | Registrar lock status. |
| `get_dns_hosts` | All DNS host records for a domain. |
| `get_nameservers` | Nameservers and whether Namecheap DNS is in use. |
| `get_email_forwarding` | Email forwarding rules. |
| `get_pricing` | Namecheap pricing for a product type (cache the results). |
| `list_ssl_certificates` | SSL certificates with type, host, status, expiry. |

### Safe writes (configuration only — no charges)

| Tool | Description |
|------|-------------|
| `set_dns_hosts` | Replace **all** host records (destructive: omitted records are deleted — send the full set). |
| `set_default_dns` | Switch a domain to Namecheap's default nameservers. |
| `set_custom_nameservers` | Point a domain at custom nameservers. |
| `set_email_forwarding` | Set email forwarding rules. |
| `set_registrar_lock` | Lock / unlock a domain at the registrar. |

## Notes & gotchas

- **`set_dns_hosts` is destructive by API design.** Namecheap's `setHosts` deletes every record not included in the call. Always read current records first (`get_dns_hosts`), merge your change, then send the complete set.
- **Errors return HTTP 200.** The Namecheap API signals failure in the XML body (`Status="ERROR"`), not the HTTP status. This server parses that and throws a real error with the Namecheap error number + message.
- **IPv4 only** for the whitelisted client IP.

## Security

- Credentials are read from environment variables only — never hard-coded, logged, or written to disk by this server.
- The API key travels in the query string (Namecheap's design); this server never logs the request URL or key, and error messages surface only the Namecheap error number and text.

## License

MIT © [Rex Jones](https://rexjones.me)
