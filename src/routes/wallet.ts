import { Hono } from "hono";
import {
	findWalletSchema,
	createWalletSchema,
	validateBody,
} from "../lib/validation.js";
import {
	findExistingWallet,
	createAgentWallet,
	saveWalletIdToUser,
} from "../services/privy.js";
import { authMiddleware, type JwtPayload } from "../middleware/auth.js";

type Variables = { jwtPayload: JwtPayload };

const wallet = new Hono<{ Variables: Variables }>();

// All wallet routes require authentication
wallet.use("/*", authMiddleware);

/**
 * POST /wallet/find
 * Find an existing wallet by email.
 * Only allows querying the authenticated user's wallet.
 */
wallet.post("/find", async (c) => {
	const { email } = await validateBody(c, findWalletSchema);

	const existing = await findExistingWallet(email);

	if (!existing) {
		return c.json({ wallet: null });
	}

	// Security: verify the found wallet belongs to the authenticated user
	const jwtPayload = c.get("jwtPayload");
	if (existing.id !== jwtPayload.walletId) {
		return c.json({ wallet: null });
	}

	return c.json({ wallet: existing });
});

/**
 * POST /wallet/create
 * Create a new server wallet for the authenticated user.
 */
wallet.post("/create", async (c) => {
	await validateBody(c, createWalletSchema);

	const jwtPayload = c.get("jwtPayload");
	const userId = jwtPayload.userId;

	const newWallet = await createAgentWallet({ userId });

	// Save new wallet ID to user metadata
	await saveWalletIdToUser(userId, newWallet.id);

	return c.json({ wallet: newWallet });
});

export default wallet;
