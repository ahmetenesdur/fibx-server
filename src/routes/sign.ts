import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
	signTransactionSchema,
	signMessageSchema,
	signTypedDataSchema,
} from "../lib/validation.js";
import {
	signTransaction as privySignTx,
	signMessage as privySignMsg,
	signTypedData as privySignTyped,
} from "../services/privy.js";
import { authMiddleware, requireWalletOwnership, type JwtPayload } from "../middleware/auth.js";

type Variables = { jwtPayload: JwtPayload };

const sign = new Hono<{ Variables: Variables }>();

sign.use("/*", authMiddleware);

sign.post("/transaction", zValidator("json", signTransactionSchema), async (c) => {
	const { walletId, transaction } = c.req.valid("json");

	requireWalletOwnership(c, walletId);

	const result = await privySignTx(walletId, transaction);
	return c.json(result);
});

sign.post("/message", zValidator("json", signMessageSchema), async (c) => {
	const { walletId, message } = c.req.valid("json");

	requireWalletOwnership(c, walletId);

	const result = await privySignMsg(walletId, message);
	return c.json(result);
});

sign.post("/typed-data", zValidator("json", signTypedDataSchema), async (c) => {
	const { walletId, typedData } = c.req.valid("json");

	requireWalletOwnership(c, walletId);

	const result = await privySignTyped(walletId, typedData);
	return c.json(result);
});

export default sign;
