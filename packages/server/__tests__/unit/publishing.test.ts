import { describe, expect, it } from "bun:test";
import { isDraft, isPublished, isScheduled } from "@blog/schema";

describe("publishing helpers", () => {
	describe("isPublished", () => {
		it("returns true for past dates", () => {
			const pastDate = new Date("2020-01-01T00:00:00Z");
			expect(isPublished({ publish_at: pastDate })).toBe(true);
		});

		it("returns true for very recent past", () => {
			const recentPast = new Date(Date.now() - 1000);
			expect(isPublished({ publish_at: recentPast })).toBe(true);
		});

		it("returns false for future dates", () => {
			const futureDate = new Date("2099-12-25T00:00:00Z");
			expect(isPublished({ publish_at: futureDate })).toBe(false);
		});

		it("returns false for null", () => {
			expect(isPublished({ publish_at: null })).toBe(false);
		});
	});

	describe("isScheduled", () => {
		it("returns true for future dates", () => {
			const futureDate = new Date("2099-12-25T00:00:00Z");
			expect(isScheduled({ publish_at: futureDate })).toBe(true);
		});

		it("returns false for past dates", () => {
			const pastDate = new Date("2020-01-01T00:00:00Z");
			expect(isScheduled({ publish_at: pastDate })).toBe(false);
		});

		it("returns false for very recent past", () => {
			const recentPast = new Date(Date.now() - 1000);
			expect(isScheduled({ publish_at: recentPast })).toBe(false);
		});

		it("returns false for null", () => {
			expect(isScheduled({ publish_at: null })).toBe(false);
		});
	});

	describe("isDraft", () => {
		it("returns true for null", () => {
			expect(isDraft({ publish_at: null })).toBe(true);
		});

		it("returns false for past date", () => {
			const pastDate = new Date("2020-01-01T00:00:00Z");
			expect(isDraft({ publish_at: pastDate })).toBe(false);
		});

		it("returns false for future date", () => {
			const futureDate = new Date("2099-12-25T00:00:00Z");
			expect(isDraft({ publish_at: futureDate })).toBe(false);
		});
	});
});
