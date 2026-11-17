# API Everything — infrastructure

One command to run the **whole** API Everything stack locally, as close to
production as possible: three connectors, the unified gateway and the site.

```bash
./deploy.sh
```

That's it. Then open <http://localhost:8180/app.html>, create your 16-digit
key, save it, and use it against <http://localhost:9100> exactly like a hosted
customer would.

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
| `./deploy.sh key` | Create a 16-digit key, shown once |
| `./deploy.sh voucher` | Issue a new 500-credit prepaid voucher |
| `./deploy.sh logs` | Follow all logs |
| `./deploy.sh urls` | Print endpoints |
| `./deploy.sh check` | Lint every `run:` shell block of the 4 CI workflows (no network) |

Overrides: `WEB_PORT`, `CORE_PORT`, `CORE_STARTER_CREDITS`.

`check` extracts each `run:` block from the workflows of `.profile`, `connectors`,
`core` and `web` and runs `bash -n` on it. A typo inside a YAML literal block is
invisible to a YAML parser but fails on GitHub with an opaque "exit code 2" —
this catches it locally before pushing.

## Test the full PayAsYouGo flow

```bash
./deploy.sh up
KEY=$(./deploy.sh key)                    # 16 digits — stdout is the key only
curl "http://localhost:9100/v1/usage" -H "X-API-Key: $KEY"
curl "http://localhost:9100/v1/instagram/kametolol/posts?limit=2" -H "X-API-Key: $KEY"
# → 200 with X-Credits-Cost: 3 and X-Credits-Remaining

./deploy.sh voucher                        # paste the code in the dashboard
```

Or use the browser: open the dashboard, click **Create my key**, save it, then
**Add credits** with the voucher printed by `./deploy.sh up`. Failed or empty
upstream responses are never charged. No subscription, no monthly reset.

## Security notes

- `.deploy/` is gitignored: it holds the local admin token and generated config.
  The public `web/assets/config.js` keeps `GATEWAY_URL` empty so the live site
  stays honest ("not launched") until a real hosted gateway is deployed.
- Connector proxy credentials from your local `.env` are **not** used by the
  stack; proxies are explicitly disabled. Set them via environment overrides if
  you want to test that path.
- The core key database lives in a named Docker volume; `down` keeps it.

## Repositories

- [`core`](https://github.com/apieverything/core) — unified gateway (keys, credits, vouchers)
- [`connectors`](https://github.com/apieverything/connectors) — Instagram, LinkedIn, TikTok
- [`web`](https://github.com/apieverything/web) — public site and dashboard
- [`.github`](https://github.com/apieverything/.github) — organization profile

Each repository has its own CI running the offline test suites. This infra repo
contains only deployment files; it is local-only until a remote is configured.

## License

MIT with an attribution notice — credit **API Everything** if you reuse it.
