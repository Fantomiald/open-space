// How an isolated session's branch and folder are named, the same for the server (which makes them) and the
// launcher (which shows the name before): os/<first name>-<slug>, in <repo>/.claude/worktrees/os-<first name>-<slug>.
// Pure functions, no I/O.

/** Where Open Space and Claude Code (claude --worktree) keep worktrees, from the root of the repository. */
export const WORKTREES_FOLDER = '.claude/worktrees';
export const BRANCH_PREFIX = 'os/';
const MAX_SLUG = 24;
const SLUG_WORDS = 3;

/**
 * Words that say nothing of the work: articles, little words and the verbs a request starts with ("Ajoute Apple Pay
 * au checkout" is about "apple pay checkout"), in French and English.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'au', 'aux', 'a', 'et', 'ou', 'en', 'dans', 'sur', 'sous', 'pour', 'par', 'avec', 'sans',
  'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'moi', 'toi', 'y', 'qui', 'que', 'quoi', 'est', 'sont', 'qu',
  'stp', 'svp', 'merci', 'peux', 'pourrais', 'faut', 'il', 'veux', 'voudrais', 'aide', 'aider',
  'ajoute', 'ajouter', 'ajouterais', 'fais', 'faire', 'corrige', 'corriger', 'mets', 'mettre', 'cree', 'creer', 'regarde', 'regarder', 'change', 'changer',
  'modifie', 'modifier', 'refais', 'refaire', 'ecris', 'ecrire', 'implemente', 'implementer', 'enleve', 'enlever', 'retire', 'retirer', 'supprime', 'supprimer',
  'the', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'without', 'at', 'by', 'from', 'into', 'this', 'that', 'these', 'those', 'my', 'our', 'your', 'its',
  'i', 'you', 'we', 'it', 'is', 'are', 'be', 'please', 'can', 'could', 'would', 'should', 'let', 's', 'me', 'us', 'some', 'new',
  'add', 'fix', 'make', 'create', 'look', 'change', 'update', 'write', 'implement', 'remove', 'delete', 'build', 'do', 'help',
  'fonction', 'function', 'fichier', 'file',
]);

/** Lower case ASCII words: accents taken off, everything else a separator. */
export const asciiWords = (text: string): string[] => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** A first name as it goes into a branch: accents off, lower case, words joined by "-"; "agent" when nothing is left. */
export const personSlug = (name: string) => asciiWords(name).join('-').slice(0, MAX_SLUG).replace(/-+$/, '') || 'agent';

/**
 * What the work is about, in a few words: the first three useful words of `about` (the tag, else the first message),
 * 24 characters at most, cut between words. '' when nothing useful is left.
 */
export function workSlug(about: string): string {
  // a path or a file name counts as its name alone: "src/checkout.js" is about "checkout"
  const named = about.replace(/\S*[\\/.]\S*/g, (token) => token.split(/[\\/]/).filter(Boolean).pop()?.split('.').find(Boolean) ?? '');
  const words = asciiWords(named).filter((word) => !STOP_WORDS.has(word)).slice(0, SLUG_WORDS);
  let slug = '';
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG) return slug || word.slice(0, MAX_SLUG);
    slug = next;
  }
  return slug;
}

/** The branch and the folder of a session (`suffix` 2, 3… when the first ones are taken). */
export function worktreeNames(name: string, about: string, suffix = 1): { branch: string; folder: string } {
  const stem = [personSlug(name), workSlug(about)].filter(Boolean).join('-') + (suffix > 1 ? `-${suffix}` : '');
  return { branch: `${BRANCH_PREFIX}${stem}`, folder: `os-${stem}` };
}

/** True when `folder` is `root` or inside it (both real paths). */
export const isInside = (folder: string, root: string) => {
  const normalize = (value: string) => /^[a-z]:[\\/]|^\\\\/i.test(value) ? value.replace(/\\/g, '/').toLowerCase() : value;
  const child = normalize(folder), parent = normalize(root);
  return child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
};
