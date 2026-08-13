import { describe, expect, it } from "vitest";
import {
  getIsoWeek,
  nextCalendarVersion,
  parseCalendarVersion,
} from "../scripts/release-version";

describe("release version", () => {
  it("uses the ISO week-year around a calendar-year boundary", () => {
    expect(getIsoWeek(new Date("2027-01-01T12:00:00Z"))).toEqual({
      year: 2026,
      week: 53,
    });
  });

  it("increments the package sequence in the same ISO week", () => {
    expect(
      nextCalendarVersion("2026.33.28", new Date("2026-08-13T03:00:00Z")),
    ).toBe("2026.33.29");
  });

  it("resets the sequence in a new ISO week", () => {
    expect(
      nextCalendarVersion("2026.33.28", new Date("2026-08-17T03:00:00Z")),
    ).toBe("2026.34.0");
  });

  it("accepts zero as the first sequence of an ISO week", () => {
    expect(parseCalendarVersion("2026.34.0")).toEqual({
      year: 2026,
      week: 34,
      sequence: 0,
    });
  });

  it("rejects invalid package versions", () => {
    expect(() => parseCalendarVersion("0.1.0")).toThrow("YYYY.WEEK.SEQ");
    expect(() => parseCalendarVersion("2026.54.1")).toThrow("주차와 순번");
  });
});
