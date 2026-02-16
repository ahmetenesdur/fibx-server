import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { errorResponse, ApiError } from "./lib/errors.js";
import authRoutes from "./routes/auth.js";
import walletRoutes from "./routes/wallet.js";
import signRoutes from "./routes/sign.js";

const app = new Hono();

// ── Global Middleware ───────────────────────────────────────────────────

app.use("*", logger());

// Body size limit (1MB max) — prevents payload flooding
app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));

// CORS — only allow specific origins (CLI doesn't need CORS in most cases)
const allowedOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
	: [];

app.use(
	"*",
	cors({
		origin: (origin) => {
			// Allow requests with no origin (CLI / server-to-server)
			if (!origin) return "*";
			// Allow whitelisted origins only
			if (allowedOrigins.includes(origin)) return origin;
			return "";
		},
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// ── Routes ──────────────────────────────────────────────────────────────

app.route("/auth", authRoutes);
app.route("/wallet", walletRoutes);
app.route("/sign", signRoutes);

// ── Health Check ────────────────────────────────────────────────────────

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

// ── Global Error Handler ────────────────────────────────────────────────

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
		404,
	);
});

// ── Export for Vercel / Node.js ─────────────────────────────────────────

const port = Number(process.env.PORT) || 3001;

// Default export for Vercel (serverless adapter)
export default app;

// For local dev: starts the Hono Node server
if (process.env.NODE_ENV !== "production") {
	const { serve } = await import("@hono/node-server");
	serve({ fetch: app.fetch, port }, (info) => {
		console.log(`🚀 fibx-server running at http://localhost:${info.port}`);
	});
}
