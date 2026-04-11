# fibx-server

Backend for the [fibx](https://github.com/ahmetenesdur/fibx) CLI. Proxies all Privy operations (OTP auth, wallet management, transaction signing) so the CLI never touches Privy credentials.

Built with [Hono](https://hono.dev) — works standalone (Docker, VPS) or serverless (Vercel, Cloudflare Workers).

### Wallet Model

Wallets are created as **app-managed** (no owner) — the server controls them via `APP_ID + APP_SECRET`. This is the recommended model for CLI agent wallets.

- Private keys never leave Privy's Trusted Execution Environment (TEE)
- User-to-wallet mapping is tracked via Privy `custom_metadata.server_wallet_id`
- On login, if an existing wallet requires owner authorization (legacy user-owned wallet), it is automatically re-provisioned as app-managed

## API

| Method | Endpoint            | Auth       | Rate Limit | Description                              |
| ------ | ------------------- | ---------- | ---------- | ---------------------------------------- |
| `POST` | `/auth/login`       | —          | 5 req/min  | Send OTP to email                        |
| `POST` | `/auth/verify`      | —          | 5 req/min  | Verify OTP, provision wallet, return JWT |
| `POST` | `/wallet/find`      | Bearer JWT | —          | Find existing wallet by email            |
| `POST` | `/wallet/create`    | Bearer JWT | —          | Create new server wallet                 |
| `POST` | `/sign/transaction` | Bearer JWT | —          | Sign Ethereum transaction                |
| `POST` | `/sign/message`     | Bearer JWT | —          | Sign a message                           |
| `POST` | `/sign/typed-data`  | Bearer JWT | —          | Sign EIP-712 typed data                  |
| `GET`  | `/health`           | —          | —          | Health check                             |

## Setup

```bash
pnpm install
cp .env.example .env   # Fill in values below
pnpm dev
```

## Environment Variables

| Variable           | Required | Default       | Description                                    |
| ------------------ | -------- | ------------- | ---------------------------------------------- |
| `PRIVY_APP_ID`     | Yes      | —             | Privy application ID                           |
| `PRIVY_APP_SECRET` | Yes      | —             | Privy application secret                       |
| `JWT_SECRET`       | Yes      | —             | Secret for signing session JWTs (min 32 chars) |
| `PORT`             | No       | `3001`        | Server port                                    |
| `NODE_ENV`         | No       | `development` | `development`, `production`, or `test`         |
| `PUBLIC_URL`       | No       | —             | Public URL for Origin header in production     |
| `ALLOWED_ORIGINS`  | No       | —             | Comma-separated allowed CORS origins           |

## Deployment

### Standalone (Docker, VPS)

The server starts automatically via `@hono/node-server` when `NODE_ENV` is `development` or `production`:

```bash
pnpm build
node dist/src/index.js
```

### Serverless (Vercel, Cloudflare Workers)

The Hono app is exported as the default module:

```typescript
import app from "./src/index.js";
export default app;
```

Use your platform's Hono adapter accordingly.

## Security

### Rate Limiting

- Auth endpoints are rate-limited (5 req/min per IP via `CF-Connecting-IP` or `X-Forwarded-For`)
- In-memory rate limiter with ordered-Map cleanup (O(k) where k = expired entries)
- `maxStoreSize` cap (10,000 entries) with LRU eviction to prevent memory exhaustion
- Standard `X-RateLimit-*` and `Retry-After` headers on all rate-limited responses

### Access Control

- All wallet/signing endpoints require a valid JWT (HS256, 7-day expiry)
- Signing endpoints verify wallet ownership — users can only sign with their own wallet (`requireWalletOwnership`)

### Credential Protection

- `PRIVY_APP_SECRET` is the most critical credential — it grants full access to all app-managed wallets
- Privy credentials never leave the server, are never sent to the CLI
- `JWT_SECRET` must be at least 32 characters (enforced via Zod schema validation)

### Key Custody

- Private keys are managed by Privy's TEE (Trusted Execution Environment) with MPC key sharding
- Neither the server nor the CLI ever sees a private key
- Keys are temporarily reconstructed inside the TEE only during signing, then immediately re-sharded

## License

[MIT](https://opensource.org/licenses/MIT)
