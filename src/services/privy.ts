import { PrivyClient } from "@privy-io/node";
import { ApiError } from "../lib/errors.js";
import { config } from "../lib/config.js";

let privyInstance: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
	if (privyInstance) return privyInstance;

	privyInstance = new PrivyClient({
		appId: config.PRIVY_APP_ID,
		appSecret: config.PRIVY_APP_SECRET,
	});
	return privyInstance;
}

export async function sendOtp(email: string): Promise<void> {
	console.log("[DEBUG] sendOtp called for:", email);
	const { PRIVY_APP_ID, PRIVY_APP_SECRET } = config;
	console.log("[DEBUG] Config loaded. App ID present:", !!PRIVY_APP_ID);

	const credentials = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");

	console.log("[DEBUG] Fetching Privy API...");
	const res = await fetch("https://auth.privy.io/api/v1/passwordless/init", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${credentials}`,
			"privy-app-id": PRIVY_APP_ID,
		},
		body: JSON.stringify({ email }),
	});
	console.log("[DEBUG] Privy API response status:", res.status);

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error("[OTP_INIT_FAILED]", { status: res.status, body });
		throw new ApiError(res.status, "Failed to send OTP. Please try again.", "OTP_INIT_FAILED");
	}
}

export async function verifyOtp(
	email: string,
	code: string
): Promise<{ userId: string; userToken: string }> {
	const { PRIVY_APP_ID, PRIVY_APP_SECRET } = config;
	const credentials = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");

	const res = await fetch("https://auth.privy.io/api/v1/passwordless/authenticate", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Basic ${credentials}`,
			"privy-app-id": PRIVY_APP_ID,
		},
		body: JSON.stringify({ email, code }),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		console.error("[OTP_VERIFY_FAILED]", { status: res.status, body });

		const message = res.status === 401 ? "Invalid OTP code" : "OTP verification failed";
		throw new ApiError(res.status, message, "OTP_VERIFY_FAILED");
	}

	const data = (await res.json()) as {
		user: { id: string };
		privy_access_token: string;
	};

	if (!data.user?.id) {
		throw new ApiError(500, "Invalid response from auth provider", "OTP_VERIFY_FAILED");
	}

	return { userId: data.user.id, userToken: data.privy_access_token };
}

export async function findExistingWallet(
	email: string
): Promise<{ id: string; address: string } | null> {
	const privy = getPrivyClient();
	try {
		const user = await privy.users().getByEmailAddress({ address: email });
		const serverWalletId = user.custom_metadata?.server_wallet_id as string | undefined;

		if (serverWalletId) {
			try {
				const wallet = await privy.wallets().get(serverWalletId);
				return { id: wallet.id, address: wallet.address };
			} catch {
				console.warn("[WALLET_NOT_FOUND]", { serverWalletId, email });
			}
		}

		return null;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("not found") || msg.includes("404")) {
			return null;
		}
		console.error("[FIND_WALLET_ERROR]", { email, error: msg });
		throw new ApiError(500, "Failed to look up wallet", "WALLET_LOOKUP_FAILED");
	}
}

export async function createAgentWallet(owner?: {
	userId?: string;
}): Promise<{ id: string; address: string }> {
	const privy = getPrivyClient();
	try {
		const walletOwner = owner?.userId ? { user_id: owner.userId } : null;

		const wallet = await privy.wallets().create({
			chain_type: "ethereum",
			owner: walletOwner,
		});

		return { id: wallet.id, address: wallet.address };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[WALLET_CREATE_FAILED]", { error: msg });
		throw new ApiError(500, "Failed to create wallet", "WALLET_CREATE_FAILED");
	}
}

export async function saveWalletIdToUser(userId: string, walletId: string): Promise<void> {
	const privy = getPrivyClient();
	try {
		await privy.users().setCustomMetadata(userId, {
			custom_metadata: {
				server_wallet_id: walletId,
			},
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[METADATA_SAVE_FAILED]", {
			userId,
			walletId,
			error: msg,
		});
		throw new ApiError(500, "Failed to save wallet metadata", "METADATA_SAVE_FAILED");
	}
}

export async function signTransaction(
	walletId: string,
	transaction: Record<string, unknown>
): Promise<{ signedTransaction: string }> {
	const privy = getPrivyClient();
	try {
		const rpcInput = {
			params: { transaction },
			method: "eth_signTransaction",
		};

		const response = await privy.wallets().ethereum().signTransaction(walletId, rpcInput);
		return { signedTransaction: response.signed_transaction };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[SIGN_TX_FAILED]", { walletId, error: msg });
		throw new ApiError(500, "Transaction signing failed", "SIGN_TX_FAILED");
	}
}

export async function signMessage(
	walletId: string,
	message: string | Record<string, unknown>
): Promise<{ signature: string }> {
	const privy = getPrivyClient();
	try {
		const msgContent = typeof message === "string" ? message : JSON.stringify(message);
		const rpcInput = { message: msgContent };
		const response = await privy.wallets().ethereum().signMessage(walletId, rpcInput);
		return { signature: response.signature };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[SIGN_MSG_FAILED]", { walletId, error: msg });
		throw new ApiError(500, "Message signing failed", "SIGN_MSG_FAILED");
	}
}

export async function signTypedData(
	walletId: string,
	typedData: Record<string, unknown>
): Promise<{ signature: string }> {
	const privy = getPrivyClient();
	try {
		const rpcInput = {
			params: {
				typed_data: typedData as any,
			},
		};

		const response = await privy.wallets().ethereum().signTypedData(walletId, rpcInput);
		return { signature: response.signature };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error("[SIGN_TYPED_DATA_FAILED]", { walletId, error: msg });
		throw new ApiError(500, "Typed data signing failed", "SIGN_TYPED_DATA_FAILED");
	}
}
