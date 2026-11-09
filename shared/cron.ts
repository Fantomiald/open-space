// A cron expression of five fields (minute, hour, day of the month, month, day of the week), in local time, as crontab
// reads it: "*", numbers, ranges "1-5", steps "*/15" or "1-30/5", lists "1,15". The day of the week goes from 0 (Sunday)
// to 7 (Sunday again). When both day fields are restricted, a day matching either runs (crontab's rule). Pure functions.

/** The fields of an expression, each as the set of values it allows; `anyDay`/`anyWeekday`: the field was "*". */
export interface Cron {
  minutes: ReadonlySet<number>;
  hours: ReadonlySet<number>;
  days: ReadonlySet<number>;
  months: ReadonlySet<number>;
  weekdays: ReadonlySet<number>;
  anyDay: boolean;
  anyWeekday: boolean;
}

const BOUNDS: readonly (readonly [number, number])[] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function parseField(field: string, [low, high]: readonly [number, number]): Set<number> | null {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const match = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!match) return null;
    const step = match[4] === undefined ? 1 : Number(match[4]);
    const from = match[1] === '*' ? low : Number(match[2]);
    // "5/10" means from 5 to the end, by 10
    const to = match[1] === '*' ? high : match[3] !== undefined ? Number(match[3]) : match[4] !== undefined ? high : from;
    if (step < 1 || from < low || to > high || from > to) return null;
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values;
}

/** The expression read, or null when it is not five valid fields. */
export function parseCron(expression: string): Cron | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const parsed = fields.map((field, index) => parseField(field, BOUNDS[index]));
  if (parsed.some((set) => set === null)) return null;
  const [minutes, hours, days, months, weekdays] = parsed as Set<number>[];
  if (weekdays.has(7)) weekdays.add(0);
  return { minutes, hours, days, months, weekdays, anyDay: fields[2] === '*', anyWeekday: fields[4] === '*' };
}

export const isCron = (expression: string) => parseCron(expression) !== null;

function dayMatches(cron: Cron, date: Date): boolean {
  const day = cron.days.has(date.getDate());
  const weekday = cron.weekdays.has(date.getDay());
  if (cron.anyDay && cron.anyWeekday) return true;
  if (cron.anyDay) return weekday;
  if (cron.anyWeekday) return day;
  return day || weekday;
}

/** Whether the expression runs in the minute of `at` (local time). */
export function cronMatches(cron: Cron, at: number): boolean {
  const date = new Date(at);
  return cron.minutes.has(date.getMinutes()) && cron.hours.has(date.getHours()) && cron.months.has(date.getMonth() + 1) && dayMatches(cron, date);
}

/** The start of the next minute after `from` when the expression runs, or null when none comes within about 5 years ("0 0 31 2 *"). */
export function nextCronRun(cron: Cron, from: number): number | null {
  const date = new Date(from);
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  const limit = from + 5 * 366 * 24 * 3600 * 1000;
  while (date.getTime() <= limit) {
    if (!cron.months.has(date.getMonth() + 1)) { date.setMonth(date.getMonth() + 1, 1); date.setHours(0, 0); continue; }
    if (!dayMatches(cron, date)) { date.setDate(date.getDate() + 1); date.setHours(0, 0); continue; }
    if (!cron.hours.has(date.getHours())) { date.setHours(date.getHours() + 1, 0); continue; }
    if (!cron.minutes.has(date.getMinutes())) { date.setMinutes(date.getMinutes() + 1); continue; }
    return date.getTime();
  }
  return null;
}

/** The minute `at` falls in, as a number that changes once a minute (local time is not needed: minutes are whole everywhere). */
export const minuteOf = (at: number) => Math.floor(at / 60_000);
