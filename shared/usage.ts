// What Claude Code spent on this computer, read from its own transcripts (~/.claude/projects, see server/usage.ts) and
// priced at Anthropic's public API list prices: an estimate of what the same tokens would cost on the API, not a bill
// (a Pro or Max plan pays a flat price). Shared because the page prices and adds up the rows the server sends.

/** The tokens of one or more answers, by kind: cache writes are split by how long they are kept (5 min or 1 h). */
export interface Tokens { input: number; output: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number }

export const NO_TOKENS: Tokens = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };

/** One model's spending on one local day ("YYYY-MM-DD"): `fast` answers (fast mode) are counted apart, at twice the price. */
export interface ModelDay { day: string; model: string; fast?: true; tokens: Tokens; turns: number }
/** One project's (its folder) spending on one day: tokens by model, to be priced. */
export interface ProjectDay { day: string; project: string; model: string; fast?: true; tokens: Tokens }
/** Activity in one local hour of one day: minutes in which a session wrote something (agents at work, summed over sessions). */
export interface ActiveHour { day: string; hour: number; minutes: number }
/** One Claude Code conversation: its folder, when it was active, and how many minutes; sub-agents count with it. */
export interface ConversationSpan { id: string; project: string; start: number; end: number; minutes: number; days: string[] }

/** What the usage view shows, for the last `DAYS` days. `scanning`: the first reading of the transcripts is still going. */
export interface CostReport {
  generatedAt: number;
  scanning: boolean;
  models: ModelDay[];
  projects: ProjectDay[];
  hours: ActiveHour[];
  conversations: ConversationSpan[];
}

export const USAGE_DAYS = 90;

/** Dollars per million tokens: input, output, cache read. Cache writes are 1.25 x input for 5 min, 2 x for 1 h. */
interface Price { input: number; output: number; cacheRead: number }

/**
 * Anthropic's list prices (claude.com/pricing, as of 2026-10), by model id prefix: the first that matches wins, so
 * longer prefixes come first. Unknown models are left unpriced rather than guessed.
 */
const PRICES: readonly (readonly [string, Price])[] = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-mythos-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-8', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-7', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-6', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4', { input: 15, output: 75, cacheRead: 1.5 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-3-7-sonnet', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheRead: 0.1 }],
  ['claude-3-5-haiku', { input: 0.8, output: 4, cacheRead: 0.08 }],
];

const priceOf = (model: string) => PRICES.find(([prefix]) => model.startsWith(prefix))?.[1];

export const isPriced = (model: string) => priceOf(model) !== undefined;

/** What the tokens cost in dollars at the model's list price, 0 for a model without one. */
export function costOf(model: string, tokens: Tokens, fast = false): number {
  const price = priceOf(model);
  if (!price) return 0;
  const dollars = tokens.input * price.input + tokens.output * price.output + tokens.cacheRead * price.cacheRead
    + tokens.cacheWrite5m * price.input * 1.25 + tokens.cacheWrite1h * price.input * 2;
  return (dollars / 1_000_000) * (fast ? 2 : 1);
}

export const totalTokens = (tokens: Tokens) => tokens.input + tokens.output + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead;

export function addTokens(sum: Tokens, more: Tokens): Tokens {
  return {
    input: sum.input + more.input, output: sum.output + more.output, cacheWrite5m: sum.cacheWrite5m + more.cacheWrite5m,
    cacheWrite1h: sum.cacheWrite1h + more.cacheWrite1h, cacheRead: sum.cacheRead + more.cacheRead,
  };
}

/** "claude-opus-5-5" as people say it: "Opus 5.5" (an unknown id is shown as it is, without "claude-"). */
export function modelName(model: string): string {
  const known = /^claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d))?(?:-\d{8})?$/.exec(model);
  if (known) return `${known[1][0].toUpperCase()}${known[1].slice(1)} ${known[2]}${known[3] ? `.${known[3]}` : ''}`;
  const legacy = /^claude-(\d)-(\d)-(sonnet|haiku|opus)/.exec(model);
  if (legacy) return `${legacy[3][0].toUpperCase()}${legacy[3].slice(1)} ${legacy[1]}.${legacy[2]}`;
  return model.replace(/^claude-/, '');
}

/** The model's family, for its colour in the charts. */
export function modelFamily(model: string): 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other' {
  const family = /(fable|mythos|opus|sonnet|haiku)/.exec(model)?.[1];
  return family === 'mythos' ? 'fable' : (family as 'fable' | 'opus' | 'sonnet' | 'haiku' | undefined) ?? 'other';
}

/** The local day of a time, "YYYY-MM-DD". */
export function dayOf(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
