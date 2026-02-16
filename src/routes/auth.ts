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

auth.post("/login", authRateLimit, async (c) => {
	const { email } = await validateBody(c, loginSchema);

	await sendOtp(email);

	return c.json({
		success: true,
		message: "OTP sent successfully",
	});
});

auth.post("/verify", authRateLimit, async (c) => {
	const { email, code } = await validateBody(c, verifySchema);

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
