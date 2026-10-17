// The server's words (errors, notes in the thread, notifications, the instructions given to new agents), in the
// language of the settings. `st` is a live binding swapped by setServerLanguage, so it is read when a text is made:
//   import { st } from './i18n/index.ts';  …  throw new Error(st.sessions.outsideRoots)
// fr.ts is the reference and sets the shape; en.ts follows it. French when nothing was chosen (and in the tests).
import type { Language } from '../../shared/i18n.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

export type ServerDictionary = typeof fr;

export let st: ServerDictionary = fr;

export function setServerLanguage(language: Language) {
  st = language === 'en' ? en : fr;
}
