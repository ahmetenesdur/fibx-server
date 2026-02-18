# fibx-server

Backend for the [fibx](https://github.com/ahmetenesdur/fibx) CLI. Proxies all Privy operations (OTP auth, wallet management, transaction signing) so the CLI never touches Privy credentials.

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

| Variable           | Required | Description                     |
| ------------------ | -------- | ------------------------------- |
| `PRIVY_APP_ID`     | Yes      | Privy application ID            |
| `PRIVY_APP_SECRET` | Yes      | Privy application secret        |
| `JWT_SECRET`       | Yes      | Secret for signing session JWTs |
| `PORT`             | No       | Server port (default: 3001)     |
| `PUBLIC_URL`       | No       | Public URL for Origin header    |

## Security

- All wallet/signing endpoints require a valid JWT
- Signing endpoints verify wallet ownership via the JWT's `walletId` claim
- Privy credentials never leave the server
