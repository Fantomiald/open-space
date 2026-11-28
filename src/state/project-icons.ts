// What the dialog "Choose the project's icon" offers (src/command/ProjectIcon.tsx): the emoji to pick from, the search
// through every Lucide icon, and the letters it starts from. Pure functions, tested without a DOM (project-icons.test.ts).
import { monoLetters } from '../../shared/project-icons.ts';

// The emoji a project may wear: content the user picks for their own projects, the one place the page shows emoji
// (they are never markers of its own, CLAUDE.md).
export const PROJECT_EMOJI = ['💻', '🛠️', '🚀', '🤖', '✨', '⚡', '🌐', '📱', '🖥️', '⌨️', '⚙️', '🗄️', '☁️', '📦', '📚', '🧪', '🔒', '🎮', '🎵', '🎬', '🖼️', '🛍️', '🔥', '💡', '🧩', '📊', '🧠', '🦄', '🐙', '🌱'] as const;

/** How many icons a search shows at most: a grid that stays quick to look through. */
export const SEARCH_LIMIT = 60;

/**
 * The icons whose name holds the words typed, spaces and dashes aside ("folder code" finds FolderCode), those that start
 * with them first, then the shortest names; none for an empty search.
 */
export function searchIcons(names: readonly string[], query: string, limit = SEARCH_LIMIT): string[] {
  const wanted = query.toLowerCase().replace(/[\s_-]+/g, '');
  if (!wanted) return [];
  return names
    .filter((name) => name.toLowerCase().includes(wanted))
    .sort((a, b) => Number(!a.toLowerCase().startsWith(wanted)) - Number(!b.toLowerCase().startsWith(wanted)) || a.length - b.length || a.localeCompare(b))
    .slice(0, limit);
}

/** The letters a project starts with: the first of its first two words ("open-space": OS, "UshyViewer": UV), else its first two ("TZMasters": TZ). */
export function initialsOf(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+|(?<=\p{Ll})(?=\p{Lu})/u).filter(Boolean);
  return monoLetters(words.length > 1 ? `${words[0][0]}${words[1][0]}` : name);
}
