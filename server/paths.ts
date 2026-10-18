// Path guards. Everything is compared on real paths (symlinks resolved), never on lexical ones:
// a symlink created inside an allowed folder must not be able to lead outside of it.
import { readdirSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** True when `child` is `parent` or inside it. Both must already be real paths. */
export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  if (relative === '') return true;
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Resolves `candidate` against `root`, following symlinks. Returns the real path, or null if it does not exist or leaves `root`. */
export function resolveInside(root: string, candidate: string): string | null {
  try {
    const realRoot = realpathSync(root);
    const real = realpathSync(path.resolve(realRoot, candidate));
    return isWithin(realRoot, real) ? real : null;
  } catch {
    return null;
  }
}

/**
 * The real path of an existing regular file whose real name ends with `extension` (a link named so but leading to
 * something else does not count), otherwise null.
 */
export function resolveFileWith(file: string, extension: string): string | null {
  try {
    const real = realpathSync(file);
    return real.toLowerCase().endsWith(extension) && statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/** The real path of an existing directory that lies inside one of the allowed roots, otherwise null. "~" is the home, as the page shows it. */
export function resolveAllowedDirectory(directory: string, roots: readonly string[], home = os.homedir()): string | null {
  const expanded = directory === '~' || directory.startsWith('~/') ? path.join(home, directory.slice(1)) : directory;
  if (!path.isAbsolute(expanded)) return null;
  try {
    const real = realpathSync(expanded);
    if (!statSync(real).isDirectory()) return null;
    for (const root of roots) {
      let realRoot: string;
      try { realRoot = realpathSync(root); } catch { continue; }
      if (isWithin(realRoot, real)) return real;
    }
    return null;
  } catch {
    return null;
  }
}

/** Folders never offered for a new session: dependencies, hidden folders, and "_" ones (templates, archives). */
const isOffered = (name: string) => name !== 'node_modules' && !name.startsWith('.') && !name.startsWith('_');

function offeredChildren(directory: string, root: string): string[] {
  let names: string[];
  try {
    names = readdirSync(directory, { withFileTypes: true }).filter((entry) => isOffered(entry.name) && (entry.isDirectory() || entry.isSymbolicLink())).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
  return names.flatMap((name) => resolveAllowedDirectory(path.join(directory, name), [root]) ?? []);
}

/**
 * The choices for a new session, as real paths: the sub-folders of each root and their own sub-folders
 * (many first-level folders hold several projects, e.g. lumina/mobile). The roots themselves are not offered.
 */
export function listProjectDirectories(roots: readonly string[], limit = 1000): string[] {
  const found: string[] = [];
  for (const root of roots) {
    let realRoot: string;
    try { realRoot = realpathSync(root); } catch { continue; }
    for (const child of offeredChildren(realRoot, realRoot)) found.push(child, ...offeredChildren(child, realRoot));
  }
  return [...new Set(found)].slice(0, limit);
}

/** What makes a folder a project. */
const PROJECT_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json', 'pubspec.yaml', 'pom.xml', 'build.gradle', 'Package.swift'];
/** Folders of a Mac home that hold no code, or that the system keeps for itself. */
const NOT_FOR_CODE = new Set(['Applications', 'Library', 'Movies', 'Music', 'Pictures', 'Public', 'Downloads', 'Applications (Parallels)']);
/** Folders macOS asks the user's permission to read: offered without looking inside (`projects` -1), so no dialog pops up. */
const PROTECTED = new Set(['Desktop', 'Documents']);

const isProject = (directory: string) => {
  try { return readdirSync(directory).some((name) => PROJECT_MARKERS.includes(name) || name.endsWith('.xcodeproj')); } catch { return false; }
};

/**
 * The folders of the home worth offering at the first start as places for sessions to run in: those holding projects
 * (at their first or second level), the ones with the most first, then Desktop and Documents, unread. Read-only.
 */
export function suggestRoots(home: string): { path: string; projects: number }[] {
  let names: string[];
  try { names = readdirSync(home, { withFileTypes: true }).filter((entry) => entry.isDirectory() && isOffered(entry.name) && !NOT_FOR_CODE.has(entry.name)).map((entry) => entry.name); } catch { return []; }
  return names.flatMap((name) => {
    const folder = path.join(home, name);
    if (PROTECTED.has(name)) return [{ path: folder, projects: -1 }];
    const children = offeredChildren(folder, folder);
    const projects = children.filter((child) => isProject(child) || offeredChildren(child, folder).some(isProject)).length;
    return projects ? [{ path: folder, projects }] : [];
  }).sort((a, b) => b.projects - a.projects);
}
