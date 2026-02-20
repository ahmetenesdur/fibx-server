# fibx-server

Backend for the [fibx](https://github.com/ahmetenesdur/fibx) CLI. Proxies all Privy operations (OTP auth, wallet management, transaction signing) so the CLI never touches Privy credentials.

### Wallet Model

Wallets are created as **app-managed** (no owner) — the server controls them via `APP_ID + APP_SECRET`. This is the recommended model for CLI agent wallets.

- Private keys never leave Privy's Trusted Execution Environment (TEE)
- User-to-wallet mapping is tracked via Privy `custom_metadata.server_wallet_id`
- On login, if an existing wallet requires owner authorization (legacy user-owned wallet), it is automatically re-provisioned as app-managed

## API

| Method | Endpoint            | Auth       | Description                              |
| ------ | ------------------- | ---------- | ---------------------------------------- |
| `POST` | `/auth/login`       | —          | Send OTP to email                        |
| `POST` | `/auth/verify`      | —          | Verify OTP, provision wallet, return JWT |
| `POST` | `/wallet/find`      | Bearer JWT | Find existing wallet by email            |
| `POST` | `/wallet/create`    | Bearer JWT | Create new server wallet                 |
| `POST` | `/sign/transaction` | Bearer JWT | Sign Ethereum transaction                |
| `POST` | `/sign/message`     | Bearer JWT | Sign a message                           |
| `POST` | `/sign/typed-data`  | Bearer JWT | Sign EIP-712 typed data                  |
| `GET`  | `/health`           | —          | Health check                             |

## Setup

```bash
pnpm install
cp .env.example .env   # Fill in values below
pnpm dev
```

## Environment Variables

| Variable           | Required | Description                                    |
| ------------------ | -------- | ---------------------------------------------- |
| `PRIVY_APP_ID`     | Yes      | Privy application ID                           |
| `PRIVY_APP_SECRET` | Yes      | Privy application secret                       |
| `JWT_SECRET`       | Yes      | Secret for signing session JWTs (min 32 chars) |
| `PORT`             | No       | Server port (default: 3001)                    |
| `PUBLIC_URL`       | No       | Public URL for Origin header                   |
| `ALLOWED_ORIGINS`  | No       | Comma-separated allowed CORS origins           |

## Security

### Access Control

- All wallet/signing endpoints require a valid JWT (HS256, 7-day expiry)
- Signing endpoints verify wallet ownership — users can only sign with their own wallet (`requireWalletOwnership`)
- Auth endpoints are rate-limited (5 req/min)

### Credential Protection

- `PRIVY_APP_SECRET` is the most critical credential — it grants full access to all app-managed wallets
- Privy credentials never leave the server, are never sent to the CLI
- `JWT_SECRET` must be at least 32 characters (enforced via Zod schema validation)

### Key Custody

- Private keys are managed by Privy's TEE (Trusted Execution Environment) with MPC key sharding
- Neither the server nor the CLI ever sees a private key
- Keys are temporarily reconstructed inside the TEE only during signing, then immediately re-sharded
