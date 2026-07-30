# fibx-server

Backend for the [fibx](https://github.com/Fibrous-Finance/fibx) CLI. Proxies all Privy operations (OTP auth, wallet management, transaction signing) so the CLI never touches Privy credentials.

Built with [Hono](https://hono.dev) — works standalone (Docker, VPS) or serverless (Vercel, Cloudflare Workers).

### Wallet Model

Wallets are created as **app-managed** (no owner) — the server controls them via `APP_ID + APP_SECRET`. This is the recommended model for CLI agent wallets.

- Private keys never leave Privy's Trusted Execution Environment (TEE)
- Every wallet is created with a [signing policy](#wallet-policy-privy-signing-layer) that caps what it can sign
- User-to-wallet mapping is tracked via Privy `custom_metadata.server_wallet_id`
- On login, if an existing wallet requires owner authorization (legacy user-owned wallet), it is automatically re-provisioned as app-managed

Because the app secret alone authorizes signing, it is the single most sensitive
credential here — and the reason the wallet policy matters: it is the one limit
that still holds if this server is compromised.

## API

| Method | Endpoint            | Auth       | Rate Limit | Description                              |
| ------ | ------------------- | ---------- | ---------- | ---------------------------------------- |
| `POST` | `/auth/login`       | —          | 5 req/min  | Send OTP to email                        |
| `POST` | `/auth/verify`      | —          | 5 req/min  | Verify OTP, provision wallet, return JWT |
| `POST` | `/wallet/find`      | Bearer JWT | —          | Find existing wallet by email            |
| `POST` | `/wallet/create`    | Bearer JWT | 5 req/min  | Get or provision the caller's wallet     |
| `POST` | `/sign/transaction` | Bearer JWT | —          | Sign Ethereum transaction                |
| `POST` | `/sign/message`     | Bearer JWT | —          | Sign a message                           |
| `POST` | `/sign/typed-data`  | Bearer JWT | —          | Sign EIP-712 typed data                  |
| `GET`  | `/health`           | —          | —          | Health check                             |

> `/wallet/create` is idempotent: it returns the wallet named by the caller's
> JWT when that wallet still exists. It only provisions a new one when the
> mapped wallet is gone, and in that case the response also carries a refreshed
> `token`, because `server_wallet_id` has been repointed and the caller's old
> JWT would no longer pass the `/sign/*` ownership check.

## Setup

```bash
pnpm install
cp .env.example .env   # Fill in values below
pnpm dev
```

## Environment Variables

| Variable                      | Required | Default                              | Description                                    |
| ----------------------------- | -------- | ------------------------------------ | ---------------------------------------------- |
| `PRIVY_APP_ID`                | Yes      | —                                    | Privy application ID                           |
| `PRIVY_APP_SECRET`            | Yes      | —                                    | Privy application secret                       |
| `JWT_SECRET`                  | Yes      | —                                    | Secret for signing session JWTs (min 32 chars) |
| `PORT`                        | No       | `3001`                               | Server port                                    |
| `NODE_ENV`                    | No       | `development`                        | `development`, `production`, or `test`         |
| `PUBLIC_URL`                  | No       | —                                    | Public URL for Origin header in production     |
| `ALLOWED_ORIGINS`             | No       | —                                    | Comma-separated allowed CORS origins           |
| `TRUST_PROXY_HOPS`            | No       | `1`                                  | Reverse proxies in front (see below)           |
| `ALLOWED_CHAIN_IDS`           | No       | `8453,4114,999,143`                  | Chain IDs this deployment will sign for        |
| `WALLET_POLICY_ID`            | No       | —                                    | Privy policy attached to new agent wallets     |
| `WALLET_POLICY_MAX_TX_NATIVE` | No       | `8453:0.5,4114:0.005,999:25,143:500` | Per-tx native value caps per chain             |

**`TRUST_PROXY_HOPS`** controls how the rate limiter identifies a client.
Forwarding headers are client-writable, and each proxy _appends_ the address it
saw, so the limiter counts this many entries in from the right of
`X-Forwarded-For`. Set it to the number of proxies actually in front of the
service — `1` behind App Runner or a single load balancer, `0` when the service
is directly exposed (then no forwarding header is trusted and the socket address
is used). Setting it too high lets a client forge its own bucket key.

**`ALLOWED_CHAIN_IDS`** bounds the signing oracle: `/sign/transaction` and
`/sign/typed-data` reject payloads targeting any other chain, so a stolen token
cannot be used to sign on an unrelated network.

## Wallet Policy (Privy signing layer)

Every agent wallet is created with a [Privy policy](https://docs.privy.io/controls/policies/overview)
attached. Privy policies are default-deny and enforced inside Privy's TEE at
signing time, so these limits hold **even if this server is fully compromised**:

- Transactions are only signed for the chains in the policy, each under its
  per-transaction native value cap (`WALLET_POLICY_MAX_TX_NATIVE`).
- Private key export is explicitly denied.
- Message signing and typed-data signing stay enabled (the login flow's
  signMessage probe depends on it).

On first wallet creation with no `WALLET_POLICY_ID` set, the server creates the
policy and logs its id — pin it via `WALLET_POLICY_ID` afterwards. Policy
changes (e.g. new caps) require creating a new policy; existing wallets keep
the policy they were created with. Note the caps apply to native value only;
ERC-20 amounts live in calldata and are bounded by the server's schema layer
instead.

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

- Auth and wallet-provisioning endpoints are rate-limited (5 req/min per client)
- The client is identified by counting `TRUST_PROXY_HOPS` entries in from the right of `X-Forwarded-For`, so a client cannot forge a fresh bucket by sending its own header
- In-memory rate limiter with ordered-Map cleanup (O(k) where k = expired entries)
- `maxStoreSize` cap (10,000 entries) with LRU eviction to prevent memory exhaustion
- Standard `X-RateLimit-*` and `Retry-After` headers on all rate-limited responses

> The limiter is per instance. Running multiple instances multiplies the
> effective limit; a shared store would be needed for strict global limits.

### Access Control

- All wallet/signing endpoints require a valid JWT (HS256, 7-day expiry)
- Signing endpoints verify wallet ownership — users can only sign with their own wallet (`requireWalletOwnership`)
- `/sign/*` payloads are validated against strict schemas: unknown fields, contract creation, and chains outside `ALLOWED_CHAIN_IDS` are rejected before reaching Privy
- Beyond that, the [wallet policy](#wallet-policy-privy-signing-layer) enforces value caps inside Privy itself

### Credential Protection

- `PRIVY_APP_SECRET` is the most critical credential — it grants full access to all app-managed wallets
- Privy credentials never leave the server, are never sent to the CLI
- `JWT_SECRET` must be at least 32 characters (enforced via Zod schema validation)

### Key Custody

- Private keys are managed by Privy's TEE (Trusted Execution Environment) with MPC key sharding
- Neither the server nor the CLI ever sees a private key
- Keys are temporarily reconstructed inside the TEE only during signing, then immediately re-sharded

## Development

```bash
pnpm install
pnpm dev          # watch mode, loads .env
pnpm test         # vitest unit tests
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # tsc to dist/
```

## Related

- [fibx](https://github.com/Fibrous-Finance/fibx) — the CLI and MCP server this backend serves
- [fibx-telegram-bot](https://github.com/Fibrous-Finance/fibx-telegram-bot) — Telegram interface
- [fibx-skills](https://github.com/Fibrous-Finance/fibx-skills) — Agent Skills

## License

[MIT](https://opensource.org/licenses/MIT)
