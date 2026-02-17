import { handle } from "@hono/node-server/vercel";
import app from "../src/index.js";

export const config = {
	runtime: "nodejs",
	maxDuration: 10, // Explicitly set to Hobby plan limit (10s) to avoid ambiguity
};

export default handle(app);
