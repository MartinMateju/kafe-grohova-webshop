/** Require an actual ISO date/time with a timezone, not a date guessed by Date.parse. */
export function isFutureCourseDate(value: unknown, now = Date.now()): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!parts) return false;
  const [, year, month, day, hour, minute, second = '0'] = parts;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}
