// The page's words, in the user's language. Every text shown goes through `t` (a live binding: it is swapped when the
// language changes, and the App is mounted again, see main.tsx), so components and helpers read it at render time:
//   import { t } from '../i18n/index.ts';  …  t.session.rename   t.session.waitingFor(name)
// Each area of the page has its file under fr/ (the reference, which sets the shape) and en/ (typed by it).
import { languageOf, localeOf, type Language } from '../../shared/i18n.ts';
import { en } from './en/index.ts';
import { fr } from './fr/index.ts';

export type Dictionary = typeof fr;

const DICTIONARIES: Record<Language, Dictionary> = { fr, en };

/** The page's document; none outside a browser (the tests, read by Node). */
const page = (globalThis as { document?: { documentElement: { lang: string } } }).document;

/** The language shown: the browser's until the server says which one the user chose (outside a page, in the tests, French). */
export let language: Language = page ? languageOf(navigator.languages) : 'fr';
export let t: Dictionary = DICTIONARIES[language];

export function setLanguage(next: Language) {
  language = next;
  t = DICTIONARIES[next];
  if (page) page.documentElement.lang = next;
}

/** The locale dates and numbers are written in (Intl, toLocaleString). */
export const locale = () => localeOf(language);

/** "1 session", "3 sessions": the singular for what the language counts as one (0 too in French). */
export function plural(count: number, one: string, many: string) {
  return `${count} ${new Intl.PluralRules(locale()).select(count) === 'one' ? one : many}`;
}
