import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { findWalletSchema, createWalletSchema } from "../lib/validation.js";
import {
	findExistingWallet,
	getWalletById,
	createAgentWallet,
	saveWalletIdToUser,
} from "../services/privy.js";
import { authMiddleware, generateToken, type JwtPayload } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

type Variables = { jwtPayload: JwtPayload };

const wallet = new Hono<{ Variables: Variables }>();

wallet.use("/*", authMiddleware);

// Wallet provisioning touches Privy's API and mutates user metadata — cap it
// the same way /auth/* is capped rather than leaving it unbounded.
const walletRateLimit = rateLimit({ maxRequests: 5, windowMs: 60_000 });

wallet.post("/find", zValidator("json", findWalletSchema), async (c) => {
	const { email } = c.req.valid("json");

	const existing = await findExistingWallet(email);

	if (!existing) {
		return c.json({ wallet: null });
	}

	const jwtPayload = c.get("jwtPayload");
	if (existing.id !== jwtPayload.walletId) {
		return c.json({ wallet: null });
	}

	return c.json({ wallet: existing });
});

wallet.post("/create", walletRateLimit, zValidator("json", createWalletSchema), async (c) => {
	const jwtPayload = c.get("jwtPayload");
	const userId = jwtPayload.userId;

	// Idempotent by design: saveWalletIdToUser overwrites server_wallet_id, so
	// minting a second wallet would orphan the first one — it would keep any
	// funds while nothing maps back to it. Return what the user already has.
	const existing = await getWalletById(jwtPayload.walletId);
	if (existing) {
		return c.json({ wallet: existing, created: false });
	}

	const newWallet = await createAgentWallet();
	await saveWalletIdToUser(userId, newWallet.id);

	// The caller's JWT still names the previous wallet, and /sign/* enforces
	// that claim — hand back a token that matches the wallet we just created.
	const token = await generateToken({
		userId,
		walletId: newWallet.id,
		walletAddress: newWallet.address,
	});

	return c.json({ wallet: newWallet, created: true, token });
});

export default wallet;
