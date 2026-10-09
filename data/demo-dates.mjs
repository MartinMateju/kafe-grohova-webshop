/** Shared date handling for the storefront fixtures and Shopify CSV export. */
export const DEMO_TIMEZONE = 'Europe/Prague';

/** @param {Date} [now] */
export function demoBaseDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEMO_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/**
 * Resolve a daytime session in Prague, regardless of the build host timezone.
 * The catalog only uses daytime hours, outside DST transition gaps.
 * @param {string} baseDate YYYY-MM-DD
 * @param {number} offsetDays
 * @param {number} localHour
 * @param {number} durationMinutes
 */
export function courseDates(baseDate, offsetDays, localHour, durationMinutes) {
  const wallClock = new Date(`${baseDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate) || Number.isNaN(wallClock.getTime()) || wallClock.toISOString().slice(0, 10) !== baseDate) {
    throw new Error('The base date must be a valid YYYY-MM-DD date.');
  }
  wallClock.setUTCDate(wallClock.getUTCDate() + offsetDays);
  wallClock.setUTCHours(localHour);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: DEMO_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = wallClock.getTime();
  for (let iteration = 0; iteration < 2; iteration++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += wallClock.getTime() - represented;
  }
  return { startsAt: new Date(instant).toISOString(), endsAt: new Date(instant + durationMinutes * 60_000).toISOString() };
}

/** @param {string} startsAt @param {string} lang */
export function courseDateLabel(startsAt, lang) {
  return new Intl.DateTimeFormat(lang === 'cs' ? 'cs-CZ' : 'en-GB', {
    timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(startsAt));
}
