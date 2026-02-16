import type { Context, Next } from "hono";
import * as jose from "jose";
import { ApiError } from "../lib/errors.js";

import { config } from "../lib/config.js";

export interface JwtPayload {
	userId: string;
	walletId: string;
	walletAddress: string;
}

const JWT_ISSUER = "fibx-server";
const JWT_AUDIENCE = "fibx-cli";

function getJwtSecret(): Uint8Array {
	return new TextEncoder().encode(config.JWT_SECRET);
}

export async function generateToken(payload: JwtPayload): Promise<string> {
	const secret = getJwtSecret();

	return new jose.SignJWT({ ...payload })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("7d")
		.setIssuer(JWT_ISSUER)
		.setAudience(JWT_AUDIENCE)
		.sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
	const secret = getJwtSecret();

	try {
		const { payload } = await jose.jwtVerify(token, secret, {
			issuer: JWT_ISSUER,
			audience: JWT_AUDIENCE,
		});

		const userId = payload.userId;
		const walletId = payload.walletId;
		const walletAddress = payload.walletAddress;

		if (
			typeof userId !== "string" ||
			typeof walletId !== "string" ||
			typeof walletAddress !== "string" ||
			!userId ||
			!walletId ||
			!walletAddress
		) {
			throw new ApiError(401, "Token contains invalid claims", "INVALID_TOKEN_CLAIMS");
		}

		if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
			throw new ApiError(
				401,
				"Token contains invalid wallet address",
				"INVALID_TOKEN_CLAIMS"
			);
		}

		return { userId, walletId, walletAddress };
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(401, "Invalid or expired token", "INVALID_TOKEN");
	}
}

export async function authMiddleware(c: Context, next: Next) {
	const authHeader = c.req.header("Authorization");

	if (!authHeader?.startsWith("Bearer ")) {
		throw new ApiError(401, "Missing or invalid Authorization header", "UNAUTHORIZED");
	}

	const token = authHeader.slice(7);

	if (!token || token.length < 10) {
		throw new ApiError(401, "Invalid token format", "UNAUTHORIZED");
	}

	const payload = await verifyToken(token);

	c.set("jwtPayload", payload);
	await next();
}

export function requireWalletOwnership(c: Context, requestedWalletId: string) {
	const payload = c.get("jwtPayload") as JwtPayload;

	if (!requestedWalletId || payload.walletId !== requestedWalletId) {
		throw new ApiError(403, "You can only sign with your own wallet", "WALLET_MISMATCH");
	}
}
