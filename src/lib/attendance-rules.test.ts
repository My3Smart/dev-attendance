import { describe, expect, it } from "vitest";
import { icToPin, isLate, localClock, normalizePhone, shouldSendAbsentAlerts } from "./attendance-rules";

describe("attendance rules", () => {
  it("builds PIN from first 4 and last 4 IC digits", () => {
    expect(icToPin("000307-02-0031")).toBe("00030031");
  });

  it("marks check-in after school start as late", () => {
    expect(isLate("07:31", "07:30")).toBe(true);
    expect(isLate("07:30", "07:30")).toBe(false);
  });

  it("sends absent alerts only on school days after alert time", () => {
    const mon = { date: "2026-10-05", time: "08:00", weekday: 1 };
    expect(shouldSendAbsentAlerts(mon, "08:00", [1, 2, 3, 4, 5])).toBe(true);
    expect(shouldSendAbsentAlerts({ ...mon, time: "07:59" }, "08:00", [1, 2, 3, 4, 5])).toBe(false);
    expect(shouldSendAbsentAlerts({ ...mon, weekday: 6 }, "08:00", [1, 2, 3, 4, 5])).toBe(false);
  });

  it("uses Malaysia time", () => {
    const c = localClock(new Date("2026-10-04T23:45:00Z"), "Asia/Kuala_Lumpur");
    expect(c).toEqual({ date: "2026-10-05", time: "07:45", weekday: 1 });
  });

  it("normalizes local phone numbers", () => {
    expect(normalizePhone("012-345 6789")).toBe("60123456789");
  });
});
