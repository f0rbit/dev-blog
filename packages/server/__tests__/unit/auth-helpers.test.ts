import { describe, expect, it } from "bun:test";
import { extractJWTFromHeader, hashToken, hexEncode, isExemptPath, isOptionalAuthPath, rowToUser } from "../../src/middleware/auth";

describe("hexEncode", () => {
	it("encodes empty buffer to empty string", () => {
		const buffer = new ArrayBuffer(0);
		expect(hexEncode(buffer)).toBe("");
	});

	it("encodes single byte correctly", () => {
		const buffer = new Uint8Array([0xff]).buffer;
		expect(hexEncode(buffer)).toBe("ff");
	});

	it("encodes multiple bytes correctly", () => {
		const buffer = new Uint8Array([0x00, 0x0f, 0xf0, 0xff]).buffer;
		expect(hexEncode(buffer)).toBe("000ff0ff");
	});

	it("pads single digit hex values with zero", () => {
		const buffer = new Uint8Array([0x01, 0x02, 0x0a]).buffer;
		expect(hexEncode(buffer)).toBe("01020a");
	});

	it("encodes known SHA-256 hash input correctly", () => {
		const bytes = new Uint8Array([0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52, 0xb8, 0x55]);
		expect(hexEncode(bytes.buffer)).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	});
});

describe("isExemptPath", () => {
	it("returns true for /health", () => {
		expect(isExemptPath("/health")).toBe(true);
	});

	it("returns true for /auth/login", () => {
		expect(isExemptPath("/auth/login")).toBe(true);
	});

	it("returns true for /auth/logout", () => {
		expect(isExemptPath("/auth/logout")).toBe(true);
	});

	it("returns true for /auth/callback", () => {
		expect(isExemptPath("/auth/callback")).toBe(true);
	});

	it("returns true for paths starting with exempt paths", () => {
		expect(isExemptPath("/health/check")).toBe(true);
		expect(isExemptPath("/auth/login/github")).toBe(true);
	});

	it("returns false for /api/posts", () => {
		expect(isExemptPath("/api/posts")).toBe(false);
	});

	it("returns false for /auth/status", () => {
		expect(isExemptPath("/auth/status")).toBe(false);
	});

	it("returns false for /auth (without specific action)", () => {
		expect(isExemptPath("/auth")).toBe(false);
	});

	it("returns false for partial matches", () => {
		expect(isExemptPath("/healthcheck")).toBe(false);
	});
});

describe("isOptionalAuthPath", () => {
	it("returns true for /auth/status", () => {
		expect(isOptionalAuthPath("/auth/status")).toBe(true);
	});

	it("returns true for paths starting with /auth/status", () => {
		expect(isOptionalAuthPath("/auth/status/check")).toBe(true);
	});

	it("returns false for /auth/login", () => {
		expect(isOptionalAuthPath("/auth/login")).toBe(false);
	});

	it("returns false for /api/posts", () => {
		expect(isOptionalAuthPath("/api/posts")).toBe(false);
	});

	it("returns false for partial matches", () => {
		expect(isOptionalAuthPath("/auth/statuses")).toBe(false);
	});
});

describe("rowToUser", () => {
	it("maps database row to User type", () => {
		const now = new Date();
		const row = {
			id: 1,
			github_id: 12345,
			username: "testuser",
			email: "test@example.com",
			avatar_url: "https://github.com/ghost.png",
			created_at: now,
			updated_at: now,
		};

		const user = rowToUser(row);

		expect(user).toEqual({
			id: 1,
			github_id: 12345,
			username: "testuser",
			email: "test@example.com",
			avatar_url: "https://github.com/ghost.png",
			created_at: now,
			updated_at: now,
		});
	});

	it("handles null email and avatar_url", () => {
		const now = new Date();
		const row = {
			id: 2,
			github_id: 67890,
			username: "minimal",
			email: null,
			avatar_url: null,
			created_at: now,
			updated_at: now,
		};

		const user = rowToUser(row);

		expect(user.email).toBeNull();
		expect(user.avatar_url).toBeNull();
	});
});

describe("extractJWTFromHeader", () => {
	it("returns ok with token for valid Bearer jwt: header", () => {
		const result = extractJWTFromHeader("Bearer jwt:my-jwt-token");

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBe("my-jwt-token");
		}
	});

	it("returns err for missing jwt prefix", () => {
		const result = extractJWTFromHeader("Bearer some-token");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("missing_jwt_prefix");
		}
	});

	it("returns err for Basic auth header", () => {
		const result = extractJWTFromHeader("Basic dXNlcjpwYXNz");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("missing_jwt_prefix");
		}
	});

	it("returns err for empty header", () => {
		const result = extractJWTFromHeader("");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("missing_jwt_prefix");
		}
	});

	it("returns err for empty token after prefix", () => {
		const result = extractJWTFromHeader("Bearer jwt:");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("empty_jwt_token");
		}
	});

	it("handles complex JWT tokens with special characters", () => {
		const complexToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
		const result = extractJWTFromHeader(`Bearer jwt:${complexToken}`);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBe(complexToken);
		}
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
});
