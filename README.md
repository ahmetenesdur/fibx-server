# fibx-server

Backend server for **fibx** CLI. Proxies all Privy operations (OTP auth, wallet management, transaction signing) so the CLI doesn't need to embed Privy credentials.

## Architecture

```
CLI (fibx)  →  fibx-server  →  Privy API
```

The CLI sends HTTP requests to this server. The server holds `PRIVY_APP_ID` and `PRIVY_APP_SECRET` securely and proxies all operations through the Privy Node SDK.

## API Endpoints

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
# Install dependencies
pnpm install

# Copy env template and fill in values
cp .env.example .env

# Start development server
pnpm dev
```

## Environment Variables

| Variable           | Required | Description                     |
| ------------------ | -------- | ------------------------------- |
| `PRIVY_APP_ID`     | ✅       | Privy application ID            |
| `PRIVY_APP_SECRET` | ✅       | Privy application secret        |
| `JWT_SECRET`       | ✅       | Secret for signing session JWTs |
| `PORT`             | ❌       | Server port (default: 3001)     |

## Deployment (Vercel)

```bash
vercel deploy
```

Set environment variables in Vercel dashboard:

- `PRIVY_APP_ID`
- `PRIVY_APP_SECRET`
- `JWT_SECRET`
- `NODE_ENV=production`

## Security

- **JWT Authentication**: All wallet/signing endpoints require a valid JWT
- **Wallet Ownership**: Signing endpoints verify that the JWT's `walletId` matches the requested wallet
- **Secrets Server-Side**: Privy credentials never leave the server
