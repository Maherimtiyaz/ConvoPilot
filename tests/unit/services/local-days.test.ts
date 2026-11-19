import { describe, expect, it } from "vitest";

import { isTimeZone, localDays } from "@/lib/services/commitments";

describe("localDays", () => {
  const evening = new Date("2026-11-18T20:00:00Z");

  it("uses the user's calendar date, not UTC", () => {
    expect(localDays("UTC", evening)).toEqual({ today: "2026-11-18", inAWeek: "2026-11-25" });
    expect(localDays("Asia/Kolkata", evening)).toEqual({ today: "2026-11-19", inAWeek: "2026-11-26" });
    expect(localDays("Pacific/Honolulu", evening).today).toBe("2026-11-18");
  });

  it("falls back to UTC for unknown or malformed names", () => {
    expect(isTimeZone("Asia/Kolkata")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("UTC; drop table")).toBe(false);
    expect(localDays("Mars/Olympus", evening).today).toBe("2026-11-18");
  });

  it("crosses month and year boundaries", () => {
    expect(localDays("UTC", new Date("2026-12-28T10:00:00Z")).inAWeek).toBe("2027-01-04");
  });
});
