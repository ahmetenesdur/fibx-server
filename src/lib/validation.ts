import { z } from "zod";
import { config } from "./config.js";

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

/**
 * Transaction signing is the most dangerous surface here: a valid JWT turns
 * this service into a signing oracle for that user's wallet. `z.record` meant
 * any object at all was signed as-is.
 *
 * These schemas pin the payload to exactly the fields the fibx CLI sends
 * (snake_case hex quantities, see toPrivyViemAccount), reject unknown keys, and
 * confine signing to the chains this deployment serves.
 */
const hexQuantity = z.string().regex(/^0x[0-9a-fA-F]+$/, "Expected a hex quantity");
const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Expected a 20-byte hex address");
const hexData = z.string().regex(/^0x[0-9a-fA-F]*$/, "Expected hex calldata");

const allowedChainIds = new Set(
	config.ALLOWED_CHAIN_IDS.split(",")
		.map((v) => Number(v.trim()))
		.filter((v) => Number.isInteger(v) && v > 0)
);

const chainIdSchema = hexQuantity.refine(
	(value) => allowedChainIds.has(Number(BigInt(value))),
	"Transaction targets a chain this deployment does not serve"
);

export const signTransactionSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	transaction: z
		.object({
			chain_id: chainIdSchema,
			// Absent `to` means contract creation, which the CLI never does.
			to: hexAddress,
			data: hexData.optional(),
			value: hexQuantity.optional(),
			nonce: hexQuantity.optional(),
			gas_limit: hexQuantity.optional(),
			max_fee_per_gas: hexQuantity.optional(),
			max_priority_fee_per_gas: hexQuantity.optional(),
			type: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]).optional(),
		})
		.strict(),
});

export const signMessageSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	// Bounded so a single request cannot push an unlimited payload to Privy.
	message: z.union([z.string().min(1).max(100_000), z.record(z.string(), z.unknown())]),
});

/**
 * EIP-712 payload. The inner `types`/`message` contents are domain-specific and
 * stay opaque, but the envelope is checked and the domain is held to the same
 * chain allowlist as a transaction — an off-chain signature can authorize just
 * as much value as an on-chain one (Permit, order signing, and so on).
 */
export const signTypedDataSchema = z.object({
	walletId: z.string().min(1, "walletId is required"),
	typedData: z
		.object({
			domain: z
				.object({
					name: z.string().optional(),
					version: z.string().optional(),
					chainId: z
						.union([z.number().int().positive(), hexQuantity])
						.optional()
						.refine(
							(value) =>
								value === undefined ||
								allowedChainIds.has(
									typeof value === "number" ? value : Number(BigInt(value))
								),
							"Typed-data domain targets a chain this deployment does not serve"
						),
					verifyingContract: hexAddress.optional(),
					salt: z.string().optional(),
				})
				.passthrough()
				.optional(),
			types: z.record(z.string(), z.unknown()),
			primaryType: z.string().min(1),
			message: z.record(z.string(), z.unknown()),
		})
		.strict(),
});
