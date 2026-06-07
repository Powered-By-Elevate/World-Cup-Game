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

const DAYNAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { MONTHS_SHORT as MONTHS };

export function dayKeyOf(d: string) {
  return d.slice(0, 10);
}

export function fmtDayLabel(key: string) {
  const dt = parseDate(key + "T12:00");
  return `${DAYNAMES[dt.getDay()]} \u00B7 ${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}`;
}

export function fmtTime(d: string) {
  const dt = parseDate(d);
  let h = dt.getHours();
  const m = dt.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap} ET`;
}
