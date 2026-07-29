import { describe, it, expect } from "vitest";
import { decimalToWeiHex, parseChainCaps, buildPolicyRules } from "./policy.js";

describe("decimalToWeiHex", () => {
	it("converts whole and fractional native amounts", () => {
		expect(decimalToWeiHex("1")).toBe("0xde0b6b3a7640000"); // 1e18
		expect(decimalToWeiHex("0.5")).toBe("0x6f05b59d3b20000"); // 5e17
		expect(decimalToWeiHex("0.005")).toBe("0x11c37937e08000"); // 5e15
	});

	it("rejects malformed amounts", () => {
		expect(() => decimalToWeiHex("abc")).toThrow();
		expect(() => decimalToWeiHex("1.2.3")).toThrow();
		// more than 18 fractional digits cannot be represented in wei
		expect(() => decimalToWeiHex("0.1234567890123456789")).toThrow();
	});
});

describe("parseChainCaps", () => {
	it("parses the default config format", () => {
		const caps = parseChainCaps("8453:0.5,4114:0.005,999:25,143:500");
		expect(caps.map((c) => c.chainId)).toEqual([8453, 4114, 999, 143]);
		expect(caps[0].maxValueWeiHex).toBe(decimalToWeiHex("0.5"));
	});

	it("rejects entries without a chain id or amount", () => {
		expect(() => parseChainCaps("8453")).toThrow();
		expect(() => parseChainCaps("abc:1")).toThrow();
	});
});

describe("buildPolicyRules", () => {
	const rules = buildPolicyRules(parseChainCaps("8453:0.5,143:500"));

	it("emits one capped ALLOW transaction rule per chain", () => {
		const txRules = rules.filter((r) => r.method === "eth_signTransaction");
		expect(txRules).toHaveLength(2);

		for (const rule of txRules) {
			expect(rule.action).toBe("ALLOW");
			// chain pin AND value cap must live in the SAME rule — conditions
			// are ANDed within a rule, so splitting them into separate rules
			// would allow an uncapped transaction on an allowed chain.
			const fields = rule.conditions.map((c) => ("field" in c ? c.field : null));
			expect(fields).toContain("chain_id");
			expect(fields).toContain("value");
		}
	});

	// Privy policies are default-deny AND method-scoped: any method the CLI
	// uses without an ALLOW rule here breaks in production. The login flow's
	// signMessage probe is the easiest one to forget.
	it("allows every RPC method the CLI depends on", () => {
		const allowedMethods = rules.filter((r) => r.action === "ALLOW").map((r) => r.method);
		expect(allowedMethods).toContain("eth_signTransaction");
		expect(allowedMethods).toContain("personal_sign");
		expect(allowedMethods).toContain("eth_signTypedData_v4");
	});

	it("explicitly denies private key export", () => {
		const denyRules = rules.filter((r) => r.action === "DENY");
		expect(denyRules.map((r) => r.method)).toEqual(["exportPrivateKey"]);
	});
});
