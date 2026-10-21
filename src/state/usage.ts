// The usage view's numbers, from the rows the server reads in Claude Code's transcripts (shared/usage.ts): totals,
// days, models, projects and the week's rewind. Pure functions; the view is src/command/UsagePanel.tsx.
import { addTokens, costOf, dayOf, NO_TOKENS, totalTokens, type CostReport, type Tokens } from '../../shared/usage.ts';

export type Metric = 'cost' | 'tokens';
/** The colour slots of the charts: the four models that cost most over the whole report, then all the others. */
export const SERIES_SLOTS = 4;
export const OTHERS = 'others';

export interface Spending { cost: number; tokens: Tokens; turns: number }
const NOTHING: Spending = { cost: 0, tokens: NO_TOKENS, turns: 0 };
const add = (sum: Spending, cost: number, tokens: Tokens, turns = 0): Spending => ({ cost: sum.cost + cost, tokens: addTokens(sum.tokens, tokens), turns: sum.turns + turns });

/** Local days, oldest first: the `count` days that end with `last` ("YYYY-MM-DD"). */
export function daysUntil(last: string, count: number): string[] {
  const [year, month, day] = last.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => dayOf(new Date(year, month - 1, day - (count - 1 - index), 12).getTime()));
}

/** The models of the report, those that cost most over all of it first: their order gives them their colour for good. */
export function seriesOf(report: CostReport): string[] {
  return byModel(report, [...new Set(report.models.map((row) => row.day))]).map((row) => row.model);
}

/** The chart slot of a model: its rank in `series` when among the first four, else the others. */
export const slotOf = (series: readonly string[], model: string) => {
  const rank = series.indexOf(model);
  return rank >= 0 && rank < SERIES_SLOTS ? model : OTHERS;
};

/** What was spent on each of `days`, by colour slot. */
export function perDay(report: CostReport, days: readonly string[], series: readonly string[]): { day: string; values: Record<string, Spending> }[] {
  const wanted = new Set(days);
  const found = new Map<string, Record<string, Spending>>();
  for (const row of report.models) {
    if (!wanted.has(row.day)) continue;
    const values = found.get(row.day) ?? {};
    const slot = slotOf(series, row.model);
    values[slot] = add(values[slot] ?? NOTHING, costOf(row.model, row.tokens, row.fast), row.tokens, row.turns);
    found.set(row.day, values);
  }
  return days.map((day) => ({ day, values: found.get(day) ?? {} }));
}

export const measure = (spending: Spending | undefined, metric: Metric) => (!spending ? 0 : metric === 'cost' ? spending.cost : totalTokens(spending.tokens));

/** What was spent over `days`, all models together. */
export function spentOn(report: CostReport, days: readonly string[]): Spending {
  const wanted = new Set(days);
  return report.models.filter((row) => wanted.has(row.day)).reduce((sum, row) => add(sum, costOf(row.model, row.tokens, row.fast), row.tokens, row.turns), NOTHING);
}

/** Each model's spending over `days`, the costliest first (fast mode counted with its model). */
export function byModel(report: CostReport, days: readonly string[]): ({ model: string } & Spending)[] {
  const wanted = new Set(days);
  const found = new Map<string, Spending>();
  for (const row of report.models) {
    if (!wanted.has(row.day)) continue;
    found.set(row.model, add(found.get(row.model) ?? NOTHING, costOf(row.model, row.tokens, row.fast), row.tokens, row.turns));
  }
  return [...found].map(([model, spending]) => ({ model, ...spending })).sort((a, b) => b.cost - a.cost || totalTokens(b.tokens) - totalTokens(a.tokens));
}

/** Each project's (folder's) spending over `days`, the costliest first. */
export function byProject(report: CostReport, days: readonly string[]): ({ project: string } & Spending)[] {
  const wanted = new Set(days);
  const found = new Map<string, Spending>();
  for (const row of report.projects) {
    if (!wanted.has(row.day)) continue;
    found.set(row.project, add(found.get(row.project) ?? NOTHING, costOf(row.model, row.tokens, row.fast), row.tokens));
  }
  return [...found].map(([project, spending]) => ({ project, ...spending })).sort((a, b) => b.cost - a.cost || totalTokens(b.tokens) - totalTokens(a.tokens));
}

/** The Monday ("YYYY-MM-DD") of the week of a day. */
export function mondayOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const noon = new Date(year, month - 1, date, 12);
  return dayOf(new Date(year, month - 1, date - ((noon.getDay() + 6) % 7), 12).getTime());
}

export interface Rewind {
  days: string[];
  minutes: number;
  sessions: number;
  cost: number;
  /** the three hours in a row with the most activity: its first hour, and its minutes (null for a quiet week) */
  peak: { from: number; minutes: number } | null;
  topProject: { project: string; sessions: number } | null;
  busiestDay: { day: string; minutes: number } | null;
  sessionsByDay: number[];
  costByDay: { day: string; values: Record<string, Spending> }[];
  /** minutes of activity, [day of the week][hour] */
  heatmap: number[][];
  models: ({ model: string } & Spending)[];
}

/** The week that starts on `monday`, told back: time, sessions, cost, when and where most happened. */
export function rewindOf(report: CostReport, monday: string, series: readonly string[]): Rewind {
  const days = daysAfter(monday, 7);
  const index = new Map(days.map((day, at) => [day, at]));
  const heatmap = days.map(() => Array.from({ length: 24 }, () => 0));
  for (const hour of report.hours) {
    const at = index.get(hour.day);
    if (at !== undefined) heatmap[at][hour.hour] += hour.minutes;
  }
  const minutesByDay = heatmap.map((hours) => hours.reduce((sum, minutes) => sum + minutes, 0));
  const minutes = minutesByDay.reduce((sum, value) => sum + value, 0);
  const conversations = report.conversations.filter((conversation) => conversation.days.some((day) => index.has(day)));
  const sessionsByDay = days.map((day) => conversations.filter((conversation) => conversation.days.includes(day)).length);
  const byHour = Array.from({ length: 24 }, (_, hour) => heatmap.reduce((sum, row) => sum + row[hour], 0));
  let peak: Rewind['peak'] = null;
  for (let from = 0; from <= 21; from++) {
    const sum = byHour[from] + byHour[from + 1] + byHour[from + 2];
    if (sum > 0 && (!peak || sum > peak.minutes)) peak = { from, minutes: sum };
  }
  const projects = new Map<string, number>();
  for (const conversation of conversations) projects.set(conversation.project, (projects.get(conversation.project) ?? 0) + 1);
  const top = [...projects].sort((a, b) => b[1] - a[1])[0];
  const busiest = minutesByDay.reduce((best, value, at) => (value > (best?.minutes ?? 0) ? { day: days[at], minutes: value } : best), null as Rewind['busiestDay']);
  return {
    days, minutes, sessions: conversations.length, cost: spentOn(report, days).cost, peak,
    topProject: top ? { project: top[0], sessions: top[1] } : null, busiestDay: busiest, sessionsByDay,
    costByDay: perDay(report, days, series), heatmap, models: byModel(report, days),
  };
}

/** `count` local days starting with `first`. */
export function daysAfter(first: string, count: number): string[] {
  const [year, month, day] = first.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => dayOf(new Date(year, month - 1, day + index, 12).getTime()));
}
