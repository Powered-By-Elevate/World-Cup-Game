export const uid = () => Math.random().toString(36).slice(2, 9);

export const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const parseDate = (d: string) => new Date(d + ":00-04:00");

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { MONTHS_SHORT as MONTHS };

// Match kickoffs are Eastern ("ET"). Format AND group days in America/New_York so
// the schedule reads correctly and in order regardless of the device's timezone
// (previously times were shown in local time but grouped by the raw ET date, so
// on any non-Eastern device the schedule looked out of order).
const ET_TZ = "America/New_York";
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: ET_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: ET_TZ, hour: "numeric", minute: "2-digit", hour12: true });
const ET_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: ET_TZ, weekday: "short", month: "short", day: "numeric" });

/** ET calendar-day key ("YYYY-MM-DD") for a fixture timestamp. */
export function dayKeyOf(d: string) {
  return ET_DAY.format(parseDate(d));
}

export function fmtDayLabel(key: string) {
  const dt = new Date(key + "T12:00:00-04:00");   // noon ET of that day
  return ET_LABEL.format(dt).replace(", ", " \u00B7 ");
}

export function fmtTime(d: string) {
  return `${ET_TIME.format(parseDate(d))} ET`;
}
