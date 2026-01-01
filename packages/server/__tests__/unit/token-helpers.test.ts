import { describe, expect, it } from "bun:test";
import { generateToken, sanitizeToken } from "../../src/services/tokens";

describe("generateToken", () => {
	it("generates a 64-character token", () => {
		const token = generateToken();
		expect(token.length).toBe(64);
	});

	it("generates tokens without hyphens", () => {
		const token = generateToken();
		expect(token).not.toContain("-");
	});

	it("generates unique tokens", () => {
		const tokens = new Set<string>();
		for (let i = 0; i < 100; i++) {
			tokens.add(generateToken());
		}
		expect(tokens.size).toBe(100);
	});

	it("generates hex-like characters", () => {
		const token = generateToken();
		expect(token).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("sanitizeToken", () => {
	it("removes key_hash from token", () => {
		const token = {
			id: 1,
			user_id: 42,
			key_hash: "secret-hash-should-be-removed",
			name: "My API Key",
			note: "For CI/CD",
			enabled: true,
			created_at: new Date("2024-01-15T10:00:00Z"),
		};

		const sanitized = sanitizeToken(token);

		expect(sanitized).not.toHaveProperty("key_hash");
		expect(sanitized).not.toHaveProperty("user_id");
	});

	it("preserves public fields", () => {
		const now = new Date("2024-01-15T10:00:00Z");
		const token = {
			id: 1,
			user_id: 42,
			key_hash: "secret-hash",
			name: "My API Key",
			note: "For testing",
			enabled: true,
			created_at: now,
		};

		const sanitized = sanitizeToken(token);

		expect(sanitized).toEqual({
			id: 1,
			name: "My API Key",
			note: "For testing",
			enabled: true,
			created_at: now,
		});
	});

	it("handles null note", () => {
		const token = {
			id: 2,
			user_id: 1,
			key_hash: "hash",
			name: "Key",
			note: null,
			enabled: false,
			created_at: new Date(),
		};

		const sanitized = sanitizeToken(token);

		expect(sanitized.note).toBeNull();
	});

	it("handles disabled token", () => {
		const token = {
			id: 3,
			user_id: 1,
			key_hash: "hash",
			name: "Disabled Key",
			note: "No longer used",
			enabled: false,
			created_at: new Date(),
		};

		const sanitized = sanitizeToken(token);

		expect(sanitized.enabled).toBe(false);
	});

	it("returns a new object (immutable)", () => {
		const token = {
			id: 1,
			user_id: 1,
			key_hash: "hash",
			name: "Key",
			note: null,
			enabled: true,
			created_at: new Date(),
		};

		const sanitized = sanitizeToken(token);

		expect(sanitized).not.toBe(token);
	});
});
