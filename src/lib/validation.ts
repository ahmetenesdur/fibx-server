import { z } from "zod";

export const loginSchema = z.object({
	email: z.string().email("Invalid email address").max(254),
});

export const verifySchema = z.object({
	email: z.string().email("Invalid email address").max(254),
	code: z
		.string()
		.min(4, "OTP code is required")
		.max(10)
		.regex(/^[0-9]+$/, "OTP code must be numeric"),
});

export const findWalletSchema = z.object({
	email: z.string().email("Invalid email address").max(254),
});

export const createWalletSchema = z.object({
	userId: z.string().min(1).optional(),
});

export const signTransactionSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	transaction: z.record(z.unknown()),
});

export const signMessageSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	message: z.union([z.string().min(1), z.record(z.unknown())]),
});

export const signTypedDataSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	typedData: z.record(z.unknown()),
});

import type { Context } from "hono";
import { ApiError } from "./errors.js";

export async function validateBody<T extends z.ZodSchema>(
	c: Context,
	schema: T
): Promise<z.infer<T>> {
	let body: unknown;
	try {
		const rawReq = c.req.raw as any;
		if (rawReq.body) {
			body = rawReq.body;
		} else {
			body = await c.req.json();
		}
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		// Only log validation/parsing errors, not debug info
		console.error("[ERROR] Body parsing failed:", e);
		throw new ApiError(400, `Invalid or missing JSON body (${errorMessage})`, "INVALID_JSON");
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw new ApiError(400, parsed.error.errors[0].message, "VALIDATION_ERROR");
	}

	return parsed.data;
}
