import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import { errorResponse } from "./lib/errors.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";
import signRoutes from "./routes/sign.js";

const app = new Hono();

app.use("*", async (c, next) => {
	console.log(`[TRACE] Incoming request: ${c.req.method} ${c.req.path}`);
	try {
		await next();
		console.log(`[TRACE] Completed request: ${c.req.method} ${c.req.path}`);
	} catch (e) {
		console.error(`[TRACE] Request failed:`, e);
		throw e;
	}
});

app.use("*", requestId());
app.use("*", logger());
// app.use("*", bodyLimit({ maxSize: 1024 * 1024 })); // Temporarily disabled for debugging
// app.use("*", secureHeaders()); // Temporarily disabled

app.use(
	"*",
	cors({
		origin: "*", // Force allow all for debugging
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	})
);

app.use("*", async (c, next) => {
	console.log("[DEBUG] Passed global middleware, entering routes");
	await next();
});

app.route("/auth", authRoutes);
app.route("/wallet", walletRoutes);
app.route("/sign", signRoutes);

app.get("/", (c) => {
	return c.json({
		name: "fibx-server",
		version: "0.1.0",
		status: "ok",
	});
});

app.get("/health", (c) => {
	return c.json({ status: "ok" });
});

app.onError((err, c) => {
	const { status, body } = errorResponse(err);
	return c.json(body, status as 400 | 401 | 403 | 500);
});

app.notFound((c) => {
	return c.json(
		{
			error: {
				code: "NOT_FOUND",
				message: `Route ${c.req.method} ${c.req.path} not found`,
			},
		},
		404
	);
});

const port = Number(process.env.PORT) || 3001;

// Export the Hono app for serverless environments (Vercel, Cloudflare, etc.)
export default app;

console.log("[FIBX] src/index.ts loaded");

// explicit start for standalone environments (Docker, VPS) or Development
// If NODE_ENV is not set, we assume development/local usage and run the server.
if (
	process.env.VERCEL !== "1" &&
	(!process.env.NODE_ENV ||
		process.env.NODE_ENV === "production" ||
		process.env.NODE_ENV === "development")
) {
	console.log("[FIBX] Starting standalone server via @hono/node-server");
	const { serve } = await import("@hono/node-server");

	serve({ fetch: app.fetch, port }, (info) => {
		console.log(`fibx-server running at http://localhost:${info.port}`);
	});
}
