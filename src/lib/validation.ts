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
		console.log("[DEBUG] Reading body. Content-Length:", c.req.header("content-length"));
		console.log("[DEBUG] Content-Type:", c.req.header("content-type"));

		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Body read timeout")), 2000)
		);
		body = await Promise.race([c.req.json(), timeout]);
	} catch (e: any) {
		console.error("[DEBUG] Body parsing failed:", e);
		throw new ApiError(400, `Invalid or missing JSON body (${e.message})`, "INVALID_JSON");
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		throw new ApiError(400, parsed.error.errors[0].message, "VALIDATION_ERROR");
	}

	return parsed.data;
}
