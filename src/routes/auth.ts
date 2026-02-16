import { Hono } from "hono";
import { loginSchema, verifySchema, validateBody } from "../lib/validation.js";
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

// Rate limiting: 5 requests per minute per IP for auth endpoints
const authRateLimit = rateLimit({ maxRequests: 5, windowMs: 60_000 });

/**
 * POST /auth/login
 * Sends OTP to the given email address.
 */
auth.post("/login", authRateLimit, async (c) => {
	const { email } = await validateBody(c, loginSchema);

	await sendOtp(email);

	return c.json({
		success: true,
		message: "OTP sent successfully",
	});
});

/**
 * POST /auth/verify
 * Verifies OTP, finds or creates a wallet, and returns a JWT.
 */
auth.post("/verify", authRateLimit, async (c) => {
	const { email, code } = await validateBody(c, verifySchema);

	// 1. Verify OTP with Privy
	const { userId } = await verifyOtp(email, code);

	// 2. Find existing wallet or create new one
	let wallet = await findExistingWallet(email);
	let isExisting = true;

	if (!wallet) {
		wallet = await createAgentWallet({ userId });
		await saveWalletIdToUser(userId, wallet.id);
		isExisting = false;
	}

	// 3. Generate backend JWT
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
