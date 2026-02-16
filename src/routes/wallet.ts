import { Hono } from "hono";
import { findWalletSchema, createWalletSchema, validateBody } from "../lib/validation.js";
import { findExistingWallet, createAgentWallet, saveWalletIdToUser } from "../services/privy.js";
import { authMiddleware, type JwtPayload } from "../middleware/auth.js";

type Variables = { jwtPayload: JwtPayload };

const wallet = new Hono<{ Variables: Variables }>();

wallet.use("/*", authMiddleware);

wallet.post("/find", async (c) => {
	const { email } = await validateBody(c, findWalletSchema);

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

wallet.post("/create", async (c) => {
	await validateBody(c, createWalletSchema);

	const jwtPayload = c.get("jwtPayload");
	const userId = jwtPayload.userId;

	const newWallet = await createAgentWallet({ userId });

	await saveWalletIdToUser(userId, newWallet.id);

	return c.json({ wallet: newWallet });
});

export default wallet;
