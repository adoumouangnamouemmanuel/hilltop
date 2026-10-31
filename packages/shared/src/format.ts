const currency = { style: "currency", currency: "GHS", currencyDisplay: "narrowSymbol" } as const;
const wholeCedi = new Intl.NumberFormat("en-GH", { ...currency, maximumFractionDigits: 0 });
const cedi = new Intl.NumberFormat("en-GH", { ...currency, minimumFractionDigits: 2 });

/** GH₵950 for whole amounts, GH₵1,175.20 otherwise. */
export function formatCedi(amount: number) {
  return Number.isInteger(amount) ? wholeCedi.format(amount) : cedi.format(amount);
}

/** Buyer protection fee, using the rate from the platform config. */
export function protectionFee(price: number, rate: number) {
  return Math.round(price * rate * 100) / 100;
}

export function postedLabel(daysAgo: number) {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}

export function discountPercent(price: number, original?: number) {
  return original && original > price ? Math.round((1 - price / original) * 100) : 0;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

export function firstName(name: string) {
  return name.split(" ")[0];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then a date. */
export function relativeTime(at: number, now: number) {
  const diff = Math.max(0, now - at);
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return shortDate.format(at);
}

/** Whether same-day ordering is still open, given a "HH:MM" cut-off in Ghana time (UTC). */
export function beforeCutoff(cutoff: string, now: number) {
  const [h, m] = cutoff.split(":").map(Number);
  const d = new Date(now);
  return d.getUTCHours() * 60 + d.getUTCMinutes() < h * 60 + m;
}

/** "11:00" -> "11am", "15:30" -> "3:30pm". */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}
