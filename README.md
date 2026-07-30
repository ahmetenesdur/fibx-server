# fibx-server

Backend for the [fibx](https://github.com/Fibrous-Finance/fibx) CLI. Proxies all Privy operations (OTP auth, wallet management, transaction signing) so the CLI never touches Privy credentials.

Built with [Hono](https://hono.dev) — works standalone (Docker, VPS) or serverless (Vercel, Cloudflare Workers).

### Wallet Model

Wallets are created as **app-managed** (no owner) — the server controls them
via `PRIVY_APP_ID + PRIVY_APP_SECRET`.

- The service does not expose a raw private-key endpoint: transaction requests
  return signed transaction payloads, while message and typed-data requests
  return signatures
- Every wallet is created with a
  [signing policy](#wallet-policy-privy-signing-layer); the server-generated
  policy evaluates chain and native `value` limits for transaction signing
- User-to-wallet mapping is tracked via Privy `custom_metadata.server_wallet_id`
- On login, if an existing wallet requires owner authorization (legacy user-owned wallet), it is automatically re-provisioned as app-managed

Because the app credentials authorize signing and policy administration, they
and the server that holds them form the administrative trust boundary. The
attached policy adds defense in depth to the normal signing path; it is not a
containment guarantee after full server or app-admin credential compromise.

## API

| Method | Endpoint            | Auth       | Rate Limit | Description                              |
| ------ | ------------------- | ---------- | ---------- | ---------------------------------------- |
| `POST` | `/auth/login`       | —          | 5 req/min  | Send OTP to email                        |
| `POST` | `/auth/verify`      | —          | 5 req/min  | Verify OTP, provision wallet, return JWT |
| `POST` | `/wallet/find`      | Bearer JWT | —          | Find existing wallet by email            |
| `POST` | `/wallet/create`    | Bearer JWT | 5 req/min  | Get or provision the caller's wallet     |
| `POST` | `/sign/transaction` | Bearer JWT | —          | Return a signed Ethereum transaction     |
| `POST` | `/sign/message`     | Bearer JWT | —          | Return a message signature               |
| `POST` | `/sign/typed-data`  | Bearer JWT | —          | Return an EIP-712 signature              |
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
| `WALLET_POLICY_ID`            | No       | —                                    | Existing Privy policy ID (existence checked)   |
| `WALLET_POLICY_MAX_TX_NATIVE` | No       | `8453:0.5,4114:0.005,999:25,143:500` | Native caps for server-generated policy rules  |

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

Every newly created agent wallet has a
[Privy policy](https://docs.privy.io/controls/policies/overview) attached.
Privy evaluates the attached policy when it receives a signing request. For the
policy generated by this server:

- Each `eth_signTransaction` allow rule matches one chain and caps the
  transaction's native `value` at `WALLET_POLICY_MAX_TX_NATIVE`.
- An `exportPrivateKey` DENY rule is included in the current generated rule
  set. This describes the attached policy's current behavior, not a permanent
  or immutable guarantee.
- `personal_sign` and `eth_signTypedData_v4` are enabled without policy-side
  content conditions (the login flow depends on message signing). Their safety
  depends on this server's authentication and payload validation. Typed-data
  domains are checked against `ALLOWED_CHAIN_IDS` when a `chainId` is present.

On first wallet creation with no `WALLET_POLICY_ID` set, the server creates the
policy and logs its id — pin it via `WALLET_POLICY_ID` afterwards. When
`WALLET_POLICY_ID` is configured, the server fetches it to confirm that it
exists, but it does **not** compare that policy's rules with the rules generated
from `WALLET_POLICY_MAX_TX_NATIVE`; operators must audit the configured policy.
Existing wallets retain the policy ID attached when they were created.

The transaction cap applies only to the top-level native `value`. ERC-20
amounts, contract methods, and other calldata are not interpreted by these
policy rules, so those paths rely on this server's authentication, schema, and
application-level validation. The app credentials can administer app-managed
wallets and their policies, which is why this layer is defense in depth rather
than protection from full compromise of that same administrative boundary.

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
- The server-generated
  [wallet policy](#wallet-policy-privy-signing-layer) evaluates chain and
  top-level native `value` conditions for transaction signing; it does not
  inspect ERC-20 or arbitrary contract calldata

### Credential Protection

- `PRIVY_APP_SECRET` is the most critical credential — together with the app
  identity it authorizes app-managed wallet operations and is part of the
  policy-administration trust boundary
- Privy credentials never leave the server, are never sent to the CLI
- `JWT_SECRET` must be at least 32 characters (enforced via Zod schema validation)

### Key Custody

- This service has no endpoint that returns raw private-key material.
- `/sign/transaction` returns the signed transaction payload supplied by
  Privy's signing API; `/sign/message` and `/sign/typed-data` return signatures.
- The CLI receives those signed payloads or signatures, not a raw private key,
  through this service.

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
