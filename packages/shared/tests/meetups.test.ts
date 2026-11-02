import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config";
import { meetupDays, windowLabel } from "../src/meetups";

describe("meet-up times", () => {
  it("labels windows the way students say them", () => {
    expect(windowLabel("16:00-18:00")).toBe("4 to 6pm");
    expect(windowLabel("10:30-12:00")).toBe("10:30am to 12pm");
    expect(windowLabel("09:00-11:00")).toBe("9 to 11am");
  });

  it("offers the configured days, hiding windows that have started today", () => {
    const now = new Date(2026, 10, 2, 13, 0); // Mon 2 Nov, 1pm
    const days = meetupDays(defaultConfig, now);
    expect(days.map((d) => d.label)).toEqual(["Today", "Tomorrow", "Wed 4"]);
    expect(days[0].windows.map((w) => w.label)).toEqual(["4 to 6pm", "6 to 8pm"]);
    expect(days[1].windows).toHaveLength(4);
    // Orders keep the actual date.
    expect(days[1].windows[0].value).toBe("Tue 3 Nov, 10am to 12pm");
  });

  it("skips today once its last window has gone", () => {
    const days = meetupDays(defaultConfig, new Date(2026, 10, 2, 18, 0));
    expect(days[0].label).toBe("Tomorrow");
    expect(days).toHaveLength(2);
  });
});
