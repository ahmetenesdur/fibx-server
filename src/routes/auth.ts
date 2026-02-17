import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema, verifySchema } from "../lib/validation.js";
import {
	sendOtp,
	verifyOtp,
	findExistingWallet,
	createAgentWallet,
	saveWalletIdToUser,
} from "../services/privy.js";
import { generateToken } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

const auth = new Hono();

// Rate limit: 5 req/min
const authRateLimit = rateLimit({ maxRequests: 5, windowMs: 60_000 });

auth.post("/login", authRateLimit, zValidator("json", loginSchema), async (c) => {
	console.log("[AUTH] /login request received");
	const { email } = c.req.valid("json");
	console.log(`[AUTH] Processing login for: ${email}`);

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

	if (!wallet) {
		wallet = await createAgentWallet({ userId });
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
