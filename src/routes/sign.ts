import { Hono } from "hono";
import {
	signTransactionSchema,
	signMessageSchema,
	signTypedDataSchema,
	validateBody,
} from "../lib/validation.js";
import {
	signTransaction as privySignTx,
	signMessage as privySignMsg,
	signTypedData as privySignTyped,
} from "../services/privy.js";
import {
	authMiddleware,
	requireWalletOwnership,
	type JwtPayload,
} from "../middleware/auth.js";

type Variables = { jwtPayload: JwtPayload };

const sign = new Hono<{ Variables: Variables }>();

// All signing routes require authentication
sign.use("/*", authMiddleware);

/**
 * POST /sign/transaction
 * Sign an Ethereum transaction with the specified wallet.
 */
sign.post("/transaction", async (c) => {
	const { walletId, transaction } = await validateBody(
		c,
		signTransactionSchema,
	);

	requireWalletOwnership(c, walletId);

	const result = await privySignTx(walletId, transaction);
	return c.json(result);
});

/**
 * POST /sign/message
 * Sign a message with the specified wallet.
 */
sign.post("/message", async (c) => {
	const { walletId, message } = await validateBody(c, signMessageSchema);

	requireWalletOwnership(c, walletId);

	const result = await privySignMsg(walletId, message);
	return c.json(result);
});

/**
 * POST /sign/typed-data
 * Sign EIP-712 typed data with the specified wallet.
 */
sign.post("/typed-data", async (c) => {
	const { walletId, typedData } = await validateBody(c, signTypedDataSchema);

	requireWalletOwnership(c, walletId);

	const result = await privySignTyped(walletId, typedData);
	return c.json(result);
});

export default sign;
