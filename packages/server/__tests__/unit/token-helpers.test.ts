import { describe, expect, it } from "bun:test";
import { generateToken, hashToken, sanitizeToken } from "../../src/routes/tokens";

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

describe("hashToken", () => {
	it("produces consistent hash for same input", async () => {
		const hash1 = await hashToken("test-token");
		const hash2 = await hashToken("test-token");

		expect(hash1).toBe(hash2);
	});

	it("produces different hashes for different inputs", async () => {
		const hash1 = await hashToken("token-a");
		const hash2 = await hashToken("token-b");

		expect(hash1).not.toBe(hash2);
	});

	it("produces 64 character hex string (SHA-256)", async () => {
		const hash = await hashToken("any-token");

		expect(hash.length).toBe(64);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("hashes empty string correctly", async () => {
		const hash = await hashToken("");
		expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	});

	it("hashes known value correctly", async () => {
		const hash = await hashToken("hello");
		expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
	});

	it("works correctly with generated tokens", async () => {
		const token = generateToken();
		const hash = await hashToken(token);

		expect(hash.length).toBe(64);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
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
