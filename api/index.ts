import { handle } from "@hono/node-server/vercel";
import app from "../src/index.js";

export const config = {
	runtime: "nodejs",
};

export default handle(app);
