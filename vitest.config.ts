import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		// config.ts validates the environment at import time and exits on
		// failure, so tests supply the required secrets themselves rather than
		// depending on a developer's shell.
		env: {
			NODE_ENV: "test",
			PRIVY_APP_ID: "test-app-id",
			PRIVY_APP_SECRET: "test-app-secret",
			JWT_SECRET: "test-jwt-secret-that-is-long-enough-to-pass",
		},
	},
});
