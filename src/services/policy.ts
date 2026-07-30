import type { PrivyPoliciesService } from "@privy-io/node";
import { getPrivyClient } from "./privy.js";
import { config } from "../lib/config.js";
import { ApiError } from "../lib/errors.js";

/**
 * Privy signing policy for agent wallets.
 *
 * Privy policies are DEFAULT-DENY and method-scoped: a method with no matching
 * ALLOW rule is rejected outright. Every RPC method the CLI actually uses must
 * therefore have an explicit ALLOW rule here — omitting personal_sign, for
 * example, would break the signMessage access probe that runs on every login.
 *
 * What this policy enforces at the signing layer (independent of fibx-server's
 * own zod validation, and still standing even if the server is compromised):
 *  - transactions only on the chains this deployment serves
 *  - a per-transaction native-value cap, configured per chain
 *  - private key export permanently denied
 */

/** The SDK exports policy params only through the service's input type. */
type PolicyRules = PrivyPoliciesService.CreateInput["rules"];

/** Per-chain native value caps parsed from "chainId:amount,chainId:amount". */
export interface ChainCap {
	chainId: number;
	maxValueWeiHex: string;
}

/**
 * Converts a decimal amount in native units ("0.5") to a hex wei quantity.
 * All supported chains use 18 decimals.
 */
export function decimalToWeiHex(amount: string): string {
	const parts = amount.split(".");
	if (parts.length > 2) {
		throw new Error(`Invalid native amount: ${amount}`);
	}
	const [whole = "0", fraction = ""] = parts;
	if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction)) || fraction.length > 18) {
		throw new Error(`Invalid native amount: ${amount}`);
	}
	const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0") || "0");
	return `0x${wei.toString(16)}`;
}

export function parseChainCaps(raw: string): ChainCap[] {
	return raw
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [chainIdStr, amount] = entry.split(":");
			const chainId = Number(chainIdStr);
			if (!Number.isInteger(chainId) || chainId <= 0 || !amount) {
				throw new Error(`Invalid WALLET_POLICY_MAX_TX_NATIVE entry: ${entry}`);
			}
			return { chainId, maxValueWeiHex: decimalToWeiHex(amount) };
		});
}

/**
 * Builds the full rule set. Pure — unit tested without touching Privy.
 *
 * Conditions within a rule are ANDed, so each chain gets its own ALLOW rule
 * pairing `chain_id eq X` with that chain's value cap. A transaction on an
 * unlisted chain matches no ALLOW rule and is denied by default.
 */
export function buildPolicyRules(caps: ChainCap[]): PolicyRules {
	const txRules = caps.map((cap) => ({
		name: `allow-tx-chain-${cap.chainId}-capped`,
		method: "eth_signTransaction" as const,
		action: "ALLOW" as const,
		conditions: [
			{
				field_source: "ethereum_transaction" as const,
				field: "chain_id" as const,
				operator: "eq" as const,
				value: String(cap.chainId),
			},
			{
				field_source: "ethereum_transaction" as const,
				field: "value" as const,
				operator: "lte" as const,
				value: cap.maxValueWeiHex,
			},
		],
	}));

	return [
		...txRules,
		// Needed by the login-time signMessage access probe and harmless on its
		// own — personal_sign cannot move funds. The SDK's method enum lags the
		// API here, hence the cast.
		{
			name: "allow-message-signing",
			method: "personal_sign",
			action: "ALLOW",
			conditions: [],
		} as unknown as PolicyRules[number],
		// Typed-data domains are already pinned to served chains by this
		// server's zod schema; a Privy-side chainId condition would reject the
		// legitimate payloads that omit domain.chainId entirely.
		{
			name: "allow-typed-data",
			method: "eth_signTypedData_v4" as const,
			action: "ALLOW" as const,
			conditions: [],
		},
		// Explicit for readers; default-deny would block it anyway.
		{
			name: "deny-key-export",
			method: "exportPrivateKey" as const,
			action: "DENY" as const,
			conditions: [],
		},
	];
}

let cachedPolicyId: string | null = null;

/**
 * Resolves the policy to attach to new agent wallets.
 *
 * If WALLET_POLICY_ID is set it is verified once and used. Otherwise a policy
 * is created on first need and its id logged loudly — the operator should pin
 * it via WALLET_POLICY_ID so restarts do not accumulate duplicate policies
 * (Privy has no list-policies API to find one by name).
 */
export async function ensureWalletPolicy(): Promise<string> {
	if (cachedPolicyId) return cachedPolicyId;

	const privy = getPrivyClient();

	if (config.WALLET_POLICY_ID) {
		try {
			await privy.policies().get(config.WALLET_POLICY_ID);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error("[POLICY_VERIFY_FAILED]", {
				policyId: config.WALLET_POLICY_ID,
				error: msg,
			});
			throw new ApiError(
				500,
				"Configured WALLET_POLICY_ID could not be verified with Privy",
				"POLICY_VERIFY_FAILED"
			);
		}
		cachedPolicyId = config.WALLET_POLICY_ID;
		return cachedPolicyId;
	}

	try {
		const caps = parseChainCaps(config.WALLET_POLICY_MAX_TX_NATIVE);
		const policy = await privy.policies().create({
			chain_type: "ethereum",
			name: "fibx-agent-wallet-policy",
			version: "1.0",
			rules: buildPolicyRules(caps),
		});
		cachedPolicyId = policy.id;
		console.warn(
			`[POLICY_CREATED] id=${policy.id} — set WALLET_POLICY_ID=${policy.id} in the environment ` +
				`to reuse it across restarts instead of creating duplicates.`
		);
		return cachedPolicyId;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[POLICY_CREATE_FAILED]", { error: msg });
		throw new ApiError(500, "Failed to provision wallet policy", "POLICY_CREATE_FAILED");
	}
}
