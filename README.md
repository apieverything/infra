# API Everything — infrastructure

One command to run the **whole** API Everything stack locally, as close to
production as possible: three connectors, the unified gateway and the site.

```bash
./deploy.sh
```

That's it. Then open <http://localhost:8180/app.html>, create your account,
**save the 16-digit unlock code**, unlock it to create an **API key**, and call
<http://localhost:9100> with that key exactly like a hosted customer would.

The unlock code (`X-Unlock-Code`) only opens the account. It is **never** an API
key: an `ae_…` API key (`X-API-Key`) is what your code uses, and it can be
created, reset or revoked without touching the account or its credits.

## What `./deploy.sh` does

1. Clones `apieverything/connectors`, `apieverything/core` and
   `apieverything/web` if they are not already present next to this file.
2. Generates `.deploy/.env` with a **random admin token** (kept across runs) and
   `.deploy/config.js` pointing the dashboard at the local gateway.
3. `docker compose up -d --build` for five services:

   | Service | Network | Exposed |
   | --- | --- | --- |
   | `instagram` | internal `ae` | no |
   | `linkedin` | internal `ae` | no |
   | `tiktok` | internal `ae` | no |
   | `core` | internal `ae` | `localhost:9100` |
   | `web` | internal `ae` | `localhost:8180` |

   Only the gateway and the site are published to the host — clients never talk
   to a connector directly, which is exactly the production topology.
4. Waits for health, verifies the gateway sees all three connectors, and issues
   a **ready-to-use voucher** so "Add quota" can be tested immediately.
5. Prints the URLs, the admin token and copy-paste `curl` examples.

## Commands

| Command | Purpose |
| --- | --- |
| `./deploy.sh` / `up` | Build and start everything |
| `./deploy.sh down` | Stop (keeps the key database volume) |
| `./deploy.sh status` | Health of gateway, site and each connector |
| `./deploy.sh key` | Create an account + its first API key (stdout = API key, stderr = unlock code) |
| `./deploy.sh apikey <code>` | Create another API key for that account |
| `./deploy.sh keys <code>` | List the account's API keys (sanitized, no raw keys) |
| `./deploy.sh rotate <code> [keyId]` | Reset one API key, or all of them |
| `./deploy.sh revoke <code> <keyId>` | Revoke one API key |
| `./deploy.sh voucher` | Issue a new 500-credit prepaid voucher |
| `./deploy.sh logs` | Follow all logs |
| `./deploy.sh urls` | Print endpoints |
| `./deploy.sh check` | Lint every `run:` shell block of the 5 CI workflows (no network) |

`<code>` is always the **16-digit unlock code**, never an API key.

Overrides: `WEB_PORT`, `CORE_PORT`, `CORE_STARTER_CREDITS`.

`check` extracts each `run:` block from this repo's workflow and the workflows of
`.profile`, `connectors`, `core` and `web`, and runs `bash -n` on it (missing
component repos are skipped). A typo inside a YAML literal block is invisible to
a YAML parser but fails on GitHub with an opaque "exit code 2" — this catches it
locally before pushing.

## Test the full PayAsYouGo flow

```bash
./deploy.sh up

# stdout = API key (ae_…), stderr = your 16-digit unlock code — SAVE IT
KEY=$(./deploy.sh key)
CODE=<the 16-digit unlock code printed above>

curl "http://localhost:9100/v1/usage" -H "X-API-Key: $KEY"
curl "http://localhost:9100/v1/instagram/kametolol/posts?limit=2" -H "X-API-Key: $KEY"
# → 200 with X-Credits-Cost: 3 and X-Credits-Remaining

# The unlock code is explicitly refused as an API key:
curl "http://localhost:9100/v1/usage" -H "X-API-Key: $CODE"
# → 401 UNLOCK_CODE_NOT_API_KEY

# Create, list, rotate and revoke API keys (credits never move):
./deploy.sh keys "$CODE"
NEW=$(./deploy.sh apikey "$CODE")
./deploy.sh rotate "$CODE"
./deploy.sh revoke "$CODE" <keyId from ./deploy.sh keys>

./deploy.sh voucher              # paste the code in the dashboard → Add quota
```

Or use the browser: open the dashboard, click **Create my account**, save the
unlock code, unlock it to reveal your first API key, then manage keys in the
**API keys** panel and **Add credits** with the voucher printed by
`./deploy.sh up`. Failed or empty upstream responses are never charged. No
subscription, no monthly reset.

## Security notes

- `.deploy/` is gitignored: it holds the local admin token and generated config.
  The public `web/assets/config.js` keeps `GATEWAY_URL` empty so the live site
  stays honest ("not launched") until a real hosted gateway is deployed.
- The 16-digit unlock code opens the account; only `ae_…` API keys are accepted
  for API calls. The gateway stores SHA-256 hashes of both, never the raw
  values. A leaked API key is rotated in one command; a leaked unlock code is
  the account itself — keep it out of scripts, CI secrets and screenshots.
- Connector proxy credentials from your local `.env` are **not** used by the
  stack; proxies are explicitly disabled. Set them via environment overrides if
  you want to test that path.
- The core key database lives in a named Docker volume; `down` keeps it. A v1
  database is migrated in place on first read (old 16-digit keys become unlock
  codes, credits preserved, no API key minted automatically).

## Repositories

- [`infra`](https://github.com/apieverything/infra) — one-command deployment (this repository)
- [`core`](https://github.com/apieverything/core) — unified gateway (unlock code, rotatable API keys, credits, vouchers)
- [`connectors`](https://github.com/apieverything/connectors) — Instagram, LinkedIn, TikTok
- [`web`](https://github.com/apieverything/web) — public site and dashboard
- [`.github`](https://github.com/apieverything/.github) — organization profile

Each repository has its own offline CI. This repo holds only deployment files;
its CI checks the shell syntax, the Compose file and that no admin token was
committed.

## License

MIT with an attribution notice — credit **API Everything** if you reuse it.
