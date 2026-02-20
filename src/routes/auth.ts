import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema, verifySchema } from "../lib/validation.js";
import {
	sendOtp,
	verifyOtp,
	findExistingWallet,
	createAgentWallet,
	saveWalletIdToUser,
	testWalletAccess,
} from "../services/privy.js";
import { generateToken } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

const auth = new Hono();

// Rate limit: 5 req/min
const authRateLimit = rateLimit({ maxRequests: 5, windowMs: 60_000 });

auth.post("/login", authRateLimit, zValidator("json", loginSchema), async (c) => {
	const { email } = c.req.valid("json");

	await sendOtp(email);

	return c.json({
		success: true,
		message: "OTP sent successfully",
	});
});

auth.post("/verify", authRateLimit, zValidator("json", verifySchema), async (c) => {
	const { email, code } = c.req.valid("json");

	const { userId } = await verifyOtp(email, code);

	let wallet = await findExistingWallet(email);
	let isExisting = true;

	if (wallet) {
		// Verify the wallet is accessible (not user-owned requiring authorization)
		const accessible = await testWalletAccess(wallet.id);
		if (!accessible) {
			// Existing wallet is user-owned — create a new app-managed one
			console.warn("[WALLET_REPROVISION]", {
				email,
				oldWalletId: wallet.id,
				reason: "Wallet requires owner authorization, re-provisioning as app-managed",
			});
			wallet = await createAgentWallet();
			await saveWalletIdToUser(userId, wallet.id);
			isExisting = false;
		}
	} else {
		wallet = await createAgentWallet();
		await saveWalletIdToUser(userId, wallet.id);
		isExisting = false;
	}

	const token = await generateToken({
		userId,
		walletId: wallet.id,
		walletAddress: wallet.address,
	});

	return c.json({
		userId,
		walletId: wallet.id,
		walletAddress: wallet.address,
		token,
		isExisting,
	});
});

export default auth;
