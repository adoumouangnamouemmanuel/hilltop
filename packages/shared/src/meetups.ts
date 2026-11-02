import type { PlatformConfig } from "./config";

/*
 * Meet-up times buyers can pick at checkout, from the admin's settings
 * (Settings → Listings → Meet-up times): how many days ahead, and which windows.
 * Ghana is on GMT all year, so local time is campus time.
 */

export type MeetupDay = { key: string; label: string; date: Date; windows: { value: string; label: string }[] };

/** "16:00-18:00" as "4 to 6pm". */
export function windowLabel(window: string) {
  const [from, to] = window.split("-").map((t) => t.split(":").map(Number));
  const part = ([h, m]: number[]) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
  const half = (h: number) => (h < 12 ? "am" : "pm");
  return half(from[0]) === half(to[0])
    ? `${part(from)} to ${part(to)}${half(to[0])}`
    : `${part(from)}${half(from[0])} to ${part(to)}${half(to[0])}`;
}

const shortDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * The days and windows on offer from `now`. Today only shows windows that start at
 * least half an hour from now, and a day with nothing left is skipped.
 */
export function meetupDays(config: Pick<PlatformConfig, "meetups">, now: Date): MeetupDay[] {
  const { daysAhead, windows } = config.meetups;
  const days: MeetupDay[] = [];
  for (let offset = 0; offset < daysAhead; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const open = windows.filter((w) => {
      if (offset > 0) return true;
      const [h, m] = w.split("-")[0].split(":").map(Number);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime() - now.getTime() >= 30 * 60_000;
    });
    if (!open.length) continue;
    const exact = shortDay.format(date);
    days.push({
      key: date.toDateString(),
      label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : exact.replace(/ \w+$/, ""),
      date,
      // Saved on the order with the real date, so it still makes sense the next day.
      windows: open.map((w) => ({ value: `${exact}, ${windowLabel(w)}`, label: windowLabel(w) })),
    });
  }
  return days;
}

/** What the order says when the two students will settle the time themselves. */
export const ARRANGE_IN_CHAT = "Time to agree in chat";
