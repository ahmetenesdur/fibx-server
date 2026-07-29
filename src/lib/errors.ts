import { config } from "./config.js";

export class ApiError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
		public readonly code?: string
	) {
		super(message);
		this.name = "ApiError";
	}
}

export function errorResponse(error: unknown) {
	const isProduction = config.NODE_ENV === "production";

	if (error instanceof ApiError) {
		// 4xx messages are user-actionable and safe to return verbatim.
		// 5xx messages often wrap a Privy SDK error, so they can carry internal
		// endpoint names and request details — log those, don't ship them.
		const isServerError = error.statusCode >= 500;

		if (isServerError) {
			console.error("[API_ERROR]", {
				code: error.code,
				status: error.statusCode,
				message: error.message,
			});
		}

		return {
			status: error.statusCode,
			body: {
				error: {
					code: error.code ?? "UNKNOWN_ERROR",
					message:
						isServerError && isProduction ? "Internal server error" : error.message,
				},
			},
		};
	}

	// Log internal errors in production for observability
	if (error instanceof Error) {
		console.error("[INTERNAL_ERROR]", error.message, error.stack);
	} else {
		console.error("[INTERNAL_ERROR]", error);
	}

	const message = isProduction
		? "Internal server error"
		: error instanceof Error
			? error.message
			: String(error);

	return {
		status: 500,
		body: {
			error: {
				code: "INTERNAL_ERROR",
				message,
			},
		},
	};
}
