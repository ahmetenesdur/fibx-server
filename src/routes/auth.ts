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
	console.log("[DEBUG] /auth/login hit");
	try {
		console.log("[DEBUG] Validating body...");
		const { email } = await validateBody(c, loginSchema);
		console.log("[DEBUG] Body validated, email:", email);

		console.log("[DEBUG] Sending OTP...");
		await sendOtp(email);
		console.log("[DEBUG] OTP sent successfully");

		return c.json({
			success: true,
			message: "OTP sent successfully",
		});
	} catch (error) {
		console.error("[DEBUG] /auth/login error:", error);
		throw error;
	}
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
