import { describe, it, expect } from "vitest";
import { signTransactionSchema, signTypedDataSchema } from "./validation.js";

/**
 * Mirrors exactly what the fibx CLI sends (see toPrivyViemAccount in
 * src/services/privy/account.ts): snake_case keys, hex quantities, numeric type.
 * If this stops parsing, signing is broken for every user.
 */
function cliTransaction(overrides: Record<string, unknown> = {}) {
	return {
		walletId: "wallet-123",
		transaction: {
			chain_id: "0x2105", // Base, 8453
			to: "0x4200000000000000000000000000000000000006",
			data: "0xd0e30db0",
			value: "0x2386f26fc10000",
			nonce: "0x5",
			gas_limit: "0x11170",
			max_fee_per_gas: "0x59682f0e",
			max_priority_fee_per_gas: "0x59682f00",
			type: 2,
			...overrides,
		},
	};
}

describe("signTransactionSchema", () => {
	it("accepts a real CLI transaction payload", () => {
		expect(signTransactionSchema.safeParse(cliTransaction()).success).toBe(true);
	});

	it("accepts a minimal native transfer", () => {
		const result = signTransactionSchema.safeParse({
			walletId: "wallet-123",
			transaction: { chain_id: "0x2105", to: "0x" + "ab".repeat(20), value: "0x0" },
		});
		expect(result.success).toBe(true);
	});

	it("accepts every supported chain by default", () => {
		// Base 8453, Citrea 4114, HyperEVM 999, Monad 143
		for (const chainId of ["0x2105", "0x1012", "0x3e7", "0x8f"]) {
			const result = signTransactionSchema.safeParse(cliTransaction({ chain_id: chainId }));
			expect(result.success, `chain ${chainId} should be allowed`).toBe(true);
		}
	});

	// The core hardening: this used to be z.record, so anything was signed.
	it("rejects unknown fields instead of signing them", () => {
		const result = signTransactionSchema.safeParse(
			cliTransaction({ authorization_list: [{ evil: true }] })
		);
		expect(result.success).toBe(false);
	});

	it("rejects a chain this deployment does not serve", () => {
		// Ethereum mainnet (1) is not in the default allowlist.
		const result = signTransactionSchema.safeParse(cliTransaction({ chain_id: "0x1" }));
		expect(result.success).toBe(false);
	});

	it("rejects contract creation (no recipient)", () => {
		const { transaction } = cliTransaction();
		delete (transaction as Record<string, unknown>).to;
		const result = signTransactionSchema.safeParse({ walletId: "w", transaction });
		expect(result.success).toBe(false);
	});

	it("rejects malformed hex and non-address recipients", () => {
		expect(signTransactionSchema.safeParse(cliTransaction({ value: "1000" })).success).toBe(
			false
		);
		expect(signTransactionSchema.safeParse(cliTransaction({ to: "0xdeadbeef" })).success).toBe(
			false
		);
		expect(signTransactionSchema.safeParse(cliTransaction({ type: 3 })).success).toBe(false);
	});
});

describe("signTypedDataSchema", () => {
	const typedData = {
		domain: { name: "Permit2", version: "1", chainId: 8453 },
		types: { Permit: [{ name: "owner", type: "address" }] },
		primaryType: "Permit",
		message: { owner: "0x" + "11".repeat(20) },
	};

	it("accepts a well-formed EIP-712 payload", () => {
		expect(signTypedDataSchema.safeParse({ walletId: "w", typedData }).success).toBe(true);
	});

	it("accepts a payload with no domain chainId", () => {
		const { chainId: _omitted, ...domain } = typedData.domain;
		const result = signTypedDataSchema.safeParse({
			walletId: "w",
			typedData: { ...typedData, domain },
		});
		expect(result.success).toBe(true);
	});

	// An off-chain signature can authorize as much value as a transaction.
	it("rejects a domain on an unserved chain", () => {
		const result = signTypedDataSchema.safeParse({
			walletId: "w",
			typedData: { ...typedData, domain: { ...typedData.domain, chainId: 1 } },
		});
		expect(result.success).toBe(false);
	});

	it("rejects a malformed envelope", () => {
		expect(
			signTypedDataSchema.safeParse({ walletId: "w", typedData: { types: {} } }).success
		).toBe(false);
		expect(
			signTypedDataSchema.safeParse({
				walletId: "w",
				typedData: { ...typedData, unexpected: 1 },
			}).success
		).toBe(false);
	});
});
