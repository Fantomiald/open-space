// The days the rooms dress up for: each festival's dates, and which one a day belongs to. Shared because the room
// layout (what furniture a festival adds) is tested without a browser; what they look like is in src/room/festivals.

export const FESTIVALS = [
  'newYear', 'epiphany', 'chineseNewYear', 'candlemas', 'valentine', 'songkran', 'easter', 'mayDay', 'music', 'bastille',
  'summer', 'birthday', 'halloween', 'christmas',
] as const;
export type Festival = (typeof FESTIVALS)[number];

/** Their names in the preview menu, in the order of the year. */
export const FESTIVAL_NAMES: Readonly<Record<Festival, string>> = {
  newYear: 'Nouvel An', epiphany: 'Épiphanie', chineseNewYear: 'Nouvel An chinois', candlemas: 'Chandeleur', valentine: 'Saint-Valentin',
  songkran: 'Songkran', easter: 'Pâques', mayDay: '1er mai', music: 'Fête de la musique', bastille: '14 juillet', summer: 'Été',
  birthday: 'Anniversaire', halloween: 'Halloween', christmas: 'Noël',
};

/** The first day of the Chinese New Year (lunar), by year: there is no simple rule, so the next years are listed. */
const CHINESE_NEW_YEAR: Readonly<Record<number, [number, number]>> = {
  2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3], 2031: [1, 23], 2032: [2, 11], 2033: [1, 31], 2034: [2, 19], 2035: [2, 8],
};

/** Easter Sunday of a year (the anonymous Gregorian algorithm), as [month, day]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return [month, ((h + l - 7 * m + 114) % 31) + 1];
}

const BIRTHDAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** A birthday as "MM-DD", or undefined when it is not one. */
export const parseBirthday = (raw: unknown): string | undefined => (typeof raw === 'string' && BIRTHDAY.test(raw) ? raw : undefined);

const DAY_MS = 86_400_000;
/** Days from a [month, day] of the date's year to the date (negative before it). */
const daysFrom = (date: Date, [month, day]: readonly [number, number]) =>
  Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), month - 1, day)) / DAY_MS);

/** A date as "MM-DD", like the birthdays. */
export const monthDay = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * The festival of a day, or null. `birthdays`: the crew's ("MM-DD"). One a day: the one-day festivals win over the
 * longer ones they fall in (a birthday over Halloween, Valentine's Day over the Chinese New Year).
 */
export function festivalOn(date: Date, birthdays: readonly string[] = []): Festival | null {
  const month = date.getMonth() + 1, day = date.getDate();
  const on = (m: number, d: number) => month === m && day === d;
  const within = (from: number, to: number, origin: readonly [number, number]) => { const days = daysFrom(date, origin); return days >= from && days <= to; };
  if (birthdays.includes(monthDay(date))) return 'birthday';
  if (on(1, 6)) return 'epiphany';
  if (on(2, 2)) return 'candlemas';
  if (on(2, 14)) return 'valentine';
  if (on(5, 1)) return 'mayDay';
  if (on(6, 21)) return 'music';
  if ((month === 12 && day === 31) || (month === 1 && day <= 2)) return 'newYear';
  const lunar = CHINESE_NEW_YEAR[date.getFullYear()];
  if (lunar && within(-1, 3, lunar)) return 'chineseNewYear';
  if (month === 4 && day >= 13 && day <= 15) return 'songkran';
  if (within(-1, 1, easterSunday(date.getFullYear()))) return 'easter';
  if (month === 7 && (day === 13 || day === 14)) return 'bastille';
  if ((month === 7 && day >= 15) || month === 8) return 'summer';
  if (month === 10 || (month === 11 && day <= 2)) return 'halloween';
  if (month === 12 && day <= 26) return 'christmas';
  return null;
}

/** Someone of the crew, as far as the festivals go. */
export interface Celebrated { name: string; birthday?: string; self?: boolean }

/** A day's festival, and who it is for: whose birthday it is, or who wears a crown at Epiphany. */
export interface FestivalDay { festival: Festival | null; guests: string[] }

/**
 * The festival of a day for a crew. Its birthdays are theirs (the user's own, when a birthday is only previewed); at
 * Epiphany the user wears the crown, with one of the crew drawn for the year. `forced`: the festival previewed instead.
 */
export function festivalDay(date: Date, crew: readonly Celebrated[], forced?: Festival | null): FestivalDay {
  const festival = forced !== undefined ? forced : festivalOn(date, crew.flatMap((member) => (member.birthday ? [member.birthday] : [])));
  const self = crew.find((member) => member.self)?.name;
  if (festival === 'birthday') {
    const born = crew.filter((member) => member.birthday === monthDay(date)).map((member) => member.name);
    return { festival, guests: born.length ? born : self ? [self] : [] };
  }
  if (festival === 'epiphany') {
    const others = crew.filter((member) => !member.self);
    const drawn = others.length ? others[(date.getFullYear() * 7919) % others.length].name : undefined;
    return { festival, guests: [self, drawn].filter((name): name is string => !!name) };
  }
  return { festival, guests: [] };
}
