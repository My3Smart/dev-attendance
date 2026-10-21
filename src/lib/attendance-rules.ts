// Pure attendance rules shared by server code and tests.

/** IC "000307-02-0031" -> PIN "00030031" (first 4 digits + last 4 digits). */
export function icToPin(ic: string): string {
  const digits = ic.replace(/\D/g, "");
  if (digits.length < 8) return "";
  return digits.slice(0, 4) + digits.slice(-4);
}

/** Malaysian phone -> digits-only E.164 (e.g. 012-345 6789 -> 60123456789). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "6" + d;
  return d;
}

export type LocalClock = { date: string; time: string; weekday: number };

/** Current date (YYYY-MM-DD), time (HH:MM) and ISO weekday (1=Mon..7=Sun) in a timezone. */
export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}`, weekday: wd };
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** A check-in is late when it happens after the school start time. */
export function isLate(localTime: string, schoolStart: string): boolean {
  return toMinutes(localTime) > toMinutes(schoolStart);
}

/** Absent alerts go out on school days once the alert time has been reached. */
export function shouldSendAbsentAlerts(clock: LocalClock, alertTime: string, schoolDays: number[]): boolean {
  return schoolDays.includes(clock.weekday) && toMinutes(clock.time) >= toMinutes(alertTime);
}
