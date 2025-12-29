import { describe, expect, it } from "bun:test";
import { isDraft, isPublished, isScheduled } from "../../src/helpers/publishing";

describe("publishing helpers", () => {
	describe("isPublished", () => {
		it("returns true for past dates", () => {
			const pastDate = new Date("2020-01-01T00:00:00Z");
			expect(isPublished(pastDate)).toBe(true);
		});

		it("returns true for very recent past", () => {
			const recentPast = new Date(Date.now() - 1000);
			expect(isPublished(recentPast)).toBe(true);
		});

		it("returns false for future dates", () => {
			const futureDate = new Date("2099-12-25T00:00:00Z");
			expect(isPublished(futureDate)).toBe(false);
		});

		it("returns false for null", () => {
			expect(isPublished(null)).toBe(false);
		});
	});

	describe("isScheduled", () => {
		it("returns true for future dates", () => {
			const futureDate = new Date("2099-12-25T00:00:00Z");
			expect(isScheduled(futureDate)).toBe(true);
		});

		it("returns false for past dates", () => {
			const pastDate = new Date("2020-01-01T00:00:00Z");
			expect(isScheduled(pastDate)).toBe(false);
		});

		it("returns false for very recent past", () => {
			const recentPast = new Date(Date.now() - 1000);
			expect(isScheduled(recentPast)).toBe(false);
		});

		it("returns false for null", () => {
			expect(isScheduled(null)).toBe(false);
		});
	});

	describe("isDraft", () => {
		it("returns true for null", () => {
			expect(isDraft(null)).toBe(true);
		});

		it("returns false for past date", () => {
			const pastDate = new Date("2020-01-01T00:00:00Z");
			expect(isDraft(pastDate)).toBe(false);
		});

		it("returns false for future date", () => {
			const futureDate = new Date("2099-12-25T00:00:00Z");
			expect(isDraft(futureDate)).toBe(false);
		});
	});
});
