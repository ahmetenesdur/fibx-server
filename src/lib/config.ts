import { z } from "zod";

const envSchema = z.object({
	// Server Configuration
	PORT: z.coerce.number().default(3001),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	ALLOWED_ORIGINS: z.string().optional().default(""),
	PUBLIC_URL: z.string().optional().default(""),

	/**
	 * Number of reverse proxies in front of this service. Rate limiting counts
	 * this many entries in from the right of X-Forwarded-For to find the real
	 * client. Set 0 when the service is directly exposed, so no client-supplied
	 * forwarding header is trusted. Default 1 matches the documented App Runner
	 * deployment.
	 */
	TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

	/**
	 * Chain IDs this deployment will sign for, comma separated. Defaults to the
	 * four chains the fibx CLI supports (Base, Citrea, HyperEVM, Monad) so a
	 * stolen token cannot be used to sign on an unrelated chain.
	 */
	ALLOWED_CHAIN_IDS: z.string().default("8453,4114,999,143"),

	/**
	 * Privy policy attached to newly created agent wallets. Leave unset to have
	 * the server create one on first wallet creation (its id is logged — pin it
	 * here afterwards so restarts reuse it instead of creating duplicates).
	 * A configured id is fetched to confirm it exists; its rules are not
	 * compared with the rules this server would generate.
	 */
	WALLET_POLICY_ID: z.string().optional(),

	/**
	 * Per-transaction native value caps enforced by the Privy policy, as
	 * "chainId:amountInNativeUnits" pairs. Defaults are deliberately
	 * conservative; adjust to your risk appetite. Applies only to wallets
	 * created after the policy exists.
	 */
	WALLET_POLICY_MAX_TX_NATIVE: z.string().default("8453:0.5,4114:0.005,999:25,143:500"),

	// Authentication (Privy)
	PRIVY_APP_ID: z.string().min(1, "PRIVY_APP_ID is required"),
	PRIVY_APP_SECRET: z.string().min(1, "PRIVY_APP_SECRET is required"),

	// JWT Security
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		console.error("❌ Invalid environment variables:");
		result.error.issues.forEach((issue) => {
			console.error(`   ${issue.path.join(".")}: ${issue.message}`);
		});
		process.exit(1);
	}

	return result.data;
}

export const config = loadConfig();
