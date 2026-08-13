import { describe, expect, it } from "vitest";
import {
  calculateWeeklySequence,
  formatDeploymentVersion,
  getIsoWeek,
} from "../scripts/deployment-version";

describe("deployment version", () => {
  it("uses the ISO week-year around a calendar-year boundary", () => {
    expect(getIsoWeek(new Date("2027-01-01T12:00:00Z"))).toMatchObject({
      year: 2026,
      week: 53,
    });
    expect(formatDeploymentVersion(new Date("2027-01-04T00:00:00Z"), 1)).toBe(
      "2027.01.1",
    );
  });

  it("counts workflow attempts in the same ISO week and includes the current run", () => {
    const deployedAt = new Date("2026-08-13T03:00:00Z");
    const sequence = calculateWeeklySequence(
      [
        { id: 10, runAttempt: 1, startedAt: "2026-08-10T00:10:00Z" },
        { id: 11, runAttempt: 2, startedAt: "2026-08-11T00:10:00Z" },
        { id: 12, runAttempt: 1, startedAt: "2026-08-13T03:00:00Z" },
        { id: 9, runAttempt: 1, startedAt: "2026-08-09T23:59:59Z" },
      ],
      { id: 12, runAttempt: 1 },
      deployedAt,
    );

    expect(sequence).toBe(4);
    expect(formatDeploymentVersion(deployedAt, sequence)).toBe("2026.33.4");
  });

  it("adds a current run that is not visible in the API response yet", () => {
    expect(
      calculateWeeklySequence(
        [{ id: 10, runAttempt: 1, startedAt: "2026-08-10T00:10:00Z" }],
        { id: 13, runAttempt: 1 },
        new Date("2026-08-13T03:00:00Z"),
      ),
    ).toBe(2);
  });

  it("rejects a non-positive deployment sequence", () => {
    expect(() =>
      formatDeploymentVersion(new Date("2026-08-13T03:00:00Z"), 0),
    ).toThrow("배포 순번");
  });
});
